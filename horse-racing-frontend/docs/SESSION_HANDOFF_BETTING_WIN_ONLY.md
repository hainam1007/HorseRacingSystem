# Session Handoff - Betting Win Only Integration

Last updated: 2026-07-03

## Purpose

This handoff summarizes the current betting scope and the frontend changes made to align with the backend. Use this file at the start of the next session to avoid re-reading all betting documents from scratch.

## Backend Betting Scope

Current backend betting is limited to fixed-odds `win` bets only.

Supported:

- Spectator selects one horse to win.
- Backend requires an open race odds market.
- Backend deducts `stake_amount` from the spectator wallet immediately.
- Backend stores an `odds_snapshot` on the bet.
- Backend calculates `potential_payout = stake_amount * odds_snapshot.game_odds`.
- Backend settles pending bets after official race results are published.

Not supported yet:

- `place`
- `show`
- `quinella`
- `exacta`
- `trifecta`
- `superfecta`
- multi-race bets

Frontend must not show or enable unsupported bet types until backend odds and settlement rules exist.

## Backend API Flow

Admin flow:

```text
POST /api/races/:id/odds/generate
POST /api/races/:id/betting/open
POST /api/races/:id/betting/close
POST /api/race-results/races/:raceId/publish
POST /api/bets/races/:raceId/settle
```

Spectator flow:

```text
GET /api/races/:id/odds
POST /api/bets
GET /api/bets/me?race_id=:raceId
GET /users/spectator/races/:raceId/results
GET /users/spectator/races/:raceId/live-state
```

Place bet body:

```json
{
  "race_id": "race_id",
  "horse_id": "horse_id",
  "stake_amount": 10
}
```

Alternative backend key:

```json
{
  "race_id": "race_id",
  "predicted_horse_id": "horse_id",
  "stake_amount": 10
}
```

Important response fields:

```text
data.bet.odds_snapshot.game_odds
data.bet.potential_payout
data.bet.status
data.wallet.token_balance
data.transaction
```

## Frontend Route

Current dedicated betting route:

```text
/spectator/predictions/races/:raceId
```

Component:

```text
src/pages/spectator/PredictionDetail.jsx
```

The route is now backend-backed for odds, wallet reads, bet submission, and My Bets history. It still keeps a development-only mock preview fallback when local APIs are unavailable.

## Changes Made This Session

### Phase 2 API connection follow-up - 2026-07-03

Phase 2 spectator betting integration is complete on the route:

```text
/spectator/predictions/races/:raceId
```

Current behavior:

- Added `src/api/betApi.js` for `POST /api/bets`, `GET /api/bets/me`, and optional admin settlement.
- Added `src/api/walletApi.js` for `GET /api/wallet/me`.
- Added `spectatorApi.getRaceOdds(raceId)` for `GET /api/races/:id/odds`.
- `PredictionDetail.jsx` now loads backend odds first and maps `market.odds[]` into the win-only fixed-odds UI.
- In development, if race/odds APIs are unavailable, the page falls back to the mock preview market.
- Real bet submission now sends only `{ race_id, horse_id, stake_amount }` to `POST /api/bets`.
- Wallet balance is loaded from `/api/wallet/me` and updated from the accepted bet response.
- Existing user bets are loaded from `GET /api/bets/me?race_id=:raceId` and rendered in the My Bets panel.
- The form now requires spectator role, scheduled race status, open race betting status, open odds market status, valid stake limits, and sufficient wallet balance.
- Real API submit now has its own lock state so the modal and controls stay disabled while `POST /api/bets` is in flight.
- Payout preview now rounds to two decimals to match backend token rounding.

### Phase 3 backend odds hardening follow-up - 2026-07-03

Phase 3 replacement of the mock market with backend odds is complete for the current win-only scope on:

```text
/spectator/predictions/races/:raceId
```

Current behavior added:

