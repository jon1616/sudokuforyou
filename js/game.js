/*
  Schermata di gioco: griglia, strumenti, tastierino, timer, salvataggio.

  Stato della partita (salvato a ogni mossa in "game"):
    level, puzzle[81], solution[81], values[81] (cifre di chi gioca + quelle di partenza),
    notes[81] (maschere di bit), elapsed (secondi), hints, history (istantanee per Annulla)

  Tutto ciò che è una scelta di gusto passa da `settings` (js/settings.js).
*/

import { ROW, COL, BOX, PEERS, UNITS, LEVELS, candidatesOf, nextStep, applyStep, digitsOf } from "./sudoku.js";
import { icons } from "./icons.js";
import * as store from "./storage.js";
import { modal, toast, formatTime } from "./ui.js";
import { settings, onSettingsChange, openSettings } from "./settings.js";
import { feedback } from "./audio.js";

const HISTORY_MAX = 80;

let G = null;          // partita in corso
let el = {};           // elementi della pagina
let sel = -1;          // casella selezionata
let activeDigit = 0;   // cifra scelta nel modo "prima la cifra"
let noteMode = false;
let paused = false;
let timerId = 0;
let lastTick = 0;
let onExit = null;
let onNewGame = null;

export const hasSavedGame = () => {
  const s = store.load("game");
  return s && !s.done ? s : null;
};

onSettingsChange(() => { if (G && el.board) render(); });

// ---------- Avvio ----------

export function mountGame(root, game, { exit, newGame }) {
  G = game;
  onExit = exit;
  onNewGame = newGame;
  sel = -1;
  activeDigit = 0;
  noteMode = false;
  paused = false;
  const L = LEVELS.find((l) => l.id === G.level);

  root.innerHTML = `
    <div class="game">
      <div class="game-head">
        <div class="head-side">
          <button class="round-btn" data-act="back" aria-label="Menu">${icons.back}</button>
        </div>
        <div class="game-info">
          <div class="game-level">${L ? L.name : ""}</div>
          <div class="game-timer">0:00</div>
        </div>
        <div class="head-side right">
          <button class="round-btn" data-act="settings" aria-label="Impostazioni">${icons.gear}</button>
          <button class="round-btn" data-act="pause" aria-label="Pausa">${icons.pause}</button>
        </div>
      </div>
      <div class="board-wrap"><div class="board"></div></div>
      <div class="tools">
        <button class="tool" data-act="undo">${icons.undo}Annulla</button>
        <button class="tool" data-act="erase">${icons.erase}Cancella</button>
        <button class="tool" data-act="notes">${icons.pencil}Note<span class="badge">NO</span></button>
        <button class="tool" data-act="hint">${icons.bulb}Aiuto</button>
      </div>
      <div class="pad"></div>
    </div>`;

  el = {
    board: root.querySelector(".board"),
    wrap: root.querySelector(".board-wrap"),
    timer: root.querySelector(".game-timer"),
    pad: root.querySelector(".pad"),
    tools: root.querySelector(".tools"),
    notesBtn: root.querySelector('[data-act="notes"]'),
    undoBtn: root.querySelector('[data-act="undo"]'),
    hintBtn: root.querySelector('[data-act="hint"]'),
    pauseBtn: root.querySelector('[data-act="pause"]'),
  };

  // 81 caselle, create una volta sola
  el.cells = [];
  for (let i = 0; i < 81; i++) {
    const c = document.createElement("div");
    const r = ROW[i], k = COL[i];
    c.className = "cell" + (k === 8 ? " c8" : "") + (r === 8 ? " r8" : "") + (k === 2 || k === 5 ? " br" : "") + (r === 2 || r === 5 ? " bb" : "");
    c.style.setProperty("--d", r + k);
    el.board.appendChild(c);
    el.cells.push(c);
  }
  el.board.addEventListener("pointerdown", (ev) => {
    const i = el.cells.indexOf(ev.target.closest(".cell"));
    if (i >= 0) tapCell(i);
  });

  // Tastierino
  el.nums = [];
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement("button");
    b.className = "num";
    b.innerHTML = `${d}<small></small>`;
    b.addEventListener("click", () => tapDigit(d));
    el.pad.appendChild(b);
    el.nums.push(b);
  }

  root.querySelector(".game").addEventListener("click", (ev) => {
    const act = ev.target.closest("[data-act]")?.dataset.act;
    if (act === "back") exitGame();
    else if (act === "pause") setPaused(!paused);
    else if (act === "settings") showSettings();
    else if (act === "undo") undo();
    else if (act === "erase") erase();
    else if (act === "notes") toggleNotes();
    else if (act === "hint") hint();
  });

  document.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVisibility);

  render();
  startTimer();
}

