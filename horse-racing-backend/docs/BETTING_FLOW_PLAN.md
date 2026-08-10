# Betting Flow Plan

## Current Scope

Current betting is intentionally limited to **fixed-odds win bet only**.

```text
Spectator selects one horse to win.
Backend stores odds snapshot at bet time.
Backend deducts wallet immediately.
Backend settles won/lost after official race result is published.
```

The model currently outputs:

```text
win_probability
fair_odds
game_odds
probability_rank
```

Because the model predicts win probability only, the first production/demo betting type should remain:

```text
win
```

Do not enable `place`, `show`, `exacta`, `quinella`, `trifecta`, or multi-race bets until their odds and settlement rules are explicitly implemented.

## Current API Flow

### 1. Prepare Race Participants

Before odds are generated, the race should already have stable participants:

```text
approved registrations
accepted primary jockey assignments
pre-race checks completed or ready for final eligibility review
```

Current backend minimum for odds generation:

```text
At least two approved race registrations.
```

### 2. Generate Odds

```text
POST /api/races/:id/odds/generate
Authorization: Bearer <admin_token>
```

Behavior:

```text
Backend builds model payload from race, registrations, accepted jockey assignments, and prior published results.
Backend calls probability engine in local or HTTP mode.
Backend saves a RaceOddsMarket snapshot.
Race betting status becomes generated.
```

### 3. Read Odds

```text
GET /api/races/:id/odds
Authorization: Bearer <token>
```

Reader roles:

```text
admin
horse_owner
jockey
race_referee
spectator
```

### 4. Place Win Bet

```text
POST /api/bets
Authorization: Bearer <spectator_token>
```

Input:

```json
{
  "race_id": "race_id",
  "horse_id": "horse_id",
  "stake_amount": 10
}
```

Behavior:

```text
Requires odds market status open.
Rejects running/completed/finished races.
Deducts stake_amount from spectator wallet.
Stores odds_snapshot on Bet.
potential_payout = stake_amount * odds_snapshot.game_odds.
```

### 5. Publish Result And Settle Bets

```text
POST /api/race-results/races/:raceId/publish
Authorization: Bearer <admin_token>
```

Behavior:

```text
Race results move to published.
Prize awards are calculated.
Pending race bets are settled.
Winning horse bet is marked won.
Other pending bets are marked lost.
Winning bets credit wallet with potential_payout.
```

Manual admin settlement is also available:

```text
POST /api/bets/races/:raceId/settle
Authorization: Bearer <admin_token>
```

This should be used for admin repair/debug only. Normal flow should settle through result publish.

## Recommended Business Timeline

Use `T` as `race_date`.

```text
T - 7d to T - 3d:
  Horse owners register horses.

T - 3d:
  Registration closes.
  Participant list becomes stable.

T - 2d to T - 1d:
  Referee performs pre-race checks.
  Failed horses should be excluded from race eligibility.

T - 1d:
  Admin generates odds.
  Betting market opens.

T - 10m or race start:
  Betting market closes.

T:
  Referee/admin starts race.

After race:
  Referee completes report/checks.
  Admin publishes results.
  Backend settles bets.
```

For demo mode, this timeline can be shortened, but the logical order should stay the same:

```text
registration locked
pre-check completed
odds generated
betting open
betting closed before start
race started
result published
bet settled
```

## Implemented Backend Controls

### Betting Market Controls

```text
POST /api/races/:id/betting/open
POST /api/races/:id/betting/close
```

Behavior:

```text
open:
  Requires generated or already-open odds.
  Sets RaceOddsMarket.status = open.
  Sets Race.betting_status = open.
  Sets betting_market opens_at/min_stake/max_stake/currency.

close:
  Sets RaceOddsMarket.status = closed.
  Sets Race.betting_status = closed.
  Prevents new bets.
```

### Auto Close On Race Start

When the race starts:

```text
POST /api/races/:id/start
```

Backend should automatically:

```text
RaceOddsMarket.status = closed
Race.betting_status = closed
Race.betting_market.status = closed
```

This prevents late bets after the race has begun.

## Current Gaps

These are intentionally left for later work.

### Betting Time Validation

Current backend does not enforce betting open/close by `race_date` or `betting_closes_at`.

Later behavior should add:

```text
Reject opening betting after race start.
Reject bets after betting_closes_at.
Default betting_closes_at to race_date minus an agreed cutoff.
```

### Registration Lock Window

Current code uses a short lock offset for registration. Business-friendly default should be:

```text
registration_lock_at = race_date - 3 days
```

Keep demo APIs to reopen/schedule races quickly:

```text
POST /api/races/registration-demo-mode
POST /api/races/:id/open-registration-demo
```

### Pre-Check Eligibility Before Odds

Future odds generation should optionally require:

```text
pre-race check passed for every participant
```

or at least exclude failed/scratched horses from the odds payload.

### Frontend Integration

FE should call backend only, not the Hugging Face model directly:

```text
GET /api/races/:id/odds
POST /api/bets
GET /api/bets/me
```

FE should hide or disable unsupported bet types.

Supported now:

```text
win
```

Unsupported for now:

```text
place
show
quinella
exacta
trifecta
superfecta
daily_double
pick_3+
```

## Later Betting Types

Possible roadmap:

```text
Phase 1: win only
Phase 2: place/show with explicit rule-based odds or upgraded model top2/top3 probabilities
Phase 3: quinella/exacta
Phase 4: trifecta/superfecta
Phase 5: multi-race bets
```

Do not present `place/show` as model-predicted probabilities unless the model is upgraded to output:

```text
top2_probability
top3_probability
place_odds
show_odds
```

## Current Verified Demo Data

Generated odds was verified against MongoDB Atlas and the deployed Hugging Face model API:

```text
Race: Review Tournament 4 Start Ready Race
Race ID: 6a3f696905f35d97a7e6bbc7
Market ID: 6a44ceb1149c9db16b9f361f
Participant count: 6
Probability total: 0.9999999999999999
Top pick: Review Ember
```

The deployed model API used by backend HTTP mode:

```text
https://son2110-horse-racing-probability-engine.hf.space/predict
```
