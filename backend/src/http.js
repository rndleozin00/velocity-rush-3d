export function problem(status, code, title, retryAfterSeconds = null) {
  const headers = new Headers({
    "Content-Type": "application/problem+json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (Number.isFinite(retryAfterSeconds)) {
    headers.set(
      "Retry-After",
      String(Math.max(1, Math.ceil(retryAfterSeconds))),
    );
  }
  return new Response(
    JSON.stringify({ type: "about:blank", status, code, title }),
    { status, headers },
  );
}

export class RequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function safeError(error) {
  return error instanceof RequestError
    ? problem(error.status, error.code, error.message)
    : problem(
        503,
        "SERVICE_UNAVAILABLE",
        "Serviço temporariamente indisponível.",
      );
}
