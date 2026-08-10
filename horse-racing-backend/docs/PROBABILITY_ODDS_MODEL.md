# Probability Odds Model Integration

## Scope

This integration uses `app_probability_engine_history_v1_runtime` to generate pre-race odds for virtual betting.

It does not replace the current race engine. The race engine still creates the official demo race order/result. The probability model only creates an odds snapshot before betting opens.

## Model Summary

- Runtime: `app_probability_engine_history_v1_runtime`
- Model: LightGBM binary classifier
- Version: `history_v1.0.0`
- Output: `win_probability`, `fair_odds`, `game_odds`, `probability_rank`
- Betting price rule: `game_odds = fair_odds * 0.85`
- Intended use: simulated/virtual betting only

## Dataset And Validation

Source dataset from the model card:

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

| Metric | Value |
| --- | ---: |
| Log loss | 0.2784 |
| Brier score | 0.0746 |
| Top-1 accuracy | 22.12% |
| Top-3 capture | 48.45% |
| Calibration MAE | 0.0590 |
| Favorite win rate | 22.12% |

Decision:

```text
Good enough for demo odds and virtual betting.
Not good enough to present as real-money or market-grade betting odds.
```

## App To Model Mapping

The runtime requires 40 model features per horse. The app currently does not store every field, so the builder uses app data where possible and records fallback fields in `input_diagnostics.fallbacks_used`.

| Model field | Current source | Fallback |
| --- | --- | --- |
| race_date | `Race.race_date` | now |
| venue | `Race.venue` or `Race.location` | `ST` |
| race_no | `Race.race_no` or number parsed from race name | `1` |
| distance | `Race.distance` | `1200` |
| horse_no | approved registration order | index + 1 |
| horse_name | `Horse.name` | generated label |
| draw | persisted approved-registration order, assigned during odds generation | registration order fallback |
| rating | future horse/race-entry field | `50` |
| declared_weight | future race-entry field | `120` |
| jockey | accepted primary jockey user name | `Unknown Jockey` |
| trainer | owner stable/user name as trainer proxy | `Demo Trainer` |
| gears | future race-entry field | empty string |
| course | future race config | `B+2` |
| race_class | future race config | `5` |
| going | future race config | `Good` |
| surface | future race config | `Turf` |
| hist_* | published `RaceResult` before current race date | neutral defaults |

## Historical Features

Historical features are computed only from:

```text
RaceResult.status = published
Race.race_date < current Race.race_date
```

This prevents post-race leakage.

If no prior result exists, neutral demo defaults are used:

- count fields: `0`
- rate fields: `0`
- finish average: `8`
- days since last race: `365`

## API

Generate odds:

```text
POST /api/races/:id/odds/generate
Authorization: Bearer <admin token>
```

Generation is not blocked by model-input readiness. Missing race-entry fields use the
documented fallback values and are recorded in `input_diagnostics.fallbacks_used`.
At least two approved race registrations are still required because the model cannot
produce a race market with fewer runners.

Before the model request, approved registrations are sorted by `registered_at` ascending
and assigned persisted draw values `1..participant_count`. Earlier registrations therefore
receive lower draw numbers. Re-generating odds keeps the same registration-order rule.
The response exposes this mapping in `draw_assignment`.

`GET /api/races/:id/model-input-readiness` and entry finalization remain available as
optional data-quality tools for admin review; they are not prerequisites for generation.

Get odds:

```text
GET /api/races/:id/odds
Authorization: Bearer <token>
```

Reader roles:

```text
admin, horse_owner, jockey, race_referee, spectator
```

## Runtime Mode

The backend supports two probability engine modes:

```env
PROBABILITY_ENGINE_MODE=local
```

`local` runs `app_probability_engine_history_v1_runtime` through Python on the backend machine.

```env
PROBABILITY_ENGINE_MODE=http
PROBABILITY_ENGINE_URL=https://son2110-horse-racing-probability-engine.hf.space/predict
PROBABILITY_ENGINE_TIMEOUT_MS=30000
```

`http` calls the deployed Hugging Face model API. The deployed API returns:

```json
{
  "success": true,
  "data": {
    "race_id": "race_id",
    "horses": []
  }
}
```

The backend unwraps `data` and stores the returned odds in `RaceOddsMarket`.

## Betting Settlement Integration

Detailed flow and future backlog:

```text
docs/BETTING_FLOW_PLAN.md
```

Current backend behavior:

1. Admin generates odds for a race with `POST /api/races/:id/odds/generate`.
2. Admin opens betting with `POST /api/races/:id/betting/open`.
3. Spectator places a win bet with `POST /api/bets`.
4. Backend deducts `stake_amount` from the spectator wallet.
5. Backend stores the exact odds snapshot on the bet.
6. Admin or referee starts the race; backend auto-closes betting.
7. Admin publishes official race results with `POST /api/race-results/races/:raceId/publish`.
8. Backend settles pending bets as `won` or `lost`.
9. Winning bets credit the wallet with `potential_payout`.

Next useful improvements:

1. Betting time validation and close deadline rules.
2. Business registration lock window, recommended `race_date - 3 days`.
3. FE display for odds, win-bet form, and my-bets history.
4. Optional: add real app fields for `draw`, `rating`, `declared_weight`, `course`, `going`, `surface`, `race_class`, and trainer.