- Backend odds market entries are now filtered before creating UI selections, so entries without a horse id or numeric `game_odds` cannot create invalid empty selection keys.
- Backend `generated` betting/odds status now normalizes to the existing frontend `scheduled` state, keeping generated-but-not-open markets valid but locked.
- The fixed-odds contract accepts backend `TOKEN` currency as well as the preview `PTS` currency.
- API-mode odds markets now prefer `currency`, `min_stake`, and `max_stake` from the backend odds market snapshot, with race-list betting market data as fallback.
- The betting slip, review modal, potential return, success message, and receipts now format amounts with the active market currency.
- Real API markets no longer depend on the mock realtime transport timer or mock `stop_betting` lock state; only development preview mode uses the mock transport lock.
- The market clock still shows the countdown in preview mode and shows `--` for backend API mode until a real backend close/countdown source is connected.

### Backend closes_at countdown follow-up - 2026-07-03

The betting detail route now uses backend close-time data when available.

Current behavior added:

- Backend odds markets carry `closesAt` from `market.closes_at`, `race.bettingMarket.closesAt`, or `race.bettingClosesAt`.
- Backend `server_time` / `serverTime` is accepted when present and used to calculate a stable server clock offset from the snapshot receive time.
- In API mode, the market clock now renders a real `MM:SS` countdown instead of `--` when `closes_at` is known.
- When the backend close-time countdown reaches zero, the client locks runner selection, stake controls, review, and the confirmation modal.
- If the backend does not provide a close time, the route preserves the previous behavior and keeps the market gated by backend status fields.
- `scripts/verify-fixed-odds-phase3.mjs` now includes a mocked backend API-mode check that confirms the countdown hydrates from `closes_at` and locks controls at `00:00`.

### Session resume verification follow-up - 2026-07-03

This resume pass did not add new product behavior. It re-ran the betting verification suite and confirmed the current win-only integration remains green.

Verified:

```text
npm run build
node scripts\verify-betting-contract-phase4.mjs
node scripts\verify-fixed-odds-phase3.mjs
node scripts\verify-admin-betting-controls.mjs
node scripts\verify-results-betting-history.mjs
node scripts\verify-admin-betting-live-backend.mjs
```

The live-backend verifier still skips safely without `BETTING_VERIFY_ADMIN_TOKEN` / `ADMIN_TOKEN`.

### Backend bet receipt hardening follow-up - 2026-07-03

The spectator betting route now validates and renders real backend bet receipts more strictly.

Current behavior added:

- Added `validateBackendBetReceipt()` for backend `POST /api/bets` responses.
- Real API submit now validates backend `_id`/`id`, status, `odds_snapshot.game_odds`, `stake_amount`, `potential_payout`, optional wallet balance, and requested `race_id` / `stake_amount`.
- Real API receipts now preserve backend `pending`, `won`, `lost`, and `cancelled` statuses instead of relying on the prototype-only `accepted` receipt shape.
- Receipt/history currency now prefers `odds_snapshot.currency`, then race betting market currency, then `TOKEN`.
- The betting detail route now also falls back to `TOKEN` for backend bet rows when a row omits currency metadata, instead of accidentally rendering backend bets as preview points.
- Betting history paid-summary now groups settled payout totals by currency.
- `scripts/verify-fixed-odds-phase3.mjs` now mocks `POST /api/bets`, verifies the win-only backend payload `{ race_id, horse_id, stake_amount }`, and confirms the pending receipt plus wallet update render in API mode.

### Admin betting controls follow-up - 2026-07-03

Frontend-only admin controls have been started on:

```text
/admin/schedule
```

Current behavior added:

- Added admin API wrapper methods for `POST /api/races/:id/odds/generate`, `POST /api/races/:id/betting/open`, and `POST /api/races/:id/betting/close`.
- Reused `betApi.settleRaceBets(raceId)` for `POST /api/bets/races/:raceId/settle`.
- Added a Race Schedule betting control panel where admin can select a race and run:
  - `Generate odds`
  - `Open betting`
  - `Close betting`
  - `Retry settle`
