# Spectator Realtime Betting and 2D Race Plan

## 1. Goal

Design a frontend architecture for two core spectator experiences:

1. A realtime betting panel with server-authoritative countdown, wallet updates, and immediate anti-cheat locking.
2. A non-video 2D race viewer driven by a server-sent race script containing timed horse checkpoints.

This document is a frontend implementation plan. The current backend does not yet document betting, wallet, WebSocket, `stop_betting`, or `race_script` contracts. The frontend UI prototype is approved to proceed now with a contract-compatible mock realtime adapter. Backend contracts are required only before production integration.

## 1.1 Current Delivery Decision

- Build the complete spectator race-room UI before backend APIs are available.
- Use deterministic mock data and a local mock realtime transport.
- Keep components unaware of whether events come from a mock or a real socket.
- Do not install Socket.IO or another socket package until backend transport is confirmed.
- Treat the mock transport as a replaceable development adapter, not production behavior.
- The UI prototype must demonstrate countdown, bet selection, balance changes, immediate `stop_betting` locking, five-horse animation, live ranking, and Top 3 finish overlay.

## 2. Product Direction

### Design Read

This is a race-day product workspace for spectators and bettors, with a premium operational interface, medium-high information density, and clear realtime state communication.

### Design Dials

- Design variance: `5/10`
- Motion intensity: `7/10` inside the race viewer, `3/10` elsewhere
- Visual density: `7/10`

### Spectator Redesign Scope

The spectator prediction area may be redesigned around a single race-day flow:

- `/spectator/predictions`: tournament and race market discovery.
- `/spectator/predictions/:tournamentId`: realtime race room containing the 2D viewer and betting panel.
- `/spectator/profile`: wallet, open bets, settled bets, and transaction history.
- `/spectator/results`: official results and settled bet outcomes.

Keep the existing dark green, beige, and orange identity. The race room should feel like a focused live console, not a marketing page.

## 3. Proposed Race Room Layout

### Desktop

Use a stable two-column layout:

- Main column, approximately 70%:
  - Race header and connection state.
  - 2D race track.
  - Live ranking strip.
  - Race event timeline.
- Side column, approximately 30%:
  - Wallet balance.
  - Server countdown.
  - Horse selection.
  - Stake input.
  - Bet confirmation.
  - Current bet receipt.

The betting panel may be sticky within the page but must not cover the race viewer or footer.

### Mobile

Use this order:

1. Compact race header and countdown.
2. Horizontal 2D track with fixed aspect ratio.
3. Live ranking.
4. Betting form.
5. Wallet and bet history summary.

Do not use a permanent side drawer on mobile. The race viewer must remain visible while the user reviews the betting state.

### Spacing Rules

- Page gutter: `14px` mobile, `20-28px` desktop.
- Major section gap: `18-24px`.
- Panel padding: `16px` mobile, `18-22px` desktop.
- Control gap: `10-12px`.
- Card radius: maximum `8px`.
- Avoid nested cards. Use dividers and spacing for information inside a panel.
- Reserve stable dimensions for countdown, track lanes, horse markers, balance, and ranking rows to prevent layout shifting.

## 4. Frontend Module Architecture

```text
src/
  realtime/
    socketClient.js
    socketEvents.js
    RealtimeProvider.jsx
    useSocketEvent.js
    useConnectionState.js
  api/
    bettingApi.js
    walletApi.js
  pages/spectator/live-race/
    LiveRaceRoom.jsx
    BettingPanel.jsx
    RaceViewer2D.jsx
    RaceTrack.jsx
    HorseRunner.jsx
    LiveRanking.jsx
    RacePodiumOverlay.jsx
    ConnectionBanner.jsx
    useBettingSession.js
    useRacePlayback.js
    raceScriptAdapter.js
    raceMath.js
  pages/spectator/
    spectator.css
```

Create these files only when implementation begins. Keep socket transport, domain state, and rendering separate.

## 5. Realtime Connection Layer

### Transport Decision

Prefer `socket.io-client` only if the backend uses Socket.IO. Use native `WebSocket` if the backend exposes a standard WebSocket endpoint.

Do not install either dependency until the backend transport is confirmed.

### Mock-First Transport Interface

Create a small transport interface shared by mock and future production implementations:

```js
transport.connect()
transport.disconnect()
transport.joinRace(raceId)
transport.leaveRace(raceId)
transport.on(eventName, handler)
transport.off(eventName, handler)
transport.emit(eventName, payload)
```

