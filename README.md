# VELOCITY RUSH 3D

Jogo universitário de corrida arcade em terceira pessoa para a disciplina Técnicas de Programação com IA. JavaScript modular, Three.js, HTML/CSS e Vite, sem servidor de jogo, cadastro ou chaves secretas.

O [backend opcional da Cars-Data](backend/README.md) fica separado em `backend/`, com Cloudflare Worker, segredo no servidor e controle de cotas por Durable Object SQLite. Consulte o guia para instalação, testes, configuração privada da chave e futura publicação. O catálogo real ainda não foi ligado à interface e a jogabilidade existente continua independente desse serviço.

## Executar

Instale o **Node.js 22 ou superior**. No terminal do VS Code, na pasta deste projeto:

```powershell
npm install
npm run dev
```

Abra o endereço mostrado pelo Vite, normalmente `http://localhost:5173`. Para testar no celular, conecte os dois aparelhos à mesma rede e use o endereço Network mostrado no terminal. O firewall do Windows precisa permitir o servidor na rede privada.

Nesta máquina, foi preparado um Node portátil em `.tools`, ignorado pelo Git. Sem instalar Node no Windows, também é possível executar:

```powershell
$env:Path = "$PWD\.tools\node-v22.16.0-win-x64;$env:Path"
& .\.tools\node-v22.16.0-win-x64\npm.cmd run dev
```

Esse ajuste vale somente para o terminal atual. A pasta `.tools` não precisa ser enviada ao GitHub.

## Controles

| Ação               | Jogador 1         | Jogador 2      |
| ------------------ | ----------------- | -------------- |
| Acelerar           | W                 | ↑              |
| Frear / ré         | S                 | ↓              |
| Esquerda / direita | A / D             | ← / →          |
| Pausar / continuar | Esc ou P          | Esc ou P       |
| Alternar câmera    | C ou botão Câmera | Alterna ambas  |
| Reposicionar       | R                 | Botão na pausa |

No celular, há botões de direção, acelerador e freio com suporte a múltiplos toques. Prefira a orientação horizontal. O multiplayer local divide a tela horizontalmente e foi pensado para computador. Alguns teclados têm limitações de teclas simultâneas (ghosting).

Na garagem, arraste a área do carro para girá-lo. Escolha a cor e confirme a seleção. J2 usa o próximo carro na lista da garagem.

## Recursos desta primeira versão

- Nove modelos esportivos fictícios, construídos com geometrias próprias. Nomes, cores e atributos originais.
- Velocidade máxima, 0–100, potência, torque, peso, tração, freios, aderência e controle influenciam a física arcade.
- Quatro circuitos com traçados distintos: Sunset Coast, Neon City, Mountain Pass e Desert Speed.
- Oito bots na corrida solo, sete na corrida com dois jogadores; três níveis de dificuldade.
- IA por antecipação de trajetória, frenagem em curvas e desvio lateral para ultrapassagens. Usa a mesma movimentação e as mesmas barreiras dos humanos.
- Contagem regressiva, aceleração, freio, ré, colisões simples, redução fora do asfalto e barreiras.
- Oito portões sequenciais por circuito, voltas de 1, 3 ou 5, classificação por progresso validado, chegada e resultados.
- Câmeras próxima, distante e capô; rodas animadas e luzes de freio.
- Corrida rápida, contra o tempo com pista livre e campeonato de quatro etapas com pontuação acumulada.
- HUD, minimapa, pausa automática ao mudar de aba e reposicionamento no último checkpoint.
- Recordes por pista e número de voltas, melhor volta, corridas, vitórias, carro favorito, preferências e campeonato salvos em `localStorage`.
- Sons sintetizados de motor, colisão, contagem regressiva e chegada; controle de volume e silêncio.
- Modo leve, resolução limitada e seleção automática de qualidade por toque/número de núcleos.

O campeonato salva ao concluir cada etapa. Sair durante uma etapa permite reiniciá-la pelo menu Campeonato. Iniciar um novo campeonato substitui o anterior. Empates de pontuação mantêm a ordem dos participantes, sem um critério adicional de desempate.

A corrida termina quando todos os jogadores humanos concluem as voltas. Bots ainda em pista são classificados pelo progresso nesse instante e identificados como **Em pista** nos resultados; os tempos deles não são inventados. A pontuação do campeonato segue essa classificação. No contra o tempo há somente o jogador, sem bots.

Reposicionar desativa o registro de tempos daquela corrida, mas mantém a contagem de corridas/vitórias. Os recordes comparam o mesmo número de voltas, independentemente do carro, dificuldade ou modo. São recordes locais, sem verificação contra manipulação do navegador.

## Estrutura

