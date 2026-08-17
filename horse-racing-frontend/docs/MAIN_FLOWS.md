# Main Flows - Horse Racing Frontend

Tai lieu nay tom tat cac luong chinh da duoc nhac trong frontend plan. Backend docs chi duoc dung lam ngu canh; cac viec frontend can tiep tuc nam trong `API_INTEGRATION_PLAN.md`, `OWNER_RACE_JOCKEY_FLOW_PLAN.md`, `SPECTATOR_REALTIME_BETTING_PLAN.md`, va `SPECTATOR_TOURNAMENT_RACE_REDESIGN_PLAN.md`.

## 1. Auth, Session, Role Routing

### Flow

```text
Signup/Login
  -> signup creates pending_verification account
  -> enter email OTP on /verify-account
  -> verified user returns to login with email prefilled
  -> login stores token, user, roles, profiles
  -> if one role: redirect to matching workspace
  -> if multiple roles: show workspace chooser
  -> protected route checks active role
  -> logout clears local session
```

### Routes

- Public: `/`, `/login`, `/signup`, `/verify-account`, `/forgot-password`, `/reset-password`, `/resend-verification`
- Protected account action: `/change-password`
- Multi-role chooser: `/choose-role`

### Backend APIs

- `POST /auth/register`
- `POST /auth/verify-account`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /auth/resend-verification`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/change-password`

### Current status

- Login/session behavior and the dedicated post-signup OTP entry are implemented and API-backed. Signup never auto-verifies when development returns an OTP.
- Still needs manual end-to-end verification for invalid login, valid login, signup, protected refresh, wrong-role routing, multi-role chooser, and logout behavior.
- Follow-up: after role application approval, refresh `/auth/me` on next login/session restore so newly assigned roles appear reliably.
- Post-verification auto-login is intentionally not planned with the current API because `/auth/verify-account` returns no JWT and the frontend must not retain the signup password.

### Forgot password flow

```text
Forgot Password
  -> request reset OTP by email
  -> open /reset-password with email context
  -> enter OTP, new password, and confirmation
  -> reset succeeds
  -> return to login with email prefilled
```

- Backend may return `data.reset.otp` in development; frontend ignores it and requires the user to enter the code received by email.
- Reset uses `POST /auth/reset-password` with `{ otp, new_password }`.
- Reset OTP expires after 15 minutes by default.
- Request and resend responses must not reveal whether the email exists.

## 2. Role Application Flow

### Flow

```text
Public signup creates spectator account
  -> user chooses desired professional role intent
  -> user submits role application
  -> admin reviews application
  -> approved application assigns role and creates/updates profile
  -> user logs back in or session refreshes
  -> new workspace becomes available
```

### Routes

- Spectator role application status/forms: `/spectator/role-applications`
- Admin review module: `/admin/:module` where module covers role applications

### Backend APIs

- `POST /role-applications/horse-owner`
- `POST /role-applications/jockey`
- `POST /role-applications/race-referee`
- `GET /role-applications/me`
- `GET /admin/role-applications`
- `GET /admin/role-applications/:id`
- `POST /admin/role-applications/:id/approve`
- `POST /admin/role-applications/:id/reject`

### Current status

- Implemented and API-backed.
- Duplicate pending applications are blocked in the UI.
- Admin list, detail, approve, and reject are connected.
- Remaining verification: approve a real application, log in as that user, and confirm the new role/profile is available.

## 3. Horse Owner Flow

### Flow

```text
Owner login
  -> owner dashboard
  -> manage owner profile
  -> create/edit/deactivate horse
  -> register horse for race
  -> wait for admin race registration approval
  -> browse tournaments/races
  -> choose jockey after registration is approved
  -> send jockey invitation with Meet link and online contract
  -> wait for jockey accept/reject
  -> track schedule/results
```

### Routes

- `/owner`
- `/owner/profile`
- `/owner/horses`
- `/owner/horses/new`
- `/owner/horses/:horseId`
- `/owner/horses/:horseId/edit`
- `/owner/registrations`
- `/owner/jockeys`
- `/owner/schedule`
- `/owner/results`