Initial implementation:

```text
MockRaceTransport
```

Future replacement:

```text
SocketIoRaceTransport or WebSocketRaceTransport
```

Select transport through a single environment flag:

```env
VITE_REALTIME_MODE=mock
```

The React provider and domain hooks must depend only on the transport interface.

### Mock Scenario Timeline

Use a deterministic development scenario so the UI is repeatable:

```text
00s  -> connection becomes connected
01s  -> betting_state: open, countdown 30 seconds
08s  -> wallet_updated: optional demo credit
30s  -> stop_betting: lock the complete betting form
33s  -> race_script: provide five horses and checkpoints
36s  -> race starts
96s  -> race_finished: provide authoritative Top 3
```

Add development controls outside production builds for restarting the scenario and jumping to waiting, open, locked, racing, finished, disconnected, and error states.

### One Shared Connection

Use one authenticated connection in `RealtimeProvider` rather than opening a socket in each component.

Responsibilities:

- Connect after a valid auth session exists.
- Send the JWT through the agreed handshake mechanism.
- Join and leave race-specific rooms.
- Track `connecting`, `connected`, `reconnecting`, and `disconnected` states.
- Register and remove event listeners safely.
- Prevent duplicate listeners during React Strict Mode remounting.
- Disconnect or clear subscriptions on logout.

### Race Room Lifecycle

```text
open race page
  -> fetch initial REST snapshot
  -> connect socket
  -> join race:<raceId>
  -> reconcile snapshot with latest socket state
  -> listen for betting, wallet, script, progress, and result events
  -> leave race:<raceId> on navigation
```

REST provides the initial source of truth. Socket events provide incremental realtime updates.

## 6. Required Socket Contract

The exact names are proposals. Backend and frontend must lock one versioned contract.

### Client Events

```text
join_race
leave_race
request_race_snapshot
```

Example:

```json
{
  "race_id": "race_object_id"
}
```

### Server Events

#### `betting_state`

Sent on room join and whenever the market state changes.

```json
{
  "race_id": "race_object_id",
  "status": "open",
  "server_time": "2026-06-12T08:00:00.000Z",
  "closes_at": "2026-06-12T08:01:00.000Z",
  "min_stake": 10,
  "max_stake": 1000,
  "currency": "points",
  "sequence": 42
}
```

Allowed status values:

```text
scheduled, open, locked, closed, settled, cancelled
```

#### `countdown_sync`

Optional periodic clock correction event.

```json
{
  "race_id": "race_object_id",
  "server_time": "2026-06-12T08:00:30.000Z",
  "closes_at": "2026-06-12T08:01:00.000Z",
  "sequence": 43
}
```

#### `stop_betting`

Authoritative anti-cheat lock event.

```json
{
  "race_id": "race_object_id",
  "locked_at": "2026-06-12T08:01:00.000Z",
  "reason": "race_starting",
  "sequence": 44
}
```

#### `wallet_updated`

```json
{
  "user_id": "user_object_id",
  "balance": 1180,
  "currency": "points",
  "reason": "bet_accepted",
  "transaction_id": "transaction_object_id",
  "sequence": 105
}
```

#### `race_script`

```json
{
  "race_id": "race_object_id",
  "script_version": 1,
  "issued_at": "2026-06-12T08:01:02.000Z",
  "starts_at": "2026-06-12T08:01:05.000Z",
  "duration_ms": 68000,
  "track_length": 1000,
  "horses": [
    {
      "horse_id": "horse_1",
      "name": "Storm Arrow",
      "lane": 1,
      "color": "#ef8354",
      "checkpoints": [
        { "time_ms": 0, "distance": 0 },
        { "time_ms": 10000, "distance": 130 },
        { "time_ms": 30000, "distance": 470 },
        { "time_ms": 68000, "distance": 1000 }
      ]
    }
  ],
  "sequence": 300
}
```

Exactly five horses are expected for the first version. The frontend should still validate the array instead of assuming its length.

Finish timing rules:

- `duration_ms` is the maximum playback window, not a requirement that every horse finishes at the same timestamp.
- Each horse's final checkpoint must reach `track_length`, but final `time_ms` values may differ.
- Different final checkpoint times are required to express a visible finish order.
- The frontend may hold finished runners beyond the finish line with rank-based display offsets while the authoritative result is pending.