export function unmountGame() {
  stopTimer();
  if (G) persist();
  document.removeEventListener("keydown", onKey);
  document.removeEventListener("visibilitychange", onVisibility);
  G = null;
  el = {};
}

function exitGame() {
  onExit?.();
}

function showSettings() {
  // Il tempo si ferma mentre si cambiano le impostazioni
  stopTimer();
  openSettings(() => { if (G && !paused) startTimer(); });
}

// ---------- Timer ----------

function startTimer() {
  stopTimer();
  if (G.done || paused) return;
  lastTick = Date.now();
  timerId = setInterval(tick, 1000);
}
function stopTimer() {
  if (timerId) { tick(); clearInterval(timerId); timerId = 0; }
}
function tick() {
  const now = Date.now();
  G.elapsed += (now - lastTick) / 1000;
  lastTick = now;
  el.timer.textContent = formatTime(G.elapsed);
}

function onVisibility() {
  if (document.hidden) { if (!G.done && !paused) setPaused(true); persist(); }
}

function setPaused(p) {
  if (G.done) return;
  paused = p;
  el.pauseBtn.innerHTML = p ? icons.play : icons.pause;
  el.board.classList.toggle("paused", p);
  el.wrap.querySelector(".cover")?.remove();
  if (p) {
    stopTimer();
    const cover = document.createElement("div");
    cover.className = "cover";
    cover.innerHTML = `<div>In pausa</div><button class="btn btn-primary">Riprendi</button>`;
    cover.querySelector("button").addEventListener("click", () => setPaused(false));
    el.wrap.appendChild(cover);
  } else {
    startTimer();
  }
}

// ---------- Tocchi ----------

function tapCell(i) {
  if (paused || G.done) return;
  sel = i;
  if (settings.inputMode === "cifra") {
    if (G.puzzle[i]) activeDigit = G.puzzle[i]; // toccare una cifra data la sceglie
    else if (activeDigit) return input(activeDigit);
  }
  render();
}

function tapDigit(d) {
  if (paused || G.done) return;
  if (settings.inputMode === "cifra") {
    activeDigit = activeDigit === d ? 0 : d;
    render();
  } else {
    input(d);
  }
}

// ---------- Mosse ----------

function snapshot() {
  G.history.push({ v: G.values.slice(), n: G.notes.slice() });
  if (G.history.length > HISTORY_MAX) G.history.shift();
}

function input(d) {
  if (paused || G.done || sel < 0 || G.puzzle[sel]) return;
  if (noteMode) {
    if (G.values[sel]) return;
    snapshot();
    G.notes[sel] ^= 1 << d;
    feedback("note");
  } else {
    snapshot();
    if (G.values[sel] === d) {
      G.values[sel] = 0; // stessa cifra: la toglie
      feedback("erase");
    } else {
      G.values[sel] = d;
      G.notes[sel] = 0;
      if (settings.autoNotes) for (const p of PEERS[sel]) G.notes[p] &= ~(1 << d);
      if (!flashCompleted(sel)) feedback("place");
    }
  }
  afterMove();
}

function erase() {
  if (paused || G.done || sel < 0 || G.puzzle[sel]) return;
  if (!G.values[sel] && !G.notes[sel]) return;
  snapshot();
  if (G.values[sel]) G.values[sel] = 0;
  else G.notes[sel] = 0;
  feedback("erase");
  afterMove();
}

function undo() {
  if (paused || G.done || !G.history.length) return;
  const h = G.history.pop();
  G.values = h.v;
  G.notes = h.n;
  feedback("erase");
  afterMove();
}