- The panel shows the selected race betting status and stake/currency limits when backend returns them.
- Each action locks while in flight, reports success/error through the existing admin notice area, and refreshes schedule data afterward.

### Admin open-betting config follow-up - 2026-07-03

The Race Schedule betting control panel now supports configurable open-betting payloads.

Current behavior added:

- Admin can edit `min_stake`, `max_stake`, `currency`, and optional `closes_at` before clicking `Open betting`.
- The panel initializes those fields from the selected race `betting_market` when available, otherwise defaults to `1`, `1000`, `TOKEN`, and no close time.
- Frontend validates positive stake limits and requires `max_stake >= min_stake` before calling the backend.
- `Open betting` now sends:

```json
{
  "min_stake": 5,
  "max_stake": 500,
  "currency": "TOKEN",
  "closes_at": "2026-07-03T10:00:00.000Z"
}
```

- `closes_at` is omitted when the admin leaves the field blank.
- Selected race status now also shows configured close time when the backend returns it.
- Betting config fields are disabled while any betting lifecycle action is in flight.
- The admin panel layout was updated for desktop, tablet, and mobile widths.

### Admin betting controls hardening follow-up - 2026-07-03

The Race Schedule betting control panel received a small safety pass.

Current behavior added:

- Admin betting status normalization now uses one helper for the badge and action gating.
- `Retry settle` is disabled until a race is completed or the betting market is closed/settled.
- `closes_at` is validated before sending `Open betting`; invalid date/time input now raises a frontend error instead of sending `Invalid Date`.
- When schedule filters change, the selected betting-control race now stays inside the filtered race list instead of silently targeting a hidden race.
- If filters remove every race, the betting control selection is cleared.

### Admin browser verification follow-up - 2026-07-03

Added a dedicated browser verifier for the Race Schedule betting lifecycle panel:

```text
scripts/verify-admin-betting-controls.mjs
```

The verifier mocks admin auth and the schedule/betting APIs, then checks:

- The betting panel hydrates status, stake limits, currency, close time, and action gates from the selected race.
- `Open betting` sends configured `min_stake`, `max_stake`, `currency`, and ISO `closes_at`.
- Completed or closed races disable odds generation and allow `Retry settle`.
- Invalid stake limits are blocked before any backend request is sent.
- Schedule filters retarget the betting-control race to the visible race list.
- Mobile admin betting controls have no horizontal overflow or clipped action buttons.

Generated artifacts:

```text
artifacts/admin-betting-controls/verification-report.json
artifacts/admin-betting-controls/admin-betting-controls-desktop-1440x1000.png
artifacts/admin-betting-controls/admin-betting-controls-mobile-390x844.png
```

### Admin odds snapshot follow-up - 2026-07-03

The Race Schedule betting control panel now includes a read-only odds snapshot for the selected race.

Current behavior added:

- Added `adminApi.getRaceOdds(raceId)` for `GET /api/races/:id/odds`.
- The selected betting-control race now loads its backend odds market independently from the race schedule list.
- The panel renders model name, model version, generated time, runner rank, horse/jockey names, win probability, fair odds, and game odds.
- Missing odds markets render an empty state instead of blocking lifecycle controls.
- Lifecycle actions refresh both schedule data and the selected odds snapshot.
- `scripts/verify-admin-betting-controls.mjs` now mocks and verifies `GET /api/races/:id/odds`.

### Spectator results betting history follow-up - 2026-07-03

The spectator results route now shows backend betting history instead of an unavailable placeholder.

Current behavior added:

- `/spectator/results` calls `GET /api/bets/me` through `betApi.getMyBets()`.
- The Betting history tab shows total bet count, settled count, and total paid payout.
- Bet rows render race, selected horse from stored `odds_snapshot`, stake, accepted `game_odds`, status, potential return, and settled payout.
- Settled won bets use backend `payout_amount`; pending bets show backend `potential_payout`; lost bets show zero payout.
- The route keeps an explicit loading state and an API error empty state when bet history cannot be loaded.
- Added responsive hardening for the results grid so the hero, tabs, and betting-history table do not create horizontal page overflow.
- Added `scripts/verify-results-betting-history.mjs` to mock published results plus `GET /api/bets/me` and verify desktop/mobile history rendering.

