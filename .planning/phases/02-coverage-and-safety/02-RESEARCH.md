# Phase 2: Coverage and Safety - Research

**Researched:** 2026-05-19
**Domain:** shift-planner.html — generateSchedule() Phase 1 greedy rest loop, Phase 3b coverage repair, Phase 2.5 opener/closer edge cases
**Confidence:** HIGH (all findings derived directly from source code; no external libraries involved)

---

## Summary

Phase 2 has two concerns: (1) algorithmic safety — no infinite loop can occur even when minCopertura
is structurally unsatisfiable, and (2) correctness — every department gets the opener and closer
roles assigned properly even when it has only 1 or 2 employees.

After a thorough code audit the verdict is:

**No infinite loops exist in the current code.** Every loop in generateSchedule() is a `forEach` or
a bounded `for` with a fixed-length array. The one `while` loop (Phase 3c, line 1996) has a
break-out path for every branch. EDGE-02 is **already safe** — the algorithm will not hang regardless
of how many absences or vacancies exist.

**Coverage gaps are surfaced correctly.** The `coverageIssues` array and its toast are the only
error path needed. ALG-03 is partially satisfied: when staff is physically present, Phase 3b
(Pass 1 + Pass 2) fills gaps. When staff is absent, the gap is logged and toasted. The only real
gap in ALG-03 is the Phase 3b Pass 1 Bug B fix: since Phase 1 (now complete) added the
`calcWeekHours < emp.ore - 0.1` guard, a rest-day employee can only be promoted to straordinario
if they still have unused contract hours. That guard is already in the code.

**Single/dual-employee departments are handled correctly** in Phase 2.5. When a dept has 1 worker,
`openerOf` and `closerOf` point to the same person; the `isCloser` condition is explicitly
suppressed (`openerOf[dk]?.[rId] !== closerOf[dk]?.[rId]` check at line 1771). So the lone worker
is always the opener and never forced into an end-locked closer shift.

**What Phase 2 actually needs to verify:**
1. `canRest` in Phase 1 — already a bounded `filter` + `for` loop; no hang risk.
2. Phase 3b Pass 1 hours guard (Bug B fix from Phase 1) is the only code change that affects
   coverage. It is already in place.
3. The `openerOf`/`closerOf` assignment for single/dual-employee departments needs explicit testing
   (the existing test scripts do not exercise it).

**Primary recommendation:** Phase 2 is mostly a verification/testing effort. One small code addition
is needed: a comment + explicit guard in Phase 3b Pass 1 making clear why the loop is finite even
when `needed` cannot reach zero. No structural changes are needed anywhere.

---

## Architecture Patterns

### Phase structure (unchanged from Phase 1 research)

```
generateSchedule()
  Phase 1   → planWork + restDaysNeeded (forEach, bounded for-loop with fallback)
  Phase 1.5 → half-day allocation (forEach, no loop risk)
  Phase 2   → department assignment per day (forEach)
  Phase 2.5 → shift variant selection (forEach over dates × employees)
  Phase 3   → write schedule entries (forEach)
  Phase 3b  → coverage repair Pass 1 + Pass 2 (forEach over dates, forEach over reparti,
               slice+forEach for candidates; bounded for-loop for Pass 2)
  Phase 3c  → hour extension (while loop with finite termination — see below)
  Post      → coverageIssues check + toast
```

### Loop safety analysis (all loops)

#### Phase 1 — `sortedEmps.forEach` with inner `for` loop (lines 1398–1463)

```javascript
for (let i = 0; i < candidates.length && restLeft > 0; i++) { ... restLeft--; }
```

- `candidates` is a filtered array of 7 (or fewer) dates; it cannot grow.
- `restLeft` decrements by 1 each iteration; loop terminates in at most 7 steps.
- **Fallback path** (lines 1450–1463): a second `for` loop over `fallback` (also bounded).
  `fallback` is all remaining work days for the employee — same 7-day bound.
- **No hang risk.** If both `candidates` and `fallback` are empty (employee has 0 available days),
  `restLeft` is already 0 (set at line 1376), so the outer `if (restLeft <= 0) return` at
  line 1401 skips them entirely.
