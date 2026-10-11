# Milestones

## v1.0 ShiftFlow Bug Fix (Shipped: 2026-05-22)

**Phases completed:** 2 phases, 6 plans  
**Timeline:** 2026-05-19 → 2026-05-22 (3 days)  
**Files changed:** 3 (`shift-planner.html`, `_test_real.js`, `_test_schedule.js`)

**Key accomplishments:**
- Garantite esattamente 40h settimanali per tutti i 19 dipendenti su ogni settimana generata (ALG-01)
- Eliminati i riposi extra: `restDaysNeeded` mai modificato, solo il giorno viene influenzato (ALG-02)
- Risolto overshoot 43.5h per dipendenti soli nel reparto: isSoloDept end-lock condizionale (Bug C)
- Aggiunto guard Bug B in Phase 3b Pass 1: nessuno straordinario per chi ha già raggiunto le ore contrattuali
- Garantita copertura `minCopertura` per reparti con 1-2 dipendenti tramite rotazione opener/closer (ALG-03)
- Documentate prove di terminazione EDGE-02 inline nei loop greedy e Phase 3b
- Suite di test con framework multi-scenario (4 scenari, inclusi edge case all-absent e single-worker)
- 5 bug fix post-milestone da live testing: reparto:null su turni manuali, etichetta Solo Mattina, copertura sole-dept fino a chiusura, domenicaApertura in Phase 3c, auto-riallocazione con reparto corretto

**Tech debt deferred:**
- isLastDay overshoot tolerance: test usa +0.01h, browser +0.51h (basso rischio)
- isOpener assente da test Phase 2.5: path isSoloDept testato, opener multi-worker solo E2E

---
