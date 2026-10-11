# Phase 1: Hours and Rest Calculation - Research

**Researched:** 2026-05-19
**Domain:** shift-planner.html — generateSchedule() hours & rest logic
**Confidence:** HIGH (all findings derived directly from source code + runnable simulations)

---

## Summary

Phase 1 of `generateSchedule()` computes how many rest days each employee gets (`restDaysNeeded`),
Phase 1.5 assigns one half-day per employee, Phase 2.5 selects shift variants to hit the hour
target, and Phase 3c patches any remaining shortfall by extending the last shift. The rest-count
formula is arithmetically correct in the zero-absence case. The hour-tracking in Phase 2.5 is also
correct in the zero-absence case. Both break down under specific conditions that are reachable in
normal store operation.

There are **four distinct bugs**, each with a clear root cause and a minimal fix. No architectural
change is needed. The greedy + slack-ordering approach is sound and must be preserved.

**Primary recommendation:** Fix the four bugs in-place inside `generateSchedule()`. Every fix is a
targeted change to one logical section and does not touch the greedy ordering, the department
assignment, or the shift-type selection logic.

---

## Standard Stack

No external libraries involved. The entire algorithm lives inside a single `<script>` block in
`shift-planner.html`. All arithmetic uses plain JavaScript numbers (64-bit float). Hour values are
stored as `HH:MM` strings and converted via `parseHour()` / `shiftHours()`.

Key data:
- `employees[]` — `{ id, nome, ore, reparti[], colore }`
- `schedule{}` — `empId -> { 'YYYY-MM-DD': { type, label, start, end, note, reparto, manual } }`
- `turniConfig[]` — `[{id:'intera',...}, {id:'mattina',...}, {id:'pomeriggio',...}]`
- `lunchBreakStart` / `lunchBreakEnd` — global strings, read by `shiftHours()`
- `domenicaAperto` — boolean; when true, Sunday is a work day (7 available days per week)

---

## Bug Inventory

### Bug A — Under-hours when 2+ manual absences (EDGE-01 / ALG-01)

**Location:** `generateSchedule()` lines 1370–1385 (`restDaysNeeded` block) and Phase 2.5 (lines 1742–1842)

**What goes wrong:**  
When an employee has N manual absences pre-set, `availableDays = 7 - N` (or fewer). The formula
sets `restDaysNeeded = 0` correctly, but then Phase 1.5 still allocates one half-day slot,
leaving `fullWorkDays = availableDays - 1`. Phase 2.5 computes:

```
targetPerFullDay = (emp.ore - halfDayH) / fullWorkDays
```

When absences reduce `fullWorkDays` below the mathematical minimum, `targetPerFullDay` exceeds the
maximum available shift variant (`maxVariantH = 8h`). Phase 2.5 can only schedule 8h/day, so the
weekly total falls short.

**Exact threshold (40h employee, domenicaAperto=true, mattina=3.5h, maxVariant=8h):**

| Absences | avail | fullDays | target/day | maxAchievable | shortfall | Phase 3c fixes | Final delta |
|----------|-------|----------|-----------|---------------|-----------|----------------|-------------|
| 0 | 7 | 5 | 7.30h | 43.5h | 0 | 0 | **0 OK** |
| 1 | 6 | 5 | 7.30h | 43.5h | 0 | 0 | **0 OK** |
| 2 | 5 | 4 | 9.13h | 35.5h | 4.5h | 4.0h max | **0.5h BUG** |
| 3 | 4 | 3 | 12.17h | 27.5h | 12.5h | 3.0h max | **9.5h BUG** |

Phase 3c (lines 1957–2023) compensates by extending shift end times by 30-minute steps. It stops
at 21:00. For a shift ending at 20:00, the maximum extension is 2 × 30min = 1h per shift. With
4 full-day shifts, maximum Phase 3c compensation = 4h. A 4.5h shortfall cannot be fully closed.

**Root cause:** The formula knows how many rest days to assign, but never verifies that the
remaining working days can arithmetically cover `emp.ore` given the available shift-variant ceiling.

**Fix direction:** After computing `workDaysTarget`, check if `(workDaysTarget - 1) * maxVariantH + halfDayH >= emp.ore`. If not, the employee cannot reach their contract hours this week — emit a
warning toast (like the existing "Ore insufficienti" toast at line 2036–2042) but do NOT add extra
rest days. This is a data-entry problem, not a scheduling problem.

---

### Bug B — Over-hours and lost rest day from Phase 3b straordinario (ALG-01, ALG-02)

**Location:** `generateSchedule()` lines 1885–1903 (Phase 3b Pass 1)

