# Data Alignment And Mock Removal Plan

This plan tracks how to align frontend screens with the seeded backend database and remove long/static mock data safely.

## 1. Goal

- Make frontend screens reflect real database records.
- Expand backend demo data so screens look complete without fake frontend arrays.
- Remove mock fallback from main role home/dashboard pages first.
- Keep accuracy higher than visual fullness: if backend has no data, show a real empty state instead of invented data.

## 2. Current Seed Baseline

Backend demo seed currently creates:

```text
Users: 19
Jockeys: 12
Horses: 42
Tournaments: 15
Rounds: 30
Races: 45
Open betting markets: 10
Registrations: 42
Jockey assignments: 23
Race results: 15
Horse checks: 18
Violations: 11
Referee reports: 15
Bets: 18
Prizes: 14
Prize awards: 14
Notifications: 18
```

Key accounts:

```text
admin@racing.test
owner1@racing.test
owner2@racing.test
jockey1@racing.test
jockey2@racing.test
jockey3@racing.test
jockey4@racing.test
referee1@racing.test
referee2@racing.test
spectator1@racing.test
spectator2@racing.test
```

Password:

```text
Password123
```

## 3. Mock Hotspots Found

### Public and role home pages

- `src/Landing Page/LandingPage.jsx`
- `src/Admin/AdminDashboard.jsx`
- `src/pages/owner/OwnerDashboard.jsx`
- `src/pages/jockey/JockeyDashboard.jsx`
- `src/pages/spectator/SpectatorHome.jsx`
- `src/Referee/RefereeDashboard.jsx`

### Static mock data modules

- `src/pages/owner/ownerData.js`
- `src/pages/jockey/jockeyData.js`
- `src/pages/spectator/tournamentData.js`
- `src/Referee/refereeData.js`

### Realtime/prototype mock modules

- `src/realtime/MockRaceTransport.js`
- `src/pages/spectator/live-race/mockRaceFixtures.js`
- `src/pages/spectator/betting/mockFixedOddsMarket.js`

These should be removed last because backend realtime betting/socket contracts are not fully aligned yet.

## 4. Accuracy Rules

- No fake rows on main pages when backend request succeeds with empty data.
- Mock fallback is allowed only in isolated prototype or test modules. Production role routes must show an unavailable state when an endpoint does not exist.
- Static arrays should not be imported by production role pages after their backend API is connected.
- Every removed mock must have one of:
  - backend data seeded,
  - backend endpoint connected,
  - real empty state.
- Seed data names must be short and UI-friendly.
- Do not use timestamp-generated emails or IDs in visible test data.

## 5. Phase 1 - Data Audit And Seed Expansion

### Backend work

- [x] Add more demo tournaments:
  - `Autumn Sprint 2026`
  - `Coastal Derby 2026`
  - `Night Track Series 2026`
- [x] Add more races per tournament:
  - scheduled
  - running
  - completed
  - cancelled/closed where supported
- [x] Add more horses for each owner:
  - active
  - inactive
  - race-ready
  - needs medical update
- [x] Add more registrations:
  - approved with no jockey
  - approved with jockey invited
  - approved with accepted jockey
  - pending
  - rejected
  - cancelled
- [x] Add more jockey assignments:
  - `meeting_invited`
  - `meeting_accepted`
  - `terms_agreed`
  - `contract_uploaded`
  - `accepted`
  - `contract_rejected`
  - `cancelled`
- [x] Add more referee data:
  - horse checks for multiple phases
  - violations with different severity/status
  - draft and submitted reports
- [x] Add more spectator data:
  - more published results
  - more bets with won/lost/pending
  - prize awards

### Frontend work

- [x] Create a route-by-route data map:
  - page
  - current imports
  - API hook used
  - fallback/mock source
  - backend endpoint needed
  - seed record needed

Route map created in `BACKEND_DATA_ROUTE_MAP.md`.

### Acceptance criteria

- [x] There is enough backend data to fill every role home page.
- [x] The owner invite jockey page still has approved race entries without jockey assignment.
- [x] No frontend mock removal starts until this map is complete.

## 6. Phase 2 - Owner Pages

### Target files

- `src/pages/owner/OwnerDashboard.jsx`
- `src/pages/owner/OwnerPages.jsx`
- `src/pages/owner/useOwnerData.js`
- `src/pages/owner/ownerData.js`

### Work

- Replace owner dashboard stats from `ownerData.js` with:
  - horses
  - registrations
  - jockey assignments
  - race results where available
- Replace owner schedule page with races derived from approved registrations and assignments.
- Replace owner results page with backend race results filtered by owner horses.
- Keep `ownerData.js` only as dev fallback temporarily, then delete when all owner pages are connected.

### Accuracy checks

- Login `owner1@racing.test`.
- Horse list shows seeded horses.
- Dashboard counts match database.
- Jockey invitation picker shows approved/no-jockey records only.
- Schedule does not invent races not present in DB.

## 7. Phase 3 - Jockey Pages

### Target files

- `src/pages/jockey/JockeyDashboard.jsx`
- `src/pages/jockey/JockeyInvitations.jsx`
- `src/pages/jockey/JockeyAssignments.jsx`
- `src/pages/jockey/JockeySchedule.jsx`
- `src/pages/jockey/JockeyResults.jsx`
- `src/pages/jockey/jockeyData.js`

### Work

- Make dashboard summarize real assignment statuses.
- Make invitations show only assignment statuses that require jockey response.
- Make assignments/schedule/results derive from `GET /jockeys/me/*`.
- Remove static jockey dashboard cards once backend values exist.

