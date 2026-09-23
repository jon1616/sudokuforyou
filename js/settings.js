/*
  Impostazioni: valori salvati, tema calcolato dal colore scelto, schermata con anteprima.

  Tutto il gioco legge `settings` (sempre aggiornato). Chi deve reagire ai cambi
  si iscrive con onSettingsChange(fn).
  Il tema nasce da UN colore (tinta e saturazione): da lì si calcolano tutte le
  sfumature per il tema chiaro e per quello scuro.
*/

import * as store from "./storage.js";
import { icons } from "./icons.js";

export const DEFAULTS = {
  // Aspetto
  color: "#7a6bd1",
  mode: "auto",          // auto | light | dark
  background: "caldo",   // caldo | neutro | colorato
  font: "rotondo",       // rotondo | semplice | classico
  digitSize: "m",        // s | m | l
  // Aiuti
  hlArea: true,          // evidenzia riga, colonna e riquadro
  hlSame: true,          // evidenzia le cifre uguali
  hlNotes: true,         // evidenzia le note uguali
  errors: "conflitti",   // mai | conflitti | subito
  autoNotes: true,       // toglie le note quando si inserisce una cifra
  showHint: true,        // pulsante Aiuto
  hintStyle: "gradini",  // gradini (dove guardare → tecnica → spiegazione) | svela (mette subito una cifra)
  showRedo: true,        // pulsante Ripeti
  showFill: true,        // pulsante Riempi note
  // Gioco
  inputMode: "cella",    // cella (prima la casella) | cifra (prima la cifra)
  showTimer: true,
  showCounts: true,      // numerini "quante ne mancano" sul tastierino
  dimDone: true,         // cifre completate sbiadite
  animations: true,
  // Sensazioni
  vibration: false,
  sounds: false,
  // Tu
  name: "",
};

export const PALETTE = [
  { name: "Lavanda", hex: "#7a6bd1" },
  { name: "Cielo", hex: "#4a8fd9" },
  { name: "Mare", hex: "#2aa3b3" },
  { name: "Menta", hex: "#3caf8c" },
  { name: "Salvia", hex: "#7c9d66" },
  { name: "Sole", hex: "#e0a526" },
  { name: "Pesca", hex: "#ee875a" },
  { name: "Corallo", hex: "#e2667a" },
  { name: "Rosa", hex: "#d46aa6" },
  { name: "Prugna", hex: "#9b5a9e" },
  { name: "Terracotta", hex: "#c0694b" },
  { name: "Ardesia", hex: "#64748b" },
];

export const settings = { ...DEFAULTS, ...store.load("settings", {}) };

const listeners = new Set();
export const onSettingsChange = (fn) => listeners.add(fn);

export function setSetting(key, value) {
  settings[key] = value;
  store.save("settings", settings);
  applyTheme();
  listeners.forEach((fn) => fn(key));
}

// ---------- Tema ----------

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}
const hsl = (h, s, l) => `hsl(${h.toFixed(0)} ${Math.max(0, Math.min(100, s)).toFixed(0)}% ${l.toFixed(0)}%)`;

const media = window.matchMedia("(prefers-color-scheme: dark)");
media.addEventListener?.("change", () => { if (settings.mode === "auto") applyTheme(); });
export const isDark = () => settings.mode === "dark" || (settings.mode === "auto" && media.matches);

const FONTS = {
  rotondo: '"Fredoka", system-ui, sans-serif',
  semplice: 'system-ui, "Segoe UI", Roboto, sans-serif',
  classico: 'Georgia, "Times New Roman", serif',
};
const DIGIT_SCALE = { s: 0.85, m: 1, l: 1.15 };

