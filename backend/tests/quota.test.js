import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { QuotaGuard } from "../src/QuotaGuard.js";

const SECRET = "fixture-private-api-key";
const NOW = Date.parse("2026-11-03T12:00:00Z");
const DEFAULT_ENV = {
  CARS_DATA_API_KEY: SECRET,
  GLOBAL_PER_MINUTE: "18",
  CLIENT_PER_MINUTE: "6",
  QUOTA_PERIOD_LIMIT: "900",
  QUOTA_PERIOD_START: "2026-11-01T00:00:00Z",
  QUOTA_PERIOD_END: "2026-12-01T00:00:00Z",
  QUOTA_INITIAL_USED: "0",
  UPSTREAM_TIMEOUT_MS: "8000",
};

function sqliteContext(db = new DatabaseSync(":memory:")) {
  return {
    db,
    storage: {
      sql: {
        exec(query, ...values) {
          const rows = db.prepare(query).all(...values);
          return { toArray: () => rows };
        },
      },
      transactionSync(callback) {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = callback();
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    },
  };
}

function envelope(data = []) {
  return new Response(
    JSON.stringify({
      data,
      meta: { last_synced_at: "2026-11-03T00:00:00Z" },
      links: { next: null },
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
}

function internal({
  path = "/v1/brands",
  search = "?locale=pt&limit=10",
  client = 1,
} = {}) {
  return new Request("https://quota.internal/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path,
      search,
      clientId: client.toString(16).padStart(64, "0"),
    }),
  });
}

function fixture(envChanges = {}, fetchImpl = async () => envelope()) {
  const ctx = sqliteContext(),
    env = { ...DEFAULT_ENV, ...envChanges };
  let current = NOW;
  const create = () =>
    new QuotaGuard(ctx, env, { fetchImpl, now: () => current });
  return {
    ctx,
    env,
    create,
    setNow: (value) => {
      current = value;
    },
    guard: create(),
  };
}

test("reserva SQLite ocorre antes do fetch e envia somente credencial do servidor", async () => {
  let captured;
  const f = fixture({}, async (url, options) => {
    assert.equal(
      f.ctx.db.prepare("SELECT used FROM quota_state").get().used,
      1,
    );
    captured = { url, options };
    return envelope();
  });
  const response = await f.guard.fetch(internal());
  assert.equal(response.status, 200);
  const target = new URL(captured.url);
  assert.equal(
    target.origin + target.pathname,
    "https://api.cars-data.com/v1/brands",
  );
  assert.deepEqual(Object.fromEntries(target.searchParams), {
    limit: "10",
    locale: "pt",
  });
  assert.deepEqual(captured.options.headers, {
    Accept: "application/json",
    "X-Api-Key": SECRET,
  });
  assert.equal(captured.options.redirect, "manual");
  assert.equal(captured.options.cache, "no-store");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.ok(!(await response.text()).includes(SECRET));
});

test("concorrência de clientes distintos não ultrapassa dezoito reservas globais", async () => {
  let calls = 0;
  const f = fixture({}, async () => {
    calls++;
    return envelope();
  });
  const responses = await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      f.guard.fetch(internal({ client: i + 1 })),
    ),
  );
  assert.equal(responses.filter((r) => r.status === 200).length, 18);
  assert.equal(responses.filter((r) => r.status === 429).length, 12);
  assert.equal(calls, 18);
  assert.equal(f.ctx.db.prepare("SELECT used FROM quota_state").get().used, 18);
});

test("limite por cliente compartilha a mesma reserva global e bloqueia sétima consulta", async () => {
  let calls = 0;
  const f = fixture({}, async () => {
    calls++;
    return envelope();
  });
  for (let i = 0; i < 6; i++)
    assert.equal((await f.guard.fetch(internal())).status, 200);
  const response = await f.guard.fetch(internal());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.equal(calls, 6);
  assert.equal((await f.guard.fetch(internal({ client: 2 }))).status, 200);
});