```text
index.html                   Estrutura e entrada
src/main.js                  Navegação, garagem, configurações, HUD e resultados
src/style.css                Interface responsiva
src/data/cars.js             Especificações dos veículos
src/data/tracks.js           Traçados e ambientação
src/game/Game.js             Ciclo fixo, estado de corrida e câmeras
src/game/Car.js              Modelagem procedural e rodas
src/game/Track.js            Curva, estrada, barreiras e cenário em lotes
src/game/Physics.js          Condução e colisões
src/game/Progress.js         Portões, voltas e classificação
src/game/AIController.js     Direção dos bots
src/game/InputManager.js     Teclado e toque
src/game/AudioManager.js     Áudio sintetizado
src/game/SaveManager.js      Persistência tolerante a falhas
tests/race.test.js           Verificações de lógica e simulações de IA
.github/workflows/deploy.yml Publicação estática
```

## Verificar e gerar produção

```powershell
npm test
npm run build
npm run preview
```

Os testes verificam portões sequenciais, atalhos, sentido inverso, classificação, recordes, freio/ré e uma volta completa de IA em cada circuito usando a física real. `dist/` contém os arquivos publicáveis. `vite.config.js` usa `base: './'`, permitindo hospedar em subdiretórios como `/velocity-rush-3d/`.

Roteiro de teste manual:

1. Abra cada menu, selecione carros/cores, gire o modelo e confirme os atributos.
2. Inicie uma corrida de uma volta e teste acelerar, frear, dar ré e bater na lateral.
3. Cruze os portões e complete a volta; confira a chegada e os recordes depois de recarregar.
4. Tente cortar caminho e passar na chegada em sentido contrário: a volta não deve ser validada.
5. Pause, alterne a câmera e use reposicionamento; o resultado deve avisar que não houve recorde.
6. Jogue com dois humanos, confira os controles independentes e a chegada de ambos.
7. Dispute as quatro etapas do campeonato e confira a soma de pontos.
8. No celular real, teste múltiplos toques, rotação e modo leve.

## Publicar gratuitamente no GitHub Pages

**Nenhum commit ou envio foi feito automaticamente.** Quando decidir publicar:

1. No GitHub, crie um repositório público, por exemplo `velocity-rush-3d`, sem adicionar README, pois este projeto já tem um.
2. No terminal, com Git instalado, execute substituindo `SEU_USUARIO`:

```powershell
git init
git add .
git commit -m "Implementa primeira versão de Velocity Rush 3D"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/velocity-rush-3d.git
git push -u origin main
```

3. Em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions**.
4. Em **Actions**, acompanhe o workflow **Publicar GitHub Pages**. Ele instala dependências com `npm ci`, testa, gera `dist` e publica. Se necessário, execute manualmente em **Run workflow**.
5. O link aparecerá no job de deployment e em Settings → Pages, normalmente `https://SEU_USUARIO.github.io/velocity-rush-3d/`.
6. Abra esse link no computador e no celular. Não abra `index.html` diretamente como arquivo local.

Para atualizar depois:

```powershell
npm test
npm run build
git add .
git commit -m "Descreva sua alteração"
git push
```

Cada envio à branch `main` dispara a publicação. O repositório e as permissões de Pages precisam existir na sua conta. Este projeto não cria conta nem repositório.

## Limites e próximos incrementos

Esta é uma base jogável de escopo universitário, com física arcade simplificada. Não utiliza motor de física rígida: colisões entre carros são aproximadas por cápsulas, sem danos nem capotamentos. A IA usa antecipação geométrica, sem aprendizado de máquina. Pode se aglomerar e perder tempo em disputas estreitas; não teletransporta carros.

As estradas são planas; as montanhas e dunas são cenográficas. Miniaturas e minimapa simplificam a curva com os pontos de controle. Não há nitro, derrapagens persistentes, partículas, reflexos de espelho, texturas fotográficas, música, controle por gamepad, multiplayer online ou três/quatro jogadores.

Ainda é necessário avaliar desempenho e conforto de direção em aparelhos reais, fazer corridas humanas completas nos quatro circuitos e ajustar a dificuldade com esses resultados. O modo automático usa heurísticas de hardware, sem benchmark de FPS. A interface está concentrada em `main.js`; pode ser separada em módulos `ui/` conforme o projeto crescer.

## Recursos e licenças

Os modelos, cenários e sons são gerados pelo código, sem marcas de fabricantes ou assets de terceiros. Three.js usa licença MIT; consulte as licenças das dependências instaladas. As fontes Barlow/Barlow Condensed são carregadas opcionalmente pelo Google Fonts (SIL Open Font License); sem conexão, a interface usa fontes do sistema. Após carregar o build, a jogabilidade não consulta APIs externas.