**What goes wrong:**  
Phase 3b (`coverage repair`) promotes employees whose schedule entry has `type === 'riposo'` to
`'intera'` (full shift, labelled 'Straordinario') when a department is understaffed. This:

1. Removes the employee's rest day (rest count goes from 1 to 0, violating ALG-02).
2. Adds a full `avgShiftH` shift (8h) on top of a week already at 40h → weekly total becomes 48h
   (violating ALG-01).

Phase 3c does NOT reduce hours — it only adds missing hours. So the overshoot is permanent.

**Code path:**
```javascript
// Phase 3b Pass 1, line 1899-1902
candidates.slice(0, needed).forEach(emp => {
  const startTime = d.getDay() === 0 ? domenicaApertura : baseStart;
  setShift(emp.id, dk, turno.id, turno.label, startTime, baseEnd, 'Straordinario', rep.id);
  // BUG: no adjustment to cumulH, no decrement of rest count, no recalculation
});
```

The sort `calcWeekHours(a.id) - calcWeekHours(b.id)` attempts to pick the lowest-hours employee
first, but after Phase 3c has already brought everyone to 40h, all rest-day employees have the same
hours. Any of them gets picked, triggering the overshoot.

**Fix direction:** After Phase 3b promotes a rest-day employee to straordinario, recalculate their
hours and reduce the new shift's end time to cover only the missing hours (i.e., treat the
straordinario day as a regular work day for hour-targeting purposes). The rest count violation is
accepted as unavoidable when coverage cannot be met otherwise — but the hours must not exceed
contract. Alternatively: Phase 3b should only promote an employee if `calcWeekHours(emp.id) < emp.ore`
(employee has not yet reached their contract hours).

---

### Bug C — isSoloDept forces 8h/day, causing over-hours for sole-department workers (ALG-01)

**Location:** Phase 2.5, lines 1781–1794

**What goes wrong:**  
When an employee is the only person assigned to their department on a given day
(`isSoloDept = true`), Phase 2.5 locks both start AND end:

```javascript
const validSt = (isOpener || isSoloDept) ? [dayBaseSt] : startOffs.map(o => addMinutes(dayBaseSt, o));
const validEn = forceMorning ? [morningEnd]
              : (isCloser || isSoloDept) ? [baseEnd]      // <-- locked end
              : ...
```

This forces only one shift variant: `baseStart → baseEnd = 8h` (or 7.5h on Sunday). For an
employee who is sole worker in their department every day (e.g. `Dipendente 1` in
`Magazzino`), all 5 full work days become 8h, giving `5 × 8 + 3.5 = 43.5h` vs 40h contract.

Phase 3c does not reduce hours. The test scripts (`_test_real.js`, `_test_schedule.js`) do NOT
include the `isSoloDept` constraint, so they miss this bug entirely.

**Why tests pass but browser fails:** Both test files use simplified Phase 2.5 code without opener/
closer/isSoloDept logic. They run `startOffs` and `endOffs = [-30, 0]` freely for all employees,
so the dynamic tracking always finds the right hour combination.

**Fix direction:** Remove or relax the `isSoloDept` end-lock. The business reason for `isSoloDept`
is that a lone worker must stay until store close. This is a coverage concern, not a contract-hours
concern. The fix: if `isSoloDept` and this is NOT the last work day, allow `endOffs = [-60, -30, 0]`
for hour-targeting, and only lock end to `baseEnd` on the last day or when `hoursLeft >= avgShiftH`.

---

### Bug D — Test scripts diverge from browser code (instrumentation gap)

**Location:** `_test_real.js` line 193, `_test_schedule.js` line 170

**What goes wrong:**  
The browser's `generateSchedule()` uses `endOffs = [-60, -30, 0]` (line 1689), giving shift-end
variants at `baseEnd - 60min = 19:00`, `baseEnd - 30min = 19:30`, and `baseEnd = 20:00`. The test
files only use `endOffs = [-30, 0]`, missing the 19:00 variant. This means:

- Tests cannot validate the -60 end offset code path.
- Tests cannot reproduce Bug C (isSoloDept is not modelled at all).
- Tests pass even when the browser would fail.

Additionally, the test's Phase 3c is simplified (simpler loop, different lunch-skip logic at
lines 248–251 vs browser lines 1975–2022). The test `calcH` does not handle the lunch-break
deduction the same way as the browser's `calcWeekHours`.

**Fix direction:** Update test scripts to mirror the full browser Phase 2.5 exactly, including
`endOffs = [-60, -30, 0]`, opener/closer selection, isSoloDept detection, and the full Phase 3c
loop with lunch-break navigation.

---

## Architecture Patterns

