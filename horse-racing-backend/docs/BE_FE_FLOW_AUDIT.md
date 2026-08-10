# BE/FE Flow Audit

Scan date: 2026-06-27

Backend repo:

```text
E:\Project\horse-racing-backend
```

Frontend repo:

```text
E:\Project\horse-racing-backend\_reference\Horse-Riding-Management-System
```

Frontend branch scanned:

```text
nam
```

Note: the FE branch `nam` currently has a local change in `src/Referee/useRefereeData.js` to call `/api/races?referee_id=<current_referee_id>` instead of loading all races.

## Summary

The backend already implements the core race-management flow across auth, role applications, horse owner, jockey invitation/contract, referee checks, violation penalties, race engine, race results, and spectator live-state.

The frontend has broad coverage for Admin, Horse Owner, Jockey, Referee, and Spectator screens, but several flows are incomplete or partially wired:

- Admin race form does not assign `referee_id`.
- Betting/prediction UI is mostly FE/mock; BE betting/prize modules exist as models only, not full APIs.
- Referee screens are mostly implemented, but rely on many API calls during initial load.
- Owner results/prize summaries mention future endpoints.
- Jockey profile/schedule/results are wired, but some old assignment accept/reject APIs overlap with the newer meeting/terms/contract flow.

## Backend API Coverage

| Module | Main endpoints | Roles | Backend status |
| --- | --- | --- | --- |
| Auth | `/api/auth/register`, `/login`, `/me`, `/verify-account`, `/forgot-password`, `/reset-password`, `/change-password`, `/logout` | Public/authenticated | Implemented |
| Role applications | `/api/role-applications/me`, `/horse-owner`, `/jockey`, `/race-referee` | Authenticated spectator/user | Implemented |
| Admin role applications | `/api/admin/role-applications`, `/:id/approve`, `/:id/reject` | Admin | Implemented |
| Admin users/roles | `/api/admin/users`, status update, assign/remove role | Admin | Implemented |
| Tournaments | `/api/tournaments` CRUD | Read authenticated, write admin | Implemented |
| Rounds | `/api/rounds` CRUD | Read authenticated, write admin | Implemented |
| Races | `/api/races` CRUD, `/:id/start`, `/:id/complete` | Read authenticated, write admin/referee for lifecycle | Implemented |
| Registrations | `/api/registrations`, approve/reject | Owner/admin | Implemented |
| Horse owner | `/api/horse-owner/profile`, horses, jockeys, tournament/race registration helpers | Horse owner | Implemented |
| Jockey assignments | `/api/jockey-assignments`, meeting accept/reject, terms, contract upload, contract confirm/reject | Owner/jockey/admin | Implemented |
| Jockey self-service | `/api/jockeys/me`, assignments, schedule, results, stats, violations | Jockey | Implemented |
| Horse checks | `/api/horse-checks/pre-race`, `/during-race`, `/post-race` | Referee/admin | Implemented |
| Referee reports | `/api/referee-reports`, `/:id/submit` | Referee/admin | Implemented |
| Violations | `/api/violations`, options, penalty preview, confirm/dismiss | Referee/admin/jockey read | Implemented |
| Race results | `/api/race-results`, race participants/readiness/finalize/apply penalties/confirm/publish | Referee/admin | Implemented |
| Spectator | `/users/spectator/...` plus `/api/tournaments`, `/api/races` | Spectator/authenticated | Implemented |
| Internal race engine | `/api/internal/races/:id/lock`, `/generate-draft-results`, `/participants` | Internal route, currently not authenticated in router | Implemented but should be protected before production |

## Backend Race Lifecycle

Current authoritative lifecycle:

1. Admin creates tournament.
2. Admin creates round.
3. Admin creates race with optional `referee_id`.
4. Horse owner creates horse.
5. Horse owner registers horse into race.
6. Admin approves registration.
7. Horse owner invites jockey with meeting information.
8. Jockey accepts meeting.
9. Owner records agreed terms.
10. Owner uploads contract through Cloudinary.
11. Jockey confirms contract.
12. Referee performs pre-race horse checks.
13. Race can start only if at least one participant is eligible.
14. `POST /api/races/:id/start` locks registrations and creates `RaceRun` provisional finish order.
15. FE 2D viewer animates locally using `RaceRun.finish_order`; backend does not stream coordinates.
16. Referee records during-race incidents and optional violation.
17. Referee completes race.
18. Referee performs post-race checks for eligible runners.
19. Referee submits report.
20. Referee finalizes race results.
21. Referee/admin applies confirmed penalties.
22. Admin confirms results.
23. Admin publishes results.
24. Spectator/jockey see published results.