function toggleNotes() {
  noteMode = !noteMode;
  render();
}

function hint() {
  if (paused || G.done) return;
  // Prima di tutto: una cifra sbagliata va segnalata (senza toglierla)
  const wrong = G.values.findIndex((v, i) => v && v !== G.solution[i]);
  if (wrong >= 0) {
    sel = wrong;
    render();
    pulse([wrong]);
    feedback("hint");
    toast("Questa cifra non è quella giusta");
    return;
  }
  // Altrimenti: la casella che si può trovare più facilmente adesso
  const g = G.values.slice();
  const cand = candidatesOf(g);
  let target = -1;
  for (let guard = 0; guard < 200 && target < 0; guard++) {
    const step = nextStep(g, cand);
    if (!step) break;
    if (step.place) target = step.place[0];
    else applyStep(g, cand, step);
  }
  if (target < 0) {
    // Ripiego: la casella vuota con meno possibilità
    let best = 10;
    const c0 = candidatesOf(G.values);
    G.values.forEach((v, i) => { if (!v && digitsOf(c0[i]).length < best) { best = digitsOf(c0[i]).length; target = i; } });
  }
  if (target < 0) return;
  snapshot();
  G.values[target] = G.solution[target];
  G.notes[target] = 0;
  if (settings.autoNotes) for (const p of PEERS[target]) G.notes[p] &= ~(1 << G.solution[target]);
  G.hints = (G.hints || 0) + 1;
  sel = target;
  if (!flashCompleted(target)) feedback("hint");
  afterMove();
}

function afterMove() {
  persist();
  render();
  if (G.values.every((v, i) => v === G.solution[i])) win();
}

function pulse(cells) {
  if (!settings.animations) return;
  requestAnimationFrame(() => {
    for (const j of cells) {
      const c = el.cells[j];
      c.classList.remove("flash");
      void c.offsetWidth;
      c.classList.add("flash");
    }
  });
}

// Illumina riga/colonna/riquadro appena completati e giusti. Restituisce true se ce n'erano.
function flashCompleted(i) {
  const units = [ROW[i], 9 + COL[i], 18 + BOX[i]].filter((u) => UNITS[u].every((j) => G.values[j] === G.solution[j]));
  if (!units.length) return false;
  pulse(units.flatMap((u) => UNITS[u]));
  if (!G.values.every((v, k) => v === G.solution[k])) feedback("unit");
  return true;
}

// ---------- Fine partita ----------

