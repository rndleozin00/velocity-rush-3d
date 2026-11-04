import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare, Log, LogLevel } from "miniflare";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join, sep } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const origin = "http://localhost:5173";
const fixtureKey = "fixture-private-api-key";
function runtime({
  limit = 900,
  used = 0,
  persist = false,
  calls = [],
  period,
} = {}) {
  const now = Date.now();
  return new Miniflare({
    name: "velocity-rush-test",
    scriptPath: join(root, "src/worker.js"),
    modules: true,
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    modulesRoot: join(root, "src"),
    compatibilityDate: "2026-07-30",
    log: new Log(LogLevel.NONE),
    durableObjects: {
      CARS_QUOTA: { className: "QuotaGuard", useSQLite: true },
    },
    durableObjectsPersist: persist,
    bindings: {
      CARS_DATA_API_KEY: fixtureKey,
      ALLOWED_ORIGINS: JSON.stringify([origin]),
      GLOBAL_PER_MINUTE: "18",
      CLIENT_PER_MINUTE: "6",
      QUOTA_PERIOD_LIMIT: String(limit),
      QUOTA_INITIAL_USED: String(used),
      QUOTA_PERIOD_START:
        period?.start ?? new Date(now - 86400000).toISOString(),
      QUOTA_PERIOD_END: period?.end ?? new Date(now + 86400000).toISOString(),
    },
    outboundService: async (request) => {
      const url = new URL(request.url);
      calls.push(url.pathname + url.search);
      assert.equal(url.origin, "https://api.cars-data.com");
      assert.equal(request.headers.get("X-Api-Key"), fixtureKey);
      assert.equal(request.headers.get("Cookie"), null);
      return Response.json({
        data: [],
        meta: { locale: "pt" },
        links: { next: null },
      });
    },
  });
}
const get = (mf, path = "/v1/brands", ip = "192.0.2.1") =>
  mf.dispatchFetch("https://worker.example" + path, {
    headers: { Origin: origin, "CF-Connecting-IP": ip },
  });

test("runtime real: Worker → Durable Object SQLite → provedor simulado", async () => {
  const calls = [],
    mf = runtime({ calls });
  try {
    const response = await get(mf, "/v1/search?q=Ferrari&locale=pt&limit=5");
    assert.equal(
      response.status,
      200,
      JSON.stringify({ body: await response.clone().text(), calls }),
    );
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual((await response.json()).data, []);
    assert.deepEqual(calls, ["/v1/search?limit=5&locale=pt&q=Ferrari"]);
  } finally {
    await mf.dispose();
  }
});
test("runtime real: consultas concorrentes compartilham reserva SQLite", async () => {
  const calls = [],
    mf = runtime({ limit: 2, calls });
  try {
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        get(mf, "/v1/brands", `192.0.2.${i + 1}`),
      ),
    );
    assert.equal(responses.filter((r) => r.status === 200).length, 2);
    assert.equal(responses.filter((r) => r.status === 429).length, 6);
    assert.equal(calls.length, 2);
  } finally {
    await mf.dispose();
  }
});
test("runtime real: estado de cota permanece após recriar o runtime", async () => {
  const storageRoot = resolve(root, ".wrangler"),
    calls = [];
  await mkdir(storageRoot, { recursive: true });
  const persist = await mkdtemp(join(storageRoot, "runtime-test-"));
  const now = Date.now(),
    period = {
      start: new Date(now - 86400000).toISOString(),
      end: new Date(now + 86400000).toISOString(),
    };
  const mf = runtime({ limit: 1, persist, calls, period });
  let disposed = false;
  // Os mesmos limites temporais são usados nas duas instâncias, como em um redeploy.
  try {
    assert.equal((await get(mf)).status, 200);
    await mf.dispose();
    disposed = true;
    const again = runtime({ limit: 1, persist, calls, period });
    try {
      assert.equal((await get(again)).status, 429);
      assert.equal(calls.length, 1);
    } finally {
      await again.dispose();
    }
  } finally {
    if (!disposed) await mf.dispose();
    if (!resolve(persist).startsWith(storageRoot + sep))
      throw Error("Pasta de teste inválida");
    await rm(persist, { recursive: true, force: true });
  }
});