Important backend rules:

- `collectParticipants()` excludes horses without passed pre-race check.
- `RaceRun` is generated at race start and stores participants plus finish order.
- Race result finalization requires completed race, submitted report, post-race checks, and no unresolved violations.
- Race result publish is admin-only.
- Demo randomness is expected for Race Engine ordering.

## Frontend Coverage By Role

### Auth and Role Applications

| FE area | API client | Backend match | Status |
| --- | --- | --- | --- |
| Login/register | `authApi` | `/api/auth/*` | Wired |
| Verify OTP | `authApi.verifyAccount` | `/api/auth/verify-account` | Wired |
| Forgot/reset/change password | `authApi` | `/api/auth/*` | Wired |
| Role application page | `roleApplicationApi` | `/api/role-applications/*` | Wired |
| Role chooser | `AuthContext`, `WorkspaceChooser` | `/api/auth/me` | Wired |

Gap:

- Signup UX still lets users pick roles visually, while backend flow is spectator-first plus role applications. Confirm this does not create role confusion in demo.

### Admin

| FE area | API client | Backend match | Status |
| --- | --- | --- | --- |
| Admin dashboard/modules | `AdminModulePage`, `AdminCommandModule` | Admin APIs | Wired |
| User list/detail/status | `adminApi.listUsers`, `getUser`, `updateUserStatus` | `/api/admin/users` | Wired |
| Assign/remove user role | `adminApi.assignUserRole`, `removeUserRole` | `/api/admin/users/:id/roles` | Wired |
| Role application review | `adminApi.listRoleApplications`, approve/reject | `/api/admin/role-applications` | Wired |
| Registration approval | `adminApi.listRegistrations`, approve/reject | `/api/registrations` | Wired |
| Tournament/round/race CRUD | `AdminCompetitionModule` | `/api/tournaments`, `/api/rounds`, `/api/races` | Mostly wired |
| Result confirm/publish | `adminApi.confirmRaceResults`, `publishRaceResults` | `/api/race-results/races/:raceId/*` | Wired |

Gaps:

- Race form explicitly shows `Referee assignment is not available in this form.`
- Race create/update payload does not include `referee_id`.
- Admin cannot select referee in UI even though BE supports `referee_id` on race.
- No admin UI for direct violation admin review beyond existing result/review modules unless exposed through result/violation screens.

### Horse Owner

| FE area | API client | Backend match | Status |
| --- | --- | --- | --- |
| Owner profile | `ownerApi.getProfile/updateProfile` | `/api/horse-owner/profile` | Wired |
| Horse CRUD/media/status | `ownerApi` | `/api/horse-owner/horses` | Wired |
| Available jockey list/detail | `ownerApi.getJockeys/getJockey` | `/api/horse-owner/jockeys` | Wired |
| Tournament/race discovery | `ownerApi.getTournaments/getTournamentRaces` | `/api/horse-owner/*` | Wired |
| Race registration | `ownerApi.registerHorseForRace` and `/registrations` | BE has both owner helper and generic registration | Wired |
| Jockey invitation | `ownerApi.createJockeyAssignment` | `/api/jockey-assignments` | Wired |
| Meeting/terms/contract | `OwnerPages` and `ownerApi` | `/api/jockey-assignments/:id/terms`, `/contract` | Wired |
| Schedule/results | Owner pages | Schedule mostly derived from registrations/assignments | Partial |

Gaps:

- Owner results page says future owner-scoped published-results endpoint is needed.
- Need verify duplicate registration paths do not confuse FE: `/horse-owner/race-registrations` and `/api/registrations`.
- Tournament registration helper exists in owner API, but core BE registration approval is race-based.

### Jockey

| FE area | API client | Backend match | Status |
| --- | --- | --- | --- |
| Profile | `jockeyApi.getMe/updateMe` | `/api/jockeys/me` | Wired |
| Approval status | `jockeyApi.getApprovalStatus` | `/api/jockeys/me/approval-status` | Wired |
| Assignments | `jockeyApi.getAssignments` | `/api/jockeys/me/assignments` | Wired |
| Meeting accept/reject | `jockeyApi.acceptMeeting/rejectMeeting` | `/api/jockey-assignments/:id/*-meeting` | Wired |
| Contract confirm/reject | `jockeyApi.confirmContract/rejectContract` | `/api/jockey-assignments/:id/*-contract` | Wired |
| Schedule/results/stats/violations | `jockeyApi` | `/api/jockeys/me/*` | Wired |

