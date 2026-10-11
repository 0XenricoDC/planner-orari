---
phase: 01-hours-and-rest-calculation
plan: 01
subsystem: algorithm
tags: [generateSchedule, feasibility, toast, restDaysNeeded, hours-calculation]

# Dependency graph
requires: []
provides:
  - "infeasibleEmps feasibility check inside restDaysNeeded loop (shift-planner.html line 1371-1392)"
  - "Ore non raggiungibili warning toast at end of generateSchedule (line 2055-2064)"
affects:
  - "01-02-PLAN.md (Bug B fix — shares generateSchedule function)"
  - "01-03-PLAN.md (Bug C fix — shares generateSchedule function)"
  - "01-04-PLAN.md (Bug D fix — test sync)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Feasibility pre-check pattern: compute maxAchievableH before Phase 2.5, push to infeasibleEmps, warn post-generation"
    - "Toast staggering: coverage (0ms) -> shortHours (600ms) -> infeasibleEmps (1200ms)"

key-files:
  created: []
  modified:
    - "shift-planner.html"

key-decisions:
  - "Feasibility warning only — restDaysNeeded formula stays untouched to preserve ALG-02 (never add extra rest days)"
  - "0.1h tolerance in maxAchievableH comparison to match float precision of calcWeekHours elsewhere"
  - "1200ms delay on infeasibleEmps toast so it fires after existing 600ms shortHours toast"

patterns-established:
  - "infeasibleEmps collector: declared before restDaysNeeded loop, populated inside loop, consumed at function end"

# Metrics
duration: 15min
completed: 2026-05-19
---

# Phase 1 Plan 01: Hours and Rest Calculation (Bug A) Summary

**Feasibility pre-check using maxAchievableH detects when 2+ absences make 40h contract hours unreachable, emitting a named warning toast without touching restDaysNeeded**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-19T00:00:00Z
- **Completed:** 2026-05-19
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `infeasibleEmps` collector array before the restDaysNeeded loop (line 1371)
- Added feasibility check inside restDaysNeeded loop: computes `fullWorkDays` and `maxAchievableH`; pushes employees whose contract hours are mathematically unreachable to `infeasibleEmps` (lines 1386-1392)
- Added `Ore non raggiungibili per: ...` warning toast at end of `generateSchedule()` (lines 2053-2064), firing at 1200ms to sequence after the existing shortHours (600ms) toast
- `restDaysNeeded[emp.id]` assignment byte-identical to pre-fix code (ALG-02 invariant preserved)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add feasibility check inside restDaysNeeded loop** - `936bfd1` (feat)
2. **Task 2: Surface infeasibleEmps warning toast at end of generateSchedule** - `7d79644` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `shift-planner.html` - Two targeted insertions: feasibility check inside restDaysNeeded loop (lines 1386-1392) and infeasibleEmps toast block at function end (lines 2053-2064)

## Decisions Made
- Used `Math.round(maxAchievableH * 10) / 10` and 0.1h tolerance to match float precision used by `calcWeekHours` elsewhere in the file
- `infeasibleEmps` is declared as a sibling to `restDaysNeeded` (not inside the forEach) so it remains accessible at the end of `generateSchedule()`
- Toast delay of 1200ms chosen to appear after the existing shortHours 600ms toast, preserving readability order

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Verification Results

| Check | Result |
|-------|--------|
| `infeasibleEmps` count in file | 4 occurrences (declaration, push, length check, map) |
| `maxAchievableH` count in file | 2 occurrences (assignment + comparison) |
| `Ore non raggiungibili per:` count | Exactly 1 |
| `restDaysNeeded[emp.id] = Math.max(...)` unchanged | Confirmed (line 1385) |
| Feasibility check insertion point | After restDaysNeeded assignment, inside employees.forEach |
| Toast insertion point | After shortHours block, before closing `}` of generateSchedule |

## Next Phase Readiness
- Bug A warning is in place; EDGE-01 partial fix landed
- Ready for 01-02 (Bug B: straordinario over-hours Phase 3b fix)
- Ready for 01-03 (Bug C: isSoloDept end-lock relaxation Phase 2.5 fix)
- infeasibleEmps variable is function-scoped — no global pollution to clean up

---
*Phase: 01-hours-and-rest-calculation*
*Completed: 2026-05-19*