test("janela móvel libera chamadas após sessenta segundos sem zerar orçamento", async () => {
  const f = fixture({ GLOBAL_PER_MINUTE: "1" });
  assert.equal((await f.guard.fetch(internal())).status, 200);
  f.setNow(NOW + 59_999);
  assert.equal((await f.guard.fetch(internal({ client: 2 }))).status, 429);
  f.setNow(NOW + 60_000);
  assert.equal((await f.guard.fetch(internal({ client: 2 }))).status, 200);
  assert.equal(f.ctx.db.prepare("SELECT used FROM quota_state").get().used, 2);
});

test("orçamento persiste após recriação do objeto e não diminui com INITIAL_USED menor", async () => {
  let calls = 0;
  const f = fixture({ QUOTA_INITIAL_USED: "899" }, async () => {
    calls++;
    return envelope();
  });
  assert.equal((await f.guard.fetch(internal())).status, 200);
  f.env.QUOTA_INITIAL_USED = "0";
  assert.equal((await f.create().fetch(internal())).status, 429);
  assert.equal(calls, 1);
  assert.equal(
    f.ctx.db.prepare("SELECT used FROM quota_state").get().used,
    900,
  );
});

test("reconciliação de uso estabelece piso sem duplicar reservas já contabilizadas", async () => {
  const f = fixture();
  assert.equal((await f.guard.fetch(internal())).status, 200);
  f.env.QUOTA_INITIAL_USED = "5";
  assert.equal((await f.guard.fetch(internal())).status, 200);
  assert.equal(f.ctx.db.prepare("SELECT used FROM quota_state").get().used, 6);
  f.env.QUOTA_INITIAL_USED = "0";
  assert.equal((await f.guard.fetch(internal())).status, 200);
  assert.equal(f.ctx.db.prepare("SELECT used FROM quota_state").get().used, 7);
});

test("período desconhecido, futuro ou expirado e segredo ausente não consultam provedor", async () => {
  for (const changes of [
    { QUOTA_PERIOD_START: "", QUOTA_PERIOD_END: "" },
    {
      QUOTA_PERIOD_START: "2026-12-01T00:00:00Z",
      QUOTA_PERIOD_END: "2027-01-01T00:00:00Z",
    },
    {
      QUOTA_PERIOD_START: "2026-10-01T00:00:00Z",
      QUOTA_PERIOD_END: "2026-11-01T00:00:00Z",
    },
    { CARS_DATA_API_KEY: "" },
  ]) {
    let calls = 0;
    const f = fixture(changes, async () => {
      calls++;
      return envelope();
    });
    assert.equal((await f.guard.fetch(internal())).status, 503);
    assert.equal(calls, 0);
  }
});

test("trocar datas durante período ativo não reinicia contador", async () => {
  const f = fixture();
  assert.equal((await f.guard.fetch(internal())).status, 200);
  f.env.QUOTA_PERIOD_START = "2026-11-02T00:00:00Z";
  assert.equal((await f.create().fetch(internal())).status, 503);
  assert.equal(f.ctx.db.prepare("SELECT used FROM quota_state").get().used, 1);
});

test("próximo período exige expiração e não pode se sobrepor ao anterior", async () => {
  const f = fixture();
  assert.equal((await f.guard.fetch(internal())).status, 200);
  f.setNow(Date.parse("2026-12-02T12:00:00Z"));
  f.env.QUOTA_PERIOD_START = "2026-11-30T00:00:00Z";
  f.env.QUOTA_PERIOD_END = "2027-01-01T00:00:00Z";
  assert.equal((await f.create().fetch(internal())).status, 503);
  f.env.QUOTA_PERIOD_START = "2026-12-01T00:00:00Z";
  assert.equal((await f.create().fetch(internal())).status, 200);
  assert.equal(f.ctx.db.prepare("SELECT used FROM quota_state").get().used, 1);
});