Gaps:

- `jockeyApi.acceptAssignment/rejectAssignment` still calls older `/api/jockeys/me/assignments/:id/accept|reject`; the newer flow is meeting -> terms -> contract -> accepted. Keep or remove old buttons depending on final product flow.
- Jockey upload license/documents is in requirements, but FE mainly handles role application documents, not ongoing jockey document management.

### Race Referee

| FE area | API client | Backend match | Status |
| --- | --- | --- | --- |
| Referee dashboard/race board | `useRefereeData` | `/api/races`, `/api/race-results`, `/api/horse-checks`, `/api/violations`, `/api/referee-reports` | Wired |
| Race detail | `RefereeRaceDetail` | Aggregated from `useRefereeData` | Wired |
| Pre-race checks | `HorseInspection` | `/api/horse-checks/pre-race` | Wired |
| Start/complete race | `RaceLifecycleControls` | `/api/races/:id/start|complete` | Wired |
| During-race monitor | `RaceMonitor` | `/api/horse-checks/during-race` | Wired |
| Violations | `ViolationManagement` | `/api/violations` | Wired |
| Post-race checks | `HorseInspection?phase=post_race` | `/api/horse-checks/post-race` | Wired |
| Referee report | `RaceReport` | `/api/referee-reports` | Wired |
| Race result readiness/finalize/penalties | `RaceResult` | `/api/race-results/races/:raceId/*` | Wired |

Gaps and risks:

- Initial referee load is heavy because one hook loads all race-related resources. The local `nam` patch filters races by current referee profile to reduce load.
- Jockey inspection page is read-only and says dedicated persistence is unavailable.
- Failed pre-check horses must be excluded from monitor/post-race/result field; FE and BE have been adjusted locally, but verify the branch being merged contains those changes.
- Backend `/api/races` still permits broad list unless caller passes `referee_id`; consider enforcing referee-scoped list server-side for race_referee users.

### Spectator

| FE area | API client | Backend match | Status |
| --- | --- | --- | --- |
| Tournament list/detail | `spectatorApi.listTournaments/getTournament/listRaces` | `/api/tournaments`, `/api/races` | Wired |
| Race detail 2D | `spectatorApi.getRaceLiveState` | `/users/spectator/races/:raceId/live-state` | Wired |
| Official results | `spectatorApi.getRaceResults`, `listRaceResults` | `/users/spectator/races/:raceId/results`, `/api/race-results` | Wired |
| Predictions/betting | `useSpectatorRaceMarkets`, FE betting files | Mostly mock/FE-only | Partial |

Gaps:

- Betting/prediction has no complete backend API flow in current BE.
- Prize/reward display is not backed by complete prize APIs.
- 2D coordinates are FE-generated by design; backend only provides participant list and finish order.

## Critical Gaps

### 1. Admin cannot assign referee from FE

Backend supports `referee_id` on race create/update.

Status: fixed locally.

Implemented local changes:

- FE `AdminCompetitionModule.jsx` loads active race referees from `/api/admin/users?role=race_referee&status=active`.
- Race create/edit form includes a `Race referee` dropdown.
- Race create/update payload includes `referee_id`.
- BE validates `referee_id` exists before creating/updating a race.

Impact:

- Referee dashboard can now be populated from Admin UI without seed/API/manual DB update.

Remaining task:

```text
[QA] Verify admin race create/edit assigns referee and referee dashboard receives the race
```

### 2. Referee race list should be scoped server-side

Status: fixed locally.

Implemented local changes:

- BE `GET /api/races` receives `req` in `raceController.listRaces`.
- BE `raceService.listRaces(req, query)` forces `filter.referee_id = currentReferee._id` for `race_referee` users unless the user is also admin.
- FE branch `nam` also filters by current `profiles.race_referee._id` to reduce request volume.

Impact:

- Referee users can only list their assigned races.
- Referee dashboard avoids loading the whole race ledger.

Remaining task:

```text
[QA] Verify referee cannot list another referee's races even with referee_id query override
```

### 3. Betting/prediction/prize flow is not backend-complete

Models exist (`Bet`, `Prize`, `PrizeAward`), but routes/services for these modules are not present in the scanned backend route list.

