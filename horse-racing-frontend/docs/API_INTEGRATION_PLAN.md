# API Integration Plan

## Goal

Connect the frontend to the backend APIs incrementally, starting from authentication/session flows and then replacing mock data by role workspace.

Realtime spectator betting and 2D race-viewer architecture is documented separately in `SPECTATOR_REALTIME_BETTING_PLAN.md`. The frontend mock UI prototype can start immediately; only production socket, wallet, betting, and race-script integration remains blocked until backend contracts are finalized.

Horse owner horse/race/jockey target flow is documented separately in `OWNER_RACE_JOCKEY_FLOW_PLAN.md`. The locked product decision is: horse profile creation does not need admin approval; admin approves race registrations; only approved race registrations unlock jockey invitation; jockey invitation should include Google Meet link and online contract.

Auth, role applications, Race Referee operations, spectator read flows, owner core management, jockey self workspace, and initial admin users/application review APIs are connected. Current work focuses on the remaining role-specific backlog and manual end-to-end verification.

## Decisions Locked

- Frontend dev server stays on `http://localhost:5173`.
- Backend stays on `http://localhost:3000`; Vite proxy targets `http://127.0.0.1:3000` to avoid Windows localhost IPv6 issues.
- Frontend will call API paths through Vite proxy using `/api`.
- Frontend `.env` should use:

```env
VITE_API_BASE_URL=/api
```

- If a user has multiple roles, show a workspace chooser.
- Backend may return `data.verification.otp` in development, but frontend must ignore it. OTP is entered only from the user's email and is never displayed or prefilled by the application.
- Public signup creates a `spectator` account by default. Professional roles (`horse_owner`, `jockey`, `race_referee`) now require a role application and admin approval.
- `POST /auth/register/horse-owner` is legacy and now also creates a spectator account only. Do not build new frontend flows around it.
- File uploads are data URI/base64 fields such as `avatar_file_data`, `image_file_data`, `*_document_file_data`, or `contract.file_data`. Backend uploads these to Cloudinary; multipart is not supported for these endpoints yet.
- `race_referee` now has a protected frontend workspace at `/referee`.
- This project scope is frontend integration only. Do not modify backend code unless the user explicitly changes scope.
- Test accounts are documented in `TEST_ACCOUNTS.md`; all listed test accounts use `Password123`.
- Race Referee routing and core APIs are connected. The three-phase, no-mock migration is tracked in `REFEREE_THREE_PHASE_FRONTEND_PLAN.md`.
- Horse profile creation is owner-local and does not require admin approval. Admin approval applies to race registrations.
- Owner can invite a jockey only after the horse has an approved race registration for that race.
- Target product flow requires jockey invitation to include both a Google Meet link and an online contract/file/link. Current backend may need alignment because the latest backend flow uploads contract after meeting/terms.
- Any UI/UX, layout, spacing, margin, padding, responsive, or interaction change must use the available frontend design skill and include a desktop/mobile spacing audit.

## Backend Update Summary

The latest backend pull adds or changes these integration-relevant areas:

- Auth signup behavior changed to spectator-first. Users apply later for horse owner, jockey, or race referee roles.
- Dev verification returns `verification.otp`, not `verification.token`.
- New role application APIs:
  - `POST /role-applications/horse-owner`
  - `POST /role-applications/jockey`
  - `POST /role-applications/race-referee`
  - `GET /role-applications/me`
  - admin review endpoints under `/admin/role-applications`
- New admin user/role management APIs under `/admin/users`.
- Expanded jockey APIs for profile, approval status, assignments, schedule, results, stats, violations, and horse-jockey lookup.
- Latest jockey assignment flow is now meeting-first and contract-last:
  - Owner/admin creates an assignment as a meeting invitation.
  - Jockey accepts or rejects the meeting.
  - Owner/admin updates agreed terms after meeting acceptance.
  - Owner/admin uploads the contract after terms are agreed.
  - Jockey confirms or rejects the uploaded contract.
  - Assignment statuses now include `meeting_invited`, `meeting_accepted`, `meeting_rejected`, `terms_agreed`, `contract_uploaded`, `contract_rejected`, `accepted`, and `cancelled`.
  - `POST /jockey-assignments` no longer accepts contract upload during invitation create. It requires `meeting.title`, `meeting.meeting_url` as a Google Meet URL, and future `meeting.meeting_time`.
- New jockey assignment endpoints:
  - `POST /jockey-assignments/:id/accept-meeting`
  - `POST /jockey-assignments/:id/reject-meeting`
  - `PATCH /jockey-assignments/:id/terms`
  - `POST /jockey-assignments/:id/contract`
  - `POST /jockey-assignments/:id/confirm-contract`
  - `POST /jockey-assignments/:id/reject-contract`