- **Edge case — all absent:** If every employee in a department is absent, `workerCount[rId][dk]`
  is 0 for all days. `canRest` returns false for every day (because `0 - 1 = -1 < minCopertura`).
  `candidates` is empty. The fallback fires and forces rest on any available day. `workerCount` is
  decremented. The result is a coverage gap, which is reported by `coverageIssues`. No hang.

#### Phase 3b Pass 1 (lines 1894–1918) — `reparti.forEach` with `candidates.slice().forEach`

```javascript
const candidates = employees.filter(...).sort(...);
candidates.slice(0, needed).forEach(emp => { setShift(...); });
```

- `needed` = `minCopertura - getRepWorking(rep.id, dk)`. This is computed once at the top of
  each reparto iteration and never re-checked inside the loop.
- The loop is a `slice(0, needed).forEach` — iterates over at most `needed` elements of a fixed
  array. No re-entry, no recursion.
- After Phase 1 Bug B fix: only employees with `calcWeekHours < emp.ore - 0.1` are candidates.
  When no such employee exists (all are at 40h), `candidates` is empty, `slice(0, needed)` is
  empty, and the forEach body never runs.
- **No hang risk even when `needed` > 0 and `candidates.length === 0`:** the slice produces an
  empty array; the forEach does nothing; `needed` is never re-evaluated; execution falls through
  to Pass 2.

#### Phase 3b Pass 2 (lines 1920–1952) — `reparti.forEach` with inner `for` loop

```javascript
for (const emp of reassignCandidates) {
  if (needed <= 0) break;
  ...
  needed--;
}
```

- `reassignCandidates` is a filtered array computed once — bounded by `employees.length`.
- `needed` is decremented each time an employee is actually reassigned.
- Guard at line 1947 prevents pulling from a source dept that would drop below its own minimum.
- **No circular reassignment loop:** `setShift` is called once per employee per day; the
  `reassignCandidates` filter excludes employees already assigned to `rep.id`; and the outer
  `reparti.forEach` moves to the next department after the inner loop finishes.
- **No hang risk.**

#### Phase 3c `while` loop (lines 1996–2028) — the only `while` in the function

```javascript
while (shortfall >= 0.25) {
  const newEnd = addMinutes(s.end, 30);
  ...
  // Each branch either: sets s.end to newEnd (+30min), sets s.start back (-30min), or breaks.
}
```

Termination proof:
- Branch 1 (`newEndH > parseHour(baseEnd)`): tries `s.start -= 30min`; if `newStartH < lbEndH`,
  **breaks**. So this branch terminates in at most `(20:00 - lbEndH) / 0.5h` = ~8 iterations.
- Branch 2 (`newEndH inside lunchBreak`): adjusts start or jumps end past lunch; then `continue`.
  After the jump, next iteration either falls into Branch 1 (break) or sets `s.end` forward.
  At most 1-2 extra iterations.
- Default: `s.end = newEnd` (+30min). `calcWeekHours` is called; if shortfall goes < 0.25, loop
  exits. Upper bound: shortfall max ~ 8h / 0.5h = 16 iterations per shift; across all extendable
  shifts this is at most 7 × 16 = 112 iterations total.
- **No hang risk.**

### opener/closer assignment for 1–2 employee departments

```javascript
// Phase 2.5, lines 1736–1747
const workers = employees.filter(emp =>
  planWork[emp.id][dk] &&
  dayAssignment[dk]?.[emp.id] === rep.id &&
  halfDayDate[emp.id] !== dk && !isManualLocked(emp.id, dk)
);
if (!workers.length) return;  // <-- guard: if nobody works this dept today, skip
const opIdx = (weekNum + d.getDay()) % workers.length;
const clIdx = workers.length === 1 ? opIdx : (opIdx + workers.length - 1) % workers.length;
openerOf[dk][rep.id] = workers[opIdx].id;
closerOf[dk][rep.id] = workers[clIdx].id;
```

- **1-worker dept:** `workers.length === 1`, so `clIdx = opIdx`. Both `openerOf` and `closerOf`
  point to the same employee.
- **2-worker dept:** `clIdx = (opIdx + 1) % 2`, so opener and closer alternate (0→1 or 1→0)
  based on weekNum rotation.
