# Probability Model Metrics

## Model Identity

| Field | Value |
| --- | --- |
| Runtime folder | `app_probability_engine_history_v1_runtime` |
| Model name | `probability_engine_history_v1` |
| Model version | `history_v1.0.0` |
| Model type | LightGBM binary classifier |
| Intended use | Virtual betting odds for demo/simulation |
| Not intended for | Real-money betting or financial advice |

## Dataset

The model card reports a Hong Kong Jockey Club historical dataset.

| Split | Races | Runners | Period |
| --- | ---: | ---: | --- |
| Train | 1,057 | 12,969 | 2016-2017 |
| Validation | 452 | 5,472 | 2018 |
| Total | 1,509 | 18,441 | 2016-2018 |

## Validation Metrics

Source: `app_probability_engine_history_v1_runtime/artifacts/evaluation_metrics_history_v1.json`

| Metric | Value | Meaning |
| --- | ---: | --- |
| Log loss | 0.2784 | Lower is better for probability quality |
| Brier score | 0.0746 | Lower is better for probability calibration |
| Top-1 accuracy | 22.12% | The model favorite won 22.12% of validation races |
| Top-3 capture | 48.45% | The actual winner was in the model top 3 for 48.45% of validation races |
| Calibration MAE | 0.0590 | Average calibration error by bins |
| Mean entropy | 2.4757 | Probability spread across race participants |
| Favorite win rate | 22.12% | Same practical signal as top-1 accuracy |

## Baseline Comparison

| Baseline | Metric | Value |
| --- | --- | ---: |
| Uniform probability | Log loss | 0.2840 |
| Uniform probability | Brier score | 0.0756 |
| Previous baseline model | Log loss | 0.2804 |
| Previous baseline model | Brier score | 0.0750 |
| Previous baseline model | Top-1 accuracy | 18.60% |
| Previous baseline model | Top-3 capture | 44.90% |

## Improvement Summary

Compared with the previous baseline model:

| Metric | Baseline | History v1 | Delta |
| --- | ---: | ---: | ---: |
| Log loss | 0.2804 | 0.2784 | -0.0020 |
| Brier score | 0.0750 | 0.0746 | -0.0004 |
| Top-1 accuracy | 18.60% | 22.12% | +3.52 pp |
| Top-3 capture | 44.90% | 48.45% | +3.55 pp |

## Odds Rule

The runtime returns:

```text
fair_odds = 1 / win_probability
game_odds = fair_odds * 0.85
```

`game_odds` is an internal virtual betting price. It is not a real market odd.

## Current App Decision

```text
Use this model for demo virtual betting odds.
Do not present it as production-grade or real-money betting odds.
```

Reason:

- Validation uses a meaningful sample size: 452 races and 5,472 runners.
- Top-1 and top-3 metrics are better than baseline.
- Calibration is acceptable for simulation but still coarse.
- The app currently uses fallback/proxy fields for several model inputs.

## App Integration Status

Implemented in backend:

- `RaceOddsMarket` snapshot model.
- `POST /api/races/:id/odds/generate`.
- `GET /api/races/:id/odds`.
- Probability engine supports `local` Python runtime mode and deployed `http` mode.
- Current deployed model API: `https://son2110-horse-racing-probability-engine.hf.space/predict`.
- Model metrics are exposed through generated market metadata.
- `Bet` stores stake, odds snapshot, potential payout, payout amount, and settlement status.
- `POST /api/bets` deducts spectator wallet tokens when placing a virtual win bet.
- `POST /api/race-results/races/:raceId/publish` settles pending race bets after official results are published.

Still needed before full betting:

- Add FE bet slip/form and my-bets display.
- Add admin/ops market open-close controls if demo needs stricter betting windows.
- Replace demo fallback fields with real race-entry fields where possible.