### Phase structure (preserve)

```
generateSchedule()
  ├── Phase 1:   planWork assignment + restDaysNeeded calculation
  ├── Phase 1.5: half-day allocation (one per employee)
  ├── Phase 2:   department assignment per day
  ├── Phase 2.5: shift variant selection (hits exact hours via dynamic tracking)
  ├── Phase 3:   write schedule entries from planWork/shiftVariant/halfDayDate
  ├── Phase 3b:  coverage repair (straordinario promotion)
  └── Phase 3c:  hour completion (extends last shifts if short)
```

**Invariant to preserve:** `restDaysNeeded` must remain a pure function of `availableDays` and
`emp.ore`. Do not add rest days. Do not move rest days here — only mark which day is rest in
Phase 1 candidate selection.

### restDaysNeeded formula (correct, keep as-is)

```javascript
// hasHalfDayConfig = true:
const fullDaysNeeded = Math.ceil(Math.max(0, emp.ore - halfDayH) / avgShiftH);
workDaysTarget = Math.min(availableDays, fullDaysNeeded + 1);
restDaysNeeded[emp.id] = Math.max(0, availableDays - workDaysTarget);
```

This correctly computes 1 rest day for a normal 40h week with 7 available days. Do not change the
formula. Only add the `maxAchievable` feasibility check described in Bug A fix.

### Phase 2.5 dynamic tracking (correct, keep as-is)

```javascript
const remaining = empFullDayList[emp.id].filter(dk2 => dk2 >= dk).length;
const hoursLeft = Math.max(0, emp.ore - halfH - cumulH[emp.id]);
const todayTgt  = remaining > 0 ? hoursLeft / remaining : targetDayH[emp.id];
```

This rolling re-computation is the correct pattern. It self-corrects on each day. Only the
`isSoloDept` end-lock interferes with it.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Hour arithmetic | Custom float rounding | `Math.round(x * 10) / 10` (already used) | 0.1-precision consistent with calcWeekHours |
| Shift duration | Custom parser | `shiftHours(t)` (already exists) | Handles lunch-break deduction correctly |
| Date iteration | New date utils | `getWeekDates()` + `fmt(d)` (already exist) | Consistent date-key format |
| Absence detection | New condition | `isAbsence(type)` + `isManualLocked()` (already exist) | Backward compat with old data |

---

## Common Pitfalls

### Pitfall 1: Adding rest days to fix hours shortfall
**What goes wrong:** When hours are short, adding a rest day removes a work slot, making hours
even shorter.
**Prevention:** Never touch `restDaysNeeded` formula when fixing hour bugs. Fix the shift-hours
selection instead.

### Pitfall 2: Modifying `schedule` entries during Phase 3b without recalculating `cumulH`
**What goes wrong:** `cumulH` is used by Phase 2.5 (which runs BEFORE Phase 3b) so it cannot be
updated retroactively. Phase 3b must recompute employee hours via `calcWeekHours()` at the point
of the straordinario decision.
**Prevention:** Phase 3b's sort already uses `calcWeekHours` — extend that pattern.

### Pitfall 3: Confusing `availableDays` with `workDaysTarget`
**What goes wrong:** `availableDays` = days employee CAN work (excludes absences and closed days).
`workDaysTarget` = days they SHOULD work (includes the half-day). `fullWorkDays = workDaysTarget - 1`.
The half-day is part of `workDaysTarget` but not part of `empFullDayList`.
**Prevention:** Always subtract 1 from `workDaysTarget` before computing `targetPerFullDay`.

### Pitfall 4: Phase 3c lunch-break navigation
**What goes wrong:** Phase 3c extends `s.end` by 30min steps, but if the new end falls inside the
lunch break (`lbStartH < newEndH < lbEndH`), it redirects by adjusting `s.start` backward, then
jumps to `lbEndH + 30min`. This creates multi-step state changes within one loop iteration.
Incorrect shortfall re-computation (`calcWeekHours` called mid-loop) can cause infinite loops or
incorrect final hours.
**Prevention:** Never call `calcWeekHours` more than once per 30-min step iteration. The current
implementation calls it at the bottom of each while-loop iteration — preserve this.

---

## Code Examples

### restDaysNeeded feasibility check (Bug A fix pattern)
```javascript
// After computing workDaysTarget, add:
const fullWorkDays = workDaysTarget - (hasHalfDayConfig ? 1 : 0);
const maxAchievableH = fullWorkDays * avgShiftH + (hasHalfDayConfig ? halfDayH : 0);
if (maxAchievableH < emp.ore) {
  // Cannot reach contract hours — will warn user after generation
  infeasibleEmps.push(emp);
}
// restDaysNeeded formula unchanged — rest count is still correct
```

