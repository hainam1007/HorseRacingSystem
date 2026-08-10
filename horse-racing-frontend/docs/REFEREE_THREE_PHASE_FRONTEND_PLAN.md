# Referee Three-Phase Frontend Plan

## Implementation Status - 2026-06-20

Implemented:

- Production referee pages no longer import `refereeData.js` or expose `usedFallback`.
- Assigned race reads are server-scoped to the authenticated referee profile.
- `GET /races/:raceId/participants` returns approved registrations and their current assignment.
- Horse checks use phase-specific create routes and remain distinct by `race_id + horse_id + phase`.
- The monitor records backend incidents and linked violations. Backend start/complete lifecycle controls now exist but are not yet wired into the frontend workspace.
- Jockey eligibility is explicitly read only until a dedicated persistence contract exists.
- Draft results exclude horses without a passed pre-race check; confirmed and published rows are read only.
- Submitted reports are read only and repeated submission errors remain visible.
- Production build and backend tests pass.

Remaining manual verification:

- Browser-based desktop/mobile inspection when the in-app browser is available.
- Full mutation walkthrough against a disposable seeded database.

## 1. Goal

Build one API-first referee workspace that operates across the complete race lifecycle:

```text
pre_race -> during_race -> post_race -> result draft -> report submission
```

Production referee pages must not display or mutate mock referee data. If an API or participant payload is unavailable, the frontend must show a clear loading, empty, error, or unavailable state.

## 2. Locked Product Decisions

- Referees can operate only on races assigned to their referee profile.
- The race workspace has three explicit phases: `pre_race`, `during_race`, and `post_race`.
- A horse check is identified in the frontend by `race_id + horse_id + phase`.
- Previous phases remain readable after the race advances.
- Only the currently valid phase is editable.
- A failed, scratched, or unresolved pre-race check makes the horse ineligible for the result workflow.
- A during-race incident may create or link a violation.
- Referees create or update draft results. Admin confirms and publishes results.
- Referee reports are editable only while they are drafts.
- Mock fixtures may exist in tests, but production components must not import them.

## 3. Race Phase Rules

| Race state | Default workspace phase | Editable operations |
| --- | --- | --- |
| scheduled | `pre_race` | Pre-race horse and jockey eligibility checks |
| running | `during_race` | Incident monitoring and violation recording |
| completed | `post_race` | Recovery checks, result draft, and referee report |
| cancelled | none | Read-only race context and cancellation reason |

The frontend must not silently infer or mutate race status. Backend now exposes assigned-referee/admin controls for `scheduled -> running` and `running -> completed`; pause/cancel/realtime event synchronization still has no referee contract.

## 4. Route Plan

Keep the existing route structure:

- `/referee`
- `/referee/races`
- `/referee/races/:raceId`
- `/referee/races/:raceId/horse-inspection`
- `/referee/races/:raceId/jockey-inspection`
- `/referee/races/:raceId/monitor`
- `/referee/races/:raceId/violations`
- `/referee/races/:raceId/result`
- `/referee/races/:raceId/report`

The race detail page becomes the shared operational shell. Child routes reuse the same race, participant, phase, check, violation, result, and report query state.

## 5. Shared Workspace Data

The frontend workspace needs:

```text
race
assigned referee
approved participants
accepted jockey assignments
lane assignments
pre-race checks
during-race checks/incidents
post-race checks
violations
draft results
referee report
```

Participants must come from backend records. The frontend must not synthesize horses, jockeys, assignments, lanes, checks, incidents, or results.

## 6. API Adapter Boundary

The frontend API layer should expose stable methods even while backend routes are finalized:

```text
getAssignedRaces()
getRace(raceId)
getRaceParticipants(raceId)
getRaceReadiness(raceId)
startRace(raceId)
completeRace(raceId)
getHorseChecks({ raceId, phase })
createHorseCheck(phase, payload)
updateHorseCheck(checkId, payload)
getViolations({ raceId })
getViolationOptions()
previewViolationPenalty(payload)
createViolation(payload)
updateViolation(violationId, payload)
confirmViolation(violationId, payload)
dismissViolation(violationId, payload)
getRaceResults({ raceId })
updateRaceResult(resultId, payload)
finalizeRace(raceId)
applyRacePenalties(raceId)
getRefereeReports({ raceId })
createRefereeReport(payload)
updateRefereeReport(reportId, payload)
submitRefereeReport(reportId)
```

Backend routes used by the implementation:

```text
GET  /races/:raceId/participants
POST /races/:raceId/start
POST /races/:raceId/complete
GET  /race-results/races/:raceId/participants
GET  /race-results/races/:raceId/readiness
POST /race-results/races/:raceId/finalize
POST /race-results/races/:raceId/apply-penalties
GET  /horse-checks?race_id=:raceId&phase=:phase
POST /horse-checks/pre-race
POST /horse-checks/during-race
POST /horse-checks/post-race
PATCH /horse-checks/:checkId
GET /violations/options
POST /violations/penalty-preview
GET/POST/PATCH /violations
POST /violations/:violationId/confirm
POST /violations/:violationId/dismiss
GET/PATCH /race-results
GET/POST/PATCH /referee-reports
POST /referee-reports/:reportId/submit
```

Adapters must preserve backend status values. They must not collapse unknown statuses into a successful state.

## 7. Frontend State Contract

Every referee query must expose:

```text
data
isLoading
error
isEmpty
isUnavailable
reload
```

Every mutation must expose:

```text
isSubmitting
fieldErrors
submitError
success state
retry
```

No `usedFallback` state is allowed in the final referee data layer.

