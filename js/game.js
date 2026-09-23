/*
  Schermata di gioco: griglia, strumenti, tastierino, timer, salvataggio.

  Stato della partita (salvato a ogni mossa in "game"):
    level, puzzle[81], solution[81], values[81] (cifre di chi gioca + quelle di partenza),
    notes[81] (maschere di bit), elapsed (secondi), hints,
    history / future (istantanee per Annulla / Ripeti)

  Tutto ciò che è una scelta di gusto passa da `settings` (js/settings.js).
*/

import { ROW, COL, BOX, PEERS, UNITS, LEVELS, candidatesOf, applyStep } from "./sudoku.js";
import { findHint, easiestCell } from "./hints.js";
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
let hint_ = null;      // aiuto aperto: { data, level } (data da findHint)
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
  hint_ = null;
  G.future ||= [];
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
      <div class="controls">
        <div class="tools">
          <button class="tool" data-act="undo">${icons.undo}Annulla</button>
          <button class="tool" data-act="redo">${icons.redo}Ripeti</button>
          <button class="tool" data-act="erase">${icons.erase}Cancella</button>
          <button class="tool" data-act="notes">${icons.pencil}Note<span class="badge">NO</span></button>
          <button class="tool" data-act="fill">${icons.wand}Riempi</button>
          <button class="tool" data-act="hint">${icons.bulb}Aiuto</button>
        </div>
        <div class="pad"></div>
      </div>
      <div class="hint-panel" hidden></div>
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
    redoBtn: root.querySelector('[data-act="redo"]'),
    fillBtn: root.querySelector('[data-act="fill"]'),
    controls: root.querySelector(".controls"),
    hintPanel: root.querySelector(".hint-panel"),
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
    else if (act === "redo") redo();
    else if (act === "fill") fillNotes();
    else if (act === "erase") erase();
    else if (act === "notes") toggleNotes();
    else if (act === "hint") hint();
  });

  el.hintPanel.addEventListener("click", onHintClick);
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
  closeHint();
  sel = i;
  if (settings.inputMode === "cifra") {
    if (G.puzzle[i]) activeDigit = G.puzzle[i]; // toccare una cifra data la sceglie
    else if (activeDigit) return input(activeDigit);
  }
  render();
}

function tapDigit(d) {
  if (paused || G.done) return;
  closeHint();
  if (settings.inputMode === "cifra") {
    activeDigit = activeDigit === d ? 0 : d;
    render();
  } else {
    input(d);
  }
}

// ---------- Mosse ----------

function snapshot() {
  closeHint();
  G.history.push({ v: G.values.slice(), n: G.notes.slice() });
  if (G.history.length > HISTORY_MAX) G.history.shift();
  G.future = []; // una mossa nuova cancella ciò che si poteva ripetere
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
  closeHint();
  G.future.push({ v: G.values.slice(), n: G.notes.slice() });
  const h = G.history.pop();
  G.values = h.v;
  G.notes = h.n;
  feedback("erase");
  afterMove();
}

function redo() {
  if (paused || G.done || !G.future.length) return;
  closeHint();
  G.history.push({ v: G.values.slice(), n: G.notes.slice() });
  const h = G.future.pop();
  G.values = h.v;
  G.notes = h.n;
  feedback("place");
  afterMove();
}

// Scrive in ogni casella vuota tutte le cifre possibili
function fillNotes() {
  if (paused || G.done) return;
  snapshot();
  const cand = candidatesOf(G.values);
  for (let i = 0; i < 81; i++) if (!G.values[i]) G.notes[i] = cand[i];
  feedback("note");
  toast("Note complete");
  afterMove();
}

function toggleNotes() {
  noteMode = !noteMode;
  render();
}

// ---------- Aiuto ----------

function hint() {
  if (paused || G.done) return;
  if (hint_) return closeHint();
  if (settings.hintStyle === "svela") return revealEasiest();
  const data = findHint(G);
  if (!data) return;
  G.hints = (G.hints || 0) + 1;
  persist();
  feedback("hint");
  hint_ = { data, level: 0 };
  showHint();
}

// Aiuto "svela subito": segnala una cifra sbagliata oppure mette la casella più facile
function revealEasiest() {
  const wrong = G.values.findIndex((v, i) => v && !G.puzzle[i] && v !== G.solution[i]);
  if (wrong >= 0) {
    sel = wrong;
    render();
    pulse([wrong]);
    feedback("hint");
    toast("Questa cifra non è quella giusta");
    return;
  }
  const target = easiestCell(G);
  if (target < 0) return;
  G.hints = (G.hints || 0) + 1;
  placeHint(target, G.solution[target]);
}

