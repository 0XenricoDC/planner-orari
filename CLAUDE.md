# ShiftFlow — Planner Turni Negozio

Applicazione web **single-file** (HTML+CSS+JS puro, no framework, no npm) per generare automaticamente i turni settimanali di un negozio: copertura garantita per reparto, rispetto dei contratti (40h/settimana, 5,5 giorni lavorativi), export Excel nel formato del negozio.

## File principale

`shift-planner.html` — ~2200 righe, tutto in un unico file (markup + CSS + JS). Usa ExcelJS via CDN per l'export.

Non esiste build/bundler: si apre il file direttamente nel browser per testare.

## Requisiti chiave dell'algoritmo (da rispettare in ogni modifica)

- Ogni dipendente: **esattamente 40h settimanali** e **5,5 giornate lavorative**
- Numero di riposi = `restDaysNeeded` esatto, mai di più
- Copertura minima (`minCopertura`) garantita per ogni reparto, apertura e chiusura, ogni giorno — anche con reparti da 1-2 dipendenti
- Le assenze manuali (malattia/ferie/permesso) devono restare rispettate dopo qualunque ottimizzazione
- Mai loop infinito quando un reparto non è copribile con il personale disponibile

## Fuori scope (deciso)

- App mobile, autenticazione/multi-utente, database/backend, notifiche — resta un tool locale single-user, single-file.

## File di supporto nella cartella

- `Preset orari offi.json`, `shiftflow-preset-*.json` — preset salvati/esportati dall'app (dati reali di test, non toccare a meno che non serva per un test specifico)
- `_harness.js` — harness Node che esegue il codice REALE di `shift-planner.html` (script inline in `vm` + DOM stub) su un preset: `node _harness.js "Preset orari offi.json" 2026-09-14`. Stampa ore/riposi/mezze giornate per dipendente, straordinari totali e gap di copertura. **Da usare prima di ogni commit che tocca `generateSchedule`.**
- `_test_real.js`, `_test_schedule.js` — vecchie copie a mano dell'algoritmo, ormai disallineate dal file principale: preferire `_harness.js`
- `TURNI L'AQUILA.xlsx`, `TURNI_25.05_31.05.xlsx` — output/esempi reali di export
- Screenshot (`*.JPG`) — riferimenti visivi di bug/stati, non parte del codice

## Workflow

Ogni modifica va verificata aprendo `shift-planner.html` nel browser e generando un piano di test reale, controllando ore totali, riposi e copertura prima di committare.
