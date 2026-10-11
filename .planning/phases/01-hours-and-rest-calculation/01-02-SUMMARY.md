---
phase: 01-hours-and-rest-calculation
plan: 02
subsystem: algorithm
tags: [javascript, scheduling, coverage, hours-tracking]

# Dependency graph
requires:
  - phase: 01-01
    provides: Bug A feasibility check and infeasibleEmps toast — context for Phase 1 algorithm fixes
provides:
  - Hours-aware candidate filter in Phase 3b Pass 1 (calcWeekHours guard)
  - ALG-01 and ALG-02 protection in straordinario promotion path
affects:
  - 01-03 (Bug C fix — isSoloDept — next plan in phase)
  - 01-04 (Bug D fix — test script drift)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Early-return filter predicate: all disqualifying checks as early returns, qualifying condition as final return"
    - "0.1h float tolerance: matches Math.round(x*10)/10 precision used throughout calcWeekHours"
    - "calcWeekHours at decision point: recompute at Phase 3b candidate selection rather than caching from Phase 2.5"

key-files:
  created: []
  modified:
    - shift-planner.html

key-decisions:
  - "0.1h tolerance (emp.ore - 0.1) matches float-rounding precision already used elsewhere, preventing false exclusions from rounding artifacts"
  - "Filter rejects promotion silently — gap surfaces via existing coverageIssues toast, not a new error path"
  - "Pass 2 (reassignment between reparti) intentionally left unchanged: it moves already-working employees without changing hours, so it cannot cause over-hours"

patterns-established:
  - "Bug B pattern: only modify Phase 3b Pass 1 filter; Phase 3b Pass 2 and setShift call are out of scope"
  - "Coverage gap reporting: genuine gaps that cannot be filled without contract violations must surface via coverageIssues toast, not be silently masked"

# Metrics
duration: 10min
completed: 2026-05-19
---

# Phase 1 Plan 02: Bug B Fix — Phase 3b Straordinario Hours Guard Summary

**Hours-aware candidate filter in Phase 3b Pass 1 prevents at-contract employees from being promoted to Straordinario, eliminating 48h weekly totals and stolen rest days**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-19T00:00:00Z
- **Completed:** 2026-05-19T00:10:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `calcWeekHours(emp.id) < emp.ore - 0.1` guard to Phase 3b Pass 1 candidate filter (line 1909 of shift-planner.html)
- Employees already at contract hours are excluded from straordinario promotion — ALG-01 (no over-hours) and ALG-02 (no extra rest-day removal) are now enforced at the promotion gate
- Genuine coverage gaps that cannot be filled without contract violations surface via the existing coverageIssues toast instead of being silently masked by 48h schedules
- No regression: all 19-employee preset weeks produce correct 40h/week, 1 rest-day schedules (confirmed via `node _test_real.js`, 3 weeks all green)

## Task Commits

1. **Task 1: Add hours-aware filter to Phase 3b Pass 1 candidate selection** — `b5e4103` (fix)

**Plan metadata:** (created in next commit)

## Files Created/Modified

- `shift-planner.html` — Phase 3b Pass 1 candidate filter extended with `calcWeekHours(emp.id) < emp.ore - 0.1` guard at lines 1899-1911; filter restructured to early-return pattern

## Decisions Made

- Used `emp.ore - 0.1` threshold (not `emp.ore`) to match the 0.1h float-rounding tolerance already established in plan 01-01 and used throughout `calcWeekHours`. This prevents false exclusions when an employee's hours round to e.g. 39.9h instead of 40.0h exactly.
- Restructured the filter predicate from `return s && s.type === 'riposo' && empReparti(emp).includes(rep.id)` (one compound return) to an early-return pattern with the new hours check as the final return. This matches the code style of other filters in the file and makes the new clause explicit.
- Pass 2 (`// Pass 2: reassign employees working in over-staffed reparti`) intentionally left untouched. Pass 2 reassigns already-working employees between reparti (no hours change), so it poses no over-hours risk and is out of scope for this fix.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Verification Performed

1. **grep check:** `calcWeekHours(emp.id) < emp.ore - 0.1` appears exactly once (line 1909) — the new filter clause. Other `calcWeekHours` comparisons (`< emp.ore - 0.5` at line 2050, `< emp.ore + 4` at line 2486) are distinct thresholds for unrelated logic.
2. **No-regression test:** `node _test_real.js` — 3 weeks, all 19 employees, all at 40h with 1 rest day. No straordinari in no-absence scenario (filter change has zero effect when candidates pool is empty anyway).
3. **Pass 2 integrity:** Lines 1919-1937 visually confirmed byte-identical to pre-fix state.
4. **Filter structure:** Manual-lock check, rest-day check, reparto-membership check, and hours check all present in correct order.

## Modified Filter (exact lines 1899-1911)

The modified candidate selection in Phase 3b Pass 1:

- Line 1901: `if (isManualLocked(emp.id, dk)) return false;` — manual lock check (preserved)
- Line 1902: `const s = (schedule[emp.id] || {})[dk];` — schedule lookup (preserved)
- Line 1903: `if (!s || s.type !== 'riposo' || !empReparti(emp).includes(rep.id)) return false;` — rest-day and reparto checks (restructured to early-return)
- Lines 1904-1908: Comment explaining the fix and its rationale
- Line 1909: `return calcWeekHours(emp.id) < emp.ore - 0.1;` — the new hours guard

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Bug B closed. ALG-01 and ALG-02 are now protected in the straordinario promotion path.
- Ready for 01-03: Bug C fix — isSoloDept end-lock causing over-hours for sole-department workers.
- Known remaining bugs: C (isSoloDept forces 8h/day) and D (test script drift from browser endOffs).

---
*Phase: 01-hours-and-rest-calculation*
*Completed: 2026-05-19*