### Backend APIs

- `GET/PATCH /horse-owner/profile`
- `GET/POST /horse-owner/horses`
- `GET/PATCH/DELETE /horse-owner/horses/:horseId`
- `PATCH /horse-owner/horses/:horseId/media`
- `GET /horse-owner/jockeys`
- `GET /horse-owner/jockeys/:jockeyId`
- `GET /horse-owner/tournaments`
- `GET /horse-owner/tournaments/:tournamentId/races`
- `POST /horse-owner/race-registrations`
- `PATCH /horse-owner/race-registrations/cancel`
- `GET /jockey-assignments`
- `POST /jockey-assignments`
- `POST /jockey-assignments/:id/accept-meeting`
- `POST /jockey-assignments/:id/reject-meeting`
- `PATCH /jockey-assignments/:id/terms`
- `POST /jockey-assignments/:id/contract`
- `POST /jockey-assignments/:id/confirm-contract`
- `POST /jockey-assignments/:id/reject-contract`

### Current status

- Core owner profile and horse management are API-backed.
- Horse profile creation is owner-local and does not require admin approval.
- Race registration submit/cancel is connected.
- Admin approval of race registration is the gate before jockey invitation.
- Jockey list/detail and the original assignment creation screen are connected, but the UI needs an update for the target invitation flow.
- Duplicate assignment for the same `horse_id + race_id` is blocked before submit and backend `409` is normalized.
- Still open:
  - Manual verification for owner list/detail/create/edit/profile with a real owner account.
  - Tournament-level registration/cancel APIs are not fully wired.
  - Owner dashboard/schedule/results still contain mock or partial sections where backend support is missing.
  - Disable jockey invitation until race registration is approved.
  - Update owner assignment form to require meeting title, Google Meet URL, future meeting time, and online contract/file/link.
  - Resolve backend mismatch if current backend still expects contract after meeting/terms rather than in the invitation.
  - Decide whether cancelled/rejected jockey assignments may be replaced or the unique horse/race rule remains permanent.

## 4. Jockey Flow

### Flow

```text
Jockey login
  -> dashboard
  -> view profile and approval status
  -> receive owner invitations with horse/race, Meet link, and contract
  -> accept/reject invitation
  -> view assignments and schedule
  -> view results, stats, violations
  -> update athlete profile fields
```

### Routes

- `/jockey`
- `/jockey/profile`
- `/jockey/invitations`
- `/jockey/assignments`
- `/jockey/schedule`
- `/jockey/results`

### Backend APIs

- `GET/PATCH /jockeys/me`
- `GET /jockeys/me/approval-status`
- `GET /jockeys/me/assignments`
- `POST /jockeys/me/assignments/:id/accept`
- `POST /jockeys/me/assignments/:id/reject`
- `POST /jockey-assignments/:id/accept-meeting`
- `POST /jockey-assignments/:id/reject-meeting`
- `POST /jockey-assignments/:id/confirm-contract`
- `POST /jockey-assignments/:id/reject-contract`
- `GET /jockeys/me/schedule`
- `GET /jockeys/me/results`
- `GET /jockeys/me/stats`
- `GET /jockeys/me/violations`

### Current status

- Main jockey workspace is API-backed with fallback/empty states for incomplete seed data.
- Profile update and violations are connected.
- Still open:
  - Manual verification for dashboard/profile/invitations/assignments/schedule/results with a real jockey account.
  - Update invitation and assignment screens to show contract and Meet information before accept/reject.
  - Align status handling after backend confirms final invitation/contract contract.
  - Horse-specific jockey lookup/schedule endpoints are not yet used where detail screens may need them:
    - `GET /jockeys/horses/:horseId/jockeys`
    - `GET /jockeys/horses/:horseId/schedule`

## 5. Race Referee Flow

### Flow

```text
Referee login
  -> assigned race dashboard/list
  -> open race detail
  -> pre-race eligibility checks
  -> check readiness blockers
  -> start assigned race
  -> during-race incident monitoring
  -> record, preview, confirm, or dismiss linked violations
  -> post-race recovery checks
  -> submit referee report
  -> complete assigned race
  -> finalize race and generate draft results
  -> review/update result draft
  -> apply confirmed penalties
  -> assigned referee confirms and publishes result
```

