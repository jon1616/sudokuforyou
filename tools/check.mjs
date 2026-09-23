#!/usr/bin/env node
/*
  Controllo rapido prima di ogni commit (senza browser):

      node tools/check.mjs

  Verifica:
    - sintassi di tutti i file JavaScript
    - ogni file elencato in sw.js (PRECACHE) esiste, e ogni file dell'app è elencato
      (altrimenti senza rete mancherebbe un pezzo)
    - js/version.js e sw.js dicono la stessa versione
    - il motore genera schemi validi (una prova veloce per livello)
  Esce con codice 1 se c'è almeno un errore.
*/

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let errors = 0;
const ok = (msg) => console.log(`  OK   ${msg}`);
const fail = (msg) => { errors++; console.log(`  ERR  ${msg}`); };
const read = (p) => readFileSync(join(root, p), "utf8");

function list(dir, ext) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const p = `${dir}/${name}`;
    if (statSync(join(root, p)).isDirectory()) out.push(...list(p, ext));
    else if (ext.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

// 1. Sintassi
console.log("Sintassi");
const files = [...list("js", [".js"]), "sw.js", ...list("tools", [".mjs"])];
let bad = 0;
for (const f of files) {
  // `node --check file.js` non segnala gli errori nei moduli ES: si passa il sorgente da stdin
  const r = spawnSync(process.execPath, ["--input-type=module", "--check"], { input: read(f), encoding: "utf8" });
  if (r.status !== 0) {
    bad++;
    const err = (r.stderr || "").split("\n");
    const where = err.find((l) => /^\[stdin\]:\d+/.test(l))?.match(/:(\d+)/)?.[1];
    fail(`${f}${where ? `:${where}` : ""}: ${(err.find((l) => /Error/.test(l)) || "errore").trim()}`);
  }
}
if (!bad) ok(`${files.length} file JavaScript, nessun errore di sintassi`);

// 2. Service worker
console.log("Service worker (sw.js)");
const sw = read("sw.js");
const precache = [...new Set([...sw.matchAll(/"(\.\/[^"]*)"/g)].map((m) => m[1]))];
const missing = precache.filter((p) => p !== "./" && !existsSync(join(root, p)));
if (missing.length) fail(`in PRECACHE ma inesistenti (il service worker non si installerebbe): ${missing.join(", ")}`);
else ok(`${precache.length} file in PRECACHE, tutti presenti`);
const appFiles = [
  "index.html", "manifest.webmanifest",
  ...list("js", [".js"]), ...list("css", [".css"]), ...list("fonts", [".woff2"]), ...list("icons", [".png"]),
].map((p) => `./${p}`);
const forgotten = appFiles.filter((p) => !precache.includes(p));
if (forgotten.length) fail(`file dell'app non elencati in PRECACHE: ${forgotten.join(", ")}`);
else ok(`tutti i ${appFiles.length} file dell'app sono in PRECACHE`);

// 3. Versione
console.log("Versione");
const v1 = read("js/version.js").match(/VERSION\s*=\s*"([^"]+)"/)?.[1];
const v2 = sw.match(/CACHE_VERSION\s*=\s*"([^"]+)"/)?.[1];
if (v1 && v1 === v2) ok(`v${v1} in version.js e sw.js`);
else fail(`version.js dice "${v1}", sw.js dice "${v2}"`);

// 4. Motore
console.log("Motore (js/sudoku.js)");
if (!bad) {
  const S = await import(pathToFileURL(join(root, "js/sudoku.js")).href);
  const rng = S.mulberry32(7);
  S.LEVELS.forEach((L, li) => {
    const r = S.generate(li, rng);
    const s = S.solve(r.puzzle, 2);
    if (s.count !== 1 || s.solution.join("") !== r.solution.join("")) fail(`${L.name}: soluzione non unica o diversa`);
    else if (!S.grade(r.puzzle).solved) fail(`${L.name}: il risolutore umano non arriva in fondo`);
  });
  if (!errors) ok(`${S.LEVELS.length} livelli, uno schema valido per ciascuno`);
}

console.log(`\n${errors ? "❌" : "✅"} ${errors} errori`);
process.exit(errors ? 1 : 0);
