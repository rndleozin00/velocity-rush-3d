# Backend seguro — VELOCITY RUSH 3D

Este serviço conecta o cliente `src/apiSupercarros.js` à Cars-Data por meio de um Cloudflare Worker. A chave fica no servidor. O jogo atual continua funcionando com os nove carros fictícios, os quatro circuitos, campeonato, multiplayer e recordes; o catálogo real ainda não foi ligado à interface.

Nenhuma conta, chave, consulta real ou publicação é criada pelos comandos de teste. Publicar o Worker e fazer consultas reais são etapas separadas, que dependem de autorização e configuração do proprietário.

## Arquitetura e limites

```text
Cliente do jogo → Worker (CORS e validação) → Durable Object (cotas) → Cars-Data
```

O Worker aceita apenas as consultas documentadas, acrescenta `X-Api-Key` no servidor e preserva o envelope `{ data, meta, links? }`. Dados ausentes continuam ausentes: o serviço não inventa potência, imagens ou especificações.

Um Durable Object com armazenamento SQLite centraliza as reservas de chamadas. Os contadores persistem entre reinicializações e publicações, com limites compartilhados pelas rotas e pelos jogadores. Uma chamada já reservada continua contada se houver timeout ou falha, pois o provedor pode tê-la contabilizado. Não há retentativa automática nem cache de respostas nesta etapa.

