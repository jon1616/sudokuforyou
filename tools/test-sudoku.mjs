#!/usr/bin/env node
/*
  Prova del motore (js/sudoku.js), senza browser:

      node tools/test-sudoku.mjs [schemi per livello, predefinito 20]

  Per ogni livello genera N schemi e controlla che:
    - la soluzione sia unica e coincida con quella salvata
    - le cifre di partenza siano quelle della soluzione
    - il risolutore "umano" arrivi in fondo
  Stampa difficoltà ottenuta, numero di cifre di partenza e tempi (su telefono
  i tempi sono circa 3-5 volte più lunghi).
*/

import { LEVELS, generate, solve, grade, mulberry32, applyStep } from "../js/sudoku.js";
import { findHint } from "../js/hints.js";

const N = Number(process.argv[2]) || 20;
let errors = 0;
const rng = mulberry32(12345);

for (let li = 0; li < LEVELS.length; li++) {
  const L = LEVELS[li];
  const times = [], clues = [], levels = {};
  for (let k = 0; k < N; k++) {
    const t0 = performance.now();
    const r = generate(li, rng);
    times.push(performance.now() - t0);
    const s = solve(r.puzzle, 2);
    if (s.count !== 1) { errors++; console.log(`  ERR ${L.id}: ${s.count} soluzioni`); }
    else if (s.solution.join("") !== r.solution.join("")) { errors++; console.log(`  ERR ${L.id}: soluzione diversa`); }
    if (r.puzzle.some((v, i) => v && v !== r.solution[i])) { errors++; console.log(`  ERR ${L.id}: cifra di partenza sbagliata`); }
    const g = grade(r.puzzle);
    if (!g.solved) { errors++; console.log(`  ERR ${L.id}: il risolutore umano non arriva in fondo`); }
    levels[g.level] = (levels[g.level] || 0) + 1;
    clues.push(r.puzzle.filter(Boolean).length);
  }
  const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0);
  console.log(
    `${L.name.padEnd(11)} obiettivo ${L.target} → ottenuti ${JSON.stringify(levels)} · cifre ${Math.min(...clues)}-${Math.max(...clues)} · ` +
    `tempo medio ${avg(times)} ms, massimo ${Math.max(...times).toFixed(0)} ms`
  );
}

// Aiuti: risolvere uno schema seguendo solo gli aiuti deve arrivare in fondo, senza errori né giri a vuoto
const techs = {};
for (let li = 0; li < LEVELS.length; li++) {
  for (let k = 0; k < Math.max(3, N / 4); k++) {
    const r = generate(li, rng);
    const G = { puzzle: r.puzzle, solution: r.solution, values: r.puzzle.slice(), notes: new Array(81).fill(0) };
    let moves = 0;
    while (G.values.some((v) => !v) && moves < 400) {
      moves++;
      const h = findHint(G);
      if (!h) { errors++; console.log(`  ERR aiuto: nessun suggerimento (${LEVELS[li].id})`); break; }
      if (h.levels.some((l) => !l.text)) { errors++; console.log("  ERR aiuto: testo vuoto"); }
      const a = h.apply;
      const t = a.step?.tech || (a.kind === "place" ? "cifra" : a.kind);
      techs[t] = (techs[t] || 0) + 1;
      if (a.kind === "place") {
        if (a.digit !== G.solution[a.cell]) { errors++; console.log("  ERR aiuto: cifra sbagliata"); break; }
        G.values[a.cell] = a.digit;
        G.notes[a.cell] = 0;
      } else if (a.kind === "notes") {
        const cand = a.cand.slice();
        applyStep(G.values.slice(), cand, a.step);
        for (let i = 0; i < 81; i++) if (!G.values[i]) {
          if (!(cand[i] & (1 << G.solution[i]))) { errors++; console.log(`  ERR aiuto: ${a.step.tech} toglie la cifra giusta`); }
          G.notes[i] = cand[i];
        }
      } else { errors++; console.log(`  ERR aiuto inatteso: ${a.kind}`); break; }
    }
    if (G.values.some((v) => !v)) { errors++; console.log(`  ERR aiuto: schema non finito (${LEVELS[li].id})`); }
  }
}
console.log(`Aiuti: schemi risolti seguendo solo gli aiuti · ${JSON.stringify(techs)}`);

console.log(errors ? `\n❌ ${errors} errori` : "\n✅ tutto a posto");
process.exit(errors ? 1 : 0);
