# AI Probability Model Application

This document describes the AI probability model currently applied to the horse racing app: what it predicts, what input it needs, what output it returns, how win probability becomes odds, and how the backend uses the result for virtual betting.

## 1. Purpose

The model is used for pre-race virtual betting odds.

It does not decide the official race result. The official/demo race result still comes from the backend race engine and referee/result flow.

Current scope:

```text
Admin generates odds before betting opens.
Spectator places win-only bets using the generated odds snapshot.
Backend settles bets after official race results are published.
```

Not intended for:

```text
real-money gambling
financial advice
real-world horse race betting
post-race result generation
```

## 2. Model Summary

Runtime folder:

```text
app_probability_engine_history_v1_runtime
```

Backend integration:

```text
services/probabilityFeatureBuilderService.js
services/probabilityEngineService.js
services/raceOddsService.js
models/RaceOddsMarket.js
```

Model identity:

| Item | Value |
| --- | --- |
| Name | `probability_engine_history_v1` |
| Version | `history_v1.0.0` |
| Model type | LightGBM binary classifier |
| Target | `won`, where `1 = horse finished first`, `0 = not winner` |
| Dataset domain | HKJC thoroughbred racing |
| Dataset period | 2016-2018 |
| Output use | Simulated win probability and virtual fixed odds |

The model predicts each horse's chance of being the winner before the race starts.

## 3. Dataset And Metrics

Dataset summary:

| Item | Value |
| --- | ---: |
| Total races | 1,509 |
| Total runners | 18,441 |
| Training races | 1,057 |
| Training runners | 12,969 |
| Validation races | 452 |
| Validation runners | 5,472 |
| Validation period | 2018 |

Validation metrics:

| Metric | Value | Meaning |
| --- | ---: | --- |
| Log loss | 0.2784 | Lower is better for probability quality |
| Brier score | 0.0746 | Lower is better for calibration |
| Top-1 accuracy | 22.12% | The model's highest-probability horse won 22.12% of validation races |
| Top-3 capture | 48.45% | The actual winner was inside the model top 3 for 48.45% of validation races |
| Calibration MAE | 0.0590 | Average binned calibration error |
| Favorite win rate | 22.12% | Same practical signal as top-1 accuracy |

Interpretation:

```text
Good enough for a demo virtual betting market.
Not strong enough to claim production-grade or real-money betting accuracy.
```

## 4. Input Shape

The runtime expects one race payload with:

```text
race_info
horses[]
```

Example:

```json
{
  "race_info": {
    "race_date": "2026-07-04T10:00:00.000Z",
    "venue": "ST",
    "race_no": 1
  },
  "horses": [
    {
      "horse_id": "horse_id",
      "horse_no": 1,
      "horse_name": "Silver Comet",
      "draw": 1,
      "rating": 50,
      "declared_weight": 120,
      "distance": 1200,
      "jockey": "Ryan Moore",
      "trainer": "Demo Trainer",
      "gears": "",
      "course": "B+2",
      "race_class": 5,
      "going": "Good",
      "surface": "Turf",
      "hist_horse_prior_starts": 0,
      "hist_horse_prior_wins": 0,
      "hist_horse_prior_places": 0,
      "hist_horse_prior_win_rate": 0,
      "hist_horse_prior_place_rate": 0,
      "hist_horse_last_3_finish_avg": 8,
      "hist_horse_last_5_finish_avg": 8,
      "hist_horse_last_3_win_rate": 0,
      "hist_horse_last_5_win_rate": 0,
      "hist_horse_days_since_last_race": 365,
      "hist_horse_same_distance_starts": 0,
      "hist_horse_same_distance_win_rate": 0,
      "hist_horse_same_venue_starts": 0,
      "hist_horse_same_venue_win_rate": 0,
      "hist_horse_same_going_starts": 0,
      "hist_horse_same_going_win_rate": 0,
      "hist_jockey_prior_starts": 0,
      "hist_jockey_prior_wins": 0,
      "hist_jockey_prior_win_rate": 0,
      "hist_jockey_last_30d_win_rate": 0,
      "hist_jockey_last_90d_win_rate": 0,
      "hist_trainer_prior_starts": 0,
      "hist_trainer_prior_wins": 0,
      "hist_trainer_prior_win_rate": 0,
      "hist_trainer_last_30d_win_rate": 0,
      "hist_trainer_last_90d_win_rate": 0,
      "hist_jockey_trainer_prior_starts": 0,
      "hist_jockey_trainer_prior_wins": 0,
      "hist_jockey_trainer_prior_win_rate": 0
    }
  ]
}
```

