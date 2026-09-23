/*
  Aiuti che spiegano. findHint(G) trova la prossima cosa da fare e la racconta in
  tre gradini: 1 "dove guardare", 2 "quale tecnica", 3 "il ragionamento completo".

  Il risolutore guarda la griglia come la vede chi gioca: le cifre inserite e,
  dove ci sono, le note (purché non abbiano tolto la cifra giusta: in quel caso
  quella casella si considera senza note, per non ragionare su un errore).

  Ogni gradino ha dei "segni" da mostrare sulla griglia:
    area   caselle di contorno (la riga, la colonna, il riquadro di cui si parla)
    focus  caselle protagoniste
    cause  cifre che spiegano il perché
    elim   caselle da cui togliere note
    notes  Map casella → { show, hl, x }: note da mostrare (anche se chi gioca non le ha scritte),
           da evidenziare (hl) e da cancellare (x)
*/

import { UNITS, PEERS, ROW, COL, BOX, candidatesOf, nextStep, applyStep, digitsOf, popcount } from "./sudoku.js";

// ---------- Parole ----------

const lineWord = (u) => (u < 9 ? "riga" : "colonna");
const linesWord = (u) => (u < 9 ? "righe" : "colonne");
const unitThis = (u) => (u < 9 ? "questa riga" : u < 18 ? "questa colonna" : "questo riquadro");
const inUnit = (u) => (u < 9 ? "in questa riga" : u < 18 ? "in questa colonna" : "in questo riquadro");
const ofUnit = (u) => (u < 9 ? "della riga" : u < 18 ? "della colonna" : "del riquadro");
const cap = (s) => s[0].toUpperCase() + s.slice(1);
function list(ds) {
  const a = ds.map((d) => `<b>${d}</b>`);
  return a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} e ${a[a.length - 1]}`;
}
const numWord = (n) => (n === 2 ? "due" : "tre");

// ---------- Come vede la griglia chi gioca ----------

export function solverView(G) {
  const g = G.values.slice();
  const full = candidatesOf(g);
  const cand = full.map((m, i) => {
    const n = G.notes[i];
    if (g[i] || !n || !(n & (1 << G.solution[i]))) return m;
    return m & n || m;
  });
  return { g, full, cand };
}

// ---------- Segni sulla griglia ----------

function marks({ area = [], focus = [], cause = [], elim = [] } = {}) {
  return { area: new Set(area), focus: new Set(focus), cause: new Set(cause), elim: new Set(elim), notes: new Map() };
}
function showNotes(m, cand, cells, { hl = 0, x = null } = {}) {
  for (const i of cells) {
    const prev = m.notes.get(i);
    m.notes.set(i, { show: cand[i], hl: (prev?.hl || 0) | (cand[i] & hl), x: (prev?.x || 0) | (x ? x(i) : 0) });
  }
}

// ---------- Ricerca ----------

// Restituisce { levels: [{ text, marks }...], apply: { label, kind, ... } }
export function findHint(G) {
  // 1. Una cifra sbagliata viene prima di tutto
  const wrong = G.values.findIndex((v, i) => v && !G.puzzle[i] && v !== G.solution[i]);
  if (wrong >= 0) {
    return {
      levels: [{ text: "Questa cifra non è quella giusta.", marks: marks({ focus: [wrong], elim: [wrong] }) }],
      apply: { label: "Toglila", kind: "clear", cell: wrong },
    };
  }

  const { g, full, cand } = solverView(G);
  const step = nextStep(g, cand);
  if (!step) {
    // Ripiego: la casella con meno possibilità
    let target = -1, best = 10;
    g.forEach((v, i) => { if (!v && popcount(cand[i]) < best) { best = popcount(cand[i]); target = i; } });
    if (target < 0) return null;
    return {
      levels: [{ text: "Qui servirebbe un ragionamento molto avanzato. Posso svelarti questa casella.", marks: marks({ focus: [target] }) }],
      apply: { label: "Mostra la cifra", kind: "place", cell: target, digit: G.solution[target] },
    };
  }
  return explain(step, g, full, cand);
}

// La casella che si può trovare più facilmente adesso (per l'aiuto "svela subito")
export function easiestCell(G) {
  const { g, cand } = solverView(G);
  for (let guard = 0; guard < 300; guard++) {
    const step = nextStep(g, cand);
    if (!step) break;
    if (step.place) return step.place[0];
    applyStep(g, cand, step);
  }
  let target = -1, best = 10;
  g.forEach((v, i) => { if (!v && popcount(cand[i]) < best) { best = popcount(cand[i]); target = i; } });
  return target;
}

// ---------- Spiegazioni ----------

function explain(step, g, full, cand) {
  const T = step.tech;

  if (T === "hiddenSingle") {
    const [i, d] = step.place, u = step.unit, unit = UNITS[u];
    const others = unit.filter((k) => k !== i && !g[k]);
    const cause = new Set();
    let byNotes = false;
    for (const o of others) {
      const p = PEERS[o].find((k) => g[k] === d);
      if (p != null) cause.add(p);
      else byNotes = true;
    }
    return {
      levels: [
        { text: `Guarda bene ${unitThis(u)}.`, marks: marks({ area: unit }) },
        { text: `<b>Cifra obbligata</b>: ${inUnit(u)} c'è un solo posto dove può andare il <b>${d}</b>.`, marks: marks({ area: unit }) },
        {
          text: `Il <b>${d}</b> manca ${inUnit(u)}. Nelle altre caselle libere non può andare: ognuna vede già un ${d} (evidenziati)${byNotes ? ", oppure l'hai già tolto dalle note" : ""}. Resta solo questa casella.`,
          marks: marks({ area: unit, focus: [i], cause: [...cause] }),
        },
      ],
      apply: { label: `Metti il ${d}`, kind: "place", cell: i, digit: d },
    };
  }

  if (T === "nakedSingle") {
    const [i, d] = step.place;
    const seen = [...new Set(PEERS[i].map((k) => g[k]).filter(Boolean))].sort();
    const area = [...UNITS[ROW[i]], ...UNITS[9 + COL[i]], ...UNITS[18 + BOX[i]]].filter((k) => k !== i);
    const byNotes = popcount(full[i]) > 1;
    const m3 = marks({ area, focus: [i], cause: byNotes ? [] : PEERS[i].filter((k) => g[k]) });
    if (byNotes) showNotes(m3, cand, [i], { hl: 1 << d });
    return {
      levels: [
        { text: "Guarda questa casella.", marks: marks({ focus: [i] }) },
        { text: "<b>Ultima possibilità</b>: in questa casella può andare una sola cifra.", marks: marks({ area, focus: [i] }) },
        {
          text: byNotes
            ? `Tenendo conto delle note che hai già tolto, in questa casella resta solo il <b>${d}</b>.`
            : `La sua riga, la sua colonna e il suo riquadro contengono già ${list(seen)}. L'unica cifra che manca è il <b>${d}</b>.`,
          marks: m3,
        },
      ],
      apply: { label: `Metti il ${d}`, kind: "place", cell: i, digit: d },
    };
  }

  // Da qui in poi le tecniche lavorano sulle note
  const b = step.digit ? 1 << step.digit : 0;
  const elimCells = step.elim.map(([k]) => k);
  const elimMask = new Map(step.elim.map(([k, m]) => [k, m]));
  const applyNotes = { label: "Aggiorna le note", kind: "notes", step, cand };
  const withElim = (m, focus, hl) => {
    showNotes(m, cand, focus, { hl });
    showNotes(m, cand, elimCells, { x: (k) => elimMask.get(k) });
    return m;
  };
  const notesHint = " Qui servono le note: se mancano, le completo io.";

  if (T === "pointing" || T === "claiming") {
    const d = step.digit;
    const [first, second] = T === "pointing" ? [step.unit, step.line] : [step.unit, step.box];
    const lw = T === "pointing" ? lineWord(step.line) : lineWord(step.unit);
    const m1 = marks({ area: UNITS[first], focus: step.cells });
    showNotes(m1, cand, step.cells, { hl: b });
    const text3 = T === "pointing"
      ? `In questo riquadro il <b>${d}</b> può andare solo nelle caselle evidenziate, tutte sulla stessa ${lw}. Quindi il ${d} di quella ${lw} sarà per forza qui: nel resto della ${lw} si può togliere dalle note.`
      : `In questa ${lw} il <b>${d}</b> può andare solo nelle caselle evidenziate, tutte nello stesso riquadro. Quindi il ${d} di quel riquadro sarà per forza qui: nel resto del riquadro si può togliere dalle note.`;
    return {
      levels: [
        { text: `Guarda il <b>${d}</b> ${T === "pointing" ? "in questo riquadro" : `in questa ${lw}`}.`, marks: m1 },
        {
          text: T === "pointing"
            ? `<b>Candidati bloccati</b>: in questo riquadro il ${d} può stare solo su una ${lw}.${notesHint}`
            : `<b>Candidati bloccati</b>: in questa ${lw} il ${d} può stare solo dentro un riquadro.${notesHint}`,
          marks: m1,
        },
        { text: text3, marks: withElim(marks({ area: [...UNITS[first], ...UNITS[second]], focus: step.cells, elim: elimCells }), step.cells, b) },
      ],
      apply: applyNotes,
    };
  }

  if (T === "nakedPair" || T === "nakedTriple") {
    const n = step.cells.length, u = step.unit;
    const union = step.cells.reduce((m, k) => m | cand[k], 0);
    const ds = digitsOf(union);
    const m1 = marks({ area: UNITS[u], focus: step.cells });
    showNotes(m1, cand, step.cells, { hl: union });
    return {
      levels: [
        { text: `Guarda queste ${numWord(n)} caselle ${inUnit(u)}.`, marks: m1 },
        { text: `<b>${n === 2 ? "Coppia" : "Tripletta"}</b>: ${numWord(n)} caselle con le stesse ${numWord(n)} sole possibilità.${notesHint}`, marks: m1 },
        {
          text: `Queste ${numWord(n)} caselle possono contenere solo ${list(ds)}: quelle cifre andranno per forza lì. Quindi nelle altre caselle ${ofUnit(u)} si possono togliere dalle note.`,
          marks: withElim(marks({ area: UNITS[u], focus: step.cells, elim: elimCells }), step.cells, union),
        },
      ],
      apply: applyNotes,
    };
  }

  if (T === "hiddenPair" || T === "hiddenTriple") {
    const n = step.digits.length, u = step.unit;
    const keep = step.digits.reduce((m, d) => m | (1 << d), 0);
    const m1 = marks({ area: UNITS[u] });
    return {
      levels: [
        { text: `Guarda ${list(step.digits)} ${inUnit(u)}.`, marks: m1 },
        { text: `<b>${n === 2 ? "Coppia" : "Tripletta"} nascosta</b>: ${inUnit(u)} ${numWord(n)} cifre possono andare solo in ${numWord(n)} caselle.${notesHint}`, marks: m1 },
        {
          text: `${cap(inUnit(u))} ${list(step.digits)} possono andare solo nelle ${numWord(n)} caselle evidenziate: quelle caselle sono "prenotate". Dalle loro note si possono togliere tutte le altre cifre.`,
          marks: withElim(marks({ area: UNITS[u], focus: step.cells, elim: elimCells }), step.cells, keep),
        },
      ],
      apply: applyNotes,
    };
  }

  if (T === "xWing") {
    const d = step.digit, [l1, l2] = step.lines;
    const area = [...UNITS[l1], ...UNITS[l2]];
    const m1 = marks({ area, focus: step.cells });
    showNotes(m1, cand, step.cells, { hl: b });
    return {
      levels: [
        { text: `Guarda il <b>${d}</b> in queste due ${linesWord(l1)}.`, marks: m1 },
        { text: `<b>X-Wing</b>: il ${d} forma un rettangolo.${notesHint}`, marks: m1 },
        {
          text: `In queste due ${linesWord(l1)} il <b>${d}</b> può andare solo in due posti, e sono sulle stesse due ${linesWord(step.cross[0])}. Comunque vada, il ${d} occuperà due angoli opposti del rettangolo: nel resto di quelle ${linesWord(step.cross[0])} si può togliere dalle note.`,
          marks: withElim(marks({ area: [...area, ...step.cross.flatMap((c) => UNITS[c])], focus: step.cells, elim: elimCells }), step.cells, b),
        },
      ],
      apply: applyNotes,
    };
  }

  if (T === "xyWing") {
    const [p, w1, w2] = step.cells, z = step.digit;
    const [x, y] = digitsOf(cand[p]);
    const xOf = cand[w1] & (1 << x) ? x : y;
    const yOf = xOf === x ? y : x;
    const m1 = marks({ focus: step.cells });
    showNotes(m1, cand, step.cells);
    return {
      levels: [
        { text: "Guarda queste tre caselle.", marks: m1 },
        { text: `<b>XY-Wing</b>: tre caselle con due possibilità ciascuna si incastrano.${notesHint}`, marks: m1 },
        {
          text: `La casella centrale può essere solo <b>${x}</b> o <b>${y}</b>. Se è ${xOf}, una delle altre due diventa ${z}; se è ${yOf}, lo diventa l'altra. In ogni caso una delle due è <b>${z}</b>: le caselle che le vedono entrambe non possono essere ${z}.`,
          marks: withElim(marks({ focus: step.cells, cause: [p], elim: elimCells }), step.cells, 1 << z),
        },
      ],
      apply: applyNotes,
    };
  }

  return null;
}
