import "./style.css";
import { Game } from "./game/Game.js";
import { SaveManager } from "./game/SaveManager.js";
import { cars, palette } from "./data/cars.js";
import { tracks } from "./data/tracks.js";

const app = document.querySelector("#app"),
  save = new SaveManager();
const format = (value) =>
  Number.isFinite(value)
    ? `${Math.floor(value / 60)
        .toString()
        .padStart(2, "0")}:${(value % 60).toFixed(2).padStart(5, "0")}`
    : "—";
const state = {
  view: "home",
  car: save.data.car,
  color: save.data.color,
  track: save.data.track,
  mode: "quick",
  difficulty: 1,
  laps: 3,
  players: 1,
};
let game;
function notice(message) {
  const el = document.querySelector("#notice");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => el.classList.remove("visible"), 5000);
}
const points = [15, 12, 10, 8, 6, 4, 3, 2, 1];
function persistSelection() {
  Object.assign(save.data, {
    car: state.car,
    color: state.color,
    track: state.track,
  });
  if (!save.save())
    notice(
      "Não foi possível salvar neste navegador. O jogo continua disponível.",
    );
}
function iconTrack(track, mini = false) {
  const xs = track.points.map((p) => p[0]),
    zs = track.points.map((p) => p[1]),
    minX = Math.min(...xs) - 25,
    minZ = Math.min(...zs) - 25,
    w = Math.max(...xs) - minX + 25,
    h = Math.max(...zs) - minZ + 25;
  const path = track.points.map(([x, z]) => `${x},${z}`).join(" ");
  return `<svg class="track-svg ${mini ? "small" : ""}" viewBox="${minX} ${minZ} ${w} ${h}" aria-label="Traçado de ${track.name}"><polygon points="${path}" fill="none" stroke="currentColor" stroke-width="${mini ? 12 : 8}" stroke-linejoin="round"/><circle cx="0" cy="0" r="13" fill="#d4ed72"/></svg>`;
}
function navButton(view, label, n) {
  return `<button class="nav-item ${state.view === view ? "active" : ""}" data-view="${view}"><span>${n}</span>${label}<b>↗</b></button>`;
}
function shell(content) {
  app.className = "menu";
  app.innerHTML = `<header class="topbar"><a class="brand" href="#" data-home aria-label="Velocity Rush início"><span class="brand-mark">V<span>R</span></span><span>VELOCITY<span class="brand-sub">RUSH 3D</span></span></a><div class="top-meta"><i></i> ARCADE RACING <span class="version">VOL. 01 / 2026</span></div><button class="sound-button" id="sound" aria-label="Ativar ou silenciar áudio">${save.data.volume > 0 ? "SOM ON" : "SOM OFF"}</button></header>
  <aside class="sidebar"><div class="eyebrow">SEU PRÓXIMO DESAFIO</div><nav>${navButton("home", "Jogar", "01")}${navButton("garage", "Garagem", "02")}${navButton("tracks", "Circuitos", "03")}${navButton("championship", "Campeonato", "04")}${navButton("records", "Recordes", "05")}${navButton("settings", "Configurações", "06")}${navButton("help", "Como jogar", "07")}</nav><div class="sidebar-bottom"><span class="tiny-label">PILOTO LOCAL</span><strong>Rookie driver <span>↗</span></strong><p>${save.data.races} corridas · ${save.data.wins} vitórias</p></div></aside>
  <section class="content ${["home", "garage"].includes(state.view) ? "show-car" : "solid-view"}">${content}</section>
  <footer class="menu-footer"><span><i></i> SEM LOGIN. SÓ ACELERAR.</span><span>9 CARROS <b>/</b> 4 CIRCUITOS <b>/</b> UM OBJETIVO</span><span>FEITO PARA CORRER ↗</span></footer>`;
  app.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        state.view = b.dataset.view;
        render();
      }),
  );
  app.querySelector("[data-home]").onclick = (e) => {
    e.preventDefault();
    state.view = "home";
    render();
  };
  app.querySelector("#sound").onclick = () => {
    save.data.volume = save.data.volume > 0 ? 0 : 0.3;
    save.save();
    game.audio.setVolume(save.data.volume);
    render();
  };
}
function configPanel() {
  return `<div class="setup"><div class="section-label">CONFIGURE SUA CORRIDA <span>↗</span></div>
  <label>Modo<select id="mode"><option value="quick" ${state.mode === "quick" ? "selected" : ""}>Corrida rápida</option><option value="time" ${state.mode === "time" ? "selected" : ""}>Contra o tempo</option></select></label>
  <div class="form-row"><label>Dificuldade<select id="difficulty">${["Fácil", "Médio", "Difícil"].map((v, i) => `<option value="${i}" ${state.difficulty === i ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>Voltas<select id="laps">${[1, 3, 5].map((n) => `<option ${state.laps === n ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
  <label>Jogadores locais<select id="players" ${state.mode === "time" ? "disabled" : ""}><option value="1" ${state.players === 1 ? "selected" : ""}>1 jogador ${state.mode === "time" ? "• pista livre" : "+ 8 bots"}</option><option value="2" ${state.players === 2 ? "selected" : ""}>2 jogadores + 7 bots</option></select></label>
  <button class="primary start" id="start">INICIAR CORRIDA <span>↗</span></button><p class="setup-note">${state.players === 2 ? "J2 usa o carro seguinte da garagem. Tela dividida horizontal." : "W A S D para pilotar · Controles de toque no celular"}</p></div>`;
}
function bindConfig() {
  for (const key of ["mode", "difficulty", "laps", "players"]) {
    const el = document.getElementById(key);
    if (el)
      el.onchange = () => {
        state[key] = key === "mode" ? el.value : Number(el.value);
        if (state.mode === "time") state.players = 1;
        render();
      };
  }
  document
    .getElementById("start")
    ?.addEventListener("click", () => begin(false));
}
function render() {
  if (!game) return;
  if (state.view === "home") {
    shell(`<div class="hero-copy"><div class="eyebrow"><span class="lime-line"></span> O ASFALTO É SEU</div><h1>CHASE<br>THE <em>RUSH.</em></h1><p>Nove pilotos. Uma linha de chegada.<br>Encontre seu limite na próxima curva.</p></div>
    <div class="car-caption"><span class="tiny-label">${String(state.car + 1).padStart(2, "0")} / 09 • ${cars[state.car].category}</span><h2>${cars[state.car].name}<span>↗</span></h2><div class="car-numbers"><span><strong>${cars[state.car].speed}</strong> KM/H</span><span><strong>${cars[state.car].zero.toFixed(1)}</strong> 0–100 S</span><button data-garage>EXPLORAR GARAGEM →</button></div></div>
    <div class="home-right"><button class="selected-track" id="track-card"><div class="track-art ${tracks[state.track].id}">${iconTrack(tracks[state.track], true)}<span>↗</span></div><div class="track-card-copy"><span class="tiny-label">CIRCUITO SELECIONADO</span><h3>${tracks[state.track].name}</h3><p>${tracks[state.track].tag}</p></div></button>${configPanel()}</div>`);
    document.querySelector("[data-garage]").onclick = () => {
      state.view = "garage";
      render();
    };
    document.querySelector("#track-card").onclick = () => {
      state.view = "tracks";
      render();
    };
    bindConfig();
  } else if (state.view === "garage") {
    const car = cars[state.car];
    shell(`<div class="page-heading"><div class="eyebrow">ESCOLHA SUA MÁQUINA</div><h1>THE GARAGE<span class="dot">.</span></h1><p>Arraste o carro para girar a visualização 3D.</p></div>
    <div class="garage-selector"><button id="previous" aria-label="Carro anterior">←</button><div><span class="tiny-label">${String(state.car + 1).padStart(2, "0")} / 09</span><h2>${car.name}</h2><p>${car.category}</p></div><button id="next" aria-label="Próximo carro">→</button></div>
    <div class="garage-panel panel"><div class="section-label">DADOS DE DESEMPENHO <span>${car.drive}</span></div><div class="stat-big"><strong>${car.speed}</strong><span>KM/H<br>VELOCIDADE MÁX.</span></div>
    ${[
      ["Aceleração", `${car.zero.toFixed(1)} s`, ((5 - car.zero) / 2.5) * 100],
      ["Potência", `${car.power} cv`, car.power / 10],
      ["Torque", `${car.torque} Nm`, car.torque / 11],
      ["Freios", `${car.brakes}%`, car.brakes],
      ["Aderência", `${car.grip}%`, car.grip],
      ["Controle", `${car.handling}%`, car.handling],
    ]
      .map(
        ([label, value, p]) =>
          `<div class="stat"><div><span>${label}</span><b>${value}</b></div><div class="bar"><i style="width:${p}%"></i></div></div>`,
      )
      .join("")}
    <div class="weight"><span>PESO <b>${car.weight} kg</b></span><span>TRAÇÃO <b>${car.drive}</b></span></div><div class="swatches">${palette.map((color) => `<button style="--swatch:${color}" class="${state.color === color ? "selected" : ""}" data-color="${color}" aria-label="Cor ${color}"></button>`).join("")}</div><button class="primary" id="select-car">SELECIONAR CARRO <span>✓</span></button></div>`);
    const change = (delta) => {
      state.car = (state.car + delta + 9) % 9;
      state.color = cars[state.car].color;
      game.preview(state.car, state.color);
      render();
    };
    document.querySelector("#previous").onclick = () => change(-1);
    document.querySelector("#next").onclick = () => change(1);
    document.querySelectorAll("[data-color]").forEach(
      (b) =>
        (b.onclick = () => {
          state.color = b.dataset.color;
          game.preview(state.car, state.color);
          render();
        }),
    );
    document.querySelector("#select-car").onclick = () => {
      persistSelection();
      state.view = "home";
      render();
    };
  } else if (state.view === "tracks") {
    shell(
      `<div class="page-heading"><div class="eyebrow">QUATRO FORMAS DE SENTIR A VELOCIDADE</div><h1>ESCOLHA O DESTINO<span class="dot">.</span></h1></div><div class="track-grid">${tracks.map((t, i) => `<button class="circuit-card ${state.track === i ? "selected" : ""}" data-track="${i}"><div class="track-art ${t.id}">${iconTrack(t)}<span>0${i + 1}</span></div><div class="circuit-copy"><span class="tiny-label">${t.tag}</span><h2>${t.name}</h2><p>${t.description}</p><div>${t.difficulty}<b>${state.track === i ? "SELECIONADO ✓" : "SELECIONAR ↗"}</b></div></div></button>`).join("")}</div>`,
    );
    document.querySelectorAll("[data-track]").forEach(
      (b) =>
        (b.onclick = () => {
          state.track = Number(b.dataset.track);
          persistSelection();
          state.view = "home";
          render();
        }),
    );
  } else if (state.view === "championship") {
    const saved = save.data.championship;
    shell(
      `<div class="page-heading"><div class="eyebrow">QUATRO ETAPAS. UM CAMPEÃO.</div><h1>RUSH SERIES<span class="dot">.</span></h1><p>Dispute os quatro circuitos e acumule pontos: 15, 12, 10, 8, 6, 4, 3, 2 e 1.</p></div><div class="champ-layout"><div class="panel champ-rounds">${tracks.map((t, i) => `<div><span>ETAPA 0${i + 1}</span><h2>${t.name}</h2><p>${t.tag}</p></div>`).join("")}</div><div class="panel"><h2>Sua temporada começa aqui</h2><p>Usa o carro da garagem, a dificuldade e o número de voltas da tela Jogar. Um jogador contra oito bots.</p><button id="new-champ" class="primary">NOVO CAMPEONATO <span>↗</span></button>${saved ? `<button id="resume-champ" class="secondary">CONTINUAR • ETAPA ${saved.round + 1}/4</button>` : ""}<p class="muted">O progresso é salvo após cada etapa. Iniciar um novo campeonato substitui o anterior.</p></div></div>`,
    );
    document.querySelector("#new-champ").onclick = () => begin(true);
    document
      .querySelector("#resume-champ")
      ?.addEventListener("click", () => runChampionship());
  } else if (state.view === "records") {
    shell(
      `<div class="page-heading"><div class="eyebrow">CADA CENTÉSIMO CONTA</div><h1>SEUS RECORDES<span class="dot">.</span></h1><p>Tempos sem reposicionamento. Resultados separados pelo número de voltas.</p></div><div class="record-totals"><div><strong>${save.data.races}</strong><span>CORRIDAS CONCLUÍDAS</span></div><div><strong>${save.data.wins}</strong><span>VITÓRIAS</span></div><div><strong>${cars[save.data.car].name}</strong><span>CARRO FAVORITO</span></div></div><div class="panel table-wrap"><table><thead><tr><th>CIRCUITO</th><th>1 VOLTA</th><th>3 VOLTAS</th><th>5 VOLTAS</th><th>MELHOR VOLTA</th></tr></thead><tbody>${tracks.map((t) => `<tr><th>${t.name}</th>${[1, 3, 5].map((n) => `<td>${format(save.data.records[`${t.id}-${n}`]?.time)}</td>`).join("")}<td>${format(Math.min(...[1, 3, 5].map((n) => save.data.records[`${t.id}-${n}`]?.lap || Infinity)))}</td></tr>`).join("")}</tbody></table></div>`,
    );
  } else if (state.view === "settings") {
    shell(
      `<div class="page-heading"><div class="eyebrow">DO SEU JEITO</div><h1>CONFIGURAÇÕES<span class="dot">.</span></h1></div><div class="panel settings-panel"><label>Qualidade gráfica<select id="quality">${[
        ["auto", "Automática"],
        ["low", "Leve • resolução reduzida, sem sombras"],
        ["high", "Alta • sombras e mais decoração"],
      ]
        .map(
          ([v, l]) =>
            `<option value="${v}" ${save.data.quality === v ? "selected" : ""}>${l}</option>`,
        )
        .join(
          "",
        )}</select></label><p>O modo automático reduz os gráficos em telas de toque e processadores com até quatro núcleos. As mudanças na decoração são aplicadas na próxima corrida.</p><label>Volume <output id="volume-label">${Math.round(save.data.volume * 100)}%</output><input id="volume" type="range" min="0" max="1" step="0.01" value="${save.data.volume}"/></label><p>Motor e sinais sonoros são sintetizados, sem arquivos externos.</p><div class="settings-status">✓ Preferências salvas automaticamente neste navegador.</div></div>`,
    );
    document.querySelector("#quality").onchange = (e) => {
      save.data.quality = e.target.value;
      save.save();
      game.quality();
    };
    document.querySelector("#volume").oninput = (e) => {
      save.data.volume = Number(e.target.value);
      game.audio.setVolume(save.data.volume);
      save.save();
      document.querySelector("#volume-label").textContent =
        `${Math.round(save.data.volume * 100)}%`;
    };
  } else if (state.view === "help") {
    shell(
      `<div class="page-heading"><div class="eyebrow">DOMINE A PRÓXIMA CURVA</div><h1>COMO JOGAR<span class="dot">.</span></h1></div><div class="help-grid"><div class="panel"><h2>01 / Assuma o controle</h2><p><kbd>W</kbd> Acelerar &nbsp; <kbd>S</kbd> Frear / ré</p><p><kbd>A</kbd> Esquerda &nbsp; <kbd>D</kbd> Direita</p><p>Jogador 2: use as quatro setas. No celular, use os botões na tela. Recomenda-se jogar na horizontal.</p></div><div class="panel"><h2>02 / Encontre seu ritmo</h2><p>Freie antes de curvas fechadas. Fora do asfalto, o carro perde velocidade. Cruze os oito portões em ordem para validar a volta.</p><p><kbd>C</kbd> Alternar câmera próxima, distante e capô.</p></div><div class="panel"><h2>03 / Respire e retome</h2><p><kbd>Esc</kbd> ou <kbd>P</kbd> Pausar</p><p><kbd>R</kbd> Reposicionar o jogador 1 no último portão. Use a pausa para reposicionar o jogador 2.</p><p>Reposicionar desativa os recordes da corrida. Mudar de aba pausa automaticamente.</p></div><div class="panel"><h2>04 / Jogue com companhia</h2><p>Na tela Jogar, escolha dois jogadores para dividir a tela. J2 recebe o próximo carro da garagem.</p><p>Teclados podem limitar teclas simultâneas. A tela dividida foi pensada para computador; no celular, priorize um jogador.</p></div></div>`,
    );
  }
}
function begin(championship) {
  persistSelection();
  if (championship) {
    save.data.championship = {
      round: 0,
      scores: Array(9).fill(0),
      config: { ...state, players: 1, mode: "championship" },
    };
    save.save();
    runChampionship();
  } else {
    state.mode = state.mode === "time" ? "time" : "quick";
    launch({ ...state });
  }
}
function runChampionship() {
  const c = save.data.championship;
  if (!c) return;
  launch({ ...c.config, track: c.round, mode: "championship", players: 1 });
}
function launch(config) {
  game.usedRecovery = false;
  try {
    game.start(config);
  } catch (error) {
    console.error(error);
    notice(`Não foi possível iniciar: ${error.message}`);
    game.preview(state.car, state.color);
    render();
  }
}
function renderHUD() {
  app.className = "playing";
  app.innerHTML = `<div id="hud"></div><div class="race-actions"><button id="camera" aria-label="Alternar câmera">CÂMERA</button><button id="pause">Ⅱ PAUSA</button></div><div id="countdown" aria-live="polite"></div><div class="touch-controls"><div><button data-control="left" aria-label="Virar à esquerda">◀</button><button data-control="right" aria-label="Virar à direita">▶</button></div><div><button data-control="brake" aria-label="Frear">FREIO</button><button data-control="gas" aria-label="Acelerar">GÁS</button></div></div><div id="modal"></div>`;
  document.querySelector("#pause").onclick = () => game.pause();
  document.querySelector("#camera").onclick = () =>
    (game.cameraMode = (game.cameraMode + 1) % 3);
  game.input.bindTouch(app);
}
function updateHUD(g) {
  if (!document.querySelector("#hud")) return;
  const ranking = g.ranking(),
    track = tracks[g.config.track];
  document.querySelector("#hud").innerHTML = `${g.cars
    .filter((c) => c.human >= 0)
    .map(
      (c, i) =>
        `<div class="player-hud player-${i} ${g.config.players === 2 ? "split" : ""}"><div class="race-title"><span class="tiny-label">${track.name} / ${i ? "JOGADOR 2" : "JOGADOR 1"}</span><div><strong>${ranking.indexOf(c) + 1}<small>/${g.cars.length}</small></strong><span>VOLTA <b>${Math.min(c.progress.laps + 1, g.config.laps)} / ${g.config.laps}</b><br>TEMPO <b>${format(c.progress.finishTime ?? g.time)}</b></span></div></div><div class="speed"><strong>${Math.round(Math.abs(c.speed) * 3.6)}</strong><span>KM/H <b>${c.speed < 0 ? "R" : Math.max(1, Math.min(7, Math.ceil(c.speed / 13)))}</b></span><div class="speed-bar"><i style="width:${((Math.abs(c.speed) * 3.6) / c.spec.speed) * 100}%"></i></div><small>MELHOR VOLTA ${format(c.progress.bestLap)}</small></div>${i === 0 ? `<div class="race-ranking">${ranking.map((car, index) => `<div class="${car.human >= 0 ? "you" : ""}"><b>${index + 1}</b><i style="background:${car.color}"></i><span>${car.name}</span>${car.progress.finished ? "✓" : ""}</div>`).join("")}</div><svg class="minimap" viewBox="-180 -430 650 950" aria-label="Minimapa"><polygon points="${track.points.map(([x, z]) => `${x},${z}`).join(" ")}" fill="none" stroke="#9ba7b8" stroke-width="7" stroke-linejoin="round"/>${g.cars.map((car) => `<circle cx="${car.position.x}" cy="${car.position.z}" r="${car.human >= 0 ? 11 : 7}" fill="${car.human >= 0 ? "#d4ed72" : car.color}"/>`).join("")}</svg>` : ""}</div>`,
    )
    .join("")}`;
  const count = document.querySelector("#countdown");
  if (count)
    count.textContent =
      g.mode === "countdown"
        ? g.countdown > 0.7
          ? Math.ceil(g.countdown - 0.7)
          : "GO!"
        : "";
}
function modal(content) {
  document.querySelector("#modal").innerHTML =
    `<div class="modal-backdrop"><section class="modal-panel">${content}</section></div>`;
}
function pause() {
  modal(
    `<div class="eyebrow">UM RESPIRO ANTES DA PRÓXIMA CURVA</div><h2>CORRIDA PAUSADA<span class="dot">.</span></h2><button class="primary" id="resume">CONTINUAR <span>↗</span></button>${game.cars
      .filter((c) => c.human >= 0)
      .map(
        (c, i) =>
          `<button class="secondary" data-recover="${i}">REPOSICIONAR JOGADOR ${i + 1}</button>`,
      )
      .join("")}<button class="secondary" id="exit">VOLTAR AO MENU</button>`,
  );
  document.querySelector("#resume").onclick = () => game.resume();
  document.querySelectorAll("[data-recover]").forEach(
    (b) =>
      (b.onclick = () => {
        game.recover(Number(b.dataset.recover));
        game.resume();
      }),
  );
  document.querySelector("#exit").onclick = backToMenu;
}
function backToMenu() {
  game.preview(state.car, state.color);
  state.view = "home";
  render();
}
function results(ranking) {
  const player = game.cars[0],
    position = ranking.indexOf(player) + 1,
    config = game.config;
  if (
    !save.result(
      `${tracks[config.track].id}-${config.laps}`,
      player.progress.finishTime,
      player.progress.bestLap,
      position,
      !game.usedRecovery,
    )
  )
    notice("O resultado não pôde ser salvo neste navegador.");
  let championship = null;
  if (config.mode === "championship") {
    championship = save.data.championship;
    ranking.forEach(
      (c, index) =>
        (championship.scores[game.cars.indexOf(c)] += points[index]),
    );
    championship.round++;
    if (championship.round >= 4) save.data.championship = null;
    save.save();
  }
  const standing = championship
    ? game.cars
        .map((c, i) => ({ name: c.name, score: championship.scores[i] }))
        .sort((a, b) => b.score - a.score)
    : null;
  modal(`<div class="eyebrow">${championship ? `RUSH SERIES • ETAPA ${championship.round}/4` : tracks[config.track].name}</div><h2>${position === 1 ? "VITÓRIA" : "BANDEIRADA FINAL"}<span class="dot">.</span></h2><div class="result-summary"><strong>${position}º<small> / ${game.cars.length}</small></strong><div>TEMPO <b>${format(player.progress.finishTime)}</b><br>MELHOR VOLTA <b>${format(player.progress.bestLap)}</b></div></div><div class="result-list">${ranking.map((c, i) => `<div class="${c.human >= 0 ? "you" : ""}"><b>${i + 1}º</b><span>${c.name}</span><span>${c.progress.finished ? format(c.progress.finishTime) : "Em pista"}${championship ? ` • +${points[i]} pts` : ""}</span></div>`).join("")}</div><p class="muted">A corrida encerra quando todos os jogadores humanos terminam. Os demais são classificados pelo progresso validado.${game.usedRecovery ? " Recordes desativados por reposicionamento." : ""}</p>
  ${standing ? `<h3>${championship.round === 4 ? `CAMPEÃO: ${standing[0].name}` : "CLASSIFICAÇÃO ACUMULADA"}</h3><div class="champ-scores">${standing.map((c, i) => `<span>${i + 1}. ${c.name}<b>${c.score} pts</b></span>`).join("")}</div>` : ""}
  <button class="primary" id="again">${championship && championship.round < 4 ? "PRÓXIMA ETAPA" : "CORRER NOVAMENTE"} <span>↗</span></button><button class="secondary" id="exit">VOLTAR AO MENU</button>`);
  document.querySelector("#again").onclick = () =>
    championship && championship.round < 4
      ? runChampionship()
      : config.mode === "championship"
        ? begin(true)
        : launch(config);
  document.querySelector("#exit").onclick = backToMenu;
}
try {
  game = new Game(document.querySelector("#world"), save, {
    started: renderHUD,
    hud: updateHUD,
    paused: pause,
    resumed: () => (document.querySelector("#modal").innerHTML = ""),
    finished: results,
    error: notice,
  });
  // Reposicionar é uma ajuda de recuperação, portanto não produz recordes oficiais.
  const recover = game.recover.bind(game);
  game.recover = (index) => {
    if (game.cars[index]?.progress.finished) return;
    game.usedRecovery = true;
    recover(index);
  };
  render();
} catch (error) {
  console.error(error);
  app.className = "fallback";
  app.innerHTML =
    "<h1>VELOCITY RUSH 3D</h1><p>Não foi possível iniciar o WebGL. Ative a aceleração de hardware ou tente um navegador compatível atualizado.</p>";
}

export { game };
