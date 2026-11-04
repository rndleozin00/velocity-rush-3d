import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/** Consulta administrativa privada; este arquivo não é importado pelo frontend. */
export async function checkUsage({
  apiKey,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
}) {
  if (typeof apiKey !== "string" || !apiKey.trim() || /[\r\n]/.test(apiKey)) {
    throw new Error(
      "Configure a chave privadamente em backend/.dev.vars ou no ambiente do terminal.",
    );
  }
  const response = await fetchImpl("https://api.cars-data.com/v1/usage", {
    method: "GET",
    headers: { Accept: "application/json", "X-Api-Key": apiKey.trim() },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw new Error(
      "A consulta administrativa falhou. Confira a configuração e tente depois.",
    );
  const { data } = await response.json();
  const end = Date.parse(data?.resets_at);
  if (
    !Number.isSafeInteger(data?.used) ||
    data.used < 0 ||
    !Number.isSafeInteger(data?.quota) ||
    data.quota < 1 ||
    data.used > data.quota ||
    !Number.isFinite(end) ||
    end <= now
  ) {
    throw new Error(
      "O provedor não informou consumo e fim de período válidos. Mantenha as consultas bloqueadas.",
    );
  }
  return {
    used: data.used,
    quota: data.quota,
    resets_at: new Date(end).toISOString(),
    suggestedConfig: {
      QUOTA_PERIOD_START: new Date(now).toISOString(),
      QUOTA_PERIOD_END: new Date(end).toISOString(),
      // Margem para /usage, cuja contabilização antes/depois da resposta não foi confirmada.
      QUOTA_INITIAL_USED: String(Math.min(data.quota, data.used + 1)),
    },
  };
}

async function localKey() {
  if (process.env.CARS_DATA_API_KEY) return process.env.CARS_DATA_API_KEY;
  let text;
  try {
    text = await readFile(new URL("../.dev.vars", import.meta.url), "utf8");
  } catch {
    return "";
  }
  const line = text
    .split(/\r?\n/)
    .find((value) => /^\s*CARS_DATA_API_KEY\s*=/.test(value));
  let value = line?.replace(/^\s*CARS_DATA_API_KEY\s*=\s*/, "").trim() ?? "";
  if (value.startsWith('"')) {
    try {
      value = JSON.parse(value);
    } catch {
      return "";
    }
  } else if (value.startsWith("'") && value.endsWith("'"))
    value = value.slice(1, -1);
  else value = value.replace(/\s+#.*$/, "").trim();
  return value;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (!process.argv.includes("--allow-network")) {
    console.error(
      "Nenhuma consulta foi feita. Após autorizar uma chamada real, use: npm --prefix backend run usage:check -- --allow-network",
    );
    process.exitCode = 1;
  } else {
    try {
      console.log(
        JSON.stringify(await checkUsage({ apiKey: await localKey() }), null, 2),
      );
    } catch {
      console.error(
        "Não foi possível conferir a cota. Verifique a configuração privada, a conexão e a disponibilidade do provedor. Nenhuma chave é exibida.",
      );
      process.exitCode = 1;
    }
  }
}