### Accuracy checks

- Login `jockey2@racing.test`.
- Pending Silver Wind invitation appears.
- Login `jockey3@racing.test`.
- Accepted River Flash assignment appears.
- Login `jockey4@racing.test`.
- Contract-uploaded Golden Mane scenario appears.

## 8. Phase 4 - Admin Pages

### Target files

- `src/Admin/AdminDashboard.jsx`
- `src/Admin/AdminModulePage.jsx`
- `src/Admin/AdminCommandModule.jsx`
- `src/Admin/AdminCompetitionModule.jsx`
- `src/Admin/AdminRegistryModule.jsx`
- `src/Admin/useAdminModuleApi.js`

### Work

- Replace dashboard hardcoded metrics with live counts:
  - users
  - pending registrations
  - tournaments/races
  - pending role applications
  - race results
- Convert admin module cards section-by-section.
- Keep non-connected admin modules honest with empty or “backend not connected” states, not fake operational rows.

### Accuracy checks

- Login `admin@racing.test`.
- Admin registration queue shows real pending `Night Arrow / Spring Final`.
- Dashboard user count equals seeded users.

## 9. Phase 5 - Spectator Pages

### Target files

- `src/pages/spectator/SpectatorHome.jsx`
- `src/pages/spectator/TournamentList.jsx`
- `src/pages/spectator/TournamentDetail.jsx`
- `src/pages/spectator/Leaderboard.jsx`
- `src/pages/spectator/Results.jsx`
- `src/pages/spectator/tournamentData.js`
- `src/pages/spectator/useSpectatorData.js`

### Work

- Replace spectator home stats/cards with live tournament/race/result/bet summaries.
- Remove `tournamentData.js` fallback from tournament list/detail after seed data is broad enough.
- Replace leaderboard sample rows with published result aggregation.
- Remove result sample fallback now that authenticated spectators can read published `/api/race-results` rows.
- Keep spectator participant fixtures isolated until a spectator-safe participant contract exists; referee/admin participant endpoints must not be called from spectator UI.
- Keep predictions/realtime betting mock only until backend betting contracts are finalized.

### Accuracy checks

- Login `spectator1@racing.test`.
- Derby Final result appears.
- Winning bet appears where supported.
- Tournament pages show seeded tournaments only.

## 10. Phase 6 - Referee Pages

### Target files

- `src/Referee/RefereeDashboard.jsx`
- `src/Referee/RefereeRaces.jsx`
- `src/Referee/RefereeRaceDetail.jsx`
- `src/Referee/HorseInspection.jsx`
- `src/Referee/JockeyInspection.jsx`
- `src/Referee/RaceMonitor.jsx`
- `src/Referee/RaceReport.jsx`
- `src/Referee/RaceResult.jsx`
- `src/Referee/ViolationManagement.jsx`
- `src/Referee/refereeData.js`

### Work

- Follow `REFEREE_THREE_PHASE_FRONTEND_PLAN.md` as the referee source of truth.
- Remove sample fallback from every production referee route, independent of seed count.
- Ensure race detail uses real race, participants, phase checks, violations, reports, and results.
- Integrate backend race start/complete, readiness, finalize, penalty preview/application, and violation decision APIs without local lifecycle authority.
- Migrate result draft creation from per-result POST calls to race-level Race Engine finalization.
- Keep distinct loading, empty, error, and unavailable states.
- Replace mock jockey inspection and race monitor behavior only with backend data, never another fixture layer.

### Accuracy checks

- Login `referee1@racing.test`.
- Derby Heat 1 and Derby Final are visible.
- Pre-race, during-race, and post-race checks remain distinct.
- Horse checks, violations, results, and reports match backend records.
- Failed API calls never show sample races or participants.

## 11. Phase 7 - Public Landing Page

### Target file

- `src/Landing Page/LandingPage.jsx`

### Work

- Replace hardcoded stats with public aggregate API data only if backend exposes safe public endpoints.
- If no public aggregate endpoint exists, either:
  - keep marketing copy static but remove fake precision, or
  - add a backend public summary endpoint later.

### Accuracy checks

- Public page must not claim fake counts like registered users/races if not backed by data.

## 12. Phase 8 - Remove Mock Modules

Remove role mock modules after connected pages pass manual tests. Referee production imports are removed as part of the three-phase migration:

- Delete or quarantine:
  - `ownerData.js`
  - `jockeyData.js`
  - `tournamentData.js`
  - `refereeData.js`
- Keep prototype-only files under a clear dev/prototype folder if backend contracts are missing:
  - realtime race transport
  - fixed odds market mock
  - race script fixtures

## 13. Verification Checklist Per Phase

For every phase:

- Run backend seed reset.
- Login with the relevant test account.
- Verify page load, empty states, and action states.
- Confirm visible rows match database seed names.
- Run frontend build.
- Update `TEST_ACCOUNTS.md` if scenario expectations change.
- Update this plan with completed checklist items.

## 14. Recommended Execution Order

```text
1. Expand backend seed data.
2. Owner dashboard/schedule/results.
3. Jockey dashboard/schedule/results.
4. Admin dashboard/module rows.
5. Spectator home/tournament/result/leaderboard.
6. Referee dashboard/detail action pages.
7. Public landing claims.
8. Delete or quarantine mock modules.
```

Reason:

Owner and jockey flows already have the most backend integration, so they are the safest first target. Spectator realtime betting should stay last because it still relies on mock transport/contracts.
