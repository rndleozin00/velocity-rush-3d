import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { validateQuery } from "../src/routes.js";
import { readQuotaConfig, readOrigins } from "../src/config.js";
import { criarClienteSupercarros } from "../../src/apiSupercarros.js";
import { checkUsage } from "../scripts/check-usage.mjs";

const origin = "http://localhost:5173";
function environment() {
  const requests = [];
  return {
    requests,
    ALLOWED_ORIGINS: JSON.stringify([origin]),
    CARS_QUOTA: {
      idFromName(name) {
        assert.equal(name, "cars-data-primary");
        return name;
      },
      get() {
        return {
          fetch: async (request) => {
            const data = await request.json();
            requests.push(data);
            const object = /\/variants\/\d+(\/specs)?$/.test(data.path);
            return Response.json({
              data: object
                ? { variant_id: 42, specs: { power: { v: null, u: "hp" } } }
                : [],
              meta: { locale: "pt" },
            });
          },
        };
      },
    },
  };
}
const req = (path, options = {}) =>
  new Request("http://worker.example" + path, {
    ...options,
    headers: { Origin: origin, ...options.headers },
  });

test("cliente original é compatível com todas as dez rotas do Worker", async () => {
  const env = environment();
  const api = criarClienteSupercarros({
    baseUrl: "https://worker.example/v1",
    fetchImpl: (url, options) =>
      worker.fetch(
        new Request(url, {
          ...options,
          headers: { ...options.headers, Origin: origin },
        }),
        env,
      ),
  });
  await api.listarMarcas();
  await api.listarModelos("ferrari");
  await api.listarGeracoes(1);
  await api.listarVersoes(2);
  await api.listarTiposEspecificacao();
  await api.pesquisar("Ferrari & Spider");
  await api.obterVersao(42);
  await api.obterEspecificacoes(42);
  await api.obterImagens(42);
  await api.comparar([42, 43]);
  assert.equal(env.requests.length, 10);
  for (const query of env.requests) {
    assert.match(query.clientId, /^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(query).includes("X-Api-Key"));
  }
  assert.equal(
    env.requests[5].search,
    "?limit=10&locale=pt&q=Ferrari+%26+Spider",
  );
});
test("CORS nega origem ausente, null, domínio parecido e wildcard", async () => {
  const env = environment();
  for (const bad of [
    null,
    "null",
    "https://localhost:5173.evil.example",
    "*",
  ]) {
    const response = await worker.fetch(
      new Request("https://worker.example/v1/brands", {
        headers: bad ? { Origin: bad } : {},
      }),
      env,
    );
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  }
  assert.equal(env.requests.length, 0);
});
test("preflight correto retorna 204 sem reservar chamada; cabeçalhos extras são negados", async () => {
  const env = environment();
  const response = await worker.fetch(
    req("/v1/brands", {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Accept",
      },
    }),
    env,
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  const denied = await worker.fetch(
    req("/v1/brands", {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "X-Api-Key",
      },
    }),
    env,
  );
  assert.equal(denied.status, 403);
  assert.equal(env.requests.length, 0);
});
test("métodos, rotas administrativas e parâmetros inválidos não alcançam o guardião", async () => {
  const env = environment();
  for (const path of [
    "/v1/keys",
    "/v1/usage",
    "/v1/export",
    "/v1/brands?limit=51",
    "/v1/brands?limit=1&limit=2",
    "/v1/brands?url=https://evil.example",
    "/v1/search?q=",
    "/v1/compare?ids=1,1",
    "/v1/variants/0",
    "/v1/variants/1/images?locale=pt",
    "/v1/brands/%2fsecret/models",
  ]) {
    const response = await worker.fetch(req(path), env);
    assert.ok([400, 404].includes(response.status), path);
  }
  assert.equal(
    (await worker.fetch(req("/v1/brands", { method: "POST", body: "{}" }), env))
      .status,
    405,
  );
  assert.equal(env.requests.length, 0);
});
test("parâmetros por rota, limite, IDs e cursor respeitam o contrato", () => {
  for (const path of [
    "/v1/variants/1?locale=pt",
    "/v1/compare?ids=1,2&units=metric",
    "/v1/brands?locale=pt-BR",
    "/v1/variants/9007199254740992",
    "/v1/search?q=%00",
  ]) {
    assert.throws(() =>
      validateQuery(new URL("https://worker.example" + path)),
    );
  }
  const query = validateQuery(
    new URL(
      "https://worker.example/v1/brands?cursor=a%2B%2F%3D&limit=5&locale=pt",
    ),
  );
  assert.equal(new URLSearchParams(query.search).get("cursor"), "a+/=");
});
test("erros internos são seguros, com CORS e sem segredo do ambiente", async () => {
  const env = environment();
  env.CARS_DATA_API_KEY = "fixture-private-value";
  env.CARS_QUOTA.get = () => {
    throw Error(env.CARS_DATA_API_KEY);
  };
  const response = await worker.fetch(req("/v1/brands"), env);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.ok(!(await response.text()).includes(env.CARS_DATA_API_KEY));
});
test("CORS expõe Retry-After e não encaminha cookies ou Authorization", async () => {
  const env = environment();
  let internal;
  env.CARS_QUOTA.get = () => ({
    fetch: async (request) => {
      internal = request;
      return new Response("{}", {
        status: 429,
        headers: {
          "Retry-After": "60",
          "Content-Type": "application/problem+json",
        },
      });
    },
  });
  const response = await worker.fetch(
    req("/v1/brands", {
      headers: { Cookie: "private", Authorization: "private" },
    }),
    env,
  );
  assert.equal(
    response.headers.get("Access-Control-Expose-Headers"),
    "Retry-After",
  );
  assert.equal(internal.headers.get("Cookie"), null);
  assert.equal(internal.headers.get("Authorization"), null);
});
test("datas e cotas falham fechadas sem inventar início do mês", () => {
  const env = {
    QUOTA_PERIOD_START: "2026-11-03T00:00:00Z",
    QUOTA_PERIOD_END: "2026-11-23T00:00:00Z",
  };
  const now = Date.parse("2026-11-10T00:00:00Z");
  assert.equal(readQuotaConfig(env, now).periodLimit, 900);
  for (const patch of [
    { QUOTA_PERIOD_END: "" },
    { QUOTA_PERIOD_START: "2026-11-03" },
    { QUOTA_PERIOD_START: "2026-02-30T00:00:00Z" },
    { QUOTA_PERIOD_LIMIT: "1000" },
    { GLOBAL_PER_MINUTE: "20" },
    { QUOTA_INITIAL_USED: "-1" },
  ])
    assert.throws(() => readQuotaConfig({ ...env, ...patch }, now));
  assert.throws(() => readQuotaConfig(env, Date.parse(env.QUOTA_PERIOD_END)));
  assert.throws(() =>
    readOrigins({ ALLOWED_ORIGINS: '["https://user.github.io/repo/"]' }),
  );
  assert.throws(() => readOrigins({ ALLOWED_ORIGINS: '["*"]' }));
  assert.equal(
    readOrigins({ ALLOWED_ORIGINS: '["https://user.github.io"]' }).size,
    1,
  );
});
test("conferência privada de usage devolve só metadados e reserva margem administrativa", async () => {
  const now = Date.parse("2026-11-03T00:00:00Z");
  let call;
  const data = await checkUsage({
    apiKey: "fixture-private-value",
    now,
    fetchImpl: async (url, options) => {
      call = { url, options };
      return Response.json({
        data: { used: 30, quota: 1000, resets_at: "2026-11-23T00:00:00Z" },
      });
    },
  });
  assert.equal(call.url, "https://api.cars-data.com/v1/usage");
  assert.equal(call.options.headers["X-Api-Key"], "fixture-private-value");
  assert.equal(data.suggestedConfig.QUOTA_INITIAL_USED, "31");
  assert.ok(!JSON.stringify(data).includes("fixture-private-value"));
  await assert.rejects(
    checkUsage({
      apiKey: "x",
      now,
      fetchImpl: async () =>
        Response.json({ data: { used: 1, quota: 1000, resets_at: null } }),
    }),
  );
});