- **isCloser suppression (line 1770–1771):**
  ```javascript
  const isCloser = closerOf[dk]?.[rId] === emp.id
                && openerOf[dk]?.[rId] !== closerOf[dk]?.[rId];
  ```
  When 1-worker dept: `openerOf === closerOf`, so `isCloser = false`. The employee is only
  `isOpener`. Their `validSt` is locked to `[dayBaseSt]`; their `validEn` follows the
  `isSoloDept` path (lock on last day / when hoursLeft >= avgShiftH). This is the correct,
  Phase-1-fixed behavior.
- **0-worker dept (all absent):** `workers.length === 0`, so `if (!workers.length) return` skips
  this dept. `openerOf[dk][rep.id]` and `closerOf[dk][rep.id]` are never set (undefined). Code
  accessing them uses optional chaining (`openerOf[dk]?.[rId]`), so `isOpener` and `isCloser` are
  both `false`. No crash, no hang.

### coverageIssues toast — where it fires and what it reports

```javascript
// Lines 1956–1970 — coverage check
const coverageIssues = [];
dates.forEach(d => {
  if (!needsCoverage(d)) return;
  const dk = fmt(d);
  reparti.forEach(rep => {
    if (d.getDay() === 0 && rep.chiusoDomenica) return;
    const working = employees.filter(emp => {
      const s = (schedule[emp.id] || {})[dk];
      return s && s.reparto === rep.id && !['riposo','malattia','ferie','permesso'].includes(s.type);
    }).length;
    if (working < rep.minCopertura) {
      coverageIssues.push(`${dayName(d)} – ${rep.nome}: ${working}/${rep.minCopertura}`);
    }
  });
});

// Lines 2044–2047 — toast
if (coverageIssues.length) {
  showToast(`⚠️ Copertura insufficiente in ${coverageIssues.length} slot. Aggiungi dipendenti.`, 'warn');
} else {
  showToast('⚡ Turni generati! Tutti i reparti coperti.', 'success');
}
```

- The toast fires **after** Phase 3b has made all repair attempts. It represents genuine
  unsatisfiable coverage (not enough staff with remaining hours).
- It shows a count of under-covered slots, not a list (the list is in `coverageIssues` array but
  only the count surfaces to the user via toast).
- The coverage summary table (rendered by `renderCoverageTable`, lines ~2198–2218) uses the same
  logic and shows per-cell color coding (`cov-err` = 0 workers, `cov-warn` = below min, `cov-ok`).
- **No new error path is needed** for Phase 2. The existing `coverageIssues` mechanism is the
  correct end-state for unsatisfiable coverage.

---

## Gap Analysis for Phase 2

### What is already correct (no fix needed)

| Area | Status | Evidence |
|------|--------|----------|
| Phase 1 greedy loop hang | No hang possible | Bounded `for` loop with fixed candidate array; fallback also bounded |
| Phase 3b Pass 1 hang | No hang possible | `slice(0, needed).forEach` — empty array does nothing |
| Phase 3b Pass 2 hang | No hang possible | `for` with `break` when `needed <= 0` |
| Phase 3c while hang | No hang possible | All branches either reduce shortfall or `break` |
| 1-worker dept opener assignment | Correct | `workers.length === 1` path: opIdx = clIdx, same person |
| 1-worker dept closer suppression | Correct | `openerOf !== closerOf` guard forces `isCloser = false` |
| 0-worker dept (all absent) | Correct | `if (!workers.length) return` guard + optional chaining throughout |
| coverageIssues toast | Correct | Fires post-Phase-3b with accurate count |
| Phase 3b Bug B guard | Correct (Phase 1 fix) | `calcWeekHours < emp.ore - 0.1` prevents overshoot promotion |

### What needs verification (tests, not code changes)

| Area | Gap | Plan |
|------|-----|------|
| 1-worker dept — full week schedule | No test exercises a dept with exactly 1 employee across all 7 days | 02-02: add test case to `_test_schedule.js` |
| 2-worker dept — opener/closer rotation | Not tested | 02-02: add test case |
| All-absent dept — no hang + coverageIssues fires | Not tested | 02-02: add manual-absence simulation |
| Phase 3b Pass 1 with all at-40h — no straordinario | Human verification only (Phase 1 open question 2) | 02-02: convert to automated test |