- Product target flow from `OWNER_RACE_JOCKEY_FLOW_PLAN.md` is stricter than the current backend contract in one area: invitation should include contract at invitation time. Keep this mismatch visible until backend confirms whether contract is allowed in `POST /jockey-assignments` or exposed as an invitation contract draft.
- New race referee operations:
  - horse checks under `/horse-checks`
  - referee reports under `/referee-reports`
- Race lifecycle and result orchestration now exist in backend code:
  - `POST /races/:raceId/start`
  - `POST /races/:raceId/complete`
  - `GET /race-results/races/:raceId/participants`
  - `GET /race-results/races/:raceId/readiness`
  - `POST /race-results/races/:raceId/finalize`
  - `POST /race-results/races/:raceId/apply-penalties`
  - `POST /race-results/races/:raceId/confirm` (admin)
  - `POST /race-results/races/:raceId/publish` (admin)
- Violation policy is backend-owned. Frontend can load `/violations/options`, preview `/violations/penalty-preview`, and call `/:id/confirm` or `/:id/dismiss`; it must not calculate or submit referee penalty values itself.
- Race results now preserve `raw_*` and `final_*` values plus `applied_violation_ids`. UI should distinguish original performance from the penalized official result.
- Spectator role can read the authenticated `/api/race-results` list. Backend also exposes `/users/spectator/races/:raceId/results` outside the `/api` mount, so the current Vite `/api` proxy and API client do not reach it without a frontend transport adjustment. Participant endpoints are still referee/admin-only.
- Jockey profiles now expose disciplinary state, suspension expiry, and outstanding fines. Assignment failures caused by suspension must surface the backend message.
- Horse checks now support phases `pre_race`, `during_race`, `post_race` and expanded statuses including `passed`, `failed`, `needs_review`, `scratched`, `normal`, `incident_recorded`, `race_stopped`, `minor_issue`, `injury_detected`, `requires_vet_follow_up`, and `under_investigation`.
- Frontend treats `race_id + horse_id + phase` as the check identity; backend now supports distinct pre-race, during-race, and post-race behavior.
- Referee production pages must use API data or explicit loading/empty/error/unavailable states, never sample fallback.
- Violation payloads now have a dedicated backend validator; frontend forms should map validation errors from `details` per field.
- Email and Cloudinary service behavior is now documented. Frontend should assume uploaded file URLs are returned by backend after mutation.

## Task Checklist

- [x] Configure Vite proxy `/api` to `http://127.0.0.1:3000`.
- [x] Set frontend API base URL to `/api`.
- [x] Add frontend API client using `fetch`.
- [x] Add auth session helpers for token, user, roles, and active role.
- [x] Connect login form to `POST /auth/login`.
- [x] Connect signup role loading to `GET /auth/roles`.
- [x] Connect signup submit to `POST /auth/register`.
- [ ] Replace legacy development auto-verification with the shared `/verify-account` flow.
- [x] Add protected route guard by role.
- [x] Add multi-role workspace chooser route.
- [x] Wire logout buttons to clear session and call `POST /auth/logout`.
- [ ] Verify login, signup, refresh, protected route, wrong-role, and logout scenarios manually.
- [x] Run frontend build.

## Implemented Slice - Account OTP Verification

### Auth interface simplification

Login and Sign Up previously presented too much supporting copy around a simple account action. They now use focused forms, short supporting copy, and one restrained desktop brand surface; feature lists, quotes, statistic tiles, social-login placeholders, and repeated account guidance were removed.

Design direction:

- Treat auth as a focused utility flow, not a marketing landing page.
- Keep the existing forest green, beige, and racing-orange identity, Sora typography, HR wordmark, and compact 8px radius system.
- Use one dominant form surface and one restrained brand/visual surface on desktop. The secondary surface may contain one short headline, one short sentence, and a simple race-track/horse motif, but no feature list, quote, numbered steps, or stat grid.
- On tablet/mobile, hide or collapse the secondary brand surface so the form appears first without a long preamble.
- Shorten the form introduction to one heading and one concise supporting line.
- Remove Google/Facebook buttons until those authentication providers are actually implemented. Non-functional social actions should not compete with the primary form.
- Keep only essential navigation: primary submit, forgot password where relevant, and one account-switch link (`Create account` or `Sign in`).
- Verification/resend guidance appears contextually after an unverified response, not as permanent repeated copy below every login form.
- Use one consistent auth shell for Login, Sign Up, Verify Account, Forgot Password, and Reset Password so moving between steps feels continuous.
- Preserve explicit loading, error, success, disabled, focus-visible, password visibility, and keyboard states.

Content targets:

```text
Login heading: Welcome back
Login support: Sign in to continue to your racing workspace.
Sign Up heading: Create your account
Sign Up support: Choose a role and enter your account details.
Brand panel heading: Built for race day
Brand panel support: One account for schedules, entries, results, and race operations.
```

Do not add decorative metrics, fake precision, testimonials, or placeholder social providers back into auth screens unless product scope explicitly enables them.

### Problem

