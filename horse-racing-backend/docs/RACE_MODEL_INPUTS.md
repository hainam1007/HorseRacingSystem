# Race Model Inputs

## Ownership

| Field | Stored on | Maintained by | Notes |
| --- | --- | --- | --- |
| `race_no` | Race | Admin | Official race number in the meeting |
| `venue_code` | Race | Admin | Short venue code such as `ST` or `HV` |
| `course` | Race | Admin | Track rail/course configuration |
| `race_class` | Race | Admin | Race class used by the model and rating K-factor |
| `going` | Race | Admin | Track condition |
| `surface` | Race | Admin | Turf, Dirt, or Synthetic |
| `current_rating` | Horse | System/Admin | Starts at 50; updated after published races |
| `default_gears` | Horse | Horse owner | Reusable horse equipment preference |
| `gears` | Registration | Horse owner/Admin | Race-specific authoritative gear declaration |
| `horse_no` | Registration | Admin finalize | Program number, unique within a race |
| `draw` | Registration | Admin finalize | Randomized starting gate position, unique within a race |
| `rating_snapshot` | Registration | Admin finalize | Freezes horse rating for that odds market |
| `declared_weight_kg` | Registration | Admin | Carried-weight input stored in kilograms |
| `weight_kg` | Jockey | Jockey/Admin approval | Profile body weight; not directly sent as declared weight |

## Gear Codes

```text
B  blinkers       BO blinkers one-sided   V  visor
TT tongue tie     CP cheek pieces         CO cornell collar
H  hood           P  pacifier             PC pacifier with cowls
PS pacifier one-sided                     SR shadow roll
SB sheepskin browband                     E  ear plugs
XB cross nose band                        CC chin strap
```

Gear belongs to the horse's race-day setup. The owner declares it; the referee verifies the
declared equipment during pre-race inspection. It is not jockey clothing.

## Entry Lifecycle

```text
owner pays/registers horse
  -> primary jockey accepts assignment
  -> owner confirms race-specific gear
  -> admin finalizes entries
  -> system assigns horse_no and random draw
  -> system snapshots rating, gear, and declared weight
  -> admin generates odds
  -> betting opens
```

Generated odds become `stale` when a model input changes. A mutation is rejected after the
market opens or when at least one bet exists.

## Units

MongoDB and APIs store kilograms:

```text
declared_weight_kg = 54.5
```

The deployed model expects pounds. Conversion occurs only in
`probabilityFeatureBuilderService`:

```text
declared_weight_lbs = round(declared_weight_kg * 2.20462, 2)
54.5 kg -> 120.15 lbs
```

`HorseCheck.weight` remains horse body weight from the referee health/equipment inspection and
is not reused as the model's carried weight.

## Rating Rule

New horses start at `50`. On publish, valid finishers are compared pairwise using Elo:

```text
expected = 1 / (1 + 10 ^ ((opponent_rating - horse_rating) / 40))
delta = round(K * (actual_score - expected_score))
delta is clamped to [-8, +8]
```

K by class is `10, 9, 8, 7, 6` for classes `1, 2, 3, 4, 5`.
Rating uses raw race position so a later administrative penalty does not rewrite measured race
performance. Every automatic or manual change is written to `HorseRatingHistory`.

## Migration

Preview and apply legacy-data migration:

```bash
npm run migrate:model-inputs -- --dry-run
npm run migrate:model-inputs
```

The migration backfills safe defaults and marks legacy generated odds as stale. It does not
pretend that old entries were finalized; admin must finalize them before regenerating odds.
