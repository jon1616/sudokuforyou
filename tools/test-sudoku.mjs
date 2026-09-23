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

import { LEVELS, generate, solve, grade, mulberry32 } from "../js/sudoku.js";

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

console.log(errors ? `\n❌ ${errors} errori` : "\n✅ tutto a posto");
process.exit(errors ? 1 : 0);
