# Race Engine

Race Engine locks registrations automatically when a race reaches its registration lock time.
When a referee starts a race, Race Engine creates one provisional finish order for FE 2D playback.
Draft official results are generated later after the assigned referee completes the race-day checks and submits the referee report.

## Environment

Set:

```env
INTERNAL_API_TOKEN=change_me_to_a_long_random_internal_token
RACE_ENGINE_CRON_ENABLED=true
```

Internal API requests must include:

```http
x-internal-token: <INTERNAL_API_TOKEN>
```

## Migration

Run once after deployment:

```bash
npm run migrate:race-engine
```

The migration backfills `registration_lock_at` from `race_date`, ensures `registration_locked`, and creates Race Engine indexes.

## Internal Endpoints

```http
POST /api/internal/races/:id/lock
GET /api/internal/races/:id/participants
POST /api/internal/races/:id/generate-draft-results
```

The internal generation endpoint also requires the race status to be `completed` or `finished`.

## Referee Flow

The assigned referee finalizes the race through the authenticated API:

```http
POST /api/race-results/races/:raceId/finalize
Authorization: Bearer <referee-token>
```

Supporting referee APIs:

```http
GET  /api/race-results/races/:raceId/participants
GET  /api/race-results/races/:raceId/readiness
POST /api/race-results/races/:raceId/apply-penalties
POST /api/races/:raceId/start
POST /api/races/:raceId/complete
```

`POST /api/races/:raceId/start` returns an `engine.race_run` object with
`participants` and `finish_order`. This is an input/output contract only. The
backend does not stream live coordinates. FE should animate the early and middle
segments locally, then align the finish segment to `finish_order`.
Starting a race always locks its registrations and closes betting atomically. It
does not require the scheduled registration lock time to have been reached first.

Finalization requires passed pre-race checks, post-race checks for every eligible participant,
a submitted referee report, and no unresolved violations. Confirmed penalties are calculated
from `raw_*` into `final_*`; repeating the calculation does not apply a penalty twice.
If a provisional race run exists, finalization uses its `finish_order` to create
draft RaceResult rows. If a race has no provisional run, finalization falls back
to the older random result generation path.

Violation penalties are selected by backend policy from `violation_type + severity`.
FE can call `POST /api/violations/penalty-preview` before submission. During-race
horse checks may set `requires_violation` and `auto_confirm_violation`; sensitive
types remain `under_review` until an admin decision.

The assigned referee can review draft results. Admin then confirms and publishes them.
Confirmation and publication are race-level transactions; per-result status
transitions are intentionally disabled. Confirmation audit and publication audit
are stored separately.

Admin can process every result in a race at once:

```http
POST /api/race-results/races/:raceId/confirm
POST /api/race-results/races/:raceId/publish
```

## Scheduler

The scheduler runs every minute when `RACE_ENGINE_CRON_ENABLED` is not `false`.

It finds races where:

```js
registration_locked === false
registration_lock_at <= now
```

For each race, it only locks registrations. It does not generate results before the race.

## Reproducible Demo Results

Race results remain random for demo behavior. Tests can set
`RACE_ENGINE_RANDOM_SEED` to make shuffle and finish times reproducible for a race.

## Spectator Live State

Spectator FE can poll:

```http
GET /users/spectator/races/:raceId/live-state
```

While a race is running or completed but unpublished, use `engine.finish_order`
for demo playback. After publication, use `official_results`.

## Data Migration

Preview legacy penalty/result changes without writing:

```bash
npm run migrate:violation-results -- --dry-run
```

Apply the migration after reviewing counts:

```bash
npm run migrate:violation-results
```

Unknown legacy penalty strings are preserved in `penalty.note` and moved to
`under_review`; they are not silently converted to warnings.
