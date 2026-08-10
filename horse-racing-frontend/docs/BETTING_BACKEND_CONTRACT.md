# Fixed-Odds Betting Backend Contract

Last updated: `2026-07-03`.

## 1. Current Scope

The current production betting contract is fixed-odds `win` betting only.

Supported:

- Spectator selects exactly one horse to win.
- Backend requires an odds market for the race.
- Backend opens and closes betting through admin lifecycle endpoints.
- Backend deducts `stake_amount` from the spectator wallet immediately.
- Backend stores `odds_snapshot.game_odds` on the accepted bet.
- Backend calculates `potential_payout = stake_amount * odds_snapshot.game_odds`.
- Backend settles pending bets after official results are published.

Not supported yet:

- `place`
- `show`
- `quinella`
- `exacta`
- `trifecta`
- `superfecta`
- multi-race bets

The frontend must keep unsupported bet types hidden or explicitly unavailable until backend odds generation and settlement rules exist for them.

## 2. Frontend Contract Decisions

| Contract item | Frontend decision |
|---|---|
| Contract version | Integer `1` for normalized fixed-odds market snapshots |
| Currency | Backend `TOKEN`; development preview may use `PTS` |
| Odds format | Decimal odds |
| Display precision | Two decimal places for odds and payout preview |
| Payout preview | `stake_amount * game_odds`, rounded to two decimals for display |
| Accepted payout | Use backend `potential_payout` from the bet receipt |
| Accepted odds | Use backend `odds_snapshot.game_odds` from the bet receipt |
| Form safety | Fail closed unless race and market status are open and the user is a spectator |
| Receipt safety | Existing bets display stored `odds_snapshot`, not current market odds |

Frontend constants and validators live in:

```text
src/pages/spectator/betting/fixedOddsContract.js
```

## 3. API Flow

Admin lifecycle:

```text
POST /api/races/:id/odds/generate
POST /api/races/:id/betting/open
POST /api/races/:id/betting/close
POST /api/race-results/races/:raceId/publish
POST /api/bets/races/:raceId/settle
GET  /api/races/:id/odds
```

Spectator flow:

```text
GET  /api/races/:id/odds
GET  /api/wallet/me
POST /api/bets
GET  /api/bets/me
GET  /api/bets/me?race_id=:raceId
GET  /users/spectator/races/:raceId/results
GET  /users/spectator/races/:raceId/live-state
```

## 4. Odds Market Read

Frontend reads:

```text
GET /api/races/:id/odds
```

Important fields accepted by the frontend:

```json
{
  "data": {
    "market": {
      "_id": "market_id",
      "race_id": "race_id",
      "status": "open",
      "currency": "TOKEN",
      "min_stake": 5,
      "max_stake": 500,
      "closes_at": "2026-07-03T10:00:00.000Z",
      "server_time": "2026-07-03T09:55:00.000Z",
      "odds": [
        {
          "horse_id": "horse_id",
          "horse_no": 1,
          "horse_name": "Red Comet",
          "jockey_name": "A. Rider",
          "win_probability": 0.32,
          "fair_odds": 3.13,
          "game_odds": 2.85,
          "probability_rank": 1
        }
      ]
    }
  }
}
```

The frontend also tolerates equivalent top-level `market`, `data.odds`, and camelCase `serverTime` shapes where existing adapters already normalize them.

Frontend normalization rules:

- `generated` status maps to the locked `scheduled` UI state.
- Entries without a horse id or numeric `game_odds` are ignored.
- `game_odds` is the only odds value used for display, preview, and bet confirmation.
- `currency`, `min_stake`, and `max_stake` are read from the odds market snapshot first, then from race-list betting market data.
- `closes_at` plus optional `server_time` drives the countdown when available.
- If `closes_at` is missing, status fields remain authoritative.

## 5. Open Betting Payload

Admin opens betting with:

```text
POST /api/races/:id/betting/open
```

Request:

```json
{
  "min_stake": 5,
  "max_stake": 500,
  "currency": "TOKEN",
  "closes_at": "2026-07-03T10:00:00.000Z"
}
```

Frontend omits `closes_at` when the admin leaves the field blank. It validates positive stake limits, requires `max_stake >= min_stake`, and blocks invalid date/time values before the request is sent.

## 6. Place Bet

Frontend submits:

```text
POST /api/bets
```

Preferred request:

```json
{
  "race_id": "race_id",
  "horse_id": "horse_id",
  "stake_amount": 10
}
```

Alternative backend-compatible key:

```json
{
  "race_id": "race_id",
  "predicted_horse_id": "horse_id",
  "stake_amount": 10
}
```

Important response fields:

```json
{
  "data": {
    "bet": {
      "_id": "bet_id",
      "race_id": "race_id",
      "predicted_horse_id": "horse_id",
      "stake_amount": 10,
      "odds_snapshot": {
        "horse_id": "horse_id",
        "horse_name": "Red Comet",
        "game_odds": 2.85,
        "currency": "TOKEN"
      },
      "potential_payout": 28.5,
      "payout_amount": 0,
      "status": "pending",
      "submitted_at": "2026-07-03T09:56:00.000Z"
    },
    "wallet": {
      "token_balance": 120
    },
    "transaction": {}
  }
}
```

Accepted statuses for backend receipts and history:

```text
pending
won
lost
cancelled
```

## 7. My Bets

Frontend reads:

```text
GET /api/bets/me
GET /api/bets/me?race_id=:raceId
```

Rows should include:

```text
stake_amount
odds_snapshot.game_odds
odds_snapshot.horse_name
potential_payout
payout_amount
status
submitted_at
settled_at
```

History rendering rules:

- `won` uses backend `payout_amount`.
- `lost` shows zero payout.
- `pending` shows backend `potential_payout`.
- Currency prefers `odds_snapshot.currency`, then race betting market currency or active market currency, then `TOKEN`.
- Settled payout summaries are grouped by currency.

## 8. Betting Form Gates

Enable betting only when:

```text
user has spectator role
race.status is scheduled
race.betting_status is open
market.status is open
market close countdown has not expired
stake is inside min/max limits
wallet balance is sufficient
```

Disable betting when:

```text
market missing
market generated but not open
race running
race completed
wallet balance insufficient
stake below min
stake above max
market countdown reaches zero
```

## 9. Still Pending

- Run `scripts/verify-admin-betting-live-backend.mjs` with a disposable backend fixture, admin token, `BETTING_VERIFY_RACE_ID`, and `BETTING_VERIFY_MUTATE=1` when lifecycle mutation verification is safe.
- Replace any remaining development-preview mock betting transport only after backend realtime betting state/socket contracts are finalized.
- Add new frontend markets only after backend odds generation, request contracts, and settlement rules are confirmed for those bet types.
