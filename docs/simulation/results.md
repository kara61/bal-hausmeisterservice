# Simulation Report — 2026-03-28

## Summary: 7 scenarios, 55 passed, 0 failed

### ✅ Scenario 1: Normal Day (Mon Feb 2) (11/11)

- [PASS] Plan generated for 2026-02-02
- [PASS] Plan status is draft
- [PASS] Plan has assignments for Mon (2 props × up to 2 workers)
- [PASS] Assignments given to sim workers
- [PASS] Plan approved
- [PASS] Property visits created
- [PASS] Sim Ali checked in at 07:00
- [PASS] All visits completed
- [PASS] Sim Ali checked out at 15:00
- [PASS] Analytics computed for Feb 2
- [PASS] Analytics: properties completed > 0

### ✅ Scenario 2: Multiple Workers, Multiple Roles (Tue Feb 3) (5/5)

- [PASS] Plan generated for Tue Feb 3
- [PASS] Plan has assignment(s) for Tuesday
- [PASS] Cleaning property assigned to cleaning worker
- [PASS] No field workers assigned on cleaning-only day
- [PASS] Analytics computed

### ✅ Scenario 3: Sick Call + Redistribution (Wed Feb 4) (8/8)

- [PASS] Plan generated for Wed Feb 4
- [PASS] Plan has assignment(s)
- [PASS] Field worker assigned to Simstraße 4
- [PASS] Sim Ali reported sick
- [PASS] Redistribution ran
- [PASS] Simstraße 4 reassigned to different worker
- [PASS] Source changed to substitution
- [PASS] Sim Ali has no time entry (was sick)

### ✅ Scenario 4: Missing Checkout (Thu Feb 5) (8/8)

- [PASS] Plan generated for Thu Feb 5
- [PASS] Plan has assignments for Thursday
- [PASS] First visit completed
- [PASS] Second visit left pending
- [PASS] Check-in exists but no check-out
- [PASS] Missing checkout detected
- [PASS] Time entry flagged
- [PASS] Flag reason set

### ✅ Scenario 5: Carry-Over (Thu→Fri, Feb 5→6) (7/7)

- [PASS] Carry-over executed
- [PASS] At least 1 task carried over
- [PASS] Original assignment marked carried_over
- [PASS] Friday plan generated
- [PASS] Friday has assignments
- [PASS] Simstraße 6 in Friday plan (may be absent if carry-over created plan first)
- [PASS] All Friday visits completed

### ✅ Scenario 6: Full Week Summary (Feb 2-6) (10/10)

- [PASS] Worker analytics returned data
- [PASS] Sim Ali has days worked
- [PASS] Sim Ali has properties completed
- [PASS] Sim Ali has sick days (Wed)
- [PASS] Operations analytics computed
- [PASS] Plan adherence > 0%
- [PASS] Cost analytics returned data
- [PASS] Sim Ali cost computed
- [PASS] Hour balances synced for February
- [PASS] Sim Ali has February hour balance

### ✅ Scenario 7: Edge Cases (6/6)

- [PASS] Saturday plan generated (no error)
- [PASS] Saturday has 0 assignments
- [PASS] Duplicate plan call returns existing (no duplicate)
- [PASS] Sim Leyla (joker) excluded from hour balances (by design)
- [PASS] Sim Leyla has time entries (12 days)
- [PASS] Sim Yusuf has no analytics for Tue (no assignment)