### Routes

- `/referee`
- `/referee/races`
- `/referee/races/:raceId`
- `/referee/races/:raceId/horse-inspection`
- `/referee/races/:raceId/jockey-inspection`
- `/referee/races/:raceId/monitor`
- `/referee/races/:raceId/violations`
- `/referee/races/:raceId/result`
- `/referee/races/:raceId/report`

### Backend APIs

- Race reads through shared race/result/violation/check/report APIs.
- `POST /races/:raceId/start`
- `POST /races/:raceId/complete`
- `GET /race-results/races/:raceId/participants`
- `GET /race-results/races/:raceId/readiness`
- `POST /race-results/races/:raceId/finalize`
- `POST /race-results/races/:raceId/apply-penalties`
- `GET/POST/PATCH /horse-checks`
- `GET /violations/options`
- `POST /violations/penalty-preview`
- `GET/POST/PATCH /violations`
- `POST /violations/:id/confirm`
- `POST /violations/:id/dismiss`
- `GET/PATCH /race-results`
- `GET/POST/PATCH /referee-reports`
- `POST /referee-reports/:id/submit`

### Current status

- The target frontend flow is defined in `REFEREE_THREE_PHASE_FRONTEND_PLAN.md`.
- Core routing and the original referee APIs are connected. The newly available lifecycle, readiness, finalize, penalty-policy, and race-level result APIs still need frontend wrappers and UI integration.
- Production referee pages must not fall back to sample races, participants, checks, incidents, results, or reports.
- Participant/readiness contracts now exist for referee/admin. Unsupported monitoring or realtime behavior must still render explicit unavailable states and disable unsupported mutations.
- The desired horse-check identity is `race_id + horse_id + phase`.
- Referees prepare draft results, submit reports, then confirm and publish official results directly.

## 6. Admin Flow

### Flow

```text
Admin login
  -> control dashboard
  -> manage users/status/roles
  -> review role applications
  -> manage tournaments, rounds, races
  -> approve/reject registrations
  -> manage jockey assignments/referees
  -> monitor published results (read-only)
  -> manage prediction/betting operations
```

### Routes

- `/admin`
- `/admin/:module`

### Current API-backed areas

- User list/detail.
- User status updates.
- Role assignment/removal.
- Role application list/detail.
- Role application approve/reject.

### Still open

- Connect tournament/round/race CRUD to `/tournaments`, `/rounds`, and `/races`.
- Connect registration approval module to `/registrations`.
- Connect admin jockey assignment module to `/jockey-assignments`.
- Connect result confirm/publish flows to race-level atomic endpoints `/race-results/races/:raceId/confirm` and `/race-results/races/:raceId/publish`.
- Connect admin referee operation modules to `/violations`, `/horse-checks`, and `/referee-reports`.
- Manual verification for admin users and registrations modules with a real admin account.
- Ensure approved application profile information is visible in admin user detail.

## 7. Spectator Tournament And Race Flow

### Flow

```text
Spectator login
  -> tournament board
  -> tournament detail
  -> race detail/viewer
  -> optional Bet Now only when bettingStatus === open
  -> results and leaderboard
```

### Routes

- `/spectator`
- `/spectator/tournaments`
- `/spectator/tournaments/:tournamentId`
- `/spectator/tournaments/:tournamentId/races/:raceId`
- `/spectator/results`
- `/spectator/leaderboard`
- `/spectator/profile`

### Backend APIs

- `GET /tournaments`
- `GET /tournaments/:id`
- `GET /races`
- `GET /race-results`
- Backend mount `GET /users/spectator/races/:raceId/results` (outside `/api`; not wired through the current API client/proxy)

### Current status