### Phase 3b straordinario — only promote if employee is still under contract (Bug B fix pattern)
```javascript
// Phase 3b Pass 1 candidate filter — add hours check:
const candidates = employees
  .filter(emp => {
    if (isManualLocked(emp.id, dk)) return false;
    const s = (schedule[emp.id] || {})[dk];
    if (!s || s.type !== 'riposo') return false;
    if (!empReparti(emp).includes(rep.id)) return false;
    // BUG B FIX: only use employee if they haven't reached contract hours
    // return calcWeekHours(emp.id) < emp.ore;  // too strict — misses rounding
    return calcWeekHours(emp.id) < emp.ore - 0.1;
  })
  .sort((a, b) => calcWeekHours(a.id) - calcWeekHours(b.id));
```

### isSoloDept — relax end lock to allow hour tracking (Bug C fix pattern)
```javascript
// Phase 2.5 — current (line 1791-1794):
const validEn = forceMorning ? [morningEnd]
              : (isCloser || isSoloDept) ? [baseEnd]
              : (isLastDay || isOpener) ? [-60, -30, 0].map(o => addMinutes(baseEnd, o))
              : [baseEnd];

// Fix: isSoloDept only locks to baseEnd on the LAST day or when hours would be met anyway
const validEn = forceMorning ? [morningEnd]
              : isCloser ? [baseEnd]
              : (isSoloDept && (isLastDay || hoursLeft >= avgShiftH)) ? [baseEnd]
              : (isLastDay || isOpener || isSoloDept) ? [-60, -30, 0].map(o => addMinutes(baseEnd, o))
              : [baseEnd];
```

---

## State of the Art

| Old assumption | Current finding |
|----------------|-----------------|
| Tests cover browser behavior | Tests use simplified Phase 2.5 (no isSoloDept, different endOffs) — tests are not a reliable regression guard for the browser |
| Phase 3c fixes all shortfalls | Phase 3c is capped at ~1h/shift up to 21:00; cannot fix shortfalls > (fullDays × 1h) |
| restDaysNeeded formula is the bug | Formula is correct; the bugs are in Phase 2.5 constraints and Phase 3b side effects |

---

## Open Questions

1. **Is Bug B (straordinario over-hours) actually triggered in the user's store?**
   - What we know: Phase 3b triggers when `getRepWorking(rep.id, dk) < rep.minCopertura` after
     Phase 3 has placed all planned shifts. With the current preset (19 employees, all 40h), the
     test shows no straordinario needed. The user may have encountered this in edge weeks.
   - Recommendation: Fix it anyway (filter is cheap) since the contract says bug must be closed.

2. **Does removing isSoloDept end-lock break opening coverage?**
   - What we know: isSoloDept was added to guarantee the lone worker stays until store close.
     The coverage check in Phase 3b would catch a gap if they left early.
   - Recommendation: Apply the conditional fix (only lock on last day or when hoursLeft >= avgShiftH).
     The opener constraint still forces on-time arrival.

3. **Does the -60 end offset in the browser cause any correctness issues?**
   - What we know: The test files omit the -60 offset. The browser produces correct hours with it
     (shown by week results in the test). The offset gives more granularity for hour-targeting.
   - What's unclear: Whether a specific emp+day combination would pick 19:00 end unexpectedly and
     leave a department unstaffed in the evening.
   - Recommendation: Keep the -60 offset; it helps hit targets. Update test files to include it.

---

## Sources

### Primary (HIGH confidence)
- Direct reading of `shift-planner.html` lines 1305–2043 (generateSchedule function in full)
- Direct reading of `_test_real.js` and `_test_schedule.js`
- `shiftflow-preset-2026-05-18 (1).json` — real employee and reparto configuration
- Runnable Node.js simulations (verified arithmetic, no inference)

### Secondary (MEDIUM confidence)
- Test output from `node _test_real.js` — 3 weeks all green with the current preset (no absences)
- Manual tracing of code paths for Bug C (isSoloDept) since test scripts don't cover it

---

## Metadata

**Confidence breakdown:**
- Bug A (under-hours from absences): HIGH — simulated numerically, confirmed formula path
- Bug B (straordinario over-hours): HIGH — code path traced line-by-line; not triggered in test data
- Bug C (isSoloDept over-hours): HIGH — code divergence between browser and tests confirmed
- Bug D (test script drift): HIGH — endOffs values differ, confirmed by reading both files
- Fix directions: MEDIUM — patterns are safe but exact integration must be validated by running tests

**Research date:** 2026-05-19
**Valid until:** No external dependencies; valid until the source file changes