export function themeVars(s = settings, dark = isDark()) {
  let [h, sat, lig] = hexToHsl(s.color);
  sat = Math.min(sat, 75);
  const grey = sat < 12; // colori quasi grigi: niente tinta forzata
  const S = grey ? sat : Math.max(sat, 35);
  // Testo sul colore pieno: scuro se il colore è molto chiaro (es. giallo)
  const accentL = dark ? 72 : Math.min(58, Math.max(45, lig));
  const yellowish = h > 35 && h < 75;
  const v = {};
  if (!dark) {
    Object.assign(v, {
      "--accent": hsl(h, S, yellowish ? Math.min(accentL, 50) : accentL),
      "--accent-ink": yellowish ? "#2f2a3b" : "#ffffff",
      "--accent-soft": hsl(h, S * 0.8, 93),
      "--user": hsl(h, S, yellowish ? 36 : 44),
      "--area": hsl(h, S * 0.7, 96),
      "--same": hsl(h, S * 0.85, 87),
      "--sel": hsl(h, S * 0.9, 79),
      "--ink": "#2f2a3b",
      "--muted": "#8a8398",
      "--line-strong": "#5b5468",
      "--err": "#d9557a",
      "--err-bg": "#fbe3ea",
      "--shadow": "0 2px 10px rgba(60, 45, 90, 0.08)",
    });
    if (s.background === "neutro") Object.assign(v, { "--bg": "#f2f2f4", "--paper": "#ffffff", "--line": "#e1e1e6" });
    else if (s.background === "colorato") Object.assign(v, { "--bg": hsl(h, S * 0.6, 93), "--paper": hsl(h, S * 0.5, 99), "--line": hsl(h, S * 0.35, 87) });
    else Object.assign(v, { "--bg": "#f6f1ea", "--paper": "#fffdf9", "--line": "#e6ded2" });
  } else {
    Object.assign(v, {
      "--accent": hsl(h, S, accentL),
      "--accent-ink": "#1c1a24",
      "--accent-soft": hsl(h, S * 0.35, 22),
      "--user": hsl(h, S + 10, 78),
      "--area": hsl(h, S * 0.3, 18),
      "--same": hsl(h, S * 0.4, 28),
      "--sel": hsl(h, S * 0.45, 37),
      "--ink": "#ece8f4",
      "--muted": "#9a93a8",
      "--line-strong": "#8b84a0",
      "--err": "#ff8aa6",
      "--err-bg": "#4a2533",
      "--shadow": "0 2px 10px rgba(0, 0, 0, 0.3)",
    });
    if (s.background === "neutro") Object.assign(v, { "--bg": "#161618", "--paper": "#212124", "--line": "#37373d" });
    else if (s.background === "colorato") Object.assign(v, { "--bg": hsl(h, S * 0.3, 11), "--paper": hsl(h, S * 0.25, 15), "--line": hsl(h, S * 0.2, 24) });
    else Object.assign(v, { "--bg": "#1c1a24", "--paper": "#25222f", "--line": "#3a3647" });
  }
  v["--font"] = FONTS[s.font] || FONTS.rotondo;
  v["--digit-scale"] = DIGIT_SCALE[s.digitSize] || 1;
  return v;
}

export function applyTheme() {
  const root = document.documentElement;
  const dark = isDark();
  const vars = themeVars(settings, dark);
  for (const [k, val] of Object.entries(vars)) root.style.setProperty(k, val);
  root.style.colorScheme = dark ? "dark" : "light";
  root.classList.toggle("no-anim", !settings.animations);
  // Colore della barra del telefono
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = getComputedStyle(root).getPropertyValue("--bg").trim() || vars["--bg"];
  document.head.appendChild(meta);
}

// ---------- Schermata Impostazioni ----------

let sheet = null;
let closeCb = null;
export const isSettingsOpen = () => !!sheet;

const seg = (key, options) => `
  <div class="seg" data-key="${key}">
    ${options.map(([val, label]) => `<button data-val="${val}" class="${settings[key] === val ? "on" : ""}">${label}</button>`).join("")}
  </div>`;
const toggle = (key, label, sub = "") => `
  <label class="row">
    <span class="row-text">${label}${sub ? `<small>${sub}</small>` : ""}</span>
    <input type="checkbox" class="switch" data-key="${key}" ${settings[key] ? "checked" : ""}>
  </label>`;
const block = (label, inner, sub = "") => `<div class="row col"><span class="row-text">${label}${sub ? `<small>${sub}</small>` : ""}</span>${inner}</div>`;

