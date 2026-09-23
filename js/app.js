/*
  Punto di partenza: schermata iniziale, passaggio alla partita, service worker.
  Il tasto "indietro" di Android durante la partita riporta al menu (la partita resta salvata).
*/

import { LEVELS, generate } from "./sudoku.js";
import { mountGame, unmountGame, hasSavedGame, newGameState } from "./game.js";
import * as store from "./storage.js";
import { modal, formatTime } from "./ui.js";
import { icons } from "./icons.js";
import { VERSION } from "./version.js";

const app = document.getElementById("app");
let screen = "home";

// ---------- Schermata iniziale ----------

function showHome() {
  if (screen === "game") unmountGame();
  screen = "home";
  const saved = hasSavedGame();
  const stats = store.load("stats", {});

  const levelCards = LEVELS.map((L, i) => {
    const s = stats[L.id];
    const stat = s?.solved
      ? `${s.solved} ${s.solved === 1 ? "risolto" : "risolti"}${s.best != null ? `<br>record ${formatTime(s.best)}` : ""}`
      : "";
    return `
      <button class="card" data-level="${i}">
        <div class="dots">${LEVELS.map((_, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("")}</div>
        <div class="card-body">
          <div class="card-title">${L.name}</div>
          <div class="card-sub">${L.desc}</div>
        </div>
        <div class="card-stat">${stat}</div>
      </button>`;
  }).join("");

  const savedLevel = saved && LEVELS.find((l) => l.id === saved.level);
  app.innerHTML = `
    <div class="home">
      <div class="home-title">
        <h1>Sudoku<br><span>for you</span></h1>
        <p>Uno schema alla volta, con calma</p>
      </div>
      ${saved ? `
        <button class="card card-continue" data-act="continue">
          ${icons.play}
          <div class="card-body">
            <div class="card-title">Continua</div>
            <div class="card-sub">${savedLevel ? savedLevel.name : ""} · ${formatTime(saved.elapsed)}</div>
          </div>
        </button>` : ""}
      <div class="section-label">Nuovo schema</div>
      ${levelCards}
      <div class="version">v${VERSION}</div>
    </div>`;

  app.querySelector(".home").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    if (btn.dataset.act === "continue") return openGame(hasSavedGame());
    if (btn.dataset.level != null) {
      const li = Number(btn.dataset.level);
      if (hasSavedGame()) {
        modal({
          html: `<h2>Nuovo schema?</h2><p>C'è una partita in corso: iniziandone una nuova andrà persa.</p>`,
          buttons: [
            { label: "Inizia il nuovo", primary: true, action: () => startNew(li) },
            { label: "Torna indietro" },
          ],
        });
      } else startNew(li);
    }
  });
}

// ---------- Partita ----------

function startNew(levelIndex) {
  // Mostra subito la schermata di attesa, poi genera (di solito pochi millisecondi)
  if (screen === "game") unmountGame();
  app.innerHTML = `<div class="game"><div class="board-wrap"><div class="loading">Preparo lo schema…</div></div></div>`;
  setTimeout(() => {
    const result = generate(levelIndex);
    const game = newGameState(result);
    store.save("game", game);
    openGame(game);
  }, 60);
}

function openGame(game) {
  if (screen === "game") unmountGame();
  if (screen !== "game") history.pushState({ screen: "game" }, "");
  screen = "game";
  mountGame(app, game, {
    exit: () => history.back(), // passa da popstate → showHome
    newGame: (levelId) => startNew(Math.max(0, LEVELS.findIndex((l) => l.id === levelId))),
  });
}

window.addEventListener("popstate", () => {
  document.querySelectorAll(".modal-back").forEach((m) => m.remove());
  if (screen === "game") showHome();
});

// ---------- Service worker: installabile e utilizzabile senza rete ----------

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Versione nuova: ricarica una volta, ma mai a metà partita
    if (reloading || !hadController || screen !== "home") return;
    reloading = true;
    location.reload();
  });
}

showHome();