### Admin live backend verifier follow-up - 2026-07-03

Added an optional live-backend browser verifier:

```text
scripts/verify-admin-betting-live-backend.mjs
```

Default behavior:

- If no admin token is configured, the verifier writes a skipped-but-passing report and does not start browser/backend checks.
- With `BETTING_VERIFY_ADMIN_TOKEN` or `ADMIN_TOKEN`, it starts the frontend against `VITE_API_BASE_URL` / `BETTING_VERIFY_API_BASE_URL`, opens `/admin/schedule`, and checks the real backend schedule data hydrates the win market lifecycle panel.
- Optional `BETTING_VERIFY_RACE_ID` selects a specific fixture race from the live schedule.
- Desktop and mobile checks verify the live panel has no horizontal overflow or clipped action buttons.
- Backend mutation is disabled by default. Set `BETTING_VERIFY_MUTATE=1` only for a disposable fixture when it is safe to click lifecycle actions such as generate/open.
- Mutation mode now requires `BETTING_VERIFY_RACE_ID` so the verifier does not mutate an arbitrary live race.
- When mutation mode is enabled for a selected disposable fixture, the verifier attempts the full visible lifecycle sequence when each action is available:
  - `Generate odds`
  - `Open betting`
  - `Close betting`
  - `Retry settle`

Generated artifact path:

```text
artifacts/admin-betting-live-backend/verification-report.json
```

### Admin live backend verifier hardening follow-up - 2026-07-03

The optional live-backend verifier was hardened for safer lifecycle mutation checks.

Current behavior added:

- `BETTING_VERIFY_MUTATE=1` no longer mutates a live race unless `BETTING_VERIFY_RACE_ID` is also set.
- Mutation mode records a skipped assertion when no explicit disposable fixture race is selected.
- With a selected disposable fixture, mutation mode now attempts each available lifecycle action in order:
  - `Generate odds`
  - `Open betting`
  - `Close betting`
  - `Retry settle`
- The verifier records final action states and the visible notice after mutation checks.

### Betting contract documentation follow-up - 2026-07-03

Updated:

```text
docs/BETTING_BACKEND_CONTRACT.md
scripts/verify-fixed-odds-phase3.mjs
```

The contract document no longer describes the obsolete mock-only/six-market state. It now records the current backend-backed win-only scope, API flow, odds market shape, admin open-betting payload, `POST /api/bets` request/receipt shape, My Bets history fields, frontend gating rules, and remaining live-backend verification task.

The fixed-odds browser verifier helper now treats browser-side `undefined` evaluate results as `null`, so `waitFor()` polling can continue while optional DOM queries are still hydrating.

### `src/pages/spectator/PredictionDetail.jsx`

- Removed bet type tabs.
- Removed `BET_TYPES` tab rendering.
- Removed multi-runner slot ordering controls.
- Removed `ArrowUp` and `ArrowDown` imports.
- Forced active bet type to `getBetType("win")`.
- Changed heading from `Choose your market` to `Win market`.
- Changed note to explicitly say `Win only`.
- Runner table third column now says `Win odds`.
- Bet slip heading now says `Win bet`.
- Slip state now says `Choose one winner` or `Runner selected`.
- Selection summary now contains only the selected horse name.

### `src/pages/spectator/betting/fixedOddsRules.js`

- `BET_TYPES` now contains only:

```js
{ id: "win", label: "Win", cardinality: 1, ordered: true, slots: ["Winner"], description: "Pick the race winner." }
```

- Removed `place`, `show`, `quinella`, `exacta`, and `trifecta`.
- Removed unused `moveSelection`.

### `src/pages/spectator/betting/mockFixedOddsMarket.js`

- Mock odds now only generate `win` odds.
- Removed permutation and combination generation for multi-runner bet types.
- Removed `placeTerms` and `showTerms`.
- Added runner status entries for all 8 current mock contenders.