function previewHTML() {
  // Una striscia di 3 righe × 9 colonne che mostra l'effetto delle impostazioni
  const s = settings;
  const given = { 0: 5, 2: 7, 5: 3, 7: 9, 10: 8, 12: 1, 16: 6, 19: 2, 22: 9, 24: 4, 26: 1 };
  const user = { 1: 3, 11: 4, 14: 3, 20: 5, 25: 7 };
  const notes = { 4: [1, 3, 8], 9: [3, 6], 21: [3, 6, 8] };
  const sel = 1, selVal = 3;
  const wrong = s.errors === "subito" ? 25 : -1; // una cifra sbagliata (senza conflitto)
  const conflict = s.errors !== "mai" ? 14 : -1; // un 3 che vede un altro 3
  let h = "";
  for (let i = 0; i < 27; i++) {
    const r = Math.floor(i / 9), c = i % 9;
    const cls = ["cell"];
    if (c === 8) cls.push("c8");
    if (r === 2) cls.push("r8");
    if (c === 2 || c === 5) cls.push("br");
    const val = given[i] || user[i] || 0;
    if (given[i]) cls.push("given");
    if (user[i]) cls.push("user");
    if (i === sel) cls.push("sel");
    else if (s.hlSame && val === selVal) cls.push("same");
    else if (s.hlArea && (r === 0 || c === 1 || c < 3)) cls.push("area");
    if (i === conflict || i === wrong || (i === 5 && conflict >= 0)) cls.push("conflict");
    let inner = val || "";
    if (notes[i]) {
      inner = '<div class="notes">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) =>
        `<span${notes[i].includes(d) && d === selVal && s.hlNotes ? ' class="hl"' : ""}>${notes[i].includes(d) ? d : ""}</span>`).join("") + "</div>";
    }
    h += `<div class="${cls.join(" ")}">${inner}</div>`;
  }
  return h;
}

