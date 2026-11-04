---
name: game-ui-frontend
description: Desenvolver ou aprimorar interfaces de jogos de corrida 3D no navegador, incluindo menus, garagem, seleção de veículos, HUD, animações e adaptação para celular. Use em alterações de interface do VELOCITY RUSH 3D; não substitui a lógica de corrida nem autoriza integrações ou publicações fora do pedido.
---

# Game UI Frontend

Crie interfaces de corrida legíveis, rápidas e coerentes com o jogo existente. Melhore a experiência solicitada sem reconstruir o projeto.

## Contexto do VELOCITY RUSH 3D

- O projeto usa JavaScript modular, HTML/CSS, Three.js e Vite, sem React. Consulte `src/main.js`, `src/style.css`, `src/data/` e os módulos afetados em `src/game/` antes de editar.
- Preserve os nove carros fictícios, os quatro circuitos, campeonato, multiplayer local, pontuação e recordes. Os quatro circuitos não são alternativas de um quiz.
- Preserve a chave de armazenamento `velocity-rush-v1` e os formatos salvos. Se uma mudança autorizada exigir outro formato, planeje migração e compatibilidade.
- Inspecione arquivos e instruções locais reais. Não presuma que uma aba aberta no editor esteja salva, nem que outra skill esteja instalada.
- Limite alterações ao escopo autorizado. Uma melhoria visual não implica substituir física, controles, dependências ou arquivos completos.

## Menus, garagem e identidade visual

- Reutilize a linguagem visual e os componentes existentes. Ao solicitar outra direção artística, adapte cores, tipografia e acabamento mantendo contraste e hierarquia.
- Mantenha ações de jogar, garagem, circuitos, campeonato, recordes e configurações acessíveis. Cada botão deve executar uma ação disponível, com feedback de seleção, foco e ativação.
- Na garagem, apresente nome, categoria, cor e atributos com unidades. Mostre a seleção ativa e permita rotação por arraste ou toque sem capturar gestos destinados à navegação.
- Diferencie carros fictícios e dados reais futuros. A API fornece informações e imagens; ela não fornece automaticamente modelos 3D licenciados. Não apresente o modelo fictício como uma reprodução real.
- Reserve espaço para imagens e ofereça alternativa quando faltarem ou falharem. Preserve a identificação textual do veículo.

## HUD e interação

- Priorize velocidade, posição, volta e tempo; use rótulos curtos, números estáveis e contraste com o cenário. Exiba pontuação e recorde no contexto adequado.
- Em tela dividida, mantenha indicadores associados à câmera e ao jogador correspondentes. Confira que menus e overlays não alterem indevidamente os viewports.
- Preserve a passagem dos eventos para o canvas. HUD decorativo não deve bloquear direção, toque ou arraste; botões interativos devem receber apenas os eventos necessários.
- Ofereça controles de teclado, foco visível e nomes acessíveis. Não dependa exclusivamente de hover ou cor para comunicar estado.
- No celular, mantenha áreas de toque confortáveis, respeite as bordas seguras e teste aceleração e direção simultâneas, liberação do toque e cancelamento do ponteiro. Restrinja `touch-action: none` às superfícies que precisam controlar gestos.

## Animações, efeitos e desempenho

- Use transições de opacidade e transformação para seleção, abertura de menus e feedback. Respeite `prefers-reduced-motion` nas animações da interface.
- Subordine brilho, partículas, desfoque e efeitos de velocidade à legibilidade e ao desempenho. Confira o resultado em modo leve antes de aumentar a qualidade.
- Reutilize o renderer, modelos e recursos quando aplicável; descarte geometrias, materiais e texturas substituídos. Evite criar novos loops de animação ou contextos WebGL por menu.
- Evite reconstruir a interface completa a cada quadro. Atualize apenas os indicadores necessários e preserve o ritmo de atualização separado da física.
- Adapte o layout à largura e à altura, incluindo celular horizontal e tela dividida. Não confunda emulação móvel com avaliação de desempenho em aparelho físico.

## Dados externos e segurança da interface

- Consulte o contrato atual antes de ligar componentes à API. Referência oficial: https://github.com/mariusmmmmm/car-specs-api/blob/main/openapi.yaml
- Use o cliente de `src/apiSupercarros.js` por meio de backend seguro. Chaves pertencem ao backend, nunca ao bundle Vite ou ao armazenamento do navegador.
- Mostre estados de carregamento, resultado vazio, dados incompletos, falha e limite de requisições. Preserve valores válidos como zero; não invente dados para preencher a ficha.
- Renderize textos externos com `textContent` ou mecanismo equivalente. Valide URLs das imagens antes de atribuí-las ao DOM e mantenha alternativas acessíveis.
- Antes de exibir dados Cars-Data, inclua o link visível `Data by cars-data.com` para https://cars-data.com e confira termos de cache e uso das imagens.
- Busca e consulta devem ocorrer por intenção do jogador, com debounce e cancelamento adequados. Falhas do catálogo não podem impedir corridas com o conteúdo existente.

## Verificação e entrega

- Teste os comportamentos alterados: navegação e foco, seleção de veículo, rotação, pausa, overlays, legibilidade e controles de toque. Confira ausência de erros no console quando houver navegador disponível.
- Para alterações que possam afetar o jogo, execute os testes relevantes já disponíveis. Faça build quando houver alteração no código consumido pelo aplicativo e isso couber no escopo autorizado.
- Compare arquivos alterados com o pedido e preserve funcionalidades existentes. Não declare integração real ou aprovação visual somente com testes simulados.
- Informe o que foi implementado, os testes executados e as limitações observadas. Diferencie testes automatizados, navegador emulado e dispositivo real.