### `scripts/verify-fixed-odds-phase3.mjs`

- Updated from six-market verification to win-only verification.
- Expects no `.fixed-odds-tabs button`.
- Verifies `Win market` heading and `Win only` note.
- Verifies one selected runner resolves odds and enables review.
- Verifies accepted receipt and wallet update.
- Verifies mobile layout has no horizontal overflow.
- Verifies `stop_betting` locks runner, stake, review, and modal controls.
- Added CDP-level mocks for:
  - `/api/auth/me`
  - `/api/races`

## Verification Completed

Commands run successfully:

```text
npm run build
node scripts\verify-betting-contract-phase4.mjs
node scripts\verify-fixed-odds-phase3.mjs
```

Verifier output confirmed:

```text
Race betting route renders a win-only market, eight runners, and no embedded race viewer
Win-only selection resolves one runner, one odds price, and an enabled review action
Confirmation creates an accepted receipt and updates wallet balance dynamically
Mobile odds board has no horizontal page overflow or clipped runner rows
stop_betting locks runner, stake, review, and confirmation controls immediately
```

Latest follow-up verification on 2026-07-03:

```text
npm run build
node scripts\verify-fixed-odds-phase3.mjs
node scripts\verify-betting-contract-phase4.mjs
node scripts\verify-admin-betting-controls.mjs
node scripts\verify-results-betting-history.mjs
node scripts\verify-admin-betting-live-backend.mjs
```

Latest admin verifier output confirmed:

```text
Admin betting panel hydrates selected race status, stake limits, odds snapshot, and action gates
Open betting sends configured min/max stake, currency, and ISO close time
Completed or closed races disable generation and allow retry settlement
Invalid stake limits are blocked before calling the backend
Schedule filters retarget betting controls to the visible race list
Mobile admin betting panel has no horizontal overflow or clipped action buttons
```

Latest fixed-odds verifier output now also confirms:

```text
Backend API-mode submit sends the win-only bet payload and renders the pending receipt
Backend closes_at countdown renders in API mode and locks betting controls at zero
```

Latest results betting history verifier output confirms:

```text
Results betting history renders won, lost, and pending bets with backend payouts
Mobile results betting history has no horizontal overflow or clipped tabs
```

Latest live backend verifier output was intentionally skipped without a token:

```text
Set BETTING_VERIFY_ADMIN_TOKEN or ADMIN_TOKEN to run live backend admin betting verification.
```

Build note:

```text
Vite still warns that some chunks are larger than 500 kB after minification.
This warning existed outside the betting scope and is not caused by win-only logic.
```

## Current Dirty Worktree Context

Before this session, the frontend worktree already had unrelated modified files, including:

```text
src/Admin/admin.css
src/App.css
src/Referee/referee.css
src/index.css
src/pages/jockey/jockey.css
src/pages/owner/OwnerPages.jsx
src/pages/owner/owner.css
src/pages/owner/ownerAdapters.js
src/pages/spectator/spectator.css
```

Do not revert these unless the user explicitly asks.

This session touched:

```text
src/api/betApi.js
src/api/walletApi.js
src/api/adminApi.js
src/api/spectatorApi.js
src/Admin/AdminCompetitionModule.jsx
src/Admin/admin.css
docs/SESSION_HANDOFF_BETTING_WIN_ONLY.md
src/pages/spectator/Results.jsx
src/pages/spectator/PredictionDetail.jsx
src/pages/spectator/betting/fixedOddsContract.js
src/pages/spectator/betting/fixedOddsRules.js
src/pages/spectator/betting/mockFixedOddsMarket.js
src/pages/spectator/race/raceStatus.js
scripts/verify-fixed-odds-phase3.mjs
scripts/verify-admin-betting-controls.mjs
scripts/verify-admin-betting-live-backend.mjs
scripts/verify-results-betting-history.mjs
artifacts/fixed-odds-phase-3/verification-report.json
artifacts/fixed-odds-phase-3/fixed-odds-mobile-390x844.png
artifacts/fixed-odds-phase-3/fixed-odds-win-desktop-1440x1100.png
artifacts/betting-contract-phase-4/verification-report.json
artifacts/admin-betting-controls/verification-report.json
artifacts/admin-betting-controls/admin-betting-controls-desktop-1440x1000.png
artifacts/admin-betting-controls/admin-betting-controls-mobile-390x844.png
artifacts/admin-betting-live-backend/verification-report.json
artifacts/results-betting-history/verification-report.json
artifacts/results-betting-history/results-betting-history-desktop-1440x1000.png
artifacts/results-betting-history/results-betting-history-mobile-390x844.png
```

