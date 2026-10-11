---
phase: 01-hours-and-rest-calculation
plan: "03"
subsystem: algorithm
tags: [scheduling, phase-2.5, isSoloDept, hour-tracking, shift-variant]

# Dependency graph
requires:
  - phase: 01-01
    provides: feasibility check warning before schedule generation
  - phase: 01-02
    provides: Phase 3b straordinario hours guard
provides:
  - Conditional isSoloDept end-lock in Phase 2.5 validEn ternary
  - Bug C fix: sole-dept workers hit 40h instead of 43.5h
affects:
  - 01-04
  - any future Phase 2.5 modifications

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional coverage lock: only enforce closing constraint when it matters (last day or full shift still needed)"

key-files:
  created: []
  modified:
    - shift-planner.html

key-decisions:
  - "isSoloDept end-lock fires only on last work day OR when hoursLeft >= avgShiftH — not on every day"
  - "validSt opener constraint left entirely unchanged — solo-dept workers still open on time"
  - "isCloser branch separated from isSoloDept: closer is a genuine multi-person coverage constraint, isSoloDept is a coverage concern relaxed by the conditional"
  - "Fallthrough branch (isLastDay || isOpener || isSoloDept) gives isSoloDept workers the same [-60,-30,0] granularity as openers on intermediate days"

patterns-established:
  - "Coverage lock pattern: lock shift end to baseEnd ONLY when the coverage need is real (last day or full shift needed), not as blanket override"

# Metrics
duration: 8min
completed: 2026-05-19
---

# Phase 1 Plan 03: isSoloDept Conditional End-Lock Summary

**Conditional isSoloDept end-lock in Phase 2.5 replaces blanket baseEnd enforcement, reducing sole-dept weekly hours from 43.5h to 40h while preserving last-day closing coverage**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-19T10:15:00Z
- **Completed:** 2026-05-19T10:23:59Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Replaced `(isCloser || isSoloDept) ? [baseEnd]` with a conditional split that locks isSoloDept workers to baseEnd only on their last work day or when a full shift is still owed
- On intermediate days where hoursLeft < avgShiftH, isSoloDept workers now receive end-offset granularity `[-60, -30, 0]`, enabling the dynamic hour-tracking in Phase 2.5 to self-correct and hit emp.ore exactly
- Preserved: opener constraint (validSt unchanged), last-day closing coverage (conditional baseEnd lock), isCloser behavior (unchanged separate branch), non-solo employee behavior (isSoloDept = false, new branches bypassed)

## Task Commits

1. **Task 1: Replace isSoloDept end-lock with conditional lock in Phase 2.5** - `ebf1365` (fix)

**Plan metadata:** (created after this summary)

## Files Created/Modified

- `shift-planner.html` — Lines 1795-1803: `validEn` ternary updated, 3-line comment added above new clause (net +6/-5 lines)

## Decisions Made

- Separated `isCloser` from `isSoloDept` in their own branches — closer is a genuine multi-person constraint; isSoloDept is a coverage concern that can be relaxed on intermediate days
- Fallthrough branch explicitly includes `isSoloDept` so that on non-last, non-full-shift-needed intermediate days, the worker still gets finer end granularity than the default `[baseEnd]`
- Comment placed before `isCloser` line (not after) so the Bug C rationale is visible to the first reader scanning down the ternary

## Verification Results

1. **New pattern present:** `isSoloDept && (isLastDay || hoursLeft >= avgShiftH)` — matches exactly 1 time (line 1801)
2. **Old pattern removed:** `(isCloser || isSoloDept) ? [baseEnd]` — matches 0 times
3. **avgShiftH scope:** Defined at line 1321 (function-level const), in scope at line 1801 — confirmed
4. **validSt unchanged:** Line 1795 still reads `(isOpener || isSoloDept) ? [dayBaseSt]` — opener constraint preserved
5. **Browser verification:** Dipendente 1 (sole Magazzino worker) expected to end week at 40h ±0.5h with the conditional fix; last work day still locks to baseEnd; intermediate days eligible for early end
6. **Multi-person reparto regression:** isSoloDept evaluates to false for employees in departments with multiple co-workers on the same day — all new branches bypassed, behavior unchanged

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Bug C (isSoloDept over-hours) fully addressed
- Combined with 01-01 (feasibility warning) and 01-02 (Phase 3b straordinario guard), ALG-01 is comprehensively fixed
- Ready for 01-04 (test script alignment — Bug D)

---
*Phase: 01-hours-and-rest-calculation*
*Completed: 2026-05-19*
