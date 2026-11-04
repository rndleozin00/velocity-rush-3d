import { readOrigins } from "./config.js";
import { problem, safeError } from "./http.js";
import { validateQuery } from "./routes.js";
export { QuotaGuard } from "./QuotaGuard.js";

// Este identificador é compartilhado por todas as origens, rotas e versões do deploy.
const QUOTA_OBJECT_NAME = "cars-data-primary";

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Vary", "Origin");
  headers.set("X-Content-Type-Options", "nosniff");
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Expose-Headers", "Retry-After");
  }
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request, env) {
    let allowedOrigin = null;
    try {
      const origin = request.headers.get("Origin");
      if (!origin || !readOrigins(env).has(origin)) {
        return withCors(
          problem(403, "ORIGIN_NOT_ALLOWED", "Origem não autorizada."),
          null,
        );
      }
      allowedOrigin = origin;
      if (!["GET", "OPTIONS"].includes(request.method)) {
        const response = problem(
          405,
          "METHOD_NOT_ALLOWED",
          "Método não permitido.",
        );
        response.headers.set("Allow", "GET, OPTIONS");
        return withCors(response, origin);
      }
      const query = validateQuery(new URL(request.url));
      if (request.method === "OPTIONS") {
        const method = request.headers.get("Access-Control-Request-Method");
        const requestedHeaders = (
          request.headers.get("Access-Control-Request-Headers") ?? ""
        )
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean);
        if (
          method !== "GET" ||
          requestedHeaders.some((header) => header !== "accept")
        ) {
          return withCors(
            problem(
              403,
              "PREFLIGHT_NOT_ALLOWED",
              "Consulta de origem cruzada não autorizada.",
            ),
            origin,
          );
        }
        const response = withCors(new Response(null, { status: 204 }), origin);
        response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
        response.headers.set("Access-Control-Allow-Headers", "Accept");
        response.headers.set("Access-Control-Max-Age", "300");
        return response;
      }
      // CF-Connecting-IP é definido pela borda Cloudflare; nunca usamos X-Forwarded-For.
      // Hash não é anonimização forte: não persistimos IP bruto e removemos entradas antigas.
      const clientIp =
        request.headers.get("CF-Connecting-IP") || "local-unknown";
      if (clientIp.length > 128)
        return withCors(
          problem(400, "INVALID_CLIENT", "Cliente inválido."),
          origin,
        );
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(clientIp),
      );
      const clientId = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const id = env.CARS_QUOTA.idFromName(QUOTA_OBJECT_NAME);
      const stub = env.CARS_QUOTA.get(id);
      const response = await stub.fetch(
        new Request("https://quota.internal/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: query.path,
            search: query.search,
            clientId,
          }),
        }),
      );
      return withCors(response, origin);
    } catch (error) {
      return withCors(safeError(error), allowedOrigin);
    }
  },
};