## 8. Pre-Race Flow

For each approved participant, display and validate:

- Horse identity and approved registration.
- Accepted jockey assignment.
- Confirmed jockey contract when required by backend.
- Horse health and visible injury checks.
- Gait and breathing checks.
- Equipment checks.
- Final fit-to-race decision.

Statuses:

```text
passed
failed
needs_review
scratched
```

Rules:

- `failed` and `scratched` require a note or issue.
- Only `passed` participants are eligible for result entry.
- `needs_review` remains visibly unresolved.
- Saved checks are reloaded from API after mutation.

## 9. During-Race Flow

The monitor must support recording an event against a participant:

- Horse and jockey.
- Event type.
- Severity.
- Race time marker.
- Description.
- Evidence URLs or uploaded evidence returned by backend.
- Whether the event requires a violation.

Statuses:

```text
normal
incident_recorded
race_stopped
under_investigation
```

The monitor must not run a frontend-only authoritative race timer or change race lifecycle state until the backend provides synchronized race events.

## 10. Violation Flow

A violation can be created manually or returned from a during-race check.

The UI must support:

- Create and edit.
- Link to race, horse, jockey, and horse check.
- Violation type and description.
- Severity and time marker.
- Evidence.
- Backend policy preview from `violation_type + severity`.
- Confirm/dismiss decision flow. Referee confirmation uses backend policy; the frontend never authors the final penalty object.
- Backend field-level validation errors.

## 11. Post-Race Flow

For each runner, display and validate:

- Safe finish.
- Lameness and injury checks.
- Breathing and heart-rate recovery.
- Bleeding check.
- Medical or veterinary follow-up.

Statuses:

```text
normal
minor_issue
injury_detected
requires_vet_follow_up
under_investigation
```

`injury_detected` and `requires_vet_follow_up` require a note or issue.

## 12. Result And Report Handoff

```text
post-race checks complete
-> violations reviewed
-> referee report drafted
-> report submitted
-> assigned referee completes race
-> readiness passes
-> referee finalizes race and Race Engine creates all draft results
-> draft results reviewed or updated
-> confirmed penalties applied from raw values to final values
-> admin confirms result
-> admin publishes result
```

Referee UI rules:

- Draft result rows must use backend participants only.
- Display `raw_*` and `final_*` values clearly when penalties change the official outcome.
- Result creation is a race-level finalize operation. Do not create participant results one by one in the target flow.
- Confirmed and published results are read-only.
- Submitted reports are read-only.
- Repeated report submission must surface backend `409` clearly.
- The UI must never imply that a referee can publish an official result.

## 13. Mock Removal Scope

Remove production dependencies on:

- `src/Referee/refereeData.js`
- `usedFallback` branches in referee hooks and pages.
- Sample participant fallback in race detail and inspections.
- Frontend-only jockey inspection records.
- Frontend-only monitor race state and event records.
- Sample result and report mutation paths.

If test fixtures are still needed, move them under a test-only path and do not import them from production components.

## 14. Implementation Phases

### Phase 0 - Documentation And Contract Boundary

- Lock the three-phase state model.
- Document no-mock production behavior.
- Record backend contract gaps without fabricating responses.

### Phase 1 - API-First Data Foundation

- Remove fallback behavior from the referee adapter and hook.
- Add explicit loading, empty, error, and unavailable states.
- Add phase-aware check API methods and adapters.

### Phase 2 - Shared Race Workspace

- Build shared race context and three-phase navigation.
- Load participants and operational records once per race workspace.
- Apply phase edit guards.

### Phase 3 - Pre-Race Operations

- Build participant eligibility cards/forms.
- Connect create/update check mutations.
- Add unresolved and ineligible states.

### Phase 4 - During-Race Operations

- Replace mock monitor behavior with API-driven incident recording.
- Connect linked violation creation and editing.
- Connect assigned-race start/complete controls to backend lifecycle APIs.
- Keep pause/cancel and synchronized realtime controls disabled or absent.
- Add violation options, penalty preview, confirm, dismiss, and review-required states.

### Phase 5 - Post-Race Operations

- Build recovery and injury checks.
- Connect phase-aware create/update mutations.

### Phase 6 - Result And Report Completion

- Gate result editing by eligibility and result status.
- Gate report submission and enforce read-only submitted state.
- Load readiness blockers and resolve them before finalization.
- Finalize by race so Race Engine generates the complete draft set.
- Apply confirmed penalties and present raw versus final values.
- Keep admin race-level confirm/publish actions out of referee controls.

### Phase 7 - Remove Referee Mock Module

- Delete or quarantine referee fixtures for tests only.
- Remove every production import of `refereeData.js`.
- Verify no sample values appear after empty or failed API responses.

## 15. Verification Matrix

- Referee sees only assigned races.
- Empty assigned-race response renders a real empty state.
- API failure never renders sample races or participants.
- Pre-race, during-race, and post-race records remain distinct.
- Previous phases become read-only when the race advances.
- Ineligible horses cannot receive draft result rows.
- During-race incidents can link to violations.
- Submitted reports cannot be edited or submitted again.
- Confirmed and published results are read-only for referees.
- Refresh restores all state from API.
- Desktop and mobile preserve the full operational flow.

## 16. Backend Contract Gaps

Frontend implementation must keep these gaps visible until backend alignment:

- Dedicated jockey inspection persistence contract.
- Synchronized monitoring/realtime events beyond the implemented start/complete lifecycle.
- Spectator-safe participant contract, separate from referee/admin participant reads.
- Backend `/users` mount normalization under `/api` if the dedicated spectator-result endpoint is adopted by the current API client.