test("renovar período não libera limites por minuto na fronteira", async () => {
  const f = fixture({ GLOBAL_PER_MINUTE: "1" });
  const end = Date.parse(DEFAULT_ENV.QUOTA_PERIOD_END);
  f.setNow(end - 5_000);
  assert.equal((await f.guard.fetch(internal())).status, 200);
  f.setNow(end + 1_000);
  f.env.QUOTA_PERIOD_START = "2026-12-01T00:00:00Z";
  f.env.QUOTA_PERIOD_END = "2027-01-01T00:00:00Z";
  assert.equal((await f.create().fetch(internal({ client: 2 }))).status, 429);
  f.setNow(end + 55_000);
  assert.equal((await f.create().fetch(internal({ client: 2 }))).status, 200);
});

test("erro de armazenamento bloqueia acesso sem fetch e sem divulgar exceção", async () => {
  let calls = 0;
  const guard = new QuotaGuard(
    {
      storage: {
        transactionSync() {
          throw new Error(SECRET);
        },
      },
    },
    DEFAULT_ENV,
    {
      now: () => NOW,
      fetchImpl: async () => {
        calls++;
        return envelope();
      },
    },
  );
  const response = await guard.fetch(internal());
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
  assert.ok(!(await response.text()).includes(SECRET));
});

test("429 do provedor persiste Retry-After inclusive após recriar objeto", async () => {
  let calls = 0;
  const f = fixture({}, async () => {
    calls++;
    return new Response("private upstream message", {
      status: 429,
      headers: { "Retry-After": "120" },
    });
  });
  const first = await f.guard.fetch(internal());
  assert.equal(first.status, 429);
  assert.equal(first.headers.get("Retry-After"), "120");
  f.setNow(NOW + 30_000);
  const second = await f.create().fetch(internal({ client: 2 }));
  assert.equal(second.status, 429);
  assert.equal(second.headers.get("Retry-After"), "90");
  assert.equal(calls, 1);
  assert.equal(f.ctx.db.prepare("SELECT used FROM quota_state").get().used, 1);
});

test("Retry-After ausente usa pausa conservadora de sessenta segundos", async () => {
  const f = fixture({}, async () => new Response("{}", { status: 429 }));
  const response = await f.guard.fetch(internal());
  assert.equal(response.headers.get("Retry-After"), "60");
});

test("Retry-After respeita data HTTP e espera maior que um dia", async () => {
  for (const [header, expected] of [
    [new Date(NOW + 120_000).toUTCString(), "120"],
    ["90000", "90000"],
  ]) {
    const f = fixture(
      {},
      async () =>
        new Response("{}", { status: 429, headers: { "Retry-After": header } }),
    );
    const response = await f.guard.fetch(internal());
    assert.equal(response.headers.get("Retry-After"), expected);
  }
});

test("falha ao persistir cooldown retorna 503 sem reconsultar provedor", async () => {
  let calls = 0,
    transactions = 0;
  const f = fixture({}, async () => {
    calls++;
    return new Response("{}", { status: 429 });
  });
  const transaction = f.ctx.storage.transactionSync;
  f.ctx.storage.transactionSync = (callback) => {
    transactions++;
    if (transactions > 1) throw Error("storage unavailable");
    return transaction(callback);
  };
  assert.equal((await f.guard.fetch(internal())).status, 503);
  assert.equal((await f.guard.fetch(internal())).status, 503);
  assert.equal(calls, 1);
});

test("falha transitória ao gravar cooldown não libera nova consulta após recuperação", async () => {
  let calls = 0,
    transactions = 0;
  const f = fixture({}, async () => {
    calls++;
    return new Response("{}", {
      status: 429,
      headers: { "Retry-After": "3600" },
    });
  });
  const transaction = f.ctx.storage.transactionSync;
  f.ctx.storage.transactionSync = (callback) => {
    transactions++;
    if (transactions === 2) throw Error("transient storage error");
    return transaction(callback);
  };
  assert.equal((await f.guard.fetch(internal())).status, 503);
  const recovered = await f.guard.fetch(internal({ client: 2 }));
  assert.equal(recovered.status, 429);
  assert.equal(recovered.headers.get("Retry-After"), "3600");
  assert.equal(calls, 1);
  assert.equal(f.ctx.db.prepare("SELECT used FROM quota_state").get().used, 1);
  assert.equal(
    f.ctx.db.prepare("SELECT cooldown_until FROM quota_state").get()
      .cooldown_until,
    NOW + 3_600_000,
  );
  assert.equal((await f.create().fetch(internal({ client: 3 }))).status, 429);
  assert.equal(calls, 1);
});