#### `race_finished`

```json
{
  "race_id": "race_object_id",
  "finished_at": "2026-06-12T08:02:13.000Z",
  "results": [
    { "horse_id": "horse_1", "position": 1, "finish_time_ms": 67920 },
    { "horse_id": "horse_4", "position": 2, "finish_time_ms": 68110 },
    { "horse_id": "horse_2", "position": 3, "finish_time_ms": 68440 }
  ],
  "sequence": 301
}
```

### Ordering and Idempotency

- Every mutable event should include an increasing `sequence` number.
- Ignore events with a sequence lower than or equal to the last applied sequence for that stream.
- Include `race_id` in every race event and ignore events for a different race.
- Include unique transaction and bet IDs to prevent duplicate UI inserts after reconnect.

## 7. Betting Panel Architecture

### State Machine

```text
loading
  -> scheduled
  -> open
  -> submitting
  -> accepted
  -> open
  -> locked
  -> settled

error and disconnected are parallel UI states, not permission to reopen betting.
```

### Core State

```js
{
  raceId,
  marketStatus,
  closesAt,
  serverOffsetMs,
  selectedHorseId,
  stake,
  balance,
  minStake,
  maxStake,
  isSubmitting,
  acceptedBet,
  lastSequence,
  connectionState
}
```

### Countdown Strategy

Do not trust a client-only countdown.

1. Receive `server_time` and `closes_at`.
2. Calculate `serverOffsetMs = serverTime - Date.now()`.
3. Render remaining time using `closesAt - (Date.now() + serverOffsetMs)`.
4. Update the visible counter locally using an interval or animation frame.
5. Correct drift whenever `countdown_sync` or `betting_state` arrives.
6. Lock locally at zero, even if `stop_betting` is delayed.
7. Never unlock without a newer server event explicitly changing the market state to `open`.

### Anti-Cheat Locking

On `stop_betting`:

- Set market status to `locked` synchronously.
- Disable horse selection, stake input, quick-stake controls, and confirm button.
- Close the confirmation modal if it is open.
- Abort or ignore any pending client confirmation interaction.
- Keep an in-flight HTTP request visible as pending until the server responds.
- If the server rejects it because betting closed, show a neutral rejection message and restore the authoritative wallet snapshot.

Frontend locking improves UX but is not sufficient security. The backend must reject every bet submitted after its authoritative close time.

### Bet Submission

Proposed REST endpoint:

```text
POST /api/bets
```

```json
{
  "race_id": "race_object_id",
  "horse_id": "horse_object_id",
  "stake": 100,
  "client_request_id": "uuid"
}
```

`client_request_id` is required for idempotency. Disable repeated submission while the request is pending.

The successful response should return:

```json
{
  "bet": {},
  "wallet": {
    "balance": 1180,
    "currency": "points"
  }
}
```

Apply the response immediately and then reconcile with `wallet_updated` using transaction IDs.

### Validation

- Market must be `open`.
- Socket snapshot must not be stale.
- Horse must belong to the active race.
- Stake must be numeric and within min/max limits.
- Stake must not exceed displayed balance.
- Submit button remains disabled when disconnected unless backend explicitly supports safe REST-only betting.

## 8. Wallet Architecture

### Initial Load

Proposed endpoint:

```text
GET /api/wallet
```

### Realtime Updates

Listen for `wallet_updated` globally in `RealtimeProvider`, because balance changes may occur outside the current race room.

### Consistency Rules

- Treat server balance as authoritative.
- Do not permanently subtract balance optimistically before bet acceptance.
- A temporary pending amount may be displayed separately.
- Deduplicate updates by `transaction_id`.
- Refetch wallet after reconnect, bet rejection, sequence gaps, or settlement inconsistencies.

## 9. Live 2D Race Viewer Architecture

### Rendering Technology

Start with DOM and CSS transforms, not Canvas or Three.js.

Reasons:

- Only five horse runners.
- Easier accessibility and responsive labels.
- CSS `transform: translate3d(...)` is sufficient for smooth movement.
- Easier testing with Playwright and DOM state assertions.

Move to Canvas only if profiling shows sustained frame drops on target devices.

### Coordinate Model

The server sends normalized race distance, not pixels.

```text
progress = distance / trackLength
x = progress * availableTrackWidth
```

The frontend converts progress to pixels based on the current track width. This keeps the script independent from viewport size.

### Playback Clock