function win() {
  stopTimer();
  G.done = true;
  sel = -1;
  activeDigit = 0;
  persist();
  render();
  el.board.classList.add("won");
  feedback("win");

  const stats = store.load("stats", {});
  const s = stats[G.level] || { solved: 0, best: null, total: 0 };
  const time = Math.round(G.elapsed);
  const record = !G.hints && (s.best == null || time < s.best);
  s.solved++;
  s.total += time;
  if (record) s.best = time;
  stats[G.level] = s;
  store.save("stats", stats);

  const L = LEVELS.find((l) => l.id === G.level);
  const hints = G.hints;
  const name = settings.name;
  setTimeout(() => {
    modal({
      html: `<div class="big">🎉</div><h2>${name ? `Ottimo lavoro, ${escapeHtml(name)}!` : "Completato!"}</h2>
        <p>${L.name}${settings.showTimer ? ` in ${formatTime(time)}` : ""}${hints ? ` · ${hints} ${hints === 1 ? "aiuto" : "aiuti"}` : ""}
        ${record && s.solved > 1 && settings.showTimer ? "<br><b>Nuovo record!</b>" : ""}</p>`,
      buttons: [
        { label: "Un altro", primary: true, action: () => onNewGame?.(L.id) },
        { label: "Menu", action: () => exitGame() },
      ],
    });
  }, settings.animations ? 1100 : 300);
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- Tastiera (per provare dal computer) ----------

function onKey(ev) {
  if (!G || document.querySelector(".modal-back, .sheet")) return;
  const k = ev.key;
  if (k >= "1" && k <= "9") input(Number(k));
  else if (k === "Backspace" || k === "Delete" || k === "0") erase();
  else if (k === "n" || k === "N") toggleNotes();
  else if ((ev.ctrlKey || ev.metaKey) && k === "z") undo();
  else if (k.startsWith("Arrow")) {
    const i = sel < 0 ? 40 : sel;
    const r = ROW[i], c = COL[i];
    const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
    if (!paused && !G.done) { sel = ((r + dr + 9) % 9) * 9 + ((c + dc + 9) % 9); render(); }
    ev.preventDefault();
  }
}

// ---------- Disegno ----------

function persist() {
  store.save("game", G);
}

function render() {
  const S = settings;
  const v = G.values;
  const digitMode = S.inputMode === "cifra";
  const focusVal = digitMode ? activeDigit || (sel >= 0 ? v[sel] : 0) : sel >= 0 ? v[sel] : 0;

  // Cifre da segnare in rosso, secondo l'impostazione "Cifre sbagliate"
  const bad = new Uint8Array(81);
  if (S.errors !== "mai") {
    for (let i = 0; i < 81; i++) {
      if (!v[i]) continue;
      for (const p of PEERS[i]) if (v[p] === v[i]) { bad[i] = 1; break; }
      if (S.errors === "subito" && !G.puzzle[i] && v[i] !== G.solution[i]) bad[i] = 1;
    }
  }

  for (let i = 0; i < 81; i++) {
    const c = el.cells[i];
    const given = !!G.puzzle[i];
    const cls = c.classList;
    cls.toggle("given", given);
    cls.toggle("user", !given && !!v[i]);
    cls.toggle("sel", i === sel);
    cls.toggle("same", S.hlSame && i !== sel && !!focusVal && v[i] === focusVal);
    cls.toggle("area", S.hlArea && sel >= 0 && i !== sel && (ROW[i] === ROW[sel] || COL[i] === COL[sel] || BOX[i] === BOX[sel]));
    cls.toggle("conflict", !!bad[i]);

    const hlNote = S.hlNotes ? focusVal : 0;
    const key = v[i] ? `v${v[i]}` : `n${G.notes[i]}:${hlNote}`;
    if (c.dataset.key === key) continue;
    c.dataset.key = key;
    if (v[i]) {
      c.textContent = v[i];
    } else if (G.notes[i]) {
      let h = '<div class="notes">';
      for (let d = 1; d <= 9; d++) {
        const on = G.notes[i] & (1 << d);
        h += `<span${on && d === hlNote ? ' class="hl"' : ""}>${on ? d : ""}</span>`;
      }
      c.innerHTML = h + "</div>";
    } else {
      c.textContent = "";
    }
  }

  // Tastierino: quante ne mancano di ogni cifra
  const count = new Array(10).fill(0);
  for (const x of v) count[x]++;
  for (let d = 1; d <= 9; d++) {
    const left = 9 - count[d];
    const b = el.nums[d - 1];
    b.classList.toggle("done", S.dimDone && left <= 0);
    b.classList.toggle("active", digitMode && activeDigit === d);
    b.querySelector("small").textContent = S.showCounts && left > 0 ? left : "";
  }
  el.pad.classList.toggle("notes", noteMode);
  el.pad.classList.toggle("no-counts", !S.showCounts);
  el.notesBtn.classList.toggle("on", noteMode);
  el.notesBtn.querySelector(".badge").textContent = noteMode ? "SÌ" : "NO";
  el.undoBtn.disabled = !G.history.length;
  el.hintBtn.hidden = !S.showHint;
  el.tools.style.gridTemplateColumns = `repeat(${S.showHint ? 4 : 3}, 1fr)`;
  el.timer.classList.toggle("hidden", !S.showTimer);
  el.timer.textContent = formatTime(G.elapsed);
}

// ---------- Nuova partita ----------

export function newGameState(result) {
  return {
    level: result.level,
    puzzle: result.puzzle,
    solution: result.solution,
    values: result.puzzle.slice(),
    notes: new Array(81).fill(0),
    elapsed: 0,
    hints: 0,
    history: [],
    done: false,
    started: Date.now(),
  };
}
