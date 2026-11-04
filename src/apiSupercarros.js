/**
 * Cliente de consulta Cars-Data para um BACKEND intermediário, ainda não conectado ao jogo.
 * Contrato: https://github.com/mariusmmmmm/car-specs-api/blob/main/openapi.yaml
 *
 * O backend deverá expor as rotas documentadas abaixo da baseUrl informada e adicionar
 * a credencial no servidor. Este módulo não recebe chave, não chama a API diretamente
 * e não faz requisições ao ser importado. /keys e /usage ficam fora do cliente público.
 *
 * Uso futuro (a URL abaixo representa o backend que ainda será configurado):
 * const api = criarClienteSupercarros({ baseUrl: URL_PUBLICA_DO_BACKEND });
 * const { data, meta, links } = await api.pesquisar("Ferrari", { signal });
 * Para outra página, passe links.next como cursor, sem tratá-lo como URL.
 *
 * Campos null/ausentes permanecem assim; cabe à interface mostrar "Não informado".
 * Não há cache persistente nem retentativas automáticas. Cache e cota global devem
 * ser tratados pelo backend conforme os termos. Debounce não substitui rate limiting.
 */

export const ATRIBUICAO_CARS_DATA = Object.freeze({
  texto: "Data by cars-data.com",
  url: "https://cars-data.com",
});