function placeHint(i, d) {
  snapshot();
  G.values[i] = d;
  G.notes[i] = 0;
  if (settings.autoNotes) for (const p of PEERS[i]) G.notes[p] &= ~(1 << d);
  sel = i;
  if (!flashCompleted(i)) feedback("hint");
  afterMove();
}

function showHint() {
  const { data, level } = hint_;
  const last = level >= data.levels.length - 1;
  const dots = data.levels.length > 1
    ? `<div class="hint-dots">${data.levels.map((_, k) => `<i class="${k <= level ? "on" : ""}"></i>`).join("")}</div>`
    : "";
  el.hintPanel.innerHTML = `
    ${dots}
    <div class="hint-text">${data.levels[level].text}</div>
    <div class="hint-buttons">
      <button class="btn" data-h="close">Chiudi</button>
      ${last
        ? `<button class="btn btn-primary" data-h="apply">${data.apply.label}</button>`
        : `<button class="btn btn-primary" data-h="more">${level === 0 ? "Dimmi di più" : "Spiegami"}</button>`}
    </div>`;
  el.hintPanel.hidden = false;
  el.controls.hidden = true;
  render();
}

function onHintClick(ev) {
  const h = ev.target.closest("[data-h]")?.dataset.h;
  if (!hint_) return;
  if (h === "close") closeHint();
  else if (h === "more") { hint_.level++; showHint(); }
  else if (h === "apply") applyHint();
}

function closeHint() {
  if (!hint_) return;
  hint_ = null;
  el.hintPanel.hidden = true;
  el.controls.hidden = false;
  render();
}

function applyHint() {
  const a = hint_.data.apply;
  if (a.kind === "place") return placeHint(a.cell, a.digit);
  if (a.kind === "clear") {
    snapshot();
    G.values[a.cell] = 0;
    sel = a.cell;
    feedback("erase");
    return afterMove();
  }
  if (a.kind === "notes") {
    // Le note diventano quelle del ragionamento (completate dove mancavano), poi si toglie ciò che la tecnica esclude
    const missing = G.values.some((v, i) => !v && !G.notes[i]);
    snapshot();
    const cand = a.cand.slice();
    applyStep(G.values.slice(), cand, a.step);
    for (let i = 0; i < 81; i++) if (!G.values[i]) G.notes[i] = cand[i];
    feedback("note");
    if (missing) toast("Note completate e aggiornate");
    return afterMove();
  }
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
  else if ((ev.ctrlKey || ev.metaKey) && k === "y") redo();
  else if (k === "Escape") closeHint();
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
  const M = hint_ ? hint_.data.levels[hint_.level].marks : null; // segni dell'aiuto aperto
  const focusVal = M ? 0 : digitMode ? activeDigit || (sel >= 0 ? v[sel] : 0) : sel >= 0 ? v[sel] : 0;

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
    cls.toggle("sel", !M && i === sel);
    cls.toggle("same", S.hlSame && i !== sel && !!focusVal && v[i] === focusVal);
    cls.toggle("area", !M && S.hlArea && sel >= 0 && i !== sel && (ROW[i] === ROW[sel] || COL[i] === COL[sel] || BOX[i] === BOX[sel]));
    cls.toggle("conflict", !!bad[i]);
    cls.toggle("h-area", !!M && M.area.has(i));
    cls.toggle("h-focus", !!M && M.focus.has(i));
    cls.toggle("h-cause", !!M && M.cause.has(i));
    cls.toggle("h-elim", !!M && M.elim.has(i));

    const hlNote = S.hlNotes ? focusVal : 0;
    const nm = M && !v[i] ? M.notes.get(i) : null; // note mostrate dall'aiuto (anche se non scritte)
    const noteMask = nm ? nm.show : G.notes[i];
    const key = v[i] ? `v${v[i]}` : nm ? `h${nm.show}:${nm.hl}:${nm.x}` : `n${G.notes[i]}:${hlNote}`;
    if (c.dataset.key === key) continue;
    c.dataset.key = key;
    if (v[i]) {
      c.textContent = v[i];
    } else if (noteMask) {
      let h = '<div class="notes">';
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << d, on = noteMask & bit;
        const k = !on ? "" : nm ? (nm.x & bit ? "x" : nm.hl & bit ? "hl" : "") : d === hlNote ? "hl" : "";
        h += `<span${k ? ` class="${k}"` : ""}>${on ? d : ""}</span>`;
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
  el.redoBtn.disabled = !G.future.length;
  el.hintBtn.hidden = !S.showHint;
  el.redoBtn.hidden = !S.showRedo;
  el.fillBtn.hidden = !S.showFill;
  el.tools.style.gridTemplateColumns = `repeat(${3 + S.showHint + S.showRedo + S.showFill}, 1fr)`;
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
    future: [],
    done: false,
    started: Date.now(),
  };
}
