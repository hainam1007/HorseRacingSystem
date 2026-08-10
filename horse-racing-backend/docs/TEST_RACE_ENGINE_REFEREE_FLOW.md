# Race Engine + Referee Flow Test

## Current Verification

```text
Date: 2026-07-27
Backend test suite: 120/120 passed
Frontend production build: passed
Atlas E2E rerun: not completed because MongoDB SRV DNS timed out before connection
Atlas writes during failed rerun: none (connection was never established)
```

## Previous Atlas E2E Result

```text
Date: 2026-06-22
Environment: MongoDB configured from local .env
Unit tests: 21/21 passed
E2E API tests: 40/40 passed
Cleanup: completed
Migration dry-run: passed, no data written
```

Atlas dry-run snapshot:

```text
violations: scanned 11, would update 11, requires review 11
race results: scanned 15, would update 15
jockeys: 12 missing fine/status defaults
```

## Flow

```text
Scheduler locks registration at race_date - 3 hours.
Referee performs pre-race checks.
Referee views participant eligibility and readiness blockers.
Assigned referee starts the race: scheduled -> running.
Referee records during-race incidents and violations when needed.
Referee reviews policy suggestions and submits a penalty proposal or dismissal.
Admin resolves sensitive or out-of-bounds proposals before finalization.
Referee performs post-race checks.
Referee submits the official race report.
Assigned referee completes the race: running -> completed.
Referee finalizes the race and Race Engine generates draft results.
Assigned referee reviews and updates draft results.
Assigned referee applies confirmed penalties to raw results.
Admin bulk confirms draft results by race.
Admin bulk publishes confirmed results by race.
Spectator and jockey can view published results.
Manual race result creation is disabled to prevent partial results from bypassing Race Engine.
```

Penalty behavior covered by E2E:

```text
Unresolved violations appear in readiness and block finalization.
Confirmed penalties change final values while preserving raw values.
Repeated penalty application is idempotent.
Admin confirmation recalculates penalties before changing result status.
Individual confirm/publish endpoints are removed.
Publish preserves confirmation audit fields.
Suspension and fine are enforced once during bulk confirmation.
Unauthorized referee/jockey detail access returns 403.
```

## API Test Cases

Additional lifecycle and readiness APIs tested successfully:

```text
GET  /api/race-results/races/:raceId/participants -> 200, participant eligible = true
GET  /api/race-results/races/:raceId/readiness -> 200, initial ready = false
POST /api/races/:raceId/start -> 200, status = running
GET  /api/race-results/races/:raceId/readiness -> 200, running ready = false
POST /api/races/:raceId/complete -> 200, status = completed
GET  /api/race-results/races/:raceId/readiness -> 200, ready = true
```

### 0. Manual Result Creation Is Disabled

```text
POST /api/race-results
Authorization: Bearer <referee-token>
```

Expected and received:

```text
404 Not Found
Race Engine is the only source that creates draft results.
```

### 1. Wrong Role Cannot Finalize

```text
POST /api/race-results/races/:raceId/finalize
Authorization: Bearer <horse-owner-token>
```

Expected and received:

```text
403 Forbidden
```

### 2. Missing Submitted Report

```text
POST /api/race-results/races/:raceId/finalize
Authorization: Bearer <assigned-referee-token>
```

Expected and received:

```text
400 Submitted referee report is required before race finalization
```

### 3. Create Referee Report

```text
POST /api/referee-reports
Authorization: Bearer <assigned-referee-token>
```

Input:

```json
{
  "race_id": "race_object_id",
  "report_title": "Official race report",
  "report_content": "Race completed.",
  "race_condition": "normal",
  "weather": "clear",
  "track_condition": "good",
  "conclusion": "Ready for result review."
}
```

Received:

```text
201 Created
status = draft
```

### 4. Submit Referee Report

```text
POST /api/referee-reports/:reportId/submit
Authorization: Bearer <assigned-referee-token>
```

Received:

```text
200 OK
status = submitted
```

### 5. Missing Post-Race Check

```text
POST /api/race-results/races/:raceId/finalize
Authorization: Bearer <assigned-referee-token>
```

Expected and received:

```text
400 Post-race checks are required for all eligible participants
```

### 6. Create Post-Race Check

```text
POST /api/horse-checks/post-race
Authorization: Bearer <assigned-referee-token>
```

Input:

```json
{
  "race_id": "race_object_id",
  "horse_id": "horse_object_id",
  "jockey_id": "jockey_profile_id",
  "status": "normal",
  "checklist": {
    "horse_finished_safely": true,
    "post_race_lameness_check": true,
    "post_race_injury_check": true,
    "breathing_recovered": true
  },
  "check_note": "No post-race issue."
}
```

Received:

