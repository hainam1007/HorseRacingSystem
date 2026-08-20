# 2D Race Renderer - Reusable Specification And Prompt

This document summarizes the reusable 2D race-rendering feature currently used by the spectator race detail page. It is intended for moving the capability into another project.

## Ready-to-copy prompt

```text
Build a production-ready 2D horse-race renderer for a React application.

Use DOM elements and CSS transforms, not Canvas or Three.js. The track must be an oval with up to 8 stable lanes. Each runner stays in its assigned lane and is positioned with translate3d(x, y, 0) and rotation based on the oval tangent. Do not rerender React components on every animation frame.

The backend is authoritative. It returns a versioned race_script with starts_at, duration_ms, track_length, and one checkpoint list per horse. Validate the script before playback: matching race ID, 1-8 unique horses, unique integer lanes, increasing time values, non-decreasing distances, first checkpoint {0, 0}, and final checkpoint at track_length.

Use one requestAnimationFrame clock for all runners. Derive elapsed time from Date.now() - starts_at, locate each horse's surrounding checkpoints, linearly interpolate distance, convert the normalized distance to an oval coordinate, and update only the marker transform. Derive a live ranking from interpolated distance and refresh its React state at most 7 times per second. Support prefers-reduced-motion by updating no more than twice per second.

The race logic is three sections and must be generated on the backend:
- Section 1, distance 0-350/1000: higher normalized win_probability gives a speed multiplier from 0.90 to 1.10.
- Section 2, distance 350-700/1000: use a persisted seeded random multiplier from 0.70 to 1.50.
- Section 3, distance 700-1000/1000: speed is 50% fixed pace and 50% probability pace, producing a multiplier from 0.90 to 1.10.
- Calculate each section time as sectionDistance / (baseSpeed * multiplier), add the three values to get finish_time, and rank ascending by finish_time.
- Persist the seed, participants, finish order, and generated script so every viewer sees the same race after refresh or reconnect.

Show these UI states: waiting at the gate, countdown, racing, awaiting official result, official result, reconnecting, and invalid script. Show live elapsed time, leader, ranking, and a final Top 3/official-results overlay. Once official results arrive, replace provisional ranking with the backend result; penalties may alter the provisional engine order.

Provide unit tests for deterministic seeded output, checkpoint validation, interpolation, three-stage speed rules, and an upset where the second-stage random value lets a lower-probability horse win. Verify desktop and mobile layouts and confirm the production build passes.
```

## Backend contract

The renderer needs this payload from a REST snapshot or realtime event:

```json
{
  "race_id": "race-uuid",
  "script_version": 1,
  "starts_at": "2026-08-17T09:00:00.000Z",
  "duration_ms": 64000,
  "track_length": 1000,
  "source": "three_section_probability_v1",
  "horses": [
    {
      "horse_id": "horse-uuid",
      "name": "Storm Arrow",
      "lane": 1,
      "win_probability": 0.34,
      "checkpoints": [
        { "time_ms": 0, "distance": 0 },
        { "time_ms": 20500, "distance": 350 },
        { "time_ms": 41800, "distance": 700 },
        { "time_ms": 61000, "distance": 1000 }
      ]
    }
  ]
}
```

Do not generate a different random race in the browser. The browser may interpolate server checkpoints only.

## Current implementation map

| Responsibility | Current file |
| --- | --- |
| Three-section timing, ranking, deterministic seed, server script | `horse-racing-backend/services/raceEngineService.js` |
| Persist RaceRun, participants, and finish order atomically | `horse-racing-backend/repositories/raceRunRepository.js` |
| Add `race_script` to spectator live-state | `horse-racing-backend/services/userService.js` |
| Connect live-state script to the viewer | `src/pages/spectator/RaceDetail.jsx` |
| Validate script payload | `src/pages/spectator/live-race/raceScriptAdapter.js` |
| One-clock interpolation and oval positioning | `src/pages/spectator/live-race/useRacePlayback.js` |
| Track, runners, live ranking, and official overlay | `src/pages/spectator/live-race/RaceViewer2D.jsx` |

## Important integration rules

- Keep the final result backend-authoritative. The frontend ranking is provisional until official results are published.
- Store a seed on every race run. A random value regenerated in the frontend will desynchronize viewers.
- Send normalized distance rather than pixel positions, so the track remains responsive.
- Use a fallback only for missing development data. Production should show an error or waiting state for an invalid/missing script.
- The current app polls live state and published results every three seconds. A WebSocket can replace polling later without changing the renderer contract.
