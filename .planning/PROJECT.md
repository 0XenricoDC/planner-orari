# ShiftFlow — Planner Turni Negozio

## What This Is

Applicazione web single-file (HTML+CSS+JS puro) per la gestione automatica dei turni settimanali di un negozio. Genera il piano turni garantendo copertura per reparto, rispettando i contratti dei dipendenti, ed esportando il risultato in Excel nel formato del negozio.

## Core Value

Ogni dipendente deve avere esattamente 40h settimanali e 5,5 giornate lavorative, con ogni reparto coperto all'apertura e alla chiusura ogni giorno — senza eccezioni.

## Requirements

### Validated

- ✓ UI funzionante (configurazione dipendenti, reparti, tipi turno) — esistente
- ✓ Algoritmo base generazione turni con distribuzione riposi greedy — esistente
- ✓ Rispetto assenze manuali (malattia/ferie/permesso) — esistente
- ✓ Export Excel con struttura 5 colonne/giorno (E mattina, U mattina, E pom, U pom, T) — esistente
- ✓ Preset salvabili/caricabili (JSON) — esistente
- ✓ **ALG-01**: Ore settimanali sempre esattamente 40h per tutti i dipendenti — v1.0
- ✓ **ALG-02**: Numero riposi rispetta `restDaysNeeded` esatto, mai più — v1.0
- ✓ **ALG-03**: Copertura `minCopertura` garantita anche con reparti da 1-2 dipendenti — v1.0
- ✓ **EDGE-01**: Con assenze manuali, ore e riposi rimangono corretti — v1.0
- ✓ **EDGE-02**: Nessun loop infinito con reparti non copribili — v1.0

### Active

- [ ] **UX-01**: Feedback visivo quando la copertura non può essere garantita (attualmente: toast generico)
- [ ] **ALG-04**: Rotazione equa dei giorni di riposo nel tempo (non sempre stesso giorno della settimana)

### Out of Scope

- App mobile — web-first, fuori scope
- Autenticazione/multi-utente — single-user locale
- Database/backend — single HTML file, nessuna dipendenza server
- Notifiche / email ai dipendenti — fuori scope

## Context

- **File principale:** `shift-planner.html` (single file, no npm, no framework, ~2200 righe)
- **Test:** `_test_real.js` (19 dipendenti reali, 3 settimane), `_test_schedule.js` (4 scenari edge case)
- **Struttura dati:** `employees[]`, `reparti[]`, `schedule{}`, `turniConfig[]`
- **Algoritmo in `generateSchedule()`:** greedy, fasi 1 → 1.5 → 2 → 2.5 → 3 → 3b → 3c
- **v1.0 shipped 2026-05-22:** tutti i 19 dipendenti a 40h esatti su ogni settimana generata

## Constraints

- **Tech stack**: HTML+CSS+JS puro, single file — nessuna dipendenza esterna oltre SheetJS CDN
- **Regola critica**: Mai aggiungere `restDaysNeeded` extra — influenzare solo *quale* giorno, non *quanti*
- **Copertura**: `minCopertura` per ogni reparto ogni giorno, inclusi apertura e chiusura

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single HTML file | Zero setup, portabile, nessun deploy | ✓ Good |
| Algoritmo greedy con slack | Bilanciamento semplice senza backtracking | ✓ Good — validato con 19 dipendenti × 3 settimane |
| Max 1,5 riposi/sett fisso | L'utente ha verificato che aggiungere riposi extra rompe le ore | ✓ Good |
| Feasibility warning solo toast | Non bloccare la generazione, avvisare post-generazione | ✓ Good |
| Bug B guard `emp.ore - 0.1` | Tolleranza floating-point per `calcWeekHours` | ✓ Good |
| isSoloDept end-lock condizionale | Solo su ultimo giorno o `hoursLeft >= avgShiftH` — non ogni giorno | ✓ Good |
| isCloser disabilitato per isSoloDept | Evitare conflitto opener=closer, garantire apertura su orario | ✓ Good (v1.0), ⚠️ revisit — vedi tech debt |
| Pre-riserva `avgShiftH` per last-day isSoloDept | Recupero ore su giorni precedenti senza overshoot | ✓ Good — 40h esatti con copertura fino a chiusura |
| reparto su turni manuali | Preservare `existing.reparto` o fallback `empReparti(emp)[0]` | ✓ Good |

---
*Last updated: 2026-05-22 after v1.0 milestone*
