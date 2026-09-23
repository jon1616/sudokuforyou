/*
  Motore del sudoku: niente interfaccia, solo logica (si può usare anche da Node).

  - Griglia = array di 81 numeri (0 = casella vuota), riga per riga.
  - Candidati = maschera di bit: il bit d (1..9) acceso vuol dire "qui può andare d".
  - generate(livello, rng): crea uno schema con UNA sola soluzione e con la
    difficoltà misurata da un risolutore "umano" (le tecniche che servirebbero
    a una persona), non dal numero di caselle vuote.
  - Le tecniche restituiscono un "passo" descritto ({ tech, place | elim }):
    serviranno anche per i suggerimenti che spiegano il perché.
*/

// ---------- Tabelle precalcolate ----------

export const ROW = [], COL = [], BOX = [];
for (let i = 0; i < 81; i++) {
  ROW.push((i / 9) | 0);
  COL.push(i % 9);
  BOX.push(((ROW[i] / 3) | 0) * 3 + ((COL[i] / 3) | 0));
}

// 27 unità: 0-8 righe, 9-17 colonne, 18-26 riquadri
export const UNITS = [];
for (let r = 0; r < 9; r++) UNITS.push([...Array(9)].map((_, c) => r * 9 + c));
for (let c = 0; c < 9; c++) UNITS.push([...Array(9)].map((_, r) => r * 9 + c));
for (let b = 0; b < 9; b++) {
  const r0 = ((b / 3) | 0) * 3, c0 = (b % 3) * 3;
  UNITS.push([...Array(9)].map((_, k) => (r0 + ((k / 3) | 0)) * 9 + c0 + (k % 3)));
}

// Le 20 caselle che "vedono" ciascuna casella (stessa riga, colonna o riquadro)
export const PEERS = [];
const IS_PEER = new Uint8Array(81 * 81);
for (let i = 0; i < 81; i++) {
  const set = new Set([...UNITS[ROW[i]], ...UNITS[9 + COL[i]], ...UNITS[18 + BOX[i]]]);
  set.delete(i);
  PEERS.push([...set]);
  for (const p of set) IS_PEER[i * 81 + p] = 1;
}
const isPeer = (a, b) => IS_PEER[a * 81 + b] === 1;

export const ALL = 0x3fe; // bit 1..9
const POP = new Uint8Array(1024);
const DIGITS = [];
for (let m = 0; m < 1024; m++) {
  const ds = [];
  for (let d = 0; d < 10; d++) if (m & (1 << d)) ds.push(d);
  POP[m] = ds.length;
  DIGITS.push(ds);
}
export const popcount = (m) => POP[m & 1023];
export const digitsOf = (m) => DIGITS[m & 1023];

// ---------- Casualità con seme (lo stesso seme dà lo stesso schema) ----------

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- Risolutore veloce (conta le soluzioni) ----------

// Restituisce { count, solution }: count si ferma a `limit`.
// Con `rng` prova le cifre in ordine casuale (serve a creare griglie piene).
export function solve(grid, limit = 2, rng = null) {
  const g = grid.slice();
  const rows = new Int32Array(9), cols = new Int32Array(9), boxes = new Int32Array(9);
  for (let i = 0; i < 81; i++) {
    const v = g[i];
    if (!v) continue;
    const b = 1 << v;
    if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & b) return { count: 0, solution: null };
    rows[ROW[i]] |= b; cols[COL[i]] |= b; boxes[BOX[i]] |= b;
  }
  let count = 0, first = null;
  const rec = () => {
    let best = -1, bestMask = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
      const n = POP[m];
      if (n < bestN) { best = i; bestMask = m; bestN = n; if (n <= 1) break; }
    }
    if (best < 0) { count++; if (!first) first = g.slice(); return; }
    if (bestN === 0) return;
    const ds = rng ? shuffle(DIGITS[bestMask].slice(), rng) : DIGITS[bestMask];
    const r = ROW[best], c = COL[best], bx = BOX[best];
    for (const d of ds) {
      const b = 1 << d;
      g[best] = d; rows[r] |= b; cols[c] |= b; boxes[bx] |= b;
      rec();
      rows[r] &= ~b; cols[c] &= ~b; boxes[bx] &= ~b; g[best] = 0;
      if (count >= limit) return;
    }
  };
  rec();
  return { count, solution: first };
}