Impact:

- Spectator prediction pages are not production-backed.
- Prize summaries in owner/spectator may be placeholder.

Recommended task:

```text
[Betting] Implement prediction/bet/prize APIs or mark FE pages as demo-only
```

### 4. Old vs new jockey assignment actions overlap

Backend supports older direct accept/reject and newer meeting/terms/contract lifecycle.

Impact:

- FE may show actions that bypass intended contract flow if old endpoints remain used.

Recommended task:

```text
[Jockey] Remove or hide direct assignment accept/reject when contract flow is enabled
```

### 5. Internal race engine routes are exposed under `/api/internal`

`routes/internalRaces.js` does not apply auth middleware in the router itself.

Impact:

- Useful for tests/dev, risky for production.

Recommended task:

```text
[Security] Protect or disable /api/internal race engine routes outside development
```

## End-To-End Flow Status

| Flow | BE | FE | E2E status |
| --- | --- | --- | --- |
| Register/login/verify/reset/change password | Complete | Complete | Ready |
| Spectator applies for role | Complete | Complete | Ready |
| Admin approves role application | Complete | Complete | Ready |
| Admin tournament/round/race setup | Complete | Complete after local referee dropdown fix | Needs QA |
| Owner horse CRUD | Complete | Complete | Ready |
| Owner race registration | Complete | Complete | Ready |
| Admin approve registration | Complete | Complete | Ready |
| Owner invites jockey with meeting/contract | Complete | Complete | Ready |
| Jockey accepts meeting/confirms contract | Complete | Complete | Ready |
| Referee pre-check/start/monitor/complete/post-check/report/finalize | Complete | Mostly complete | Ready after Admin assigns race |
| Violation penalty workflow | Complete | Complete enough for referee flow | Ready |
| Admin confirm/publish results | Complete | Complete | Ready |
| Spectator 2D live-state/results | Complete | Complete enough for demo | Ready |
| Betting/prediction/prize | Mostly missing APIs | UI/mock exists | Not production-ready |

## Jira Task Candidates

1. `[Admin] Add referee assignment to race form`
   - Status: fixed locally, pending QA/merge.
   - Add referee list to Admin competition data load.
   - Add `referee_id` to RaceForm create/edit state.
   - Include `referee_id` in `createRace` and `updateRace` payload.
   - Show assigned referee in race ledger.

2. `[BE] Add referee-scoped race listing`
   - Status: fixed locally, pending QA/merge.
   - If user role is `race_referee`, resolve referee profile.
   - Apply `filter.referee_id = profile._id` unless admin.
   - Keep admin query filtering unchanged.

3. `[Referee] Optimize referee dashboard loading`
   - Keep `GET /api/races?referee_id=...` FE patch.
   - Consider a backend aggregate endpoint for referee workspace to replace `1 + N + 4` calls.

4. `[Referee] Finalize failed-precheck exclusion across BE/FE`
   - Ensure failed/scratched pre-check horses do not appear in monitor/post-race/report/result participant selection.
   - Ensure direct API calls reject during/post checks for failed pre-check horses.

5. `[Jockey] Normalize assignment lifecycle`
   - Decide whether old direct accept/reject endpoints remain.
   - Prefer meeting invited -> meeting accepted -> terms agreed -> contract uploaded -> contract confirmed.

6. `[Spectator] Mark betting/prediction as demo or implement backend`
   - Either add APIs for bets/odds/prizes, or clearly hide demo controls for production.

7. `[Security] Lock down internal race engine routes`
   - Require admin/internal token or disable in production.

8. `[Docs] Update API.md and FE integration notes`
   - Add admin referee assignment payload.
   - Document RaceRun live-state behavior.
   - Document referee readiness requirements.

## Recommended Demo Path

For current demo, use this path:

1. Seed or manually assign a referee to race.
2. Login referee.
3. Pre-check all horses, optionally fail one horse before start.
4. Start race.
5. Spectator opens 2D page; FE animates locally using backend finish order.
6. Referee records during-race violation.
7. Complete race.
8. Post-check eligible runners only.
9. Submit referee report.
10. Finalize result and apply penalties.
11. Admin confirms and publishes.
12. Spectator/jockey view published results.

Avoid demoing these until fixed:

- Admin assigning referee from FE.
- Real betting/prediction settlement.
- Prize payout workflow.
- Jockey document upload outside role application.