Use a single race clock for all five horses:

```text
raceElapsedMs = adjustedServerNow - startsAt
```

Do not create one timer per horse.

Use `requestAnimationFrame` to:

1. Calculate current race elapsed time.
2. Find the two surrounding checkpoints for each horse.
3. Interpolate distance between checkpoints.
4. Convert distance to progress.
5. Update horse transforms.
6. Derive current ranking from interpolated distance.

### Interpolation

For checkpoints A and B:

```text
t = (elapsed - A.time_ms) / (B.time_ms - A.time_ms)
distance = A.distance + (B.distance - A.distance) * easing(t)
```

Use linear interpolation for deterministic first implementation. Optional easing can be introduced only if the backend contract confirms it does not alter result ordering.

### Ranking

During playback:

- Sort by current interpolated distance descending.
- Break equal-distance ties using the most recent checkpoint timestamp or stable lane order.
- Throttle visual ranking updates to approximately 5-10 updates per second to avoid noisy reordering.
- Do not animate DOM lane order itself. Keep horses in physical lanes and update a separate ranking panel.

At finish:

- Replace calculated ranking with the authoritative `race_finished.results` order.
- Show Top 3 overlay only after receiving `race_finished` or a confirmed final snapshot.

### Race Script Validation

`raceScriptAdapter.js` must reject or normalize:

- Wrong race ID.
- Missing script version.
- Duplicate horse IDs or lanes.
- Non-monotonic checkpoint times.
- Decreasing distances.
- Distances outside `0..track_length`.
- Checkpoints beyond `duration_ms`.
- Missing start or finish checkpoint.

Invalid scripts should show an error state and request a fresh snapshot rather than attempting partial playback.

## 10. Race Viewer UI States

### Waiting

- Track visible but runners remain at the gate.
- Show connection state and scheduled start time.
- Betting panel may remain open.

### Betting Locked

- Freeze betting controls.
- Keep the countdown at `00:00`.
- Show a clear `Betting closed` status.
- Race viewer prepares runners without starting early.

### Racing

- Animate runners using transform only.
- Show race elapsed time, leader, progress, and connection status.
- Avoid decorative motion unrelated to race progress.

### Finished

- Stop the animation loop.
- Snap positions to final progress.
- Replace provisional ranking with official order.
- Display Top 3 overlay with horse name, lane, finish time, and position.
- Provide actions for official results and the next race.

### Reconnecting

- Never restart from zero.
- Freeze the last rendered frame or continue locally only for a short grace period.
- On reconnect, request a snapshot and calculate the correct position from server time.
- If the race has finished, skip playback and show the official result state.

## 11. Accessibility and Reduced Motion

- Race state must be understandable without animation.
- Provide a live ranking list with semantic text.
- Use `aria-live="polite"` for market lock, bet acceptance, wallet changes, and final results.
- Do not announce every frame or ranking fluctuation.
- With `prefers-reduced-motion`, update horse positions at checkpoint boundaries or at a reduced frequency without continuous tweening.
- Keep color independent labels for open, locked, disconnected, and finished states.
- Ensure all betting controls remain keyboard accessible.

## 12. Error and Recovery Strategy

### Socket Disconnect Before Betting Close

- Disable confirmation.
- Preserve user selection and stake locally.
- Show `Connection lost. Reconnecting...`.
- Refetch betting and wallet snapshots after reconnect.

### `stop_betting` Arrives During Confirmation

- Lock the form immediately.
- Allow the pending request to resolve.
- Use the HTTP response as the final acceptance/rejection result.

### Missing `race_script`

- Request race snapshot.
- Show track waiting state.
- Do not generate a random local race in production.

### Browser Refresh Mid-Race

- Fetch race snapshot.
- Receive or request script.
- Calculate elapsed time using `starts_at` and server offset.
- Render directly at the current positions.

### Background Tab

- Do not rely on accumulated animation frames.
- Recalculate positions from absolute server-adjusted time when the tab becomes visible.

## 13. Testing Plan

### Unit Tests

- Server clock offset and countdown formatting.
- Betting state reducer and illegal state transitions.
- `stop_betting` lock behavior.
- Wallet transaction deduplication.
- Race script validation.
- Checkpoint interpolation.
- Dynamic ranking and tie behavior.

### Component Tests