`POST /auth/register` creates a `pending_verification` account and sends a six-digit OTP when backend email credentials are configured. Any raw OTP returned by development backend responses is ignored by frontend and never rendered or prefilled.

### Locked frontend flow

```text
Submit signup
  -> backend creates pending_verification account and attempts OTP email
  -> frontend stores role-application intent
  -> navigate to /verify-account?email=<registered-email>
  -> user enters six-digit OTP
  -> POST /auth/verify-account
  -> success redirects to /login with email prefilled and a verified notice
  -> user logs in
  -> non-spectator intent continues to the matching role application
```

Post-registration decision: use an explicit Login handoff after OTP verification. Do not auto-login with cached signup credentials. The current verify API returns the verified user and roles but no JWT, while login requires the original password. Frontend must not retain the password in navigation state, query parameters, localStorage, or sessionStorage. True post-verification auto-login would require a future backend contract that returns a short-lived exchange token or authenticated session.

Development follows the same email-delivery and manual-entry experience as production. Frontend never reads a response OTP into UI state.

### UI and interaction plan

- Add public route `/verify-account`.
- Use the established auth visual language and existing auth CSS; do not add a dependency or a new component system.
- Prefer one accessible OTP input with `inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`, paste support, and visible label. Do not build six fragile focus-jumping inputs.
- Show the target email as context. Preserve it through navigation state and an encoded query parameter so reload remains usable.
- Provide `Verify account`, `Resend code`, `Change email`, and `Back to login` actions.
- Resend calls `POST /auth/resend-verification`; replace the current OTP value when development returns a new code.
- Add a 60-second client resend cooldown for accidental repeat clicks. Treat it as UX only, not a security rate limit.
- Disable submit until the normalized code contains exactly six digits.
- Preserve focus-visible, disabled, submitting, success, invalid/expired, resend-success, resend-error, and offline/API-error states.
- Use action copy such as `Verifying...` and `Sending...`; page loading, if any, uses the existing skeleton conventions.
- Mobile layout must keep at least 16px side gutters, 44px control height, readable OTP characters, and no keyboard-induced horizontal overflow.

### Code changes

- `src/SignUp/SignUp.jsx`
  - Remove automatic `verifyAccount()` after register.
  - Navigate every successful registration to `/verify-account` with email and optional development OTP.
- `src/auth/VerifyAccount.jsx` (new focused screen)
  - Own OTP normalization, verification submit, resend state/cooldown, development hint, and redirect.
- `src/App.jsx`
  - Register the public `/verify-account` route.
- `src/Login/Login.jsx`
  - Accept navigation state after verification, prefill the verified email, and display `Account verified. Sign in to continue.`
  - When login returns the known unverified-account error, offer or navigate to verification with the entered email instead of leaving the user at a generic error.
- `src/api/authApi.js`
  - Reuse existing `verifyAccount(otp)` and `resendVerification(email)` methods; no API contract change is needed.
- Existing auth styles in `src/App.css` or the current auth stylesheet
  - Add only screen-specific selectors needed for OTP context, development hint, actions, and responsive states.

### Security and contract notes

- Never persist the OTP in localStorage or session storage.
- Never put the OTP in the URL. Email may be encoded in the query; OTP travels only in navigation state/input and the verification request body.
- Do not log OTP values.
- Production does not receive `data.verification.otp`; the UI must work entirely from the email-delivered code.
- The backend OTP expiry defaults to 24 hours. Invalid and expired OTP currently share the message `Verification OTP is invalid or expired`.
- Email delivery may be skipped when backend email credentials are absent. In that case development can use the returned OTP; production configuration must provide the email service.
- Backend rate limiting is outside frontend scope. Client cooldown must not be described as abuse protection.

### Acceptance checklist

- [x] Signup never verifies automatically in development or production.
- [x] Successful signup always reaches `/verify-account` with the registered email visible.
- [x] Correct OTP verifies and redirects to login.
- [x] Login receives the verified email prefilled, but never receives or restores the signup password.
- [ ] Invalid/expired OTP remains editable and exposes resend.
- [x] Resend generates a replacement code and cooldown prevents accidental repeats.
- [x] Reload preserves the email context without persisting OTP.
- [x] Unverified login leads back to the verification flow with email preserved.
- [ ] Spectator intent reaches the spectator workspace after verified login.
- [ ] Horse owner, jockey, and referee intents continue to role application after verified login.
- [ ] Keyboard-only, paste, screen-reader labeling, desktop, and mobile behavior are verified.
- [x] `npm run build` passes.
- [x] `design.md` and `MAIN_FLOWS.md` document the implemented flow and visual direction.

## Implemented Slice - Forgot Password OTP Reset

### Current mismatch

Backend `POST /auth/forgot-password` may return `data.reset.otp` in development and emails the six-digit OTP when email credentials are configured. Frontend ignores any response OTP and requires manual entry from the user's email.

Backend contracts already available:

```text
POST /auth/forgot-password  { email }
POST /auth/reset-password   { otp, new_password }
```

The backend also accepts legacy `token`, but the frontend target contract should use `otp` consistently.

### Locked frontend flow

```text
Open /forgot-password
  -> enter account email
  -> POST /auth/forgot-password
  -> always show the same generic success behavior
  -> navigate to /reset-password?email=<account-email>
  -> enter six-digit reset OTP
  -> enter and confirm new password
  -> POST /auth/reset-password { otp, new_password }
  -> success redirects to /login with a password-reset notice and email prefilled
```

Do not reveal whether an email exists. The backend intentionally returns a generic success response for unknown, blocked, disabled, or unverified accounts.

### UI and interaction plan

- Keep `/forgot-password` as the email request screen.
- Convert `/reset-password` into a clear OTP plus new-password form:
  - One accessible six-digit OTP field with `inputMode="numeric"`, `autoComplete="one-time-code"`, paste support, and `maxLength={6}`.
  - New password and confirm password fields with show/hide controls using `lucide-react`.
  - Visible requirements matching backend minimum length of eight characters.
- Show the masked destination email as context without claiming delivery succeeded for a registered account.
- Development must not display or prefill `data.reset.otp`; it follows the same manual email-code entry flow as production.
- Provide `Reset password`, `Send a new code`, `Change email`, and `Back to login` actions.
- `Send a new code` calls `POST /auth/forgot-password` again because no separate reset-resend endpoint exists.
- Use a 60-second client cooldown to prevent accidental repeat clicks; document that this is not backend rate limiting.
- Reset OTP expiry is 15 minutes by backend default. Invalid and expired codes use the backend message without guessing which case occurred.
- Do not auto-login after password reset. Redirect to Login because reset response does not include a JWT and previously issued JWT invalidation is not guaranteed by the current contract.

### Code changes

- `src/auth/AuthRecovery.jsx`
  - Ignore raw reset OTP values returned by development responses.
  - Navigate from forgot to reset with email and optional development OTP.
  - Submit reset as `{ otp, new_password }`.
  - Add resend/cooldown, masked email context, OTP validation, and redirect notice.
- `src/Login/Login.jsx`
  - Prefill email from navigation state after reset and display `Password reset successfully. Sign in with your new password.`
- `src/api/authApi.js`
  - Keep the existing methods; update frontend call sites to the canonical `otp` payload.
- Existing auth styles
  - Reuse the auth shell and add only focused OTP/password/resend states with explicit mobile behavior.

### Security and accessibility notes

- Never store reset OTP or passwords in persistent browser storage or URL parameters.
- Do not log the email/OTP/password payload.
- Clear password fields after a failed reset only when the failure indicates sensitive transport/session loss; preserve them for correctable field errors.
- Use `aria-live` for request/reset feedback, visible labels, focus placement on the first invalid field, and keyboard-operable password visibility controls.
- Preserve at least 44px control height, 16px mobile gutters, and stable layout when validation messages appear.

### Acceptance checklist

- [ ] Forgot Password always returns the same user-facing response regardless of whether the email exists.
- [x] Development response OTP is ignored and never exposed in the reset UI.
- [x] Reset form accepts a pasted six-digit OTP and submits the canonical `otp` field.
- [x] Password length and confirmation are validated before submit.
- [x] Resend requests a replacement reset OTP and respects the cooldown.
- [ ] Invalid/expired OTP keeps the user on the reset screen with a clear recovery action.
- [x] Successful reset redirects to Login with email prefilled and no password retained.
- [x] No OTP or password appears in URL or persistent storage.
- [ ] Desktop/mobile, keyboard, screen-reader, loading, error, and reduced-motion behavior are verified.
- [x] `npm run build` passes.

## Phase 2 Owner API Checklist

- [x] Add horse owner API wrapper for profile and horse endpoints.
- [x] Add adapters from backend owner/horse schema to existing owner UI shape.
- [x] Connect owner horse list to `GET /horse-owner/horses`.
- [x] Connect owner horse detail to `GET /horse-owner/horses/:horseId`.
- [x] Connect owner horse create/edit to `POST/PATCH /horse-owner/horses`.
- [x] Connect owner profile page to `GET /horse-owner/profile`.
- [x] Treat horse profile creation as owner-local data; do not require admin horse approval before saving a horse profile.
- [ ] Verify owner list/detail/create/edit/profile manually with a real horse owner account.
- [x] Run frontend build after Phase 2.

## Phase 3 Role Application Checklist

This phase should be done before connecting more role-specific workspaces, because new backend accounts are spectators until admin approval.

- [x] Add role application API wrapper for `/role-applications/*`.
- [x] Add file-to-data-URI helper for application documents and reuse it for future upload fields.
- [x] Update signup post-success UX:
  - spectator users can continue to spectator workspace.
  - users who picked horse owner/jockey/referee during signup should see the matching role application next step after verification/login.