## Next Integration Plan

### 1. Add Betting API Wrapper

Status: completed for spectator betting.

Suggested file:

```text
src/api/betApi.js
```

Methods:

```js
placeBet({ race_id, horse_id, stake_amount })
getMyBets({ race_id, status })
settleRaceBets(raceId) // admin only, optional later
```

### 2. Add Odds API Wrapper

Status: completed for spectator odds read and basic admin lifecycle actions.

Suggested methods can live in `src/api/spectatorApi.js` or a new `src/api/oddsApi.js`:

```js
getRaceOdds(raceId)
generateRaceOdds(raceId) // admin only, added in src/api/adminApi.js
openRaceBetting(raceId, payload) // admin only, added in src/api/adminApi.js
closeRaceBetting(raceId) // admin only, added in src/api/adminApi.js
```

### 3. Replace Mock Market With Backend Odds

Status: completed for the current win-only scope. The betting detail route now prefers backend odds and uses mock odds only as a development fallback.

Map backend odds:

```text
market.odds[].horse_id
market.odds[].horse_no
market.odds[].horse_name
market.odds[].win_probability
market.odds[].fair_odds
market.odds[].game_odds
market.odds[].probability_rank
```

Use `game_odds` for displayed odds and payout preview.

### 4. Replace Mock Submit With `POST /api/bets`

Status: completed for non-preview mode. Development preview still uses `MockRaceTransport`.

Current mock submit still uses:

```text
market_id
bet_type
client_request_id
displayed_odds
horse_ids
race_id
stake
```

Backend now expects:

```text
race_id
horse_id
stake_amount
```

When connecting real API, normalize the UI submit payload before calling backend.

### 5. Add My Bets Panel

Status: completed for the betting detail route and spectator results history tab.

Use:

```text
GET /api/bets/me?race_id=:raceId
```

Show:

```text
stake_amount
odds_snapshot.game_odds
potential_payout
payout_amount
status
```

Statuses:

```text
pending
won
lost
cancelled
```

### 6. Gate The Bet Form

Status: completed for route-level UI gating. Real-time/socket-backed market state can replace the mock timer later.

Enable the bet form only when:

```js
race.status === "scheduled"
race.betting_status === "open"
market.status === "open"
user.roles.includes("spectator")
```

Disable when:

```text
market missing
market generated but not open
race running
race completed
wallet balance insufficient
stake below min
stake above max
```

### 7. Admin Controls

Status: completed for frontend Race Schedule controls; optional live-backend verifier added.

Added:

```text
Generate odds
Open betting
Close betting
Retry settle
Read-only odds snapshot for the selected race
```

Remaining later:

```text
Run scripts/verify-admin-betting-live-backend.mjs with a disposable backend fixture, admin token, BETTING_VERIFY_RACE_ID, and BETTING_VERIFY_MUTATE=1 when lifecycle mutation verification is safe
```

## Product Rules To Preserve

- FE must call backend only, not the Hugging Face model directly.
- FE must not calculate new odds itself.
- FE may preview payout using selected `game_odds`, but accepted payout must come from backend.
- Existing accepted bets must display stored `odds_snapshot`, not current market odds.
- Unsupported bet types should remain hidden or explicitly unavailable.
- The current first production/demo betting type is `win`.
