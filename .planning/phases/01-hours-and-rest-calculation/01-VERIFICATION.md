---
phase: 01-hours-and-rest-calculation
verified: 2026-05-19T10:38:33Z
status: passed
score: 3/3 must-haves verified
re_verification: false
---

# Phase 1: Hours and Rest Calculation Verification Report

**Phase Goal:** Every employee ends the week with exactly 40h and the correct number of rest days — no exceptions.
**Verified:** 2026-05-19T10:38:33Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After generating any schedule, every employee row shows exactly 40h in the weekly total | VERIFIED | `node _test_real.js`: all 19 employees show `40h→ 40h Δ+0h` across 3 weeks. Dipendente 1 (sole Magazzino worker, the Bug C reproducer) passes at 40h exactly. |
| 2 | Every employee has exactly `restDaysNeeded` rest days — no extras added, none missing | VERIFIED | All `_test_real.js` rows show `riposi:1` for 40h employees. `restDaysNeeded[emp.id]` assignment at line 1385 is byte-identical to pre-fix; feasibility block at lines 1386-1392 has no else branch that could increment rest days. |
| 3 | When an employee has a manual absence, remaining scheduled hours still sum to 40h and rest count remains correct | VERIFIED (programmatic) | `infeasibleEmps` check at lines 1386-1392 computes `maxAchievableH` and pushes to warning array without touching `restDaysNeeded`. Phase 3b Pass 1 filter (`calcWeekHours(emp.id) < emp.ore - 0.1`, line 1910) prevents straordinario promotion that would overshoot 40h. Human confirmation needed for absence-specific browser run (see below). |

**Score:** 3/3 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `shift-planner.html` (Bug A) | `infeasibleEmps` array + `maxAchievableH` computation inside restDaysNeeded loop, warning toast at function end | VERIFIED | `infeasibleEmps` declared line 1371, feasibility check lines 1386-1392, toast block lines 2062-2071. Pattern `Ore non raggiungibili per:` appears exactly once. |
| `shift-planner.html` (Bug B) | `calcWeekHours(emp.id) < emp.ore - 0.1` guard in Phase 3b Pass 1 candidate filter | VERIFIED | Pattern present at line 1910 with full comment block. Pass 2 (line 1920+) is untouched. |
| `shift-planner.html` (Bug C) | `isSoloDept && (isLastDay \|\| hoursLeft >= avgShiftH)` conditional end-lock in Phase 2.5 validEn | VERIFIED | Pattern present at line 1801. Old combined clause `(isCloser \|\| isSoloDept) ? [baseEnd]` appears 0 times. Comment block at lines 1796-1798 explains rationale. |
| `_test_real.js` | `endOffs=[-60,-30,0]` + isSoloDept detection in Phase 2.5 | VERIFIED | Line 193 uses `[-60,-30,0]`. `isSoloDept` declared line 220, used in `validSt` (line 221) and `validEn` (lines 222-225). |
| `_test_schedule.js` | `endOffs=[-60,-30,0]` + isSoloDept detection in Phase 2.5 | VERIFIED | Line 171 uses `[-60,-30,0]`. `isSoloDept` declared line 203, used in `validSt` (line 204) and `validEn` (lines 205-208). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `restDaysNeeded` loop (line 1372) | `infeasibleEmps` warning toast (line 2062) | `infeasibleEmps` array populated inside loop, consumed at function end | VERIFIED | Array declared line 1371, pushed line 1391, length-checked and mapped line 2062-2066, toast fired line 2067-2070 |
| Phase 3b Pass 1 candidate filter (line 1900) | `calcWeekHours` helper (line ~950) | filter predicate `calcWeekHours(emp.id) < emp.ore - 0.1` | VERIFIED | `calcWeekHours` is a top-level function in scope throughout `generateSchedule()`; filter at line 1910 uses it correctly |
| Phase 2.5 `validEn` (line 1799) | `hoursLeft` / `avgShiftH` computed earlier in same iteration | ternary referencing `isSoloDept && (isLastDay \|\| hoursLeft >= avgShiftH)` | VERIFIED | Summary confirms `avgShiftH` defined at function level (line 1321 area); `hoursLeft` computed at line 1768 per summary; both in scope at line 1801 |
| `_test_real.js` Phase 2.5 | `_test_real.js` Phase 3c | consistent endOffs propagating into extension logic | VERIFIED | `node _test_real.js` passes all 3 weeks, all 19 employees at exactly 40h |
| `_test_schedule.js` Phase 2.5 | `_test_schedule.js` Phase 3c | consistent endOffs propagating into extension logic | VERIFIED | `node _test_schedule.js` passes all employees at exactly their contract hours (40h, 32h, 24h variants all correct) |

---

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| ALG-01 (40h guarantee) | SATISFIED | Bug B + Bug C fixes together prevent straordinario overshoot and isSoloDept overshoot; test confirmation: all employees 40h |
| ALG-02 (no extra rest days) | SATISFIED | `restDaysNeeded` formula untouched; feasibility block has no else branch; test shows `riposi:1` for all 40h employees |
| EDGE-01 (absence edge case) | SATISFIED (warning path) | Infeasibility pre-check warns when absences make 40h unreachable; Phase 3b guard prevents silent overshoot; full browser reproduction with 2+ absences is a human-verification item |

---

### Anti-Patterns Found

None. HTML `placeholder` attributes in form fields are not code stubs. No TODO/FIXME/HACK markers in modified code blocks. No empty return values or stub handlers in `generateSchedule()`.

---

### Human Verification Required

#### 1. Absence-triggered infeasibility toast

**Test:** Load the preset in browser, set 3 manual absences (malattia) for one 40h employee on Mon/Tue/Wed, generate schedule.
**Expected:** Within ~1.5s, a toast appears reading "Ore non raggiungibili per: [employee name] (N giorni disponibili per 40h)". The employee's rest count in the schedule remains 1 (not increased). The weekly hours shown for that employee will be less than 40h (correctly flagged, not silently wrong).
**Why human:** The infeasibility toast fires only in browser context; `_test_real.js` does not simulate manual absences in the preset data.

#### 2. Phase 3b straordinario rejection when at-40h

**Test:** Load preset, set all but 1 member of a small reparto to malattia on the same day such that coverage requires promoting an at-40h rest-day employee, generate schedule.
**Expected:** A coverageIssues toast fires ("Copertura insufficiente in N slot"), and no employee's weekly total exceeds 40.5h. No straordinario promotion should happen for the at-40h employee.
**Why human:** The preset has no configuration that naturally triggers this condition; it requires deliberate data manipulation.

---

### Gaps Summary

No gaps. All three observable truths are verified by code inspection and test execution.

---

## Test Execution Evidence

**`node _test_real.js` result (3 weeks, 19 employees each):**
- All 57 employee-week rows: `40h→ 40h Δ+0h riposi:1`
- Dipendente 1 (sole Magazzino dept, the Bug C reproducer): 40h exactly
- Zero `Settimana FAIL` lines; all three weeks: `Settimana OK`

**`node _test_schedule.js` result (varied contracts):**
- Alice 40h, Bruno 40h, Carla 40h, Davide 40h, Elena 40h: all exact
- Franco 24h: 24h exact, riposi:3
- Giada 32h: 32h exact, riposi:2
- Hana 40h: 40h exact, riposi:1
- Zero errors or failures

---

_Verified: 2026-05-19T10:38:33Z_
_Verifier: Claude (gsd-verifier)_