- [x] Build role application status page using `GET /role-applications/me`.
- [x] Build horse owner role application form with required fields: `stable_name`, `address`, `license_number`, `ownership_type`.
- [x] Build jockey role application form with required fields: `license_number`, `height`, `weight`, `experience_years`, medical clearance, racing license document.
- [x] Build race referee role application form with required fields: `license_number`, `experience_years`, `accreditation_body`, rules training certificate, background check.
- [x] Prevent duplicate pending applications in the UI when `GET /role-applications/me` already has a pending application for that role.
- [ ] Refresh `/auth/me` after an application is approved and the user logs back in, so newly assigned roles appear in session.
- [x] Run frontend build.

## Phase 4 Jockey API Checklist

- [x] Add jockey API wrapper for `/jockeys/me`, assignments, schedule, results, stats, violations, and horse-jockey lookup endpoints.
- [x] Connect `/jockey/profile` to `GET /jockeys/me` and `GET /jockeys/me/approval-status`.
- [x] Connect `/jockey/invitations` and `/jockey/assignments` to `GET /jockeys/me/assignments`.
- [x] Wire original invitation accept/reject actions to `POST /jockeys/me/assignments/:id/accept` and `POST /jockeys/me/assignments/:id/reject`.
- [ ] Update jockey UI wording/status handling for the new meeting-first contract flow:
  - `meeting_invited`
  - `meeting_accepted`
  - `meeting_rejected`
  - `terms_agreed`
  - `contract_uploaded`
  - `contract_rejected`
  - `accepted`
  - `cancelled`
- [ ] Prefer the new assignment endpoints where appropriate:
  - `POST /jockey-assignments/:id/accept-meeting`
  - `POST /jockey-assignments/:id/reject-meeting`
  - `POST /jockey-assignments/:id/confirm-contract`
  - `POST /jockey-assignments/:id/reject-contract`
- [x] Connect `/jockey/schedule` to `GET /jockeys/me/schedule`.
- [x] Connect `/jockey/results` to `GET /jockeys/me/results` and stats cards to `GET /jockeys/me/stats`.
- [x] Keep local mock fallback or empty states for missing backend data while data seeding is incomplete.
- [ ] Verify jockey dashboard/profile/invitations/assignments/schedule/results manually with a real jockey account.
- [x] Run frontend build.

## Phase 5 Admin API Checklist

- [x] Add admin API wrapper for `/admin/users` and `/admin/role-applications`.
- [x] Connect admin users module list to `GET /admin/users`.
- [ ] Connect admin user detail to `GET /admin/users/:id`.
- [x] Wire user status updates to `PATCH /admin/users/:id/status` for activate/suspend actions.
- [ ] Wire role assignment/removal to `POST /admin/users/:id/roles` and `DELETE /admin/users/:id/roles/:roleName`.
- [x] Add admin role application queue using `GET /admin/role-applications`.
- [x] Wire role application approve and reject flows.
- [ ] Wire application detail to `GET /admin/role-applications/:id`.
- [ ] After approving role applications, ensure profile information is visible in admin user detail.
- [ ] Verify admin users and registrations modules manually with a real admin account.
- [x] Run frontend build.

## Completed Slice - Race Referee API Checklist

Race Referee UI is protected and partially connected. The next slice replaces fallback behavior with the API-first three-phase workspace.

- [x] Add `/referee` protected routes and role route mapping for users with `race_referee`.
- [x] Add Race Referee API wrapper for assigned race reads using shared race/result/violation/check/report endpoints.
- [x] Add adapters from backend race/result/violation/check/report schema to the existing Referee UI race shape.
- [x] Connect `/referee` dashboard to live race data.
- [x] Connect `/referee/races` list/search/filter to live race data.
- [x] Connect `/referee/races/:raceId` detail to live race data.
- [x] Connect horse inspection submit/update to `POST/PATCH /horse-checks`.
- [x] Connect violation create to `POST /violations`.
- [x] Connect violation update to `PATCH /violations/:id`.
- [x] Connect legacy result draft create/update to `POST/PATCH /race-results`; migrate creation to race finalization so new drafts come from the Race Engine flow.
- [x] Connect report draft/update/submit to `POST/PATCH/submit /referee-reports`.
- [x] Respect backend ownership rules: race referees can only act on races assigned to their referee profile.
- [x] Run frontend build after each integration slice.
- [x] Remove `usedFallback` and `refereeData.js` dependencies from production referee pages.
- [x] Add phase-aware check adapters and explicit unavailable states.
- [x] Replace the mock race monitor with backend incident operations; expose jockey inspection as unavailable/read-only until its persistence contract exists.

## Next Slice - Race Engine And Penalty Integration

