# Test Race Model Input Flow

## Automated Coverage

Run:

```bash
npm test
```

Covered behavior:

```text
race/model enum validation
jockey weight_kg range validation
gear code and declared-weight validation
entry readiness remains false before finalize
finalize assigns unique draws and rating/gear/weight snapshots
kg-to-lbs conversion for the AI runtime
generated odds become stale after an input mutation
input mutations are blocked after a bet exists
pairwise Elo rating updates and upset behavior
publish succeeds even if asynchronous bet settlement fails
legacy migration inference
```

Run the configured integration flow separately:

```bash
npm run test:e2e:model-input-betting
```

This test connects to the configured MongoDB database and probability-engine URL, then verifies:

```text
five approved entries are finalized with unique draws
the deployed model receives kg converted to pounds and returns normalized odds
admin adjusts final game odds while generated odds remain auditable
a spectator stake is deducted from the TOKEN wallet
confirmed results are published and the winning bet is settled
all five horse ratings and audit rows are updated
all test data is removed in teardown
```

To verify the bundled runtime while keeping the same Atlas transaction flow on PowerShell:

```powershell
$env:PROBABILITY_ENGINE_MODE='local'; npm.cmd run test:e2e:model-input-betting
```

Latest verification on July 19, 2026:

```text
npm test: 102/102 passed
Atlas + bundled probability runtime E2E: 4/4 passed
Hugging Face /health and /predict: HTTP 503 Service Temporarily Unavailable
```

The Hugging Face public metadata reported the Space as `RUNNING` and its domain as `READY`, but
the Space load balancer still returned `503`. Re-run the default E2E after restarting or rebuilding
the Space; do not treat the local-runtime pass as proof that the public endpoint is healthy.

## Manual API Flow

All requests require an admin bearer token unless another role is shown.

### 1. Configure Race

```text
PATCH /api/races/:raceId
```

Input:

```json
{
  "race_no": 2,
  "venue_code": "ST",
  "course": "B+2",
  "race_class": "5",
  "going": "Good",
  "surface": "Turf",
  "distance": 1200
}
```

Expected output:

```json
{
  "success": true,
  "message": "Race updated successfully",
  "data": {
    "race": {
      "race_no": 2,
      "venue_code": "ST",
      "model_input_version": 1
    }
  }
}
```

### 2. Declare Gear

Horse owner:

```text
PATCH /api/horse-owner/race-registrations/:registrationId/entry-details
```

Input:

```json
{
  "gears": ["B", "TT"]
}
```

Expected output contains the updated registration with the same gear array.

### 3. Read Readiness

```text
GET /api/races/:raceId/model-input-readiness
```

Expected before finalize:

```json
{
  "success": true,
  "data": {
    "entries_finalized": false,
    "ready": false,
    "participant_count": 5,
    "participants": [
      {
        "horse_name": "Northern Dancer",
        "current_rating": 50,
        "default_gears": ["B"],
        "primary_jockey": {
          "name": "William Buick"
        }
      }
    ]
  }
}
```

### 4. Finalize Entries

```text
POST /api/races/:raceId/entries/finalize
```

Expected output:

```json
{
  "success": true,
  "data": {
    "already_finalized": false,
    "readiness": {
      "entries_finalized": true,
      "ready": true
    },
    "entries": [
      {
        "horse_no": 1,
        "draw": 4,
        "rating_snapshot": 50,
        "declared_weight_kg": 54.5,
        "gears": ["B", "TT"]
      }
    ]
  }
}
```

Every approved registration must have an accepted primary jockey. A second finalize call returns
`already_finalized=true` and does not randomize draw again.

### 5. Correct One Entry

```text
PATCH /api/registrations/:registrationId/race-entry
```

Input:

```json
{
  "horse_no": 1,
  "draw": 4,
  "declared_weight_kg": 54.5,
  "gears": ["B", "TT"]
}
```

Duplicate `horse_no` or `draw` returns `409`. Weight outside `40..75` kg or unsupported gear
codes returns `400`.

### 6. Generate Odds

```text
POST /api/races/:raceId/odds/generate
```

The stored `RaceOddsMarket.input_snapshot` should contain:

```json
{
  "horses": [
    {
      "horse_no": 1,
      "draw": 4,
      "rating": 50,
      "declared_weight": 120.15,
      "gears": "B/TT"
    }
  ]
}
```

`declared_weight` is pounds only in the AI payload. MongoDB registration data remains `54.5` kg.

### 7. Publish And Verify Rating

After the referee result lifecycle and admin publish:

```text
POST /api/race-results/races/:raceId/publish
GET /api/admin/horses/:horseId/rating-history
```

Publish output includes:

```json
{
  "data": {
    "rating_update": {
      "applied": true,
      "changes": [
        {
          "rating": 50,
          "rating_delta": 4,
          "new_rating": 54
        }
      ]
    }
  }
}
```

The history endpoint returns automatic `published_result` and manual `manual_admin` audit rows.

## Migration Check

```bash
npm run migrate:model-inputs -- --dry-run
```

Expected: counts only, no writes. Run without `--dry-run` once per environment before using the
new entry-finalization flow on legacy data.