- All betting inputs disable immediately on `stop_betting`.
- Bet cannot submit when disconnected, locked, invalid, or over balance.
- Wallet display updates from socket events.
- Five runners render in stable lanes.
- Ranking updates without moving lane DOM order.
- Top 3 overlay appears only after authoritative finish.

### Integration Tests

- Join/leave race room.
- Reconnect before and during race.
- Duplicate and out-of-order socket events.
- Refresh during countdown and mid-race.
- Bet request crosses the close boundary.
- Wallet updates after accepted, rejected, and settled bets.

### Visual Tests

Required viewport checks:

- `1440x900`
- `1024x768`
- `390x844`

Verify:

- Betting panel does not cover the viewer.
- Countdown width remains stable.
- Horse labels remain inside lanes.
- Top 3 overlay fits without clipping.
- Mobile page has consistent edge margins.
- No controls or text overlap during reconnect and error states.

### Performance Targets

- Race animation should remain near 60 FPS on a mid-range laptop.
- No React tree rerender on every animation frame.
- Keep animation positions in refs, CSS variables, or motion values.
- React state should update only for coarse UI data such as ranking, status, and result overlays.

## 14. Implementation Phases

### Phase 0: Mock UI Foundation - Start Now

- [x] Add `VITE_REALTIME_MODE=mock` development configuration.
- [x] Define the transport interface and event constants.
- [x] Add deterministic mock race, horse, wallet, betting, script, and result fixtures.
- [x] Build `MockRaceTransport` with subscribe/unsubscribe cleanup.
- [x] Add development scenario controls for every important UI state.
- [x] Ensure no production socket dependency is installed yet.

### Phase 1: Spectator Race Room Redesign - Start Now

- [x] Refactor `PredictionDetail.jsx` into a race room container while preserving its route.
- [x] Keep `/spectator/predictions` as the market and race discovery screen.
- [x] Build the desktop 70/30 race-viewer and betting-panel layout.
- [x] Build the mobile stacked layout with stable track aspect ratio.
- [x] Add race header, mock connection status, countdown, wallet, ranking, and race-state labels.
- [ ] Add loading, empty, disconnected, locked, racing, finished, and error presentations.
- [x] Complete code-level spacing, margin, responsive, overflow, and overlap audit using the frontend design skill.
- [ ] Complete browser screenshot verification when Playwright or browser tooling is available.

### Phase 2: Mock Betting Panel - Start Now

- [x] Render five selectable horses from mock race data.
- [x] Add stake input and quick-stake controls.
- [x] Add min, max, numeric, and wallet-balance validation.
- [x] Add confirmation review without sending a real backend request.
- [x] Simulate accepted and rejected bets through the transport adapter.
- [x] Update mock balance after accepted bets.
- [x] Disable all controls synchronously on mock `stop_betting`.
- [x] Preserve selected horse and stake for reconnect/error demonstrations.

### Phase 3: Mock 2D Race Viewer - Start Now

- [x] Build five stable track lanes and horse runner components.
- [x] Validate the mock `race_script` with the planned adapter.
- [x] Implement one-clock checkpoint interpolation.
- [x] Animate runners with `translate3d` without React rerenders per frame.
- [x] Add throttled live ranking.
- [x] Add waiting gate, locked, racing, reconnecting, and finished states.
- [x] Show Top 3 overlay from mock `race_finished` results.
- [x] Add reduced-motion behavior.
- [x] Align all five runners at the shared start line before playback.
- [x] Use different finish timestamps and rank-based post-finish spacing.
- [x] Add oval rails, distance markers, live phase telemetry, leader callout, and distance-gap labels.

### Phase 4: Prototype Verification - Start Now

- [x] Run the production frontend build.
- [x] Verify the full deterministic mock timeline.
- [x] Verify immediate anti-cheat form locking.
- [x] Verify mock balance updates and duplicate-event protection.
- [x] Verify five runners, ranking updates, and Top 3 overlay.
- [x] Capture desktop and mobile screenshots.
- [x] Check canvas/track pixels or DOM positions to ensure the race viewer is nonblank and moving.
- [x] Complete final margin, spacing, clipping, text-overflow, and overlap audit.

Verification artifacts:

- `artifacts/phase-4/verification-report.json`
- `artifacts/phase-4/spectator-race-desktop-1440x900.png`
- `artifacts/phase-4/spectator-race-mobile-390x844.png`
- Repeatable harness: `node scripts/verify-spectator-phase4.mjs`