```text
201 Created
phase = post_race
status = normal
```

### 7. Finalize Race and Generate Draft

```text
POST /api/race-results/races/:raceId/finalize
Authorization: Bearer <assigned-referee-token>
```

Received:

```text
200 OK
race status = completed
engine run status = completed
result status = draft
```

### 8. Referee Reviews Draft

```text
PATCH /api/race-results/:resultId
Authorization: Bearer <assigned-referee-token>
```

Input:

```json
{
  "finish_time": 61.25,
  "score": 100,
  "note": "Reviewed by assigned referee."
}
```

Received:

```text
200 OK
```

### 9. Bulk Publish Draft Directly Is Blocked

```text
POST /api/race-results/races/:raceId/publish
Authorization: Bearer <admin-token>
```

Expected and received:

```text
400 Only confirmed results can be published
```

### 10. Admin Bulk Confirms Draft Results

```text
POST /api/race-results/races/:raceId/confirm
Authorization: Bearer <admin-token>
```

Received:

```text
200 OK
status = confirmed
```

### 11. Admin Bulk Publishes Confirmed Results

```text
POST /api/race-results/races/:raceId/publish
Authorization: Bearer <admin-token>
```

Received:

```text
200 OK
status = published
```

### 12. Spectator Views Published Results

```text
GET /users/spectator/races/:raceId/results
Authorization: Bearer <spectator-token>
```

Received:

```text
200 OK
Only published results are returned, ordered by position.
```

### 13. Preview And Submit Violation Decision

```text
POST /api/violations/penalty-preview
Authorization: Bearer <assigned-referee-token>
```

Input:

```json
{
  "violation_type": "lane_violation",
  "severity": "major"
}
```

Received:

```text
200 OK
requires_review = false
suggested_penalty.type = time_penalty
suggested_penalty.time_penalty_seconds = 3
```

The same incident is submitted through `POST /api/horse-checks/during-race` with:

```json
{
  "event_type": "lane_violation",
  "severity": "major",
  "requires_violation": true
}
```

Expected: `201 Created`, violation `status = recorded`,
`suggested_penalty.time_penalty_seconds = 3`, `penalty = null`.

Referee decision:

```text
POST /api/violations/:violationId/confirm
```

```json
{
  "decision": "Confirmed after video review.",
  "penalty": {
    "type": "time_penalty",
    "time_penalty_seconds": 2
  },
  "deviation_reason": "The horse was partially forced outward."
}
```

Expected: an in-bounds proposal is confirmed and becomes the final `penalty`.
A proposal outside `referee_adjustment.bounds` returns `400` and remains
unresolved until the referee submits a valid decision.

Invalid `violation_type` and a client-supplied `penalty` were both tested and
returned `400 Validation failed`.

### 14. Referee Decision For A Sensitive Violation

```text
POST /api/violations
```

Input:

```json
{
  "race_id": "race_object_id",
  "violation_type": "track_safety_issue",
  "severity": "minor"
}
```

Received: `201 Created`, `auto_confirmed = false`, `status = recorded`.
The recording referee may confirm the suggested warning, choose another
in-bounds penalty with a deviation reason, or dismiss the incident using:

```json
{
  "decision": "Track inspection confirmed the marker was secured."
}
```

Received: `200 OK`, `status = dismissed`. Readiness became `true` immediately
after the referee decision.

### 15. Apply Penalties

```text
POST /api/race-results/races/:raceId/apply-penalties
Authorization: Bearer <assigned-referee-token>
Body: none
```

Received:

```json
{
  "raw_finish_time": 61.25,
  "final_finish_time": 64.25,
  "finish_time": 64.25,
  "applied_violation_ids": ["confirmed_violation_id"]
}
```

Calling the endpoint twice returned `final_finish_time = 64.25` both times.
Creating another violation after publish returned `409`.

## Changed Files

```text
services/raceEngineService.js
services/raceResultService.js
services/raceService.js
services/userService.js
controllers/raceResultController.js
controllers/raceController.js
controllers/userController.js
routes/raceResults.js
routes/races.js
routes/users.js
repositories/raceResultRepository.js
repositories/refereeReportRepository.js
repositories/violationRepository.js
models/RaceResult.js
models/Violation.js
models/HorseCheck.js
constants/statuses.js
constants/violationPenaltyPolicy.js
services/horseCheckService.js
services/violationService.js
controllers/violationController.js
routes/violations.js
validators/violationValidator.js
validators/horseCheckValidator.js
scripts/migrateViolationResults.js
tests/raceEngineService.test.js
tests/raceEngineRefereeFlow.e2e.js
tests/violationPenaltyPolicy.test.js
package.json
docs/API.md
docs/VIOLATION_PENALTY_POLICY.md
RACE_ENGINE_README.md
```