- Tournament list/detail and race schedule reads are API-backed.
- Spectator results can read published rows from authenticated `GET /race-results` and the dedicated race result endpoint. Connected result screens should use explicit empty/error states instead of sample fallback.
- Horse leaderboard derives from available published result data.
- Jockey leaderboard remains mock until aggregate jockey ranking data is available.
- Published result access is confirmed. Spectator-safe participant access remains unavailable because current participant endpoints are restricted to referee/admin.

## 8. Spectator Prediction And Fixed-Odds Flow

### Flow

```text
Predictions navigation
  -> Race Market Board
  -> select race by raceId
  -> Fixed-Odds Betting Page
  -> choose bet type
  -> choose horse selection(s)
  -> enter stake
  -> review bet
  -> accept receipt or show rejection
```

### Routes

- Race market board: `/spectator/predictions`
- Race-based betting page: `/spectator/predictions/races/:raceId`
- Legacy route redirect: `/spectator/predictions/:tournamentId` -> `/spectator/predictions`

### Bet types in UI prototype

- Win
- Place
- Show
- Quinella
- Exacta
- Trifecta

### Contract rules

- `race.status` must not be used to infer betting permission.
- `canBet = bettingStatus === "open"`.
- Scheduled races are upcoming races, not automatically open markets.
- Fixed odds accepted by the server must be stored in the receipt as `accepted_odds`.

### Current status

- Race-first prediction board is implemented.
- Race detail is separated from betting controls.
- Fixed-odds UI prototype is implemented with mock market contract/transport.
- Production integration is blocked until backend provides market, odds, wallet, bet submit, settlement, and spectator-safe race data contracts.

## 9. Spectator Realtime Race Room / 2D Viewer Flow

### Flow

```text
Open race room/detail
  -> load initial REST snapshot
  -> connect realtime transport
  -> join race room
  -> receive betting state and countdown
  -> lock betting on stop_betting
  -> receive race_script
  -> animate 2D runners from server script
  -> receive race_finished
  -> show authoritative Top 3 and settled state
```

### Current prototype

- Mock transport and deterministic fixtures are implemented.
- Five-lane 2D race viewer is implemented with DOM/CSS transforms.
- One-clock checkpoint interpolation is implemented.
- Top 3 overlay, finish spacing, countdown, wallet preview, and lock behavior are demonstrated in mock mode.

### Production blockers

- Confirm Socket.IO vs native WebSocket.
- Confirm authentication handshake.
- Confirm join/leave race room protocol.
- Finalize event names and payloads.
- Finalize sequence/idempotency rules.
- Finalize wallet, bet, bet history, race snapshot, `race_script`, `stop_betting`, and `race_finished` contracts.
- Add production `RealtimeProvider` and authenticated socket client.
- Replace mock race fixtures with backend data.

## 10. Open Task Summary

### Can be done in frontend now

- Manual test auth/session flows using `TEST_ACCOUNTS.md`.
- Manual test owner, jockey, and admin API-backed flows with real accounts.
- Update owner and jockey assignment screens for race-registration-approved gating, Meet link, contract-in-invitation, and jockey accept/reject.
- Continue wiring admin operational modules that already have documented backend APIs.
- Use existing horse-specific jockey endpoints where owner/detail screens need them.
- Improve owner dashboard/schedule/results live data where backend support exists.

### Blocked by backend contract or backend data shape

- Production spectator fixed-odds betting.
- Production realtime betting lock/wallet updates.
- Production race script playback and authoritative finish events.
- Backend-backed spectator jockey leaderboard.
- Spectator-safe participants and published result access if current permissions do not allow it.
- Referee participant-heavy workflows where race payloads lack participants.

### Verification still needed

- Auth: invalid/valid login, signup, refresh, expired token, protected route, wrong role, multi-role chooser, logout.
- Owner: horse list/detail/create/edit/profile, race registration approval gate, duplicate assignment flow, invitation with Meet link and contract.
- Jockey: profile, invitation review with Meet/contract, accept/reject, assignments, schedule, results, violations.
- Admin: users, role applications, registrations, role assignment/removal.
- Spectator: all race/betting state combinations, six bet types, anti-cheat lock during confirmation, fixed odds receipt immutability, desktop/tablet/mobile screenshots, keyboard navigation, reduced motion.