const IDIOMAS = new Set([
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

export class ErroApiSupercarros extends Error {
  constructor(
    codigo,
    mensagem,
    { status = 0, retentarAposSegundos = null } = {},
  ) {
    super(mensagem);
    this.name = "ErroApiSupercarros";
    this.codigo = codigo;
    this.status = status;
    this.retentarAposSegundos = retentarAposSegundos;
  }
}

function parametroInvalido(mensagem) {
  return new ErroApiSupercarros("PARAMETRO_INVALIDO", mensagem);
}

function validarId(valor) {
  if (
    !["number", "string"].includes(typeof valor) ||
    !/^\d+$/.test(String(valor)) ||
    !Number.isSafeInteger(Number(valor)) ||
    Number(valor) < 1
  ) {
    throw parametroInvalido(
      "Use um identificador inteiro positivo retornado pela API.",
    );
  }
  return String(Number(valor));
}

function validarSlug(valor) {
  if (
    typeof valor !== "string" ||
    !valor ||
    valor.length > 120 ||
    /[\/\\?#%\s\u0000-\u001f]/u.test(valor) ||
    [".", ".."].includes(valor)
  ) {
    throw parametroInvalido("Use o slug da marca retornado pelo catálogo.");
  }
  return encodeURIComponent(valor);
}

function validarIdioma(locale = "pt") {
  if (!IDIOMAS.has(locale)) {
    throw parametroInvalido("Idioma inválido. Para português, use pt.");
  }
  return locale;
}

function validarUnidades(units = "metric") {
  if (!["metric", "imperial"].includes(units)) {
    throw parametroInvalido("As unidades devem ser metric ou imperial.");
  }
  return units;
}

function paginacao({ locale, limit = 10, cursor } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw parametroInvalido("O limite por página deve estar entre 1 e 50.");
  }
  const params = { locale: validarIdioma(locale), limit };
  if (cursor !== undefined && cursor !== null) {
    if (typeof cursor !== "string" || cursor.length > 4096) {
      throw parametroInvalido("Cursor de paginação inválido.");
    }
    params.cursor = cursor;
  }
  return params;
}

function validarBase(baseUrl) {
  if (baseUrl === undefined || baseUrl === "") return null;
  let url;
  try {
    if (typeof baseUrl !== "string") throw new TypeError();
    url = new URL(baseUrl);
  } catch {
    throw new ErroApiSupercarros(
      "CONFIGURACAO_INVALIDA",
      "Informe uma URL absoluta para o backend.",
    );
  }
  const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    hostname === "cars-data.com" ||
    hostname.endsWith(".cars-data.com")
  ) {
    throw new ErroApiSupercarros(
      "CONFIGURACAO_INVALIDA",
      "Use a URL HTTPS do seu backend, sem credenciais, query ou fragmento. HTTP é permitido apenas em localhost.",
    );
  }
  return url.href.replace(/\/+$/, "") + "/";
}

function lerRetryAfter(valor) {
  if (!valor?.trim()) return null;
  if (/^\d+(\.\d+)?$/.test(valor.trim())) {
    const segundos = Number(valor);
    return Number.isFinite(segundos) ? Math.ceil(segundos) : null;
  }
  const instante = Date.parse(valor);
  return Number.isFinite(instante)
    ? Math.max(0, Math.ceil((instante - Date.now()) / 1000))
    : null;
}

function erroHttp(response) {
  const mensagens = {
    400: "O backend recusou os parâmetros da consulta.",
    401: "O backend precisa de uma credencial válida no servidor.",
    403: "O backend não autorizou esta consulta.",
    404: "Veículo ou recurso não encontrado.",
    429: "Limite de consultas atingido. Aguarde antes de tentar novamente.",
  };
  const codigo = response.status === 429 ? "LIMITE_ATINGIDO" : "ERRO_HTTP";
  return new ErroApiSupercarros(
    codigo,
    mensagens[response.status] ||
      "O serviço de consulta está indisponível no momento.",
    {
      status: response.status,
      retentarAposSegundos: lerRetryAfter(response.headers.get("Retry-After")),
    },
  );
}

/** A base deve incluir o prefixo de rotas escolhido no backend, se houver. */
export function criarClienteSupercarros({
  baseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10000,
} = {}) {
  const base = validarBase(baseUrl);
  if (typeof fetchImpl !== "function") {
    throw new ErroApiSupercarros(
      "FETCH_INDISPONIVEL",
      "Este ambiente não oferece suporte a fetch.",
    );
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) {
    throw parametroInvalido(
      "O tempo limite deve estar entre 1 e 120000 milissegundos.",
    );
  }

  async function consultar(caminho, params, signal, formato = "lista") {
    if (!base) {
      throw new ErroApiSupercarros(
        "BACKEND_NAO_CONFIGURADO",
        "Configure a URL do backend seguro para consultar carros reais.",
      );
    }
    if (
      signal &&
      (typeof signal.addEventListener !== "function" ||
        typeof signal.removeEventListener !== "function" ||
        typeof signal.aborted !== "boolean")
    ) {
      throw parametroInvalido("O cancelamento deve usar um AbortSignal.");
    }
    if (signal?.aborted) {
      throw new ErroApiSupercarros("CANCELADO", "Consulta cancelada.");
    }
    // Caminhos relativos mantêm o prefixo da base; nenhum cursor vira URL externa.
    const url = new URL(caminho, base);
    url.search = new URLSearchParams(params).toString();
    const controller = new AbortController();
    const cancelar = () => controller.abort();
    let tempoEsgotado = false;
    signal?.addEventListener("abort", cancelar, { once: true });
    const timer = setTimeout(() => {
      tempoEsgotado = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetchImpl(url.href, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (!response.ok) throw erroHttp(response);
      if (
        !response.headers.get("Content-Type")?.toLowerCase().includes("json")
      ) {
        throw new ErroApiSupercarros(
          "RESPOSTA_INVALIDA",
          "O backend não devolveu uma resposta JSON.",
        );
      }
      let envelope;
      try {
        envelope = await response.json();
      } catch {
        throw new ErroApiSupercarros(
          "RESPOSTA_INVALIDA",
          "O backend devolveu um JSON inválido.",
        );
      }
      const objeto = (value) =>
        value !== null && typeof value === "object" && !Array.isArray(value);
      if (
        !objeto(envelope) ||
        !Object.hasOwn(envelope, "data") ||
        (formato === "lista"
          ? !Array.isArray(envelope.data)
          : !objeto(envelope.data))
      ) {
        throw new ErroApiSupercarros(
          "RESPOSTA_INVALIDA",
          "A resposta não corresponde ao contrato de dados esperado.",
        );
      }
      if (controller.signal.aborted) throw new Error("aborted");
      return envelope;
    } catch (error) {
      if (tempoEsgotado) {
        throw new ErroApiSupercarros(
          "TEMPO_ESGOTADO",
          "O serviço demorou demais para responder.",
        );
      }
      if (controller.signal.aborted) {
        throw new ErroApiSupercarros("CANCELADO", "Consulta cancelada.");
      }
      if (error instanceof ErroApiSupercarros) throw error;
      throw new ErroApiSupercarros(
        "FALHA_DE_REDE",
        "Não foi possível conectar ao backend. Verifique a conexão e a configuração de CORS.",
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancelar);
    }
  }

  return Object.freeze({
    configurado: base !== null,

    async listarMarcas(options = {}) {
      return consultar("brands", paginacao(options), options.signal);
    },

    async listarModelos(slug, options = {}) {
      return consultar(
        `brands/${validarSlug(slug)}/models`,
        paginacao(options),
        options.signal,
      );
    },

    async listarGeracoes(modeloId, options = {}) {
      return consultar(
        `models/${validarId(modeloId)}/generations`,
        paginacao(options),
        options.signal,
      );
    },

    async listarVersoes(geracaoId, options = {}) {
      return consultar(
        `generations/${validarId(geracaoId)}/variants`,
        paginacao(options),
        options.signal,
      );
    },

    async listarTiposEspecificacao(options = {}) {
      return consultar("specs/catalog", paginacao(options), options.signal);
    },

    async pesquisar(termo, options = {}) {
      // O máximo de 200 caracteres é uma proteção local, não um limite declarado pela API.
      if (
        typeof termo !== "string" ||
        !termo.trim() ||
        termo.trim().length > 200
      ) {
        throw parametroInvalido(
          "A pesquisa deve conter entre 1 e 200 caracteres.",
        );
      }
      return consultar(
        "search",
        { q: termo.trim(), ...paginacao(options) },
        options.signal,
      );
    },

    async obterVersao(id, { units, signal } = {}) {
      return consultar(
        `variants/${validarId(id)}`,
        { units: validarUnidades(units) },
        signal,
        "objeto",
      );
    },

    async obterEspecificacoes(id, { locale, units, signal } = {}) {
      return consultar(
        `variants/${validarId(id)}/specs`,
        {
          locale: validarIdioma(locale),
          units: validarUnidades(units),
        },
        signal,
        "objeto",
      );
    },

    async obterImagens(id, { signal } = {}) {
      return consultar(`variants/${validarId(id)}/images`, {}, signal);
    },

    async comparar(ids, { locale, signal } = {}) {
      if (!Array.isArray(ids) || ids.length < 2 || ids.length > 4) {
        throw parametroInvalido(
          "Selecione entre dois e quatro identificadores de versões.",
        );
      }
      const validados = Array.from(ids, validarId);
      if (new Set(validados).size !== validados.length) {
        throw parametroInvalido("Selecione versões diferentes para comparar.");
      }
      return consultar(
        "compare",
        { ids: validados.join(","), locale: validarIdioma(locale) },
        signal,
      );
    },
  });
}

/** Use na futura interface antes de atribuir uma URL externa a img.src. */
export function urlImagemSegura(valor) {
  if (typeof valor !== "string") return null;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/**
 * Busca para futura barra de pesquisa. Cada chamada substitui a anterior, que rejeita
 * com codigo CANCELADO. A interface deve ignorar esse erro ao trocar o termo.
 * cancelar() também deve ser chamado ao sair da tela para liberar timer e requisição.
 */
export function criarPesquisaComDebounce(cliente, atrasoMs = 500) {
  if (
    typeof cliente?.pesquisar !== "function" ||
    !Number.isInteger(atrasoMs) ||
    atrasoMs < 0 ||
    atrasoMs > 10000
  ) {
    throw parametroInvalido(
      "Informe um cliente e um atraso entre 0 e 10000 milissegundos.",
    );
  }
  let atual = null;

  function cancelar() {
    if (!atual) return;
    const tarefa = atual;
    atual = null;
    clearTimeout(tarefa.timer);
    tarefa.controller.abort();
    tarefa.limparSinal();
    tarefa.reject(
      new ErroApiSupercarros("CANCELADO", "Pesquisa substituída ou cancelada."),
    );
  }

  function pesquisar(termo, options = {}) {
    cancelar();
    return new Promise((resolve, reject) => {
      const externo = options.signal;
      if (
        externo &&
        (typeof externo.addEventListener !== "function" ||
          typeof externo.removeEventListener !== "function" ||
          typeof externo.aborted !== "boolean")
      ) {
        reject(parametroInvalido("O cancelamento deve usar um AbortSignal."));
        return;
      }
      if (externo?.aborted) {
        reject(new ErroApiSupercarros("CANCELADO", "Pesquisa cancelada."));
        return;
      }
      const tarefa = {
        controller: new AbortController(),
        reject,
        timer: null,
        limparSinal: () => externo?.removeEventListener("abort", cancelar),
      };
      atual = tarefa;
      externo?.addEventListener("abort", cancelar, { once: true });
      tarefa.timer = setTimeout(async () => {
        try {
          const resposta = await cliente.pesquisar(termo, {
            ...options,
            signal: tarefa.controller.signal,
          });
          if (atual === tarefa) resolve(resposta);
        } catch (error) {
          reject(error);
        } finally {
          tarefa.limparSinal();
          if (atual === tarefa) atual = null;
        }
      }, atrasoMs);
    });
  }

  return Object.freeze({ pesquisar, cancelar });
}

export default criarClienteSupercarros;