## 5. Required Model Features

The model has 40 required features per horse.

Numeric features:

```text
draw
rating
declared_weight
distance
hist_horse_prior_starts
hist_horse_prior_wins
hist_horse_prior_places
hist_horse_prior_win_rate
hist_horse_prior_place_rate
hist_horse_last_3_finish_avg
hist_horse_last_5_finish_avg
hist_horse_last_3_win_rate
hist_horse_last_5_win_rate
hist_horse_days_since_last_race
hist_horse_same_distance_starts
hist_horse_same_distance_win_rate
hist_horse_same_venue_starts
hist_horse_same_venue_win_rate
hist_horse_same_going_starts
hist_horse_same_going_win_rate
hist_jockey_prior_starts
hist_jockey_prior_wins
hist_jockey_prior_win_rate
hist_jockey_last_30d_win_rate
hist_jockey_last_90d_win_rate
hist_trainer_prior_starts
hist_trainer_prior_wins
hist_trainer_prior_win_rate
hist_trainer_last_30d_win_rate
hist_trainer_last_90d_win_rate
hist_jockey_trainer_prior_starts
hist_jockey_trainer_prior_wins
hist_jockey_trainer_prior_win_rate
```

Categorical features:

```text
jockey
trainer
gears
course
race_class
going
surface
```

Identifier/output fields:

```text
race_date
venue
race_no
horse_id
horse_name
horse_no
```

## 6. How Backend Builds Input

Backend entry point:

```text
POST /api/races/:id/odds/generate
```

Service flow:

```text
raceOddsService.generateRaceOdds
  -> probabilityFeatureBuilderService.buildRaceProbabilityPayload
  -> probabilityEngineService.predictRace
  -> RaceOddsMarket upsert
  -> Race.betting_status = generated
```

Data sources:

| Model field | Current backend source |
| --- | --- |
| `race_date` | `Race.race_date`, fallback `now` |
| `venue` | `Race.venue_code`, then location normalization, fallback `ST` |
| `race_no` | `Race.race_no`, fallback first number parsed from race name or `1` |
| `distance` | `Race.distance`, fallback `1200` |
| `horse_no` | finalized `Registration.horse_no` |
| `horse_name` | `Horse.name` |
| `draw` | finalized `Registration.draw` |
| `rating` | `Registration.rating_snapshot`, then `Horse.current_rating`, fallback `50` |
| `declared_weight` | `Registration.declared_weight_kg * 2.20462`; model receives lbs |
| `jockey` | accepted primary jockey profile/user, fallback `Unknown Jockey` |
| `trainer` | owner stable/user as trainer proxy, fallback `Demo Trainer` |
| `gears` | `Registration.gears`, fallback empty string |
| `course` | `Race.course`, fallback `B+2` |
| `race_class` | `Race.race_class`, fallback `5` |
| `going` | `Race.going`, fallback `Good` |
| `surface` | `Race.surface`, fallback `Turf` |
| `hist_*` | published previous `RaceResult` before current race date |

Important:

```text
Only approved registrations are used.
Only accepted primary jockey assignments are used.
At least two approved registrations are required.
Entries must be finalized before odds generation.
Historical features use only prior published results where race_date < current race_date.
```

Fallback tracking:

```text
RaceOddsMarket.input_diagnostics.fallbacks_used
RaceOddsMarket.odds[].fallbacks_used
```

These fields help explain where the app used defaults instead of real historical/app data.