- [ ] Add frontend API methods for race start, complete, participants, and readiness.
- [ ] Add race lifecycle controls with backend authorization/error handling; never advance phase from local state alone.
- [ ] Replace per-result draft creation with `POST /race-results/races/:raceId/finalize`.
- [ ] Add penalty options and preview UI using backend policy responses.
- [ ] Add violation confirm/dismiss flows and sensitive-review states.
- [ ] Display readiness blockers before finalize and reload the workspace after every resolving mutation.
- [ ] Display raw and final result values plus applied violation context.
- [ ] Add admin race-level confirm/publish actions; remove assumptions about individual result transitions.
- [ ] Surface jockey suspension/fine state and backend assignment rejection messages.
- [ ] Remove spectator result sample fallback now that authenticated published-result reads are available.
- [ ] Decide a frontend-only transport approach for the backend `/users` mount, or continue using `/api/race-results` until a normalized `/api` route exists.

## Remaining API Backlog By Role

## Completed Slice - Spectator Read API Checklist

Spectator prediction APIs are not documented yet, so this phase focuses on read-only tournament, race, and published result data that already exists in the backend.

- [x] Add spectator API wrapper for `GET /tournaments`, `GET /tournaments/:id`, `GET /races`, and `GET /race-results`.
- [x] Add adapters/hooks for backend tournament/race data. Connected screens must use explicit loading, empty, and error states; mock remains only in isolated betting/realtime prototypes.
- [x] Connect `/spectator/tournaments` to live tournament data.
- [x] Connect `/spectator/tournaments/:tournamentId` to live tournament and race schedule data.
- [x] Connect `/spectator/results` to `GET /race-results`.
- [x] Connect `/spectator/leaderboard` horse board to available published result data.
- [ ] Add a backend-backed jockey leaderboard when aggregate jockey ranking data is available.
- [ ] Keep predictions room/profile prediction sections as mock until backend prediction/bet APIs are documented.

### Auth Follow-Up

- [x] Connect resend verification to `POST /auth/resend-verification`.
- [x] Connect forgot password to `POST /auth/forgot-password`.
- [x] Connect reset password to `POST /auth/reset-password`.
- [x] Connect change password to `POST /auth/change-password`.

### Spectator Remaining

- [x] Add spectator/shared tournament API wrapper for `GET /tournaments` and `GET /tournaments/:id`.
- [x] Connect spectator tournament list/detail to live tournament/race data.
- [x] Connect spectator results to `GET /race-results`.
- [x] Connect spectator horse leaderboard to available published results/stats data.
- [ ] Connect spectator jockey leaderboard when backend exposes aggregate jockey ranking data.
- [ ] Keep prediction UI as mock until backend prediction/bet APIs are documented or implemented.

### Owner Follow-Up

- [x] Add owner profile update via `PATCH /horse-owner/profile`.
- [x] Add horse delete/deactivate via `DELETE /horse-owner/horses/:horseId`.
- [x] Add horse media update via `PATCH /horse-owner/horses/:horseId/media`.
- [x] Add horse approval status via `GET /horse-owner/horses/:horseId/approval-status`.
- [ ] Reframe horse approval/readiness UI as race-registration eligibility/supporting checks, not as required admin approval for creating a horse profile.
- [ ] Add owner registration APIs for tournament/race registration and cancellation:
  - `POST /horse-owner/tournament-registrations`
  - [x] `POST /horse-owner/race-registrations`
  - `PATCH /horse-owner/tournament-registrations/cancel`
  - [x] `PATCH /horse-owner/race-registrations/cancel`
- [x] Connect owner available jockey list to `GET /horse-owner/jockeys`.
- [x] Connect owner available jockey detail to `GET /horse-owner/jockeys/:jockeyId`.
- [x] Add owner jockey assignment creation via `POST /jockey-assignments`.
- [ ] Update owner jockey assignment creation to match latest backend contract:
  - [x] Do not allow jockey invitation until the selected horse has approved race registration for the selected race.
  - [x] Require meeting title, Google Meet URL, and future meeting time.
  - [x] Include online contract/file/link in the target invitation UX.
  - [x] Send backend-compatible `meeting` payload in `POST /jockey-assignments`.
  - [x] Send contract information as temporary `contract_draft` so the current backend validator does not reject assignment create.
  - [ ] Resolve backend mismatch: either send contract/draft in `POST /jockey-assignments` if backend supports it, or use a backend-supported draft contract field before jockey review.
- [x] Load existing owner assignments from `GET /jockey-assignments` before submission.
- [x] Prevent duplicate assignment submission for the same `horse_id + race_id` and disable the create button when a matching assignment exists.
- [x] Normalize duplicate assignment responses (`409 Conflict`) into a user-facing message instead of rendering MongoDB `E11000` text.
- [x] Connect owner tournament list/race selection for registration via `GET /horse-owner/tournaments` and `GET /horse-owner/tournaments/:tournamentId/races`.
- [ ] Replace owner dashboard/schedule/results mock sections with live APIs where backend supports them.

### Jockey Follow-Up