test("timeout mantém a reserva e responde 504 sem nova tentativa", async () => {
  let calls = 0;
  const f = fixture({ UPSTREAM_TIMEOUT_MS: "5" }, async (_url, { signal }) => {
    calls++;
    return new Promise((resolve, reject) =>
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("timeout", "AbortError")),
        { once: true },
      ),
    );
  });
  assert.equal((await f.guard.fetch(internal())).status, 504);
  assert.equal(calls, 1);
  assert.equal(f.ctx.db.prepare("SELECT used FROM quota_state").get().used, 1);
});

test("timeout durante leitura do corpo cancela o stream sem devolver dados parciais", async () => {
  let cancelled = false;
  const f = fixture(
    { UPSTREAM_TIMEOUT_MS: "5" },
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"data":'));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  const response = await f.guard.fetch(internal());
  assert.equal(response.status, 504);
  assert.equal(cancelled, true);
  assert.equal(f.ctx.db.prepare("SELECT used FROM quota_state").get().used, 1);
});

test("falhas de rede e autenticação não expõem dados privados e continuam contando", async () => {
  for (const result of ["network", 401, 403, 500, 404]) {
    let calls = 0;
    const f = fixture({}, async () => {
      calls++;
      if (result === "network") throw Error(SECRET);
      return new Response(SECRET, { status: result });
    });
    const response = await f.guard.fetch(internal());
    assert.equal(response.status, result === 404 ? 404 : 502);
    assert.ok(!(await response.text()).includes(SECRET));
    assert.equal(calls, 1);
    assert.equal(
      f.ctx.db.prepare("SELECT used FROM quota_state").get().used,
      1,
    );
  }
});

test("envelopes mantêm null, zero, false e metadados", async () => {
  const data = {
    variant_id: 42,
    specs: {
      power: { v: null, u: "hp" },
      speed: { v: 0, u: "km/h" },
      ev: { v: false, u: null },
    },
  };
  const f = fixture({}, async () => envelope(data));
  const response = await f.guard.fetch(
    internal({
      path: "/v1/variants/42/specs",
      search: "?locale=pt&units=metric",
    }),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.data, data);
  assert.deepEqual(payload.links, { next: null });
});

test("JSON inválido, envelope incompatível e resposta grande são recusados", async () => {
  for (const make of [
    () =>
      new Response("{", { headers: { "Content-Type": "application/json" } }),
    () => envelope({ should: "be a list" }),
    () =>
      new Response("<html></html>", {
        headers: { "Content-Type": "text/html" },
      }),
    () =>
      new Response("{}", {
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(2 * 1024 * 1024 + 1),
        },
      }),
    () =>
      new Response("x".repeat(2 * 1024 * 1024 + 1), {
        headers: { "Content-Type": "application/json" },
      }),
    () => envelope([{ unexpected: SECRET }]),
  ]) {
    const f = fixture({}, async () => make());
    const response = await f.guard.fetch(internal());
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes(SECRET));
  }
});

test("payload interno inválido não reserva nem consulta URLs externas", async () => {
  let calls = 0;
  const f = fixture({}, async () => {
    calls++;
    return envelope();
  });
  const bad = new Request("https://quota.internal/query", {
    method: "POST",
    body: JSON.stringify({
      path: "https://evil.example/",
      search: "",
      clientId: "a".repeat(64),
    }),
  });
  assert.equal((await f.guard.fetch(bad)).status, 400);
  assert.equal(
    (await f.guard.fetch(new Request("https://quota.internal/query"))).status,
    405,
  );
  assert.equal(calls, 0);
});