O plano Free da Cars-Data documenta 1.000 chamadas por mês e 20 por minuto. O limite operacional do projeto é menor: 18 por minuto, seis por cliente por minuto e orçamento de 900 por período. A margem não permite usar a chave simultaneamente em outros programas sem reconciliar o consumo. Consulte os [limites e termos oficiais da Cars-Data](https://github.com/mariusmmmmm/car-specs-api#rest-api).

O [plano gratuito da Cloudflare aceita Durable Objects com SQLite](https://developers.cloudflare.com/durable-objects/platform/pricing/), sujeito às cotas de computação e armazenamento compartilhadas da conta. Essa implementação não exige ativar um plano pago. Ao alcançar uma cota gratuita, o serviço pode deixar de atender; disponibilidade ilimitada não faz parte do plano Free.

CORS restringe o uso pelo navegador, mas não autentica pessoas: ferramentas externas conseguem imitar `Origin`. Os limites por cliente mitigam abuso e o orçamento global limita o consumo da credencial. Um terceiro ainda pode disputar essa cota pública. A [documentação Cloudflare](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/#strict-limits) explica por que um contador global persistente é necessário.

## 1. Instalar as ferramentas locais

Use Node.js 22 ou superior. Na pasta principal do projeto:

O runtime atual das ferramentas Cloudflare oferece suporte oficial a Windows 11, macOS 13.5+ e distribuições Linux compatíveis. Em um Windows antigo, prefira um ambiente suportado e não confunda uma falha de inicialização local com falha do backend publicado.

```powershell
node --version
npm ci --prefix backend
```

Isso instala as ferramentas apenas em `backend/node_modules/`, incluindo Wrangler para executar e empacotar o Worker e Miniflare para testes do runtime. Não é necessário instalar Wrangler globalmente nem mudar as dependências do jogo.

Nesta máquina também é possível usar o Node portátil já existente:

```powershell
$env:Path = "$PWD\.tools\node-v22.16.0-win-x64;$env:Path"
npm.cmd ci --prefix backend
```

## 2. Testar sem conta e sem chave real

Na pasta principal:

```powershell
npm --prefix backend test
npm --prefix backend run test:runtime
npm --prefix backend run build
```

Os testes devem usar respostas simuladas, nunca consumir a Cars-Data. A suíte de runtime verifica o Worker e o Durable Object em ambiente local. O build do backend usa `wrangler deploy --dry-run`, escreve o pacote em `backend/.wrangler/build/` e não publica o serviço.

Para verificar o jogo separadamente:

```powershell
npm test
npm run build
```

O build do jogo continua em `dist/`. O backend não deve ser copiado para essa pasta ou incluído como asset do frontend. Os resultados efetivos de cada execução precisam ser conferidos no terminal; esta documentação não substitui um relatório de testes.

### Validação desta entrega

| Verificação executada | Resultado |
| --- | --- |
| Testes unitários e de compatibilidade do backend | 31 passaram |
| Miniflare/workerd com Durable Object SQLite | 3 passaram, incluindo concorrência e persistência após reiniciar |
| Testes existentes do jogo | 11 passaram |
| Build Vite do jogo | Passou |
| Build Wrangler com `--dry-run` | Passou, sem publicação |
| `npm audit` das ferramentas do backend | Zero vulnerabilidades conhecidas após correções |
| Servidor Wrangler local sem chave/período | Retornou 503 sem consultar o provedor |
| Origem não autorizada / preflight permitido | Retornaram 403 / 204, respectivamente |
| Consulta autenticada à Cars-Data e deploy remoto | Não executados; dependem de configuração e autorização |

Os testes usam credenciais e respostas fictícias identificadas como fixtures, sem chamadas ao provedor. A validação de runtime usa o runtime local real da Cloudflare, com saída externa interceptada pelo teste. Foi corrigida a opção de redirecionamento: Workers aceita `manual`, e respostas 3xx são recusadas em vez de encaminhar a credencial a outro endereço.

O Node 22 emite aviso de SQLite experimental nos testes. Vite avisa sobre o tamanho do bundle do jogo (cerca de 536 kB sem gzip). Wrangler avisa quando o comando usa a configuração superior de produção em um arquivo que também define o ambiente `local`. Esses avisos não impediram os builds. Dependências de desenvolvimento `sharp` e `undici` foram fixadas em versões corrigidas por `overrides`, verificadas com os testes e a auditoria; elas não são incluídas no Worker publicado.

## 3. Preparar a configuração local

Copie o exemplo sem sobrescrever um arquivo que já contenha sua configuração:

```powershell
if (-not (Test-Path -LiteralPath backend/.dev.vars)) {
  Copy-Item -LiteralPath backend/.dev.vars.example -Destination backend/.dev.vars
}
```

Edite `backend/.dev.vars` somente no seu computador. A variável secreta é `CARS_DATA_API_KEY`. Nunca cole a chave nesta conversa, no HTML, em `src/`, em variáveis `VITE_`, em argumentos do terminal ou em arquivos enviados ao GitHub. O `.gitignore` protege os arquivos locais de segredos.

As variáveis de configuração são:

| Nome                  | Finalidade                                                                    |
| --------------------- | ----------------------------------------------------------------------------- |
| `CARS_DATA_API_KEY`   | Credencial privada; no Cloudflare deve ser do tipo **Secret**                 |
| `ALLOWED_ORIGINS`     | Lista JSON de origens exatas autorizadas                                      |
| `GLOBAL_PER_MINUTE`   | Teto compartilhado de chamadas por minuto; padrão conservador 18              |
| `CLIENT_PER_MINUTE`   | Teto por cliente por minuto; padrão 6                                         |
| `QUOTA_PERIOD_LIMIT`  | Orçamento total do período; padrão e teto conservador 900                     |
| `QUOTA_PERIOD_START`  | Início da janela configurada, em ISO UTC com `Z`, como `2026-11-03T12:00:00Z` |
| `QUOTA_PERIOD_END`    | Fim confirmado do período do provedor, também em ISO UTC com `Z`              |
| `QUOTA_INITIAL_USED`  | Piso do total já consumido no período; reduzi-lo não devolve chamadas         |
| `UPSTREAM_TIMEOUT_MS` | Tempo limite do provedor, até 8.000 milissegundos                             |

A identidade do objeto é fixa no código: `cars-data-primary`. Não altere essa constante, a classe, o nome do Worker, o binding ou o namespace de armazenamento para zerar contadores.

As datas começam vazias de propósito. Sem credencial e período válidos, as consultas devem falhar antes de alcançar a Cars-Data. Não use datas arbitrárias para contornar o bloqueio.

No ambiente `local`, as origens previstas são `http://localhost:5173` e `http://127.0.0.1:5173`. Elas são diferentes e a porta precisa coincidir com o endereço do Vite. A configuração de produção começa com a lista de origens vazia, recusando acesso até ser preenchida.

## 4. Solicitar a chave Cars-Data e conferir o período

Leia os [termos da Cars-Data](https://cars-data.com/api/terms) antes de aceitar. O [projeto oficial](https://github.com/mariusmmmmm/car-specs-api#rest-api) documenta `POST https://api.cars-data.com/v1/keys` com JSON contendo seu e-mail e `accept_tos: true`. Esse aceite deve ser seu; o projeto não solicita a chave automaticamente. Confirme o e-mail se o serviço pedir e guarde a credencial em local privado.

Depois de configurar a chave localmente e autorizar uma consulta real de administração:

```powershell
npm --prefix backend run usage:check -- --allow-network
```

Esse comando faz uma consulta privada a `/usage`, usando a chave local ou a variável de ambiente. Ele não imprime a chave: apresenta `used`, `quota`, `resets_at` e uma sugestão de configuração do período. Sem `--allow-network`, recusa a operação sem fazer consultas. A sugestão usa `used + 1` como piso conservador, limitado à cota, para reservar margem à chamada administrativa; não sabemos se `/usage` já conta a própria consulta na resposta. Não execute esse comando em loop.

Use os campos de `suggestedConfig`: `QUOTA_INITIAL_USED` inclui a margem administrativa, `QUOTA_PERIOD_END` usa o `resets_at` válido e `QUOTA_PERIOD_START` registra o início da operação controlada. As datas precisam estar em UTC com `Z`. Não presuma que o mês termina ou recomeça no primeiro dia. Se o provedor não informar uma data confiável ou se a consulta falhar, mantenha as chamadas reais bloqueadas até esclarecer o período.

Ao chegar ao fim configurado, o serviço bloqueia novas chamadas. Consulte novamente o provedor de forma privada, confirme a renovação e atualize o período. Não existe renovação automática baseada no calendário. Não troque identidades do Durable Object, nomes de classe ou binding para zerar consumo; o histórico existe para sobreviver a deploys.

Desenvolvimento e produção não compartilham automaticamente o banco do Durable Object. Prefira os testes com mocks no computador. Ao passar para produção, use um único Worker como guardião da credencial e não faça chamadas reais em paralelo por outras instalações locais ou ferramentas. Uma chave usada fora dele pode atingir o limite do provedor antes do contador local.

## 5. Executar o Worker localmente

Depois da configuração, na pasta principal:

```powershell
npm --prefix backend run dev
```

O comando usa `wrangler dev --local --env local`. A base esperada é `http://127.0.0.1:8787/v1`. O servidor roda no seu computador; isso não publica o Worker e não exige uma conta para simular o runtime local. Uma requisição com chave real configurada, contudo, pode consultar o provedor e consumir a cota real.

Em outro terminal, uma consulta de teste manual pode ser feita assim, somente quando as consultas reais estiverem autorizadas:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/v1/brands?locale=pt&limit=5' -Headers @{ Origin = 'http://localhost:5173' }
```

O pedido não contém a chave. O Worker a acrescenta no servidor. As rotas públicas exigem uma origem autorizada; ferramentas de terminal também precisam enviar esse cabeçalho.

## 6. Rotas compatíveis com o cliente

Todos os caminhos abaixo são relativos à base `/v1`. O prefixo remoto da API é fixo; o Worker não funciona como proxy de URLs escolhidas pelo visitante.

| Método e rota                    | Parâmetros aceitos               |
| -------------------------------- | -------------------------------- |
| `GET /brands`                    | `locale`, `cursor`, `limit`      |
| `GET /brands/{slug}/models`      | `locale`, `cursor`, `limit`      |
| `GET /models/{id}/generations`   | `locale`, `cursor`, `limit`      |
| `GET /generations/{id}/variants` | `locale`, `cursor`, `limit`      |
| `GET /specs/catalog`             | `locale`, `cursor`, `limit`      |
| `GET /search`                    | `q`, `locale`, `cursor`, `limit` |
| `GET /variants/{id}`             | `units`                          |
| `GET /variants/{id}/specs`       | `locale`, `units`                |
| `GET /variants/{id}/images`      | nenhum                           |
| `GET /compare`                   | `ids`, `locale`                  |

O locale de português é `pt`. IDs são inteiros positivos; comparação aceita de duas a quatro versões diferentes; a paginação aceita limite de 1 a 50. Um cursor é um token opaco, não uma URL para o Worker seguir. `OPTIONS` permite o preflight necessário ao navegador sem consultar a Cars-Data. `/keys`, `/usage` e exportação em massa não são rotas públicas deste backend. O [OpenAPI oficial](https://github.com/mariusmmmmm/car-specs-api/blob/main/openapi.yaml) é a referência do contrato.

## 7. Criar a conta Cloudflare e configurar produção

Os passos desta seção são orientações para uma publicação futura. Não foram executados automaticamente.

1. Abra [Cloudflare](https://dash.cloudflare.com/sign-up), crie sua conta e confirme o e-mail se solicitado.
2. Entre em **Workers & Pages**. Mantenha o plano **Workers Free**. Não é necessário comprar um domínio para usar um endereço `workers.dev`.
3. No terminal, entre na pasta do backend e autorize Wrangler na sua conta:

```powershell
Push-Location backend
npx wrangler login
npx wrangler whoami
Pop-Location
```

4. Em `backend/wrangler.jsonc`, confira o nome do Worker, o binding `CARS_QUOTA`, a classe `QuotaGuard` e a migração `new_sqlite_classes`. Preserve as identidades estáveis ao atualizar. Não coloque a chave em `vars`. A configuração superior é a produção; `env.local` é destinada somente aos testes locais.
5. Preencha as variáveis públicas de produção e o período confirmado da cota. Em `ALLOWED_ORIGINS`, coloque somente as origens desejadas. Para `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`, a origem é `https://SEU-USUARIO.github.io`, sem o caminho do repositório. Essa origem também é compartilhada pelos outros repositórios Pages do mesmo usuário.
6. Rode testes e build locais. A primeira versão publicada sem segredo deve recusar consultas, em vez de fazer chamadas sem autenticação.
7. Somente após autorização de publicação, execute:

```powershell
Push-Location backend
npx wrangler deploy
Pop-Location
```

8. Guarde o endereço retornado. A base terá formato semelhante a `https://velocity-rush-cars-api.SEUSUBDOMINIO.workers.dev/v1`; use o endereço real que Wrangler informar.
9. No painel Cloudflare, abra o Worker e acesse **Settings → Variables and Secrets → Add**. Crie uma variável chamada exatamente `CARS_DATA_API_KEY`, selecione o tipo **Secret** e informe a chave privadamente. Salve/aplique a alteração. Esse passo altera a configuração remota e faz parte da publicação autorizada.
10. Alternativamente, após o Worker existir e dentro de uma etapa autorizada, o comando abaixo pede o valor de forma interativa. Não inclua a chave como argumento:

```powershell
Push-Location backend
npx wrangler secret put CARS_DATA_API_KEY
Pop-Location
```

O comando `secret put` cria e publica uma nova versão do Worker; ele não é apenas uma edição local. O segredo não é enviado pelo GitHub Pages. Consulte a [documentação oficial de segredos](https://developers.cloudflare.com/workers/configuration/secrets/) para outras formas de gerenciamento.

11. Com origem, período e segredo configurados, autorize uma consulta real pequena e confira o resultado, sem repetir buscas em massa. Verifique o consumo privado e os erros retornados antes de integrar à interface.

## 8. Preparar o frontend para GitHub Pages

O frontend permanece estático e usa `base: './'` no Vite. GitHub Pages hospeda `dist/`; o Worker permanece em serviço separado.

O cliente já permite configurar a URL pública sem credenciais:

```javascript
import { criarClienteSupercarros } from "./apiSupercarros.js";

const api = criarClienteSupercarros({
  baseUrl: "https://SEU-WORKER.workers.dev/v1",
});
```

Esse trecho é um exemplo para a futura integração, não uma alteração já feita nos menus. Nenhuma chave pertence a essa configuração. Ao usar os dados na interface, inclua `Data by cars-data.com` com link para `https://cars-data.com` e respeite as condições de uso de imagens e cache.

## Atualizar sem perder o controle de cotas

Execute os testes, faça o build e revise as diferenças antes de um novo deploy autorizado. Atualizar o código não deve apagar os registros, alterar a identidade do Durable Object nem aumentar os limites. Rotacionar uma chave ou iniciar um novo período exige conferir o consumo e a configuração do provedor.

Não versione `.dev.vars`, arquivos `.env` reais ou o estado de `.wrangler/`. Se uma chave for exposta por engano, remova o acesso ao segredo comprometido e solicite sua revogação/rotação ao provedor; apagar apenas o arquivo público não torna a credencial privada novamente.

## Resolver problemas comuns

Uma falha de armazenamento faz a chamada falhar sem liberar outra consulta. Uma pausa observada do provedor também é guardada em memória enquanto sua persistência é tentada. Se houver reinicialização justamente após falha na gravação dessa pausa, a espera que não chegou ao disco não poderá ser recuperada; nesse caso, confira o consumo e o `Retry-After` antes de retomar. As reservas já persistidas continuam contabilizadas.

| Problema                                    | O que conferir                                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `node` ou `npm` não encontrados             | Instale Node 22+ ou configure o Node portátil neste terminal                                                                 |
| Worker recusa consultas logo ao iniciar     | Segredo, datas do período e variáveis obrigatórias ainda podem estar vazios                                                  |
| Erro de CORS/403                            | A origem deve coincidir com esquema, host e porta; não use caminho de repositório ou `*`                                     |
| HTTP 429                                    | Aguarde `Retry-After`; não faça loops de repetição nem aumente limites para contornar o provedor                             |
| Período expirado                            | Confira `/usage` privadamente e configure o período renovado confirmado                                                      |
| Provedor responde 401/403                   | Confira o segredo no ambiente correto, a validade da chave e os termos aceitos                                               |
| Timeout/502/503                             | Confira disponibilidade do provedor e do armazenamento; não apague contadores para tentar resolver                           |
| Erro no runtime local                       | Confira suporte do Windows/Node às ferramentas e a instalação por `npm ci`; reporte a falha sem tratá-la como teste aprovado |
| Jogo abre, mas não mostra supercarros reais | A integração visual está reservada para uma próxima etapa                                                                    |

## Referências

- [Contrato e código da Cars-Data](https://github.com/mariusmmmmm/car-specs-api)
- [Instalar e executar Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- [Começar pelo terminal Cloudflare](https://developers.cloudflare.com/workers/get-started/guide/)
- [Durable Objects no plano gratuito](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Controle global de requisições](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/#strict-limits)
- [Segredos no Worker](https://developers.cloudflare.com/workers/configuration/secrets/)