export const hasUniqueSolution = (grid) => solve(grid, 2).count === 1;

// ---------- Candidati ----------

export function candidatesOf(grid) {
  const cand = new Array(81).fill(0);
  for (let i = 0; i < 81; i++) {
    if (grid[i]) continue;
    let m = ALL;
    for (const p of PEERS[i]) if (grid[p]) m &= ~(1 << grid[p]);
    cand[i] = m;
  }
  return cand;
}

// ---------- Tecniche "umane" ----------
// Ogni funzione riceve (g, cand) e restituisce un passo oppure null.
// Passo: { tech, place: [casella, cifra] } oppure { tech, elim: [[casella, maschera], ...] }

function nakedSingle(g, cand) {
  for (let i = 0; i < 81; i++) {
    if (!g[i] && POP[cand[i]] === 1) return { tech: "nakedSingle", place: [i, DIGITS[cand[i]][0]] };
  }
  return null;
}

function hiddenSingle(g, cand) {
  // Prima i riquadri (è il modo più naturale di guardare), poi righe e colonne
  for (const u of [18, 19, 20, 21, 22, 23, 24, 25, 26, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]) {
    for (let d = 1; d <= 9; d++) {
      const b = 1 << d;
      let where = -1, n = 0;
      for (const i of UNITS[u]) if (!g[i] && cand[i] & b) { where = i; n++; if (n > 1) break; }
      if (n === 1) return { tech: "hiddenSingle", place: [where, d], unit: u };
    }
  }
  return null;
}

function lockedCandidates(g, cand) {
  // Puntamento: in un riquadro la cifra sta solo su una riga/colonna → via dal resto della riga/colonna
  for (let bx = 18; bx < 27; bx++) {
    for (let d = 1; d <= 9; d++) {
      const b = 1 << d;
      const cells = UNITS[bx].filter((i) => !g[i] && cand[i] & b);
      if (cells.length < 2) continue;
      for (const [line, key] of [[ROW, 0], [COL, 9]]) {
        if (cells.every((i) => line[i] === line[cells[0]])) {
          const elim = UNITS[key + line[cells[0]]].filter((i) => BOX[i] !== bx - 18 && !g[i] && cand[i] & b).map((i) => [i, b]);
          if (elim.length) return { tech: "pointing", elim, digit: d, unit: bx };
        }
      }
    }
  }
  // Riga/colonna: la cifra sta solo in un riquadro → via dal resto del riquadro
  for (let u = 0; u < 18; u++) {
    for (let d = 1; d <= 9; d++) {
      const b = 1 << d;
      const cells = UNITS[u].filter((i) => !g[i] && cand[i] & b);
      if (cells.length < 2 || !cells.every((i) => BOX[i] === BOX[cells[0]])) continue;
      const elim = UNITS[18 + BOX[cells[0]]].filter((i) => !UNITS[u].includes(i) && !g[i] && cand[i] & b).map((i) => [i, b]);
      if (elim.length) return { tech: "claiming", elim, digit: d, unit: u };
    }
  }
  return null;
}

function combos(arr, n, fn) {
  // Chiama fn su ogni combinazione di n elementi (n = 2 o 3); si ferma se fn restituisce qualcosa
  for (let a = 0; a < arr.length; a++)
    for (let b = a + 1; b < arr.length; b++) {
      if (n === 2) { const r = fn([arr[a], arr[b]]); if (r) return r; continue; }
      for (let c = b + 1; c < arr.length; c++) { const r = fn([arr[a], arr[b], arr[c]]); if (r) return r; }
    }
  return null;
}

