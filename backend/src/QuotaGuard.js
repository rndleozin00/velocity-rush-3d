import { readQuotaConfig } from "./config.js";
import { validateQuery } from "./routes.js";
import { problem } from "./http.js";

const UPSTREAM = "https://api.cars-data.com";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const WINDOW_MS = 60_000;

function retrySeconds(until, now) {
  return Math.max(1, Math.ceil((until - now) / 1000));
}

function upstreamRetryAfter(value, now) {
  if (!value) return 60;
  if (/^\d+(\.\d+)?$/.test(value.trim())) {
    const seconds = Number(value);
    if (
      Number.isSafeInteger(Math.ceil(seconds)) &&
      seconds <= 8_000_000_000_000
    ) {
      return Math.max(1, Math.ceil(seconds));
    }
  }
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.max(1, Math.ceil((date - now) / 1000))
    : 60;
}

/** Um único objeto desta classe deve guardar todas as consultas da mesma credencial. */
export class QuotaGuard {
  constructor(
    ctx,
    env,
    { fetchImpl = (...args) => globalThis.fetch(...args), now = Date.now } = {},
  ) {
    this.ctx = ctx;
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.pendingCooldownUntil = 0;
  }

  reserve(config, clientId, now) {
    if (now < config.periodStartMs || now >= config.periodEndMs) {
      return {
        status: 503,
        code: "PERIODO_INATIVO",
        title:
          "Configure um período de cotas válido antes de consultar o provedor.",
      };
    }
    // A transação é inteiramente síncrona: jamais fazemos fetch dentro dela.
    // A chamada fica contabilizada ANTES do acesso externo, inclusive se esse acesso falhar.
    return this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql;
      sql.exec(`CREATE TABLE IF NOT EXISTS quota_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        period_start INTEGER NOT NULL,
        period_end INTEGER NOT NULL,
        used INTEGER NOT NULL,
        cooldown_until INTEGER NOT NULL DEFAULT 0
      )`);
      sql.exec(`CREATE TABLE IF NOT EXISTS quota_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requested_at INTEGER NOT NULL,
        client_id TEXT NOT NULL
      )`);
      sql.exec(
        "CREATE INDEX IF NOT EXISTS quota_requests_time ON quota_requests(requested_at)",
      );
      sql.exec(
        "CREATE INDEX IF NOT EXISTS quota_requests_client ON quota_requests(client_id, requested_at)",
      );

      let stored = sql
        .exec("SELECT * FROM quota_state WHERE singleton = 1")
        .toArray()[0];
      if (!stored) {
        sql.exec(
          "INSERT INTO quota_state(singleton, period_start, period_end, used) VALUES (1, ?, ?, ?)",
          config.periodStartMs,
          config.periodEndMs,
          config.initialUsed,
        );
        stored = {
          period_start: config.periodStartMs,
          period_end: config.periodEndMs,
          used: config.initialUsed,
          cooldown_until: 0,
        };
      } else if (
        stored.period_start !== config.periodStartMs ||
        stored.period_end !== config.periodEndMs
      ) {
        // Um deploy com outras datas não pode zerar um orçamento ainda ativo.
        if (
          now < stored.period_end ||
          config.periodStartMs < stored.period_end
        ) {
          return {
            status: 503,
            code: "PERIODO_CONFLITANTE",
            title:
              "O período informado conflita com o controle de cotas existente.",
          };
        }
        sql.exec(
          "UPDATE quota_state SET period_start = ?, period_end = ?, used = ? WHERE singleton = 1",
          config.periodStartMs,
          config.periodEndMs,
          config.initialUsed,
        );
        stored.period_start = config.periodStartMs;
        stored.period_end = config.periodEndMs;
        stored.used = config.initialUsed;
      }

      // Uma reconciliação com /usage só pode aumentar o piso; nunca devolver consultas.
      const used = Math.max(stored.used, config.initialUsed);
      if (used !== stored.used) {
        sql.exec("UPDATE quota_state SET used = ? WHERE singleton = 1", used);
      }
      sql.exec(
        "DELETE FROM quota_requests WHERE requested_at <= ?",
        now - WINDOW_MS,
      );

      if (stored.cooldown_until > now) {
        return {
          status: 429,
          code: "PROVEDOR_EM_ESPERA",
          title: "O provedor pediu uma pausa nas consultas.",
          retry: retrySeconds(stored.cooldown_until, now),
        };
      }
      if (used >= config.periodLimit) {
        return {
          status: 429,
          code: "COTA_DO_PERIODO",
          title: "O orçamento de consultas deste período foi atingido.",
          retry: retrySeconds(config.periodEndMs, now),
        };
      }
      const global = sql
        .exec(
          "SELECT COUNT(*) AS count, MIN(requested_at) AS oldest FROM quota_requests",
        )
        .toArray()[0];
      if (global.count >= config.globalPerMinute) {
        return {
          status: 429,
          code: "LIMITE_GLOBAL",
          title: "Aguarde antes de realizar outra consulta.",
          retry: retrySeconds(global.oldest + WINDOW_MS, now),
        };
      }
      const client = sql
        .exec(
          "SELECT COUNT(*) AS count, MIN(requested_at) AS oldest FROM quota_requests WHERE client_id = ?",
          clientId,
        )
        .toArray()[0];
      if (client.count >= config.clientPerMinute) {
        return {
          status: 429,
          code: "LIMITE_DO_CLIENTE",
          title: "Este cliente atingiu o limite temporário de consultas.",
          retry: retrySeconds(client.oldest + WINDOW_MS, now),
        };
      }

      sql.exec(
        "INSERT INTO quota_requests(requested_at, client_id) VALUES (?, ?)",
        now,
        clientId,
      );
      sql.exec("UPDATE quota_state SET used = ? WHERE singleton = 1", used + 1);
      return { allowed: true };
    });
  }

  cooldown(until) {
    // A memória mantém a pausa mesmo se a escrita falhar transitoriamente.
    // Só descartamos o valor pendente depois de confirmar a persistência.
    this.pendingCooldownUntil = Math.max(this.pendingCooldownUntil, until);
    this.persistPendingCooldown();
  }

  persistPendingCooldown() {
    if (!this.pendingCooldownUntil) return;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "UPDATE quota_state SET cooldown_until = MAX(cooldown_until, ?) WHERE singleton = 1",
        this.pendingCooldownUntil,
      );
    });
    this.pendingCooldownUntil = 0;
  }

  async fetch(request) {
    if (request.method !== "POST")
      return problem(405, "METODO_INVALIDO", "Método interno não permitido.");

    let query, clientId, config;
    try {
      const body = await request.json();
      if (
        typeof body.path !== "string" ||
        !body.path.startsWith("/v1/") ||
        typeof body.search !== "string" ||
        (body.search !== "" && !body.search.startsWith("?")) ||
        typeof body.clientId !== "string" ||
        !/^[a-f0-9]{64}$/.test(body.clientId)
      ) {
        return problem(400, "CONSULTA_INVALIDA", "Consulta interna inválida.");
      }
      const url = new URL(body.path + body.search, "https://quota.internal");
      if (url.origin !== "https://quota.internal" || url.hash) {
        return problem(400, "CONSULTA_INVALIDA", "Consulta interna inválida.");
      }
      query = validateQuery(url);
      clientId = body.clientId;
    } catch {
      return problem(400, "CONSULTA_INVALIDA", "Consulta interna inválida.");
    }

    try {
      config = readQuotaConfig(this.env, this.now());
      if (
        typeof this.env.CARS_DATA_API_KEY !== "string" ||
        !this.env.CARS_DATA_API_KEY.trim()
      ) {
        return problem(
          503,
          "SEGREDO_AUSENTE",
          "Configure a credencial no segredo do backend.",
        );
      }
      // Uma pausa ainda não gravada precisa ser reconciliada antes de outra reserva.
      // Se o banco continuar indisponível, o catch bloqueia sem consultar o provedor.
      this.persistPendingCooldown();
      const reservation = this.reserve(config, clientId, this.now());
      if (!reservation.allowed) {
        return problem(
          reservation.status,
          reservation.code,
          reservation.title,
          reservation.retry ?? null,
        );
      }
    } catch {
      return problem(
        503,
        "CONTROLE_INDISPONIVEL",
        "Controle de cotas indisponível. Confira o período e a configuração do backend.",
      );
    }

    const controller = new AbortController();
    let activeReader = null;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      activeReader?.cancel().catch(() => {});
    }, config.timeoutMs);
    try {
      const response = await this.fetchImpl(
        UPSTREAM + query.path + query.search,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-Api-Key": this.env.CARS_DATA_API_KEY,
          },
          // Workers aceita manual/follow. Manual impede enviar a chave a um redirecionamento.
          redirect: "manual",
          cache: "no-store",
          credentials: "omit",
          signal: controller.signal,
        },
      );
      if (response.status === 429) {
        const seconds = upstreamRetryAfter(
          response.headers.get("Retry-After"),
          this.now(),
        );
        let persisted = true;
        try {
          this.cooldown(this.now() + seconds * 1000);
        } catch {
          persisted = false;
        }
        await response.body?.cancel();
        if (!persisted) {
          return problem(
            503,
            "CONTROLE_INDISPONIVEL",
            "Não foi possível persistir a pausa de consultas.",
          );
        }
        return problem(
          429,
          "LIMITE_DO_PROVEDOR",
          "O provedor atingiu um limite temporário de consultas.",
          seconds,
        );
      }
      if (!response.ok) {
        await response.body?.cancel();
        if ([401, 403].includes(response.status)) {
          return problem(
            502,
            "CREDENCIAL_RECUSADA",
            "O provedor recusou a credencial configurada no backend.",
          );
        }
        return problem(
          [400, 404].includes(response.status) ? response.status : 502,
          "ERRO_DO_PROVEDOR",
          "O provedor não conseguiu atender à consulta.",
        );
      }
      if (
        !response.headers.get("Content-Type")?.toLowerCase().includes("json")
      ) {
        await response.body?.cancel();
        return problem(
          502,
          "FORMATO_INVALIDO",
          "O provedor devolveu um formato inesperado.",
        );
      }
      if (Number(response.headers.get("Content-Length")) > MAX_RESPONSE_BYTES) {
        await response.body?.cancel();
        return problem(
          502,
          "RESPOSTA_GRANDE",
          "A resposta do provedor excedeu o limite permitido.",
        );
      }
      const reader = response.body?.getReader();
      if (!reader)
        return problem(
          502,
          "RESPOSTA_INVALIDA",
          "O provedor devolveu uma resposta vazia.",
        );
      activeReader = reader;
      let size = 0;
      const chunks = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          return problem(
            502,
            "RESPOSTA_GRANDE",
            "A resposta do provedor excedeu o limite permitido.",
          );
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const envelope = JSON.parse(new TextDecoder().decode(bytes));
      const object = (value) =>
        value !== null && typeof value === "object" && !Array.isArray(value);
      if (
        !object(envelope) ||
        !Object.hasOwn(envelope, "data") ||
        (query.format === "list"
          ? !Array.isArray(envelope.data)
          : !object(envelope.data))
      ) {
        return problem(
          502,
          "RESPOSTA_INVALIDA",
          "O provedor devolveu dados fora do contrato esperado.",
        );
      }
      const serialized = JSON.stringify(envelope);
      if (serialized.includes(this.env.CARS_DATA_API_KEY)) {
        return problem(
          502,
          "RESPOSTA_INVALIDA",
          "O provedor devolveu dados que não podem ser publicados.",
        );
      }
      if (timedOut || controller.signal.aborted) {
        return problem(
          504,
          "TEMPO_ESGOTADO",
          "O provedor demorou demais para responder.",
        );
      }
      return new Response(serialized, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return timedOut
        ? problem(
            504,
            "TEMPO_ESGOTADO",
            "O provedor demorou demais para responder.",
          )
        : problem(
            502,
            "FALHA_DO_PROVEDOR",
            "Não foi possível concluir a consulta ao provedor.",
          );
    } finally {
      clearTimeout(timer);
    }
  }
}