### Phase 5: Backend Contract Lock - Required Later

- [ ] Confirm Socket.IO versus native WebSocket.
- [ ] Confirm authentication handshake.
- [ ] Confirm race room join/leave protocol.
- [ ] Finalize event names, payloads, sequence handling, and error events.
- [ ] Finalize betting, wallet, bet history, and race snapshot REST APIs.
- [ ] Confirm currency rules, stake limits, odds model, and settlement behavior.

### Phase 6: Production Realtime Infrastructure - Required Later

- [ ] Add shared authenticated socket client.
- [ ] Add `RealtimeProvider` and connection state UI.
- [ ] Add race room subscriptions with cleanup.
- [ ] Add event sequence and snapshot reconciliation.
- [ ] Add reconnect handling.

### Phase 7: Production Betting Integration - Required Later

- [ ] Connect initial betting state and wallet snapshots.
- [ ] Implement server-adjusted countdown.
- [ ] Implement horse selection and stake validation.
- [ ] Implement idempotent bet submission.
- [ ] Lock all betting controls on `stop_betting` and local countdown zero.
- [ ] Reconcile wallet through HTTP response and `wallet_updated`.

### Phase 8: Production Race Playback Integration - Required Later

- [ ] Define and validate race script schema.
- [ ] Build five-lane responsive track.
- [ ] Implement one-clock checkpoint interpolation.
- [ ] Animate runners with GPU-friendly transforms.
- [ ] Add throttled live ranking.
- [ ] Add reconnect and refresh recovery.

### Phase 9: Production Finish and Settlement - Required Later

- [ ] Consume authoritative `race_finished` results.
- [ ] Display Top 3 overlay.
- [ ] Update settled bet and wallet states.
- [ ] Link to official result and next race.

### Phase 10: Production Verification - Required Later

- [ ] Unit and component tests pass.
- [ ] Reconnect, duplicate event, and close-boundary tests pass.
- [ ] Production build passes.
- [ ] Desktop/mobile screenshots pass spacing and overlap checks.
- [ ] Reduced-motion behavior is verified.
- [ ] No client-only path can place a bet after server lock.

## 15. Backend Dependencies and Blockers

The following do not currently exist in the documented backend. They block production integration but do not block the approved frontend mock UI prototype:

- Socket server and authentication contract.
- Betting state and `stop_betting` events.
- Wallet model, balance endpoint, and wallet events.
- Bet create/list/detail/settlement APIs.
- Odds and stake limit source.
- Race script generation and validation rules.
- Race snapshot, script replay, and reconnect recovery endpoints.
- Official `race_finished` event.

Frontend will build against a local mock transport now. Proposed event schemas should remain isolated behind adapters so contract changes do not require rewriting the UI.

## 16. Architecture Decisions

- Server time is authoritative for countdown and race playback.
- Backend validation is authoritative for anti-cheat and bet acceptance.
- Socket events update realtime state; REST snapshots recover state.
- One socket connection is shared across the authenticated app.
- Race animation uses one clock and deterministic checkpoint interpolation.
- DOM/CSS transforms are the initial 2D rendering approach.
- Final ranking always comes from the backend.
- During the mock prototype, final ranking comes from the deterministic mock `race_finished` event and is clearly development-only.
- UI components depend on a transport interface, never directly on Socket.IO or browser WebSocket APIs.
- Mock and production transports must emit the same normalized frontend domain events.
- Spectator UI changes remain scoped to `spectator.css` and existing routes where possible.
- Every implementation phase involving UI must use the frontend design skill and include a spacing, margin, responsive, and overlap audit.

## 17. Session Closeout - 2026-06-14

- Technology: React DOM, CSS oval geometry, PNG pixel horses, one `requestAnimationFrame` clock, checkpoint interpolation, and `translate3d` transforms.
- Start behavior: `starts_at` is three seconds in the future, all horses remain at distance `0`, and the viewer displays `Runners at the gate`.
- Finish behavior: horse-specific final checkpoints range from `56.00s` to `67.00s`; ranking uses finish time after runners complete.
- Presentation: broadcast phase, completion percentage, current leader, live distance gaps, double rails, distance markers, dust motion, and Top 3 overlay.
- Verification: production build and `node scripts/verify-race-detail-phase2.mjs` pass on desktop and mobile.
- Production phases 5 through 10 remain blocked by backend realtime, wallet, market, betting, snapshot, and settlement contracts.