- [x] Render jockey violations from `GET /jockeys/me/violations`.
- [x] Add jockey profile update form submit to `PATCH /jockeys/me`.
- [ ] Update jockey invitation/assignment actions for the meeting/contract lifecycle:
  - [x] Accept/reject meeting invitation using new endpoints with fallback to legacy self-assignment endpoints.
  - [x] Show Meet and contract review context before accept/reject.
  - [ ] Confirm final backend status model for invitation contract review.
- [ ] Add horse-specific jockey lookup/schedule usage where owner or detail screens need it:
  - `GET /jockeys/horses/:horseId/jockeys`
  - `GET /jockeys/horses/:horseId/schedule`

### Admin Follow-Up

- [x] Connect admin user detail to `GET /admin/users/:id`.
- [x] Wire role assignment/removal to `POST /admin/users/:id/roles` and `DELETE /admin/users/:id/roles/:roleName`.
- [x] Wire application detail to `GET /admin/role-applications/:id`.
- [ ] Connect tournament/round/race CRUD to `/tournaments`, `/rounds`, and `/races`.
- [x] Connect registration approval module to `/registrations`, including approve/reject through `/registrations/:id/approve` and `/registrations/:id/reject`.
- [ ] Connect admin jockey assignment module to `/jockey-assignments`.
- [ ] Connect result confirm/publish flows to `/race-results/races/:raceId/confirm` and `/race-results/races/:raceId/publish`.
- [ ] Connect admin referee operation modules to `/violations`, `/horse-checks`, and `/referee-reports`.

## Implementation Notes

- API client should read `import.meta.env.VITE_API_BASE_URL`.
- API client should attach `Authorization: Bearer <token>` when a token exists.
- API client should normalize backend errors from `{ success, message, details }`.
- Session storage keys:
  - `horse_racing_token`
  - `horse_racing_user`
  - `horse_racing_roles`
  - `horse_racing_active_role`
  - `horse_racing_profiles`
- Test account reference:
  - `TEST_ACCOUNTS.md`
- Role redirect priority only applies when the user has one role. Multiple roles go to the chooser.
- Single-role redirect targets:
  - `admin` -> `/admin`
  - `horse_owner` -> `/owner`
  - `jockey` -> `/jockey`
  - `race_referee` -> `/referee`
  - `spectator` -> `/spectator`

## Test Checklist

- [x] Backend runs successfully on `localhost:3000`.
- [x] Frontend runs successfully on Vite dev server; latest verified URL is `http://127.0.0.1:5173/`.
- [ ] Invalid login shows backend error message.
- [ ] Valid login stores token and user session.
- [ ] Single-role login redirects to the correct workspace.
- [ ] Multi-role login redirects to workspace chooser.
- [ ] Signup validates password length, confirm password, and terms before API call.
- [ ] Valid signup registers, opens `/verify-account`, and verifies only after the OTP submit action in development and production.
- [ ] Refreshing a protected route restores session using `/auth/me`.
- [ ] Expired or invalid token clears session and redirects to `/login`.
- [ ] Logout clears local session even if API logout fails.

## Progress Log

