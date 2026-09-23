# SUDOKUFORYOU — guida per chi lavora sul codice (umani e agenti)

Sudoku per telefono, **single player e rilassante**, altamente personalizzabile. Pensato per un'amica
dell'utente che gioca per rilassarsi, su **Android** (Chrome). Pagina web installabile (PWA),
vanilla JS senza build, funziona offline, hosting su GitHub Pages.
Stessa impostazione di CELLCITTINE (`../CELLCITTINE`).
Online: https://jon1616.github.io/sudokuforyou/ — Repo: jon1616/sudokuforyou (branch `main`).

## Chi decide cosa

- L'utente è il **regista**: decide cosa fare, prova sul telefono, dà feedback. Non scrive codice né grafica.
- L'agente fa **tutto il lavoro pratico** e procede **a piccoli passi**: una cosa alla volta, pubblicata e verificabile.
- Ogni aggiunta futura va prima segnata in [ROADMAP.md](ROADMAP.md) e poi spuntata quando è online.

## Regole fisse

1. **Rilassante prima di tutto**: niente vite, niente penalità, niente fretta. Il timer c'è ma non mette pressione; gli errori si segnalano con garbo.
2. **Ogni schema ha una sola soluzione** e la difficoltà è misurata dal risolutore "umano" (`grade()` in `js/sudoku.js`), non dal numero di cifre.
3. **Ogni scelta di gioco diventa, prima o poi, un'impostazione**: il gioco deve essere personalizzabile. Valori predefiniti gentili.
   Nuova impostazione = voce in `DEFAULTS` + riga nella schermata (`sheetHTML`) + uso in `render()` + (se si vede) anteprima.
   Colori sempre dalle variabili CSS (`--accent`, `--user`, …), mai scritti a mano: così seguono il tema.
4. **La partita non si perde mai**: salvataggio a ogni mossa (`localStorage`, chiave `sfy.game`), pausa automatica quando l'app va in secondo piano, il tasto indietro di Android torna al menu senza perdere nulla.
5. **Asset e librerie solo con licenza libera e salvati nel progetto** (font in `fonts/`, mai da CDN), sempre elencati in PRECACHE. Icone e grafica disegnate da codice (SVG in `js/icons.js`, PNG da `tools/make-icons.mjs`).
6. **Mai credenziali** in chat, file o commit.
7. **Ogni file nuovo dell'app va in PRECACHE** (`sw.js`): `node tools/check.mjs` lo segnala se manca.
8. **Testi in italiano**, tono semplice e caldo.

## Struttura

```
index.html · manifest.webmanifest · sw.js (service worker: PRECACHE + CACHE_VERSION)

css/base.css     carattere (Fredoka), colori (chiaro/scuro), schermata iniziale, finestre, avvisi
css/game.css     griglia, strumenti, tastierino, animazioni (lampo di unità completata, onda finale)
css/settings.css schermata Impostazioni (interruttori, scelte, colori, anteprima)

js/app.js        schermata iniziale, passaggio alla partita, history (tasto indietro), service worker
js/game.js       partita: selezione, cifre, note, annulla, cancella, aiuto, timer, pausa, vittoria, statistiche
js/settings.js   DEFAULTS, `settings` (sempre aggiornato), setSetting(), onSettingsChange(), tema calcolato da UN colore
                 (themeVars: chiaro/scuro × sfondo carta/neutro/colorato), schermata con anteprima
js/audio.js      feedback("place"|"note"|"erase"|"unit"|"win"|"hint"): suoni sintetizzati + vibrazione, secondo le impostazioni
js/hints.js      findHint(G): prossimo passo spiegato in 3 gradini con i segni per la griglia (area/focus/cause/elim/notes)
                 e l'azione da applicare; solverView() = la griglia come la vede chi gioca (note comprese, se non sbagliate)
js/sudoku.js     motore puro (usabile da Node): risolutore, candidati, tecniche umane, grade(), generate(), LEVELS
js/ui.js         modal(), toast(), formatTime()
js/icons.js      icone SVG
js/storage.js    load/save/remove su localStorage con prefisso "sfy."
js/version.js    VERSION

tools/check.mjs        controllo prima di ogni commit
tools/test-sudoku.mjs  prova approfondita del motore (N schemi per livello, tempi)
tools/make-icons.mjs   ridisegna le icone in icons/
fonts/                 Fredoka (OFL, licenza in fonts/OFL.txt)
```

## Il motore (`js/sudoku.js`)

- Griglia = 81 numeri (0 = vuota). Candidati = maschere di bit (bit d = cifra d).
- `TECHNIQUES`: livello 1 (singolo nascosto, singolo nudo), 2 (candidati bloccati, coppie nude/nascoste),
  3 (triple nude/nascoste, X-Wing, XY-Wing). Ogni tecnica restituisce un **passo** `{ tech, place | elim, ... }`:
  la stessa struttura servirà per i suggerimenti che spiegano.
- `LEVELS`: Rilassante e Facile = solo livello 1 (con 38 / 31 cifre minime), Medio = 2, Difficile = 3.
  Schemi che richiedono tecniche oltre quelle note vengono scartati.
- Per aggiungere una tecnica: funzione `find(g, cand)` che restituisce anche le caselle coinvolte + voce in `TECHNIQUES`
  + spiegazione in `js/hints.js` (explain) + `node tools/test-sudoku.mjs` (risolve schemi seguendo solo gli aiuti).

## Versioni e pubblicazione

`MAJOR.MINOR.PATCH`: MINOR per nuove funzioni, PATCH per correzioni e tarature.
A ogni pubblicazione: alzare `VERSION` in `js/version.js` **e** `CACHE_VERSION` in `sw.js` (stesso numero),
`node tools/check.mjs`, commit descrittivo, push su `main`. GitHub Pages pubblica in ~1 minuto;
l'app sul telefono si aggiorna da sola alla riapertura (mai a metà partita).

## Sviluppo locale

Server: `node .claude/serve.js` (o il preview "sudokuforyou" da `.claude/launch.json`) → http://localhost:8766/
Provare con viewport telefono 375×812, sia tema chiaro che scuro.
Nel riquadro di anteprima i clic per coordinate possono finire nel punto sbagliato: per le prove
automatiche usare JavaScript (`pointerdown` sulle `.cell`, `click()` su `.num` e `[data-act]`).

## Cose che NON si fanno (decise con l'utente)

- Niente store (Google Play): si installa dal browser come CELLCITTINE.
- Niente multiplayer: è un gioco da soli.
