import { RequestError } from "./http.js";

const locales = new Set([
  "en",
  "ro",
  "fr",
  "de",
  "es",
  "it",
  "sr",
  "hr",
  "pt",
  "pl",
  "cs",
  "sk",
  "hu",
  "no",
  "sv",
  "el",
  "bg",
  "da",
  "ar",
]);
const pageParams = ["locale", "cursor", "limit"];
const routes = [
  { pattern: /^\/v1\/brands$/, params: pageParams, format: "list" },
  {
    pattern: /^\/v1\/brands\/([^/]+)\/models$/,
    params: pageParams,
    format: "list",
    slug: true,
  },
  {
    pattern: /^\/v1\/models\/(\d+)\/generations$/,
    params: pageParams,
    format: "list",
    id: true,
  },
  {
    pattern: /^\/v1\/generations\/(\d+)\/variants$/,
    params: pageParams,
    format: "list",
    id: true,
  },
  { pattern: /^\/v1\/specs\/catalog$/, params: pageParams, format: "list" },
  {
    pattern: /^\/v1\/search$/,
    params: ["q", ...pageParams],
    format: "list",
    search: true,
  },
  {
    pattern: /^\/v1\/variants\/(\d+)$/,
    params: ["units"],
    format: "object",
    id: true,
  },
  {
    pattern: /^\/v1\/variants\/(\d+)\/specs$/,
    params: ["locale", "units"],
    format: "object",
    id: true,
  },
  {
    pattern: /^\/v1\/variants\/(\d+)\/images$/,
    params: [],
    format: "list",
    id: true,
  },
  {
    pattern: /^\/v1\/compare$/,
    params: ["ids", "locale"],
    format: "list",
    compare: true,
  },
];

function invalid() {
  throw new RequestError(
    400,
    "INVALID_PARAMETERS",
    "Parâmetros de consulta inválidos.",
  );
}
function positiveId(value) {
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1
  )
    invalid();
  return String(Number(value));
}

export function validateQuery(url) {
  if (url.href.length > 10000 || url.hash) invalid();
  const route = routes.find((item) => item.pattern.test(url.pathname));
  if (!route)
    throw new RequestError(404, "ROUTE_NOT_FOUND", "Rota não encontrada.");
  const match = url.pathname.match(route.pattern);
  let path = url.pathname;
  if (route.id) path = path.replace(match[1], positiveId(match[1]));
  if (route.slug) {
    let slug;
    try {
      slug = decodeURIComponent(match[1]);
    } catch {
      invalid();
    }
    if (
      !slug ||
      slug.length > 120 ||
      /[\/\\?#%\s\u0000-\u001f]/u.test(slug) ||
      [".", ".."].includes(slug)
    )
      invalid();
    path = `/v1/brands/${encodeURIComponent(slug)}/models`;
  }
  const params = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (
      !route.params.includes(key) ||
      params.has(key) ||
      /[\u0000-\u001f\u007f]/u.test(value)
    )
      invalid();
    params.set(key, value);
  }
  if (params.has("locale") && !locales.has(params.get("locale"))) invalid();
  if (
    params.has("units") &&
    !["metric", "imperial"].includes(params.get("units"))
  )
    invalid();
  if (params.has("limit")) {
    const value = params.get("limit");
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 50)
      invalid();
    params.set("limit", String(Number(value)));
  }
  if ((params.get("cursor")?.length ?? 0) > 4096) invalid();
  if (route.search) {
    const q = params.get("q");
    if (q === null || !q.trim() || q.trim().length > 200) invalid();
    params.set("q", q.trim());
  }
  if (route.compare) {
    const ids = params.get("ids")?.split(",");
    if (!ids || ids.length < 2 || ids.length > 4) invalid();
    const normalized = ids.map(positiveId);
    if (new Set(normalized).size !== normalized.length) invalid();
    params.set("ids", normalized.join(","));
  }
  params.sort();
  const search = params.toString();
  return { path, search: search ? "?" + search : "", format: route.format };
}
