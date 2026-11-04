import { RequestError } from "./http.js";

function invalidConfig() {
  throw new RequestError(
    503,
    "CONFIGURATION_REQUIRED",
    "O backend precisa de configuração válida antes de consultar a API.",
  );
}

function integer(value, fallback, min, max) {
  const raw = value === undefined ? String(fallback) : String(value);
  if (!/^\d+$/.test(raw)) invalidConfig();
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    invalidConfig();
  return parsed;
}

// UTC explícito evita assumir timezone ou calendário de renovação do provedor.
function utcDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)
  )
    invalidConfig();
  const [whole, fraction = ""] = value.slice(0, -1).split(".");
  const expected = whole + "." + fraction.padEnd(3, "0") + "Z";
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== expected)
    invalidConfig();
  return time;
}

export function readQuotaConfig(env, now = Date.now()) {
  const periodStartMs = utcDate(env.QUOTA_PERIOD_START);
  const periodEndMs = utcDate(env.QUOTA_PERIOD_END);
  if (periodStartMs >= periodEndMs || now < periodStartMs || now >= periodEndMs)
    invalidConfig();
  return {
    periodStartMs,
    periodEndMs,
    initialUsed: integer(env.QUOTA_INITIAL_USED, 0, 0, 1000),
    periodLimit: integer(env.QUOTA_PERIOD_LIMIT, 900, 1, 900),
    globalPerMinute: integer(env.GLOBAL_PER_MINUTE, 18, 1, 18),
    clientPerMinute: integer(env.CLIENT_PER_MINUTE, 6, 1, 18),
    timeoutMs: integer(env.UPSTREAM_TIMEOUT_MS, 8000, 1, 8000),
  };
}

export function readOrigins(env) {
  let origins;
  try {
    origins = JSON.parse(env.ALLOWED_ORIGINS ?? "[]");
  } catch {
    invalidConfig();
  }
  if (!Array.isArray(origins) || origins.length > 20) invalidConfig();
  for (const origin of origins) {
    if (typeof origin !== "string") invalidConfig();
    let url;
    try {
      url = new URL(origin);
    } catch {
      invalidConfig();
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    )
      invalidConfig();
  }
  return new Set(origins);
}