### What might need a small code clarification (not a bug, not behavior change)

The Phase 1 greedy fallback (lines 1450–1463) forces rest even when it drops `workerCount` below
`minCopertura`. This is documented with the comment "Fallback: force rest anyway, let coverage
warning surface." The intent is correct, but there is no explicit comment explaining why this
cannot loop. Adding a comment to clarify the finite bound would satisfy EDGE-02 documentation
requirements without changing behavior.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Infinite-loop guard for coverage repair | Custom iteration counter or retry loop | Fix the candidate filter (already done in Phase 1) | The loop is already bounded; a counter would add complexity with no benefit |
| New error path for unsatisfiable coverage | New toast type, new UI element | `coverageIssues` + existing warn toast | The mechanism already exists and communicates correctly |
| Custom opener/closer rotation | New rotation data structure | `(weekNum + d.getDay()) % workers.length` (already in place) | Modular arithmetic over the workers array handles 1, 2, N employees uniformly |

---

## Common Pitfalls

### Pitfall 1: Confusing "no infinite loop" with "coverage is guaranteed"
**What goes wrong:** Concluding that because EDGE-02 (no hang) is satisfied, ALG-03 (coverage
guaranteed) is also satisfied. They are independent. ALG-03 cannot be fully satisfied when staff is
absent — that is by design. The coverage check and toast handle the unmet-coverage case.
**Prevention:** Keep the two success criteria separate in plans and tests.

### Pitfall 2: Adding a `while` or retry loop to Phase 3b to force coverage
**What goes wrong:** Any retry loop in Phase 3b would either (a) promote employees already at 40h
(violating ALG-01) or (b) loop forever when no valid candidate exists.
**Prevention:** The current single-pass `forEach` with `slice(0, needed)` is the correct pattern.
The Bug B guard from Phase 1 is the only protection needed.

### Pitfall 3: Misreading `openerOf[dk]?.[rId]` — undefined is not the same as no opener
**What goes wrong:** When a dept has no workers on a given day, `openerOf[dk][rep.id]` is never
set. Code accessing it returns `undefined`. Both `isOpener` and `isCloser` become false.
This is correct behavior. If someone adds a check like `if (openerOf[dk][rep.id] === undefined)`
to "fix" this, they'd be adding dead code since it already falls through gracefully.
**Prevention:** Trust the optional chaining. Do not add undefined-guards that duplicate what `?.`
already handles.

### Pitfall 4: Phase 3b Pass 2 can silently not reduce `needed`
**What goes wrong:** If all candidates in Pass 2 have their source dept at the minimum, every
`continue` fires and `needed` stays positive. The loop exits without error. This is correct —
there are not enough staff — but it can look like a hang during debugging if the loop is traced.
**Prevention:** When debugging, check `reassignCandidates.length` and `getRepWorking(fromRepId, dk)`
values; don't assume the loop is stuck just because `needed > 0` at exit.

---

## Code Examples

### Phase 2.5 opener/closer for 1-employee department (verified, lines 1736–1771)

```javascript
// workers = [ singleEmployee ] (length 1)
const opIdx = (weekNum + d.getDay()) % 1;  // always 0
const clIdx = 1 === 1 ? 0 : ...;           // always 0
openerOf[dk][rep.id] = workers[0].id;
closerOf[dk][rep.id] = workers[0].id;      // same person

// Later in Phase 2.5 per-employee loop:
const isOpener = openerOf[dk]?.[rId] === emp.id;  // true
const isCloser = closerOf[dk]?.[rId] === emp.id   // true
              && openerOf[dk]?.[rId] !== closerOf[dk]?.[rId];  // false (same id)
// Result: isOpener = true, isCloser = false
// validSt = [dayBaseSt]  (opener lock — correct, morning opening guaranteed)
// validEn follows isSoloDept path (lock only on last day / high hoursLeft)
```

### Phase 3b Pass 1 — empty candidate array path (safe, lines 1900–1918)