## 7. How Win Probability Is Produced

Runtime flow inside `app_probability_engine_history_v1_runtime`:

```text
JSON payload
  -> validate required race_info and horse features
  -> convert horses to DataFrame
  -> target encode categorical features
  -> standardize numeric features
  -> LightGBM model predicts one score per horse
  -> softmax normalizes scores within the race
  -> win_probability per horse
```

Formula:

For each horse `i`, the model returns a score:

```text
score_i = LightGBM(features_i)
```

Then the runtime normalizes all horses in the same race:

```text
win_probability_i = exp(score_i - max_score) / sum(exp(score_j - max_score))
```

Why softmax:

```text
The app needs probabilities across one race to sum to 1.
If one horse's probability goes up, the others must share the remaining probability.
```

Validation:

```text
sum(win_probability for all horses in race) must be approximately 1.
Backend rejects model output if total differs from 1 by more than 0.0001.
```

Known caveat:

```text
The current runtime softmaxes the LightGBM output. If LightGBM output is already probability-like, this can compress probability differences. This is acceptable for demo odds but should be revisited before stronger betting claims.
```

## 8. Output Shape

Runtime output:

```json
{
  "race_id": "2026-07-04T10:00:00.000Z_ST_1",
  "race_date": "2026-07-04T10:00:00.000Z",
  "venue": "ST",
  "race_no": 1,
  "horses": [
    {
      "horse_no": 1,
      "horse_name": "Silver Comet",
      "win_probability": 0.24,
      "fair_odds": 4.1666666667,
      "game_odds": 3.5416666667,
      "probability_rank": 1
    }
  ]
}
```

Backend stores mapped output in `RaceOddsMarket.odds[]`:

```json
{
  "horse_id": "horse_id",
  "jockey_id": "jockey_id",
  "horse_no": 1,
  "horse_name": "Silver Comet",
  "jockey_name": "Ryan Moore",
  "win_probability": 0.24,
  "fair_odds": 4.16,
  "game_odds": 3.54,
  "probability_rank": 1,
  "fallbacks_used": []
}
```

## 9. Odds Formula

The model produces:

```text
win_probability = p
```

Fair decimal odds:

```text
fair_odds = 1 / p
```

Example:

```text
p = 0.25
fair_odds = 1 / 0.25 = 4.00
```

Game odds:

```text
game_odds = fair_odds * 0.85
```

The `0.85` factor is the app payout factor. It means the game pays less than pure fair odds.

Example:

```text
p = 0.25
fair_odds = 4.00
game_odds = 4.00 * 0.85 = 3.40
```

Clamp rule in runtime:

```text
game_odds is clamped to [1.01, 99.0]
fair_odds for p <= 0 returns 99.0
```

Meaning:

```text
fair_odds = theoretical break-even decimal odds.
game_odds = app's virtual betting payout odds.
```

## 10. Betting Payout Formula

When a spectator places a win bet:

```text
potential_payout = stake_amount * odds_snapshot.game_odds
```

Example:

```text
stake_amount = 10
game_odds = 3.40
potential_payout = 10 * 3.40 = 34
```

The backend stores odds snapshot on the bet:

```text
Bet.odds_snapshot
Bet.potential_payout
```

This prevents payout from changing if admin regenerates odds later.

Settlement:

```text
If predicted_horse_id == official winner horse_id:
  bet status = won
  wallet credit = potential_payout

Otherwise:
  bet status = lost
  wallet credit = 0
```

## 11. App Flow

Current recommended flow:

```text
1. Admin creates tournament/round/race.
2. Horse owner registers horses.
3. Admin approves registrations.
4. Horse owner assigns primary jockey.
5. Jockey accepts assignment.
6. Referee/admin prepares race day flow.
7. Admin generates odds:
   POST /api/races/:raceId/odds/generate
8. Backend builds model payload and calls probability engine.
9. Backend stores RaceOddsMarket with status generated.
10. Admin opens betting:
    POST /api/races/:raceId/betting/open
11. Spectator places win bet:
    POST /api/bets
12. Race starts:
    POST /api/races/:raceId/start
13. Backend auto closes betting market.
14. Race result is finalized/published.
15. Backend settles pending bets.
```

