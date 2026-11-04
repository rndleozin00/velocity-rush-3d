# Entrega da primeira versão

O arquivo preexistente `inicio.md` foi preservado. Não havia código para adaptar. Nenhum commit, repositório remoto ou publicação foi realizado.

## Etapas 1 a 5 — base jogável

| Etapa            | Arquivos principais                                                 | Implementação                                                         | Validação                                                              |
| ---------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Estrutura     | `package.json`, `package-lock.json`, `vite.config.js`, `index.html` | Vite, Three.js e base relativa                                        | Instalação, build e abertura no Chrome                                 |
| 2. Carro e pista | `Car.js`, `Track.js`, `Game.js`                                     | Carro procedural, asfalto, cenário e câmera                           | Renderização WebGL e aceleração via teclado                            |
| 3. Física        | `Physics.js`, `InputManager.js`                                     | Aceleração, ré, curvas, freio, limites e colisões                     | Testes de condução e corrida no navegador                              |
| 4. Corrida       | `Progress.js`, `Game.js`, `main.js`                                 | Contagem regressiva, oito portões, voltas, classificação e resultados | Testes contra atalhos e corrida concluída no Chrome                    |
| 5. Bots          | `AIController.js`                                                   | Antecipação de curvas, três dificuldades e variações laterais         | IA completa os quatro traçados; corridas de nove veículos no navegador |

Execute `npm run dev` para jogar e `npm test` para a lógica. Teste manualmente uma volta com WASD, freio e ré; valide que cortar os portões não registra a chegada. A física é arcade e as colisões aproximadas; não há danos nem capotamentos.

## Etapas 6 a 9 — escolhas e modos

| Etapa            | Arquivos principais                     | Implementação                                                  | Validação                                                                  |
| ---------------- | --------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 6. Garagem       | `cars.js`, `Car.js`, `main.js`          | Nove carros, atributos funcionais, cores e rotação por arraste | Troca de carro/cor e seleção no Chrome                                     |
| 7. Mapas         | `tracks.js`, `Track.js`, `main.js`      | Quatro traçados e ambientes, miniaturas e minimapa             | IA completa cada circuito e campeonato passa pelos quatro                  |
| 8. Menus e modos | `main.js`, `SaveManager.js`             | Corrida rápida, contra o tempo, campeonato e recordes          | Corridas completas nos modos e pontuação das quatro etapas                 |
| 9. Multiplayer   | `Game.js`, `InputManager.js`, `main.js` | Dois humanos, sete bots e duas câmeras                         | WASD e setas aceleram independentemente; ambos concluem a corrida de teste |

Execute `npm run dev`. Na garagem, selecione um carro e confirme; no menu Circuitos, escolha o traçado. Para testar o campeonato, configure uma volta na tela Jogar e inicie uma temporada no menu Campeonato. Os testes de chegada no navegador usam um piloto automático de teste conectado à física real; não equivalem a uma sessão humana de avaliação de dirigibilidade.

O segundo jogador usa o próximo carro da garagem. Não há seleção independente de carro para J2, multiplayer online ou suporte a três/quatro humanos. Os circuitos são planos, com relevo apenas cenográfico. A IA é básica e pode se aglomerar.

## Etapa 10 — interface e compatibilidade inicial

Arquivos: `style.css`, `main.js`, `AudioManager.js`, `SaveManager.js`, `public/favicon.svg` e ajustes em `Game.js`/`Track.js`.

Inclui menu responsivo, HUD, sons sintetizados, volume, sombras opcionais, rodas animadas, luzes de freio, controle por toque, resolução limitada e agrupamento do cenário para reduzir chamadas gráficas. O modo leve foi confirmado na emulação móvel do Chrome, sem transbordamento horizontal. A entrada real por toque emulada acelerou o carro. Os fluxos verificados terminaram sem erros no console.

Teste `npm run dev` e abra no celular pela mesma rede. Falta validar desempenho, áudio e múltiplos toques em aparelhos físicos. Não há partículas, marcas de pneus, nitro, texturas fotográficas ou música. Somente o motor, colisão, contagem e chegada possuem sinais sonoros; não há sons separados de frenagem/vitória/derrota.

## Etapa 11 — pronta para publicar, sem publicação

Arquivos: `.github/workflows/deploy.yml`, `.gitignore`, `vite.config.js` e `README.md`.

Execute `npm test` e `npm run build`; `npm run preview` serve o resultado. O build usa caminhos relativos compatíveis com subdiretórios. O README detalha criação do repositório, primeiro commit, push, ativação do GitHub Pages e atualizações.

Falta criar o repositório público e executar o deploy após autorização. Por isso ainda não existe link público. A validação local não substitui abrir o endereço final no computador e no celular depois da publicação.

## Verificação automatizada

Os testes de lógica ficam em `tests/race.test.js`. As verificações locais de navegador e capturas foram feitas com Playwright/Chrome em `.tools/qa`, pasta auxiliar ignorada pelo Git. O projeto não precisa do Playwright para executar, gerar build ou publicar.

Para retomar o desenvolvimento: primeiro experimente corridas humanas completas e ajuste sensação de direção/dificuldade; depois aprofunde modelos, pista com relevo, efeitos e desempenho em dispositivos reais.

Resultado final: **11 testes de lógica passaram**. No Chrome, corrida rápida, dois jogadores, contra o tempo e as quatro etapas do campeonato chegaram aos resultados; o teste móvel acelerou por toque. O build também abriu e iniciou uma corrida em `/velocity-rush-3d/`, sem erros no console. O Vite emite um aviso de tamanho do JavaScript (aproximadamente 536 kB antes de gzip, incluindo Three.js); isso não impede a geração, mas o carregamento inicial ainda pode ser otimizado.