```javascript
// Scenario: all employees in dept are at 40h (calcWeekHours >= emp.ore - 0.1)
const candidates = employees.filter(emp => {
  ...
  return calcWeekHours(emp.id) < emp.ore - 0.1;  // returns false for everyone
}).sort(...);
// candidates = []
candidates.slice(0, needed).forEach(emp => { ... });  // slice(0, N) of [] = []; forEach does nothing
// needed is still > 0 but execution falls to Pass 2 — no hang, no crash
```

### Phase 1 greedy — all-absent department scenario (safe, lines 1398–1463)

```javascript
// Scenario: dept "Cassa" has minCopertura:1, only 1 employee, who has manual absence Monday–Friday
// restDaysNeeded[emp.id] = 0  (no available days → set to 0 at line 1376)
// The forEach body returns immediately at line 1401: if (restLeft <= 0) return;
// workerCount["cassa"] = 0 for all days → canRest returns false for every day
// candidates = [] → fallback fires but restLeft is already 0 → fallback for-loop never runs
// coverageIssues will catch this after Phase 3b also finds no candidates
```

---

## State of the Art

| Assumption before research | Finding after audit |
|---------------------------|---------------------|
| Phase 3b might have an infinite loop when minCopertura can't be met | No while-loop in Phase 3b; forEach+slice is always bounded |
| Single-employee depts might crash opener/closer assignment | `!workers.length` guard + same-person opIdx/clIdx handles 0- and 1-worker depts |
| EDGE-02 requires a code fix | EDGE-02 is already safe; Phase 2 is primarily a test/verification exercise |
| Phase 2 plans are symmetric to Phase 1 (code changes) | Phase 2 plan 02-02 is a test-writing plan; 02-01 is mostly clarification/commentary |

---

## Open Questions

1. **Does Phase 3b Pass 2 ever reassign an employee away from a reparto and then back (circular)?**
   - What we know: Pass 2 iterates `reparti.forEach` in array order. If dept A needs a worker
     from dept B, and dept B later needs a worker from dept A, a circular swap could occur across
     iterations of the outer `reparti.forEach`.
   - What's unclear: Whether the net effect is correct (coverage counts may round-trip to the same
     state, wasting iterations but not corrupting data).
   - Recommendation: Verify with a test where two understaffed depts share the same multi-dept
     employee. The `getRepWorking` helper re-reads `schedule` on every call, so any reassignment
     is visible immediately to the next iteration. The risk is wasted work, not corruption.

2. **Is there a case where `needed > 0` after both Pass 1 and Pass 2 but `coverageIssues` is still empty?**
   - What we know: `coverageIssues` checks `getRepWorking < rep.minCopertura` after both passes.
     If `needed > 0` reached this point, the working count is still below min, so the issue IS
     pushed to the array.
   - What's unclear: Whether a `setShift` call in Pass 2 could reassign someone in a way that
     momentarily satisfies the count for one reparto but causes `getRepWorking` to undercount
     another when the coverageIssues loop runs.
   - Recommendation: The coverageIssues check is a fresh re-read from `schedule` (not from
     `getRepWorking`'s cached view), so it should be accurate. Verify with a two-reparto test.

---

## Sources

### Primary (HIGH confidence)
- Direct reading of `shift-planner.html` lines 1304–2072 (full `generateSchedule()`)
- Direct reading of `shift-planner.html` lines 1062–1072 (`empReparti`, `isManualLocked`)
- Direct reading of `shift-planner.html` lines 1292–1302 (`calcWeekHours`)
- Direct reading of `.planning/phases/01-hours-and-rest-calculation/01-RESEARCH.md` (Phase 1 bug
  inventory and fix patterns already applied)
- Direct reading of `.planning/phases/01-hours-and-rest-calculation/01-VERIFICATION.md` (confirms
  Bug B fix at line 1910 is in the live code)

---

## Metadata

**Confidence breakdown:**
- Loop safety (EDGE-02): HIGH — every loop traced with termination proof
- Opener/closer 1-2 worker edge cases (ALG-03): HIGH — code read line by line
- coverageIssues toast: HIGH — code read, behavior confirmed
- Test gaps: HIGH — test files reviewed in Phase 1; no single/dual-dept tests exist

**Research date:** 2026-05-19
**Valid until:** No external dependencies; valid until `shift-planner.html` is modified