- Created plan file.
- Added Vite proxy, `/api` frontend env, API client, auth API wrapper, role routing helpers, and session storage helpers.
- Connected login and signup forms to backend auth endpoints. Signup now always hands off to the OTP screen and no longer auto-verifies in development.
- Added role-protected routes, multi-role workspace chooser, logout integration, and auth UI states.
- Adjusted Vite proxy target to `127.0.0.1` after local proxy test hung through `localhost`.
- Verified backend roles endpoint, Vite dev server response, Vite proxy `/api/auth/roles`, and production build.
- Started Phase 2 owner API integration for profile and horse management pages.
- Phase 2 frontend build passed after owner API integration.
- Started Phase 3 role application integration after the backend changed signup to spectator-first role approval.
- Added `/spectator/role-applications`, role application API wrapper, data URI file helper, role-intent redirect after login, and updated signup verification to use `verification.otp`.
- Phase 3 frontend build passed after role application integration.
- Added `TEST_ACCOUNTS.md` with available Atlas/Supplement/Epic/RaceDay test users and common password.
- Confirmed working constraint: frontend-only implementation; backend code stays untouched.
- Deferred Race Referee workspace/API work until the Race Referee UI branch is merged.
- Started Phase 4 Jockey API integration.
- Added jockey API wrapper, robust backend-to-UI adapters, live data hook with mock fallback, and connected jockey dashboard/profile/invitations/assignments/schedule/results.
- Phase 4 frontend build passed after jockey API integration.
- Started Phase 5 Admin API integration.
- Added admin API wrapper, admin users/role-application adapters, live admin module hook, live users table, live role application queue, activate/suspend actions, and approve/reject role application actions.
- Phase 5 frontend build passed after initial admin API integration.
- Merged Race Referee UI from `origin/race-referee`, added protected `/referee` route mapping, and started current Phase 1 Race Referee API integration.
- Added the Race Referee API wrapper, adapter, and live data hook. Connected `/referee` dashboard and `/referee/races` to live race data.
- Connected `/referee/races/:raceId`, horse inspection create/update, and violation create to live APIs.
- Connected race result draft create/update and referee report draft/update/submit to live APIs.
- Started the no-mock, three-phase referee migration defined in `REFEREE_THREE_PHASE_FRONTEND_PLAN.md`.
- Stored auth profiles in the frontend session and filtered referee race reads by `profiles.race_referee._id` when available.
- Added violation edit flow using `PATCH /violations/:id`.
- Started Phase 2 Spectator read API integration. Added spectator API wrapper/adapters/hooks and connected tournament list/detail to live tournament/race data.
- Connected `/spectator/results` to published race results. Remove sample fallback from this connected screen and use explicit empty/error states.
- Connected `/spectator/leaderboard` horse board to published race results; jockey board remains sample data pending an aggregate backend endpoint.
- Started Owner follow-up integration. Added full owner API wrapper coverage, connected profile update, horse deactivate, horse approval status, available jockey list, tournament/race selection, and race registration submit.
- Connected owner horse profile image upload. New horses send `image_file_data` on create; existing horses call `PATCH /horse-owner/horses/:horseId/media`.
- Connected owner registration queue to `GET /registrations`, refreshed it after race registration submit, and added race registration cancellation through `PATCH /horse-owner/race-registrations/cancel`.
- Connected owner jockey detail selection and original assignment creation. This older frontend flow allowed optional contract upload during `POST /jockey-assignments`, but the latest backend supersedes it with a meeting-first lifecycle where contract upload happens later through `POST /jockey-assignments/:id/contract`.
- Hardened owner jockey assignment creation. The page now fetches existing assignments, detects duplicate `horse_id + race_id` pairs before upload/submission, shows the existing assignment status, disables the submit action, and maps backend `409` responses to readable guidance.
- Completed Auth follow-up integration. Added `/verify-account`, `/forgot-password`, `/reset-password`, `/resend-verification`, and protected `/change-password` flows with canonical OTP handling, resend cooldowns, and a simplified responsive auth interface.
- Completed Jockey profile follow-up. Added live violation loading and an athlete profile form for height, weight, experience, license number, and availability status.
- Connected Admin user and role-application detail modals to live APIs. Added user role assignment/removal controls with list/detail refresh after each mutation.
- Started the spectator realtime prototype Phase 1. Redesigned `PredictionDetail.jsx` as a race-day room with a five-lane 2D track preview, live ranking, race timeline, race selector, wallet, sticky betting panel, open bets, and responsive desktop/mobile layouts.

## Assumptions

- Backend response contract follows `horse-racing-backend/docs/API.md`.
- Backend development mode returns raw verification OTPs for signup and resend verification.
- Role-selected signup in the current UI is now a product intent, not immediate role assignment. The backend always creates a spectator until a role application is approved.
- No backend CORS package is needed for this phase because Vite proxy handles local development calls.
- Mock data remains in several non-referee areas until their integration slices replace it. Referee mock data is now scheduled for removal from all production paths.
- Race participant data is not populated by `GET /races` in the current backend. Referee screens must use an explicit unavailable state until backend exposes assigned race participants; they must not substitute sample participants.
- Latest backend jockey assignment contract is meeting-first. Existing frontend owner/jockey assignment screens may still reflect the earlier direct-invitation/direct-contract mental model until updated.
- Target product flow is stricter than current backend: horse profile does not need admin approval, race registration does, and jockey invitation must include Meet link plus online contract.

## Session Closeout - 2026-06-14

Completed:

- Owner jockey assignment duplicate protection is implemented in the frontend.
- `ownerApi.getJockeyAssignments()` loads the current owner's assignments.
- The assignment form blocks a duplicate horse/race pair before contract conversion or submission.
- A contextual conflict panel explains the existing assignment and disables submit.
- Frontend production build passed after the owner assignment update.
- Spectator race detail now uses a broadcast-style oval DOM/CSS viewer with deterministic checkpoint interpolation.
- Live demo runners wait together at the start line for three seconds before moving.
- Mock finish times are separated and completed runners remain visibly spaced after the finish line.
- Race detail browser verification passed for scheduled, running, completed, desktop, and mobile states.

Next session:

1. Align owner/jockey assignment screens with `OWNER_RACE_JOCKEY_FLOW_PLAN.md`.
2. Confirm backend support for contract-at-invitation or an invitation contract draft.
3. Manually verify owner horse create, race registration approval gate, jockey invitation, and jockey accept/reject with real owner/admin/jockey accounts.
4. Decide whether cancelled/rejected assignments may be replaced or the unique `horse_id + race_id` rule remains permanent.
5. Continue production spectator integration after market, wallet, bet, participant, race-script, and socket contracts are available.
6. Continue remaining admin modules and the spectator jockey leaderboard when backend endpoints are ready.
