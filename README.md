# Sudoku for you

Sudoku da giocare con calma sul telefono: schemi sempre nuovi con una sola soluzione, quattro
livelli (Rilassante, Facile, Medio, Difficile), note a matita, aiuto, salvataggio automatico.
Funziona anche senza connessione.

## Sul telefono (Android)

Apri **https://jon1616.github.io/sudokuforyou/** in Chrome → menu ⋮ → **"Aggiungi a schermata Home"** (o "Installa app").
Da quel momento si apre come un'app, a schermo intero, anche offline.
Gli aggiornamenti arrivano da soli: basta chiudere e riaprire.

## Come si gioca

- Tocca una casella, poi una cifra. Toccare di nuovo la stessa cifra la toglie.
- **Note**: con la matita accesa le cifre diventano appunti piccoli nella casella.
- **Annulla** torna indietro di una mossa, **Cancella** svuota la casella.
- **Aiuto**: se c'è una cifra sbagliata la indica; altrimenti svela la casella più facile da trovare.
- Il numerino sotto ogni cifra del tastierino dice quante ne mancano.
- **Impostazioni** (rotella ⚙): colore, tema chiaro/scuro, sfondo, carattere, grandezza delle cifre,
  quali aiuti usare, "prima la casella" o "prima la cifra", tempo, suoni e vibrazione, il tuo nome.
- La partita si salva da sola: si può chiudere l'app e riprendere con **Continua**.

## Per chi lavora sul codice

Vedi [CLAUDE.md](CLAUDE.md) (regole e struttura) e [ROADMAP.md](ROADMAP.md) (cosa c'è e cosa verrà).

```bash
node .claude/serve.js          # server locale su http://localhost:8766
node tools/check.mjs           # controllo prima di ogni commit
node tools/test-sudoku.mjs 50  # prova approfondita del generatore
```

Carattere Fredoka © The Fredoka Project Authors, licenza SIL Open Font License (fonts/OFL.txt).