API endpoints:

```text
POST /api/races/:id/odds/generate
GET  /api/races/:id/odds
POST /api/races/:id/betting/open
POST /api/races/:id/betting/close
POST /api/bets
GET  /api/bets/me
POST /api/race-results/races/:raceId/publish
POST /api/bets/races/:raceId/settle
```

## 12. Runtime Modes

The backend supports two model call modes.

Local mode:

```text
PROBABILITY_ENGINE_MODE=local
PROBABILITY_ENGINE_PYTHON=python
```

Backend writes a temp JSON file, runs Python locally, then reads output JSON.

HTTP mode:

```text
PROBABILITY_ENGINE_MODE=http
PROBABILITY_ENGINE_URL=https://son2110-horse-racing-probability-engine.hf.space/predict
PROBABILITY_ENGINE_TIMEOUT_MS=30000
```

Backend sends JSON payload to deployed model API and unwraps:

```json
{
  "success": true,
  "data": {
    "horses": []
  }
}
```

## 13. What The App Must Have For Better Model Quality

The app now stores the core race-entry fields needed by the model. Historical fields still
depend on having enough prior published race results.

Implemented fields:

```text
Registration.horse_no
Registration.draw
Registration.rating_snapshot
Registration.declared_weight_kg
Registration.gears
Race.venue_code
Race.course
Race.race_class
Race.going
Race.surface
Horse.current_rating
Horse historical performance
Jockey historical performance
Trainer or stable historical performance
```

Minimum operational requirements:

```text
Race has at least two approved registrations.
Race entries are finalized by admin.
Primary jockey assignments are accepted.
Published historical results should have race_date, horse_id, jockey_id, position/final_position.
Odds should be generated before betting opens.
FE must use backend odds from RaceOddsMarket, not call model directly.
```

## 14. Data Leakage Rules

Do not use post-race information to generate pre-race odds.

Allowed before race:

```text
horse profile
jockey profile
owner/stable info
race date
race distance
race venue
declared race condition
past published race results before current race date
accepted pre-race participants
```

Not allowed before race:

```text
current race final position
current race finish time
current race prize
current race violations
current race official result
post-race checks
admin/referee post-race report
```

Backend rule:

```text
Historical features only use published RaceResult where prior race date < current race date.
```

## 15. Limitations

Current limitations:

```text
Model trained on HKJC 2016-2018 data, not this app's real domain data.
Current app uses fallbacks for several race-entry features.
Probabilities are demo-grade, not real-money grade.
Calibration is imperfect.
Only win probability is supported.
Place/show/exacta/trifecta are not supported by this model yet.
HTTP model deployment can be slow or asleep on free hosting.
```

Business limitation:

```text
The app currently supports win-only fixed odds betting.
Do not expose place/show betting until model or odds rules explicitly support top-2/top-3 probabilities.
```

## 16. Verification Checklist

Before using model odds in a demo:

```text
1. Race has approved registrations.
2. Jockey assignments are accepted.
3. Backend env points to correct probability engine mode.
4. POST /api/races/:id/odds/generate returns success.
5. RaceOddsMarket.status is generated.
6. sum(win_probability) is approximately 1.
7. RaceOddsMarket.input_diagnostics.fallbacks_used is reviewed.
8. Admin opens betting.
9. Spectator places win bet.
10. Race start auto closes betting.
11. Result publish settles pending bets.
```

Useful tests:

```text
npm.cmd test
```

For the runtime package itself:

```text
cd app_probability_engine_history_v1_runtime
python -m unittest tests/test_runtime_engine.py
```

Expected runtime invariants:

```text
output has win_probability, fair_odds, game_odds, probability_rank
sum(win_probability) == 1 per race
fair_odds ~= 1 / win_probability
game_odds ~= fair_odds * 0.85, clamped to [1.01, 99.0]
```