function sheetHTML() {
  const custom = !PALETTE.some((p) => p.hex === settings.color);
  return `
    <div class="sheet-head">
      <button class="round-btn" data-close aria-label="Chiudi">${icons.back}</button>
      <h2>Impostazioni</h2>
      <span style="width:44px"></span>
    </div>
    <div class="sheet-body">
      <div class="board preview">${previewHTML()}</div>

      <div class="section-label">Aspetto</div>
      <div class="group">
        ${block("Colore", `
          <div class="swatches">
            ${PALETTE.map((p) => `<button class="swatch ${settings.color === p.hex ? "on" : ""}" data-color="${p.hex}" style="--c:${p.hex}" aria-label="${p.name}" title="${p.name}"></button>`).join("")}
            <label class="swatch custom ${custom ? "on" : ""}" style="--c:${settings.color}" title="Scegli tu">
              <input type="color" value="${settings.color}" data-custom-color>
              <span>+</span>
            </label>
          </div>`, "Tocca il + per scegliere qualsiasi colore")}
        ${block("Tema", seg("mode", [["auto", "Come il telefono"], ["light", "Chiaro"], ["dark", "Scuro"]]))}
        ${block("Sfondo", seg("background", [["caldo", "Carta"], ["neutro", "Neutro"], ["colorato", "Colorato"]]))}
        ${block("Carattere", seg("font", [["rotondo", "Rotondo"], ["semplice", "Semplice"], ["classico", "Classico"]]))}
        ${block("Grandezza delle cifre", seg("digitSize", [["s", "Piccole"], ["m", "Medie"], ["l", "Grandi"]]))}
      </div>

      <div class="section-label">Aiuti</div>
      <div class="group">
        ${block("Cifre sbagliate", seg("errors", [["mai", "Non segnalare"], ["conflitti", "Solo i doppioni"], ["subito", "Subito"]]),
          { mai: "Nessun segnale: si scopre alla fine", conflitti: "In rosso solo se la stessa cifra si ripete", subito: "In rosso appena una cifra non è quella giusta" }[settings.errors])}
        ${toggle("hlArea", "Evidenzia riga, colonna e riquadro")}
        ${toggle("hlSame", "Evidenzia le cifre uguali")}
        ${toggle("hlNotes", "Evidenzia le note uguali")}
        ${toggle("autoNotes", "Togli le note in automatico", "Quando metti una cifra, sparisce dalle note vicine")}
        ${toggle("showHint", "Pulsante Aiuto")}
        ${settings.showHint ? block("Come aiuta", seg("hintStyle", [["gradini", "Un passo alla volta"], ["svela", "Svela subito"]]),
          settings.hintStyle === "gradini" ? "Prima dove guardare, poi la tecnica, poi il ragionamento completo" : "Mette subito la cifra più facile da trovare") : ""}
      </div>

      <div class="section-label">Gioco</div>
      <div class="group">
        ${block("Come inserire le cifre", seg("inputMode", [["cella", "Prima la casella"], ["cifra", "Prima la cifra"]]),
          settings.inputMode === "cifra" ? "Scegli una cifra dal tastierino, poi tocca le caselle dove metterla" : "Tocca una casella, poi la cifra")}
        ${toggle("showRedo", "Pulsante Ripeti", "Rifà una mossa annullata")}
        ${toggle("showFill", "Pulsante Riempi note", "Scrive in ogni casella tutte le cifre possibili")}
        ${toggle("showTimer", "Mostra il tempo")}
        ${toggle("showCounts", "Quante ne mancano", "Il numerino sotto ogni cifra del tastierino")}
        ${toggle("dimDone", "Sbiadisci le cifre completate")}
        ${toggle("animations", "Animazioni", "Lampi quando completi una riga e onda finale")}
      </div>

      <div class="section-label">Sensazioni</div>
      <div class="group">
        ${toggle("vibration", "Vibrazione leggera")}
        ${toggle("sounds", "Suoni delicati")}
      </div>

      <div class="section-label">Tu</div>
      <div class="group">
        ${block("Il tuo nome", `<input class="text" type="text" maxlength="20" placeholder="Per un saluto all'apertura" value="${settings.name.replace(/"/g, "&quot;")}" data-name>`)}
      </div>

      <button class="btn reset" data-reset>Ripristina le impostazioni iniziali</button>
    </div>`;
}

function refresh() {
  if (!sheet) return;
  const y = sheet.querySelector(".sheet-body").scrollTop;
  sheet.innerHTML = sheetHTML();
  sheet.querySelector(".sheet-body").scrollTop = y;
}

// Apre la schermata. onClose viene chiamata alla chiusura.
export function openSettings(onClose) {
  if (sheet) return;
  closeCb = onClose;
  sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.innerHTML = sheetHTML();
  document.body.appendChild(sheet);
  history.pushState({ screen: "settings" }, "");

  sheet.addEventListener("click", (ev) => {
    const t = ev.target;
    if (t.closest("[data-close]")) return history.back(); // popstate → closeSettings
    const sw = t.closest("[data-color]");
    if (sw) { setSetting("color", sw.dataset.color); return refresh(); }
    const segBtn = t.closest(".seg button");
    if (segBtn) { setSetting(segBtn.parentElement.dataset.key, segBtn.dataset.val); return refresh(); }
    if (t.closest("[data-reset]")) {
      for (const k of Object.keys(DEFAULTS)) if (k !== "name") settings[k] = DEFAULTS[k];
      setSetting("name", settings.name);
      return refresh();
    }
  });
  sheet.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.matches(".switch")) { setSetting(t.dataset.key, t.checked); refresh(); }
    else if (t.matches("[data-custom-color]")) { setSetting("color", t.value); refresh(); }
    else if (t.matches("[data-name]")) setSetting("name", t.value.trim());
  });
  // Colore libero: anteprima mentre si sceglie
  sheet.addEventListener("input", (ev) => {
    if (ev.target.matches("[data-custom-color]")) {
      settings.color = ev.target.value;
      applyTheme();
    } else if (ev.target.matches("[data-name]")) {
      settings.name = ev.target.value.trim();
      store.save("settings", settings);
    }
  });
}

export function closeSettings() {
  if (!sheet) return;
  sheet.remove();
  sheet = null;
  const cb = closeCb;
  closeCb = null;
  cb?.();
}
