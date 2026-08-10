# Test Prize Flow

## Business Rule

- Prize belongs to `Race`, not `Tournament`.
- `Tournament` and `Round` only organize the race structure.
- When Admin publishes race results, backend automatically calculates `PrizeAward`.
- Default split if Admin only enters `prize_pool`: positions 1-5 receive `60% / 20% / 11% / 6% / 3%`.
- Each award is split into `owner_amount = 90%` and `jockey_amount = 10%`.

## APIs To Test

### 1. Create Or Update Race With Prize

```text
POST /api/races
PATCH /api/races/:id
```

Input:

```json
{
  "tournament_id": "tournament_id",
  "round_id": "round_id",
  "name": "Royal Mile Stakes",
  "race_date": "2026-07-01T09:00:00.000Z",
  "distance": 1600,
  "max_participants": 6,
  "prize_pool": 100000000,
  "prize_currency": "VND"
}
```

Expected output includes:

```json
{
  "race": {
    "_id": "race_id",
    "prize_pool": 100000000,
    "prize_currency": "VND"
  }
}
```

### 2. Configure Custom Race Prize Distribution

```text
POST /api/prizes/races/:raceId/config
```

Input:

```json
{
  "prize_pool": 100000000,
  "prize_currency": "VND",
  "prize_distribution": [
    { "position": 1, "percent": 60, "label": "Winner" },
    { "position": 2, "percent": 25, "label": "Second" },
    { "position": 3, "percent": 15, "label": "Third" }
  ]
}
```

Expected output:

```json
{
  "prizes": [
    { "position": 1, "amount": 60000000 },
    { "position": 2, "amount": 25000000 },
    { "position": 3, "amount": 15000000 }
  ]
}
```

### 3. Publish Results And Auto Calculate Awards

```text
POST /api/race-results/races/:raceId/publish
```

Expected output includes:

```json
{
  "race_id": "race_id",
  "results": [],
  "prize_awards": {
    "created_count": 3,
    "awards": [
      {
        "position": 1,
        "gross_amount": 60000000,
        "owner_amount": 54000000,
        "jockey_amount": 6000000,
        "status": "calculated"
      }
    ]
  }
}
```

### 4. Approve Awards

```text
POST /api/prizes/races/:raceId/approve
```

Expected output:

```json
{
  "awards": [
    { "status": "approved" }
  ]
}
```

### 5. Mark Award Paid

```text
POST /api/prizes/awards/:awardId/mark-paid
```

Expected output:

```json
{
  "award": {
    "status": "paid",
    "paid_at": "2026-06-30T00:00:00.000Z"
  }
}
```

## FE Check

- Admin Race Schedule form has `Prize pool` and `Prize currency`.
- Spectator race detail shows `Race prize` when `race.prize_pool > 0`.
- FE prize API helper exists at `src/api/prizeApi.js`.