function nakedSubset(n, tech) {
  return (g, cand) => {
    for (let u = 0; u < 27; u++) {
      const empty = UNITS[u].filter((i) => !g[i]);
      const small = empty.filter((i) => POP[cand[i]] >= 2 && POP[cand[i]] <= n);
      const step = combos(small, n, (set) => {
        const union = set.reduce((m, i) => m | cand[i], 0);
        if (POP[union] !== n) return null;
        const elim = empty.filter((i) => !set.includes(i) && cand[i] & union).map((i) => [i, cand[i] & union]);
        return elim.length ? { tech, elim, cells: set, unit: u } : null;
      });
      if (step) return step;
    }
    return null;
  };
}

function hiddenSubset(n, tech) {
  return (g, cand) => {
    for (let u = 0; u < 27; u++) {
      const cells = UNITS[u];
      const pos = {}; // cifra → maschera delle posizioni (0..8) nell'unità
      const ds = [];
      for (let d = 1; d <= 9; d++) {
        let m = 0;
        cells.forEach((i, k) => { if (!g[i] && cand[i] & (1 << d)) m |= 1 << k; });
        pos[d] = m;
        if (POP[m] >= 2 && POP[m] <= n) ds.push(d);
      }
      const step = combos(ds, n, (set) => {
        const where = set.reduce((m, d) => m | pos[d], 0);
        if (POP[where] !== n) return null;
        const keep = set.reduce((m, d) => m | (1 << d), 0);
        const elim = [];
        cells.forEach((i, k) => { if (where & (1 << k) && cand[i] & ~keep) elim.push([i, cand[i] & ~keep]); });
        return elim.length ? { tech, elim, digits: set, unit: u } : null;
      });
      if (step) return step;
    }
    return null;
  };
}

function xWing(g, cand) {
  for (let d = 1; d <= 9; d++) {
    const b = 1 << d;
    for (const [base, cross] of [[0, 9], [9, 0]]) {
      // base = righe (0) o colonne (9): per ognuna, dove può stare d
      const masks = [];
      for (let k = 0; k < 9; k++) {
        let m = 0;
        UNITS[base + k].forEach((i, j) => { if (!g[i] && cand[i] & b) m |= 1 << j; });
        masks.push(m);
      }
      for (let a = 0; a < 9; a++) {
        if (POP[masks[a]] !== 2) continue;
        for (let c = a + 1; c < 9; c++) {
          if (masks[c] !== masks[a]) continue;
          const elim = [];
          for (const j of DIGITS[masks[a]]) {
            for (const i of UNITS[cross + j]) {
              const k = base === 0 ? ROW[i] : COL[i];
              if (k !== a && k !== c && !g[i] && cand[i] & b) elim.push([i, b]);
            }
          }
          if (elim.length) return { tech: "xWing", elim, digit: d };
        }
      }
    }
  }
  return null;
}

function xyWing(g, cand) {
  for (let p = 0; p < 81; p++) {
    if (g[p] || POP[cand[p]] !== 2) continue;
    const [x, y] = DIGITS[cand[p]];
    const wings = PEERS[p].filter((i) => !g[i] && POP[cand[i]] === 2 && POP[cand[i] & cand[p]] === 1);
    for (const w1 of wings) {
      if (!(cand[w1] & (1 << x))) continue;
      const z = DIGITS[cand[w1] & ~(1 << x)][0];
      if (z === y) continue;
      for (const w2 of wings) {
        if (w2 === w1 || cand[w2] !== ((1 << y) | (1 << z))) continue;
        const bz = 1 << z;
        const elim = [];
        for (let i = 0; i < 81; i++) {
          if (i !== p && i !== w1 && i !== w2 && !g[i] && cand[i] & bz && isPeer(i, w1) && isPeer(i, w2)) elim.push([i, bz]);
        }
        if (elim.length) return { tech: "xyWing", elim, cells: [p, w1, w2], digit: z };
      }
    }
  }
  return null;
}

// Tecniche in ordine di difficoltà. level: 1 = base, 2 = intermedie, 3 = avanzate
export const TECHNIQUES = [
  { id: "hiddenSingle", level: 1, find: hiddenSingle },
  { id: "nakedSingle", level: 1, find: nakedSingle },
  { id: "locked", level: 2, find: lockedCandidates },
  { id: "nakedPair", level: 2, find: nakedSubset(2, "nakedPair") },
  { id: "hiddenPair", level: 2, find: hiddenSubset(2, "hiddenPair") },
  { id: "nakedTriple", level: 3, find: nakedSubset(3, "nakedTriple") },
  { id: "hiddenTriple", level: 3, find: hiddenSubset(3, "hiddenTriple") },
  { id: "xWing", level: 3, find: xWing },
  { id: "xyWing", level: 3, find: xyWing },
];

export function applyStep(g, cand, step) {
  if (step.place) {
    const [i, d] = step.place;
    g[i] = d;
    cand[i] = 0;
    for (const p of PEERS[i]) cand[p] &= ~(1 << d);
  } else {
    for (const [i, m] of step.elim) cand[i] &= ~m;
  }
}

// Il prossimo passo logico (per i suggerimenti)
export function nextStep(g, cand) {
  for (const t of TECHNIQUES) {
    const step = t.find(g, cand);
    if (step) return { ...step, level: t.level };
  }
  return null;
}

// Risolve "come una persona" e dice quanto è difficile.
// level: 1..3 = tecnica più difficile servita; 4 = servono tecniche oltre quelle note
export function grade(puzzle) {
  const g = puzzle.slice();
  const cand = candidatesOf(g);
  let level = 1, steps = 0;
  const used = {};
  while (g.includes(0)) {
    const step = nextStep(g, cand);
    if (!step) return { solved: false, level: 4, steps, used };
    applyStep(g, cand, step);
    level = Math.max(level, step.level);
    used[step.tech] = (used[step.tech] || 0) + 1;
    steps++;
  }
  return { solved: true, level, steps, used };
}

// ---------- Generatore ----------

export const LEVELS = [
  { id: "rilassante", name: "Rilassante", desc: "Tante cifre di partenza, si risolve con calma", minClues: 38, target: 1 },
  { id: "facile", name: "Facile", desc: "Basta guardare bene righe, colonne e riquadri", minClues: 31, target: 1 },
  { id: "medio", name: "Medio", desc: "Qualche nota a matita aiuta", minClues: 24, target: 2 },
  { id: "difficile", name: "Difficile", desc: "Servono le note e un po' di ragionamento", minClues: 17, target: 3 },
];

export function fullGrid(rng) {
  return solve(new Array(81).fill(0), 1, rng).solution;
}

// Toglie cifre a coppie simmetriche finché la soluzione resta unica
function carve(solution, minClues, rng) {
  const p = solution.slice();
  let clues = 81;
  for (const i of shuffle([...Array(41).keys()], rng)) {
    const j = 80 - i;
    const n = i === j ? 1 : 2;
    if (clues - n < minClues) continue;
    const a = p[i], b = p[j];
    p[i] = 0; p[j] = 0;
    if (hasUniqueSolution(p)) clues -= n;
    else { p[i] = a; p[j] = b; }
  }
  return p;
}

export function generate(levelIndex, rng = Math.random, maxAttempts = 60) {
  const L = LEVELS[levelIndex];
  let fallback = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = fullGrid(rng);
    const puzzle = carve(solution, L.minClues, rng);
    const gr = grade(puzzle);
    if (!gr.solved) continue; // troppo difficile per le tecniche note: scartato
    const result = { puzzle, solution, grade: gr, level: L.id };
    if (gr.level === L.target) return result;
    // Se non si trova il livello giusto, il più vicino (per difetto) va bene
    if (gr.level < L.target && (!fallback || gr.level > fallback.grade.level)) fallback = result;
  }
  return fallback || generate(Math.max(0, levelIndex - 1), rng, maxAttempts);
}
