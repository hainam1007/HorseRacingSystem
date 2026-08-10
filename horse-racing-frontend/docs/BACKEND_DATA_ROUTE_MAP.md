# Backend Data Route Map

This map is the accuracy checklist for replacing frontend mock data with the seeded backend database.

## Seed Snapshot

After running:

```bash
cd D:\WDP\horse-racing-backend
npm run seed:demo:reset
```

the current demo database contains:

```text
Users: 19
Jockeys: 12
Horses: 42
Tournaments: 15
Rounds: 30
Races: 45
Open betting markets: 10
Registrations: 42
Jockey assignments: 23
Race results: 15
Horse checks: 18
Violations: 11
Referee reports: 15
Bets: 18
Prizes: 14
Prize awards: 14
Notifications: 18
```

## Owner Routes

| Route | Screen | Current mock/fallback | API/source to use | Seed records |
|---|---|---|---|---|
| `/owner` | Owner dashboard | `ownerData.js` | horses, registrations, jockey assignments, race results | `owner1@racing.test` has 8 horses, 7 registrations, several assignment states |
| `/owner/horses` | Horse list | `ownerData.js` fallback | `GET /horse-owner/horses` | Thunder Bolt, Silver Wind, Night Arrow, Ember Crown, Copper Comet, Misty Lane, Oak Runner, Sea Glass |
| `/owner/registrations` | Race registration | sample fallback for tournaments/races | `GET /horse-owner/tournaments`, `GET /horse-owner/tournaments/:id/races`, `GET /registrations` | pending, approved, rejected, cancelled registrations |
| `/owner/jockeys` | Jockey invitation | `ownerJockeys` fallback | `GET /horse-owner/jockeys`, `GET /registrations`, `GET /jockey-assignments` | Thunder Bolt / Spring Heat 1 and Copper Comet / Autumn Opener are approved with no jockey |
| `/owner/schedule` | Owner schedule | `ownerSchedule` | derive from approved registrations and assignments | Spring, Autumn, Derby, Coastal, Night races |
| `/owner/results` | Owner results | `ownerResults` | race results for owner horses | Oak Runner confirmed, Golden Mane/River Flash/Shadow Lake published |
| `/owner/profile` | Owner profile | profile fallback | `GET /horse-owner/profile` | Atlas Stable, Rivergate Stable |

## Jockey Routes

| Route | Screen | Current mock/fallback | API/source to use | Seed records |
|---|---|---|---|---|
| `/jockey` | Jockey dashboard | `jockeyData.js` | `GET /jockeys/me`, `GET /jockeys/me/assignments`, stats/schedule/results | all jockey accounts have useful assignment context |
| `/jockey/invitations` | Invitations | `jockeyData.js` fallback | `GET /jockeys/me/assignments` | `jockey2@racing.test` has Silver Wind meeting invitation |
| `/jockey/assignments` | Assignment list | fallback rows | `GET /jockeys/me/assignments` | accepted, terms_agreed, contract_uploaded, contract_rejected states |
| `/jockey/schedule` | Schedule | fallback rows | `GET /jockeys/me/schedule` | Jockey Charlie and Delta have scheduled/completed race links |
| `/jockey/results` | Results | fallback rows | `GET /jockeys/me/results` | published results for Jockey Charlie/Delta/Alpha |
| `/jockey/profile` | Profile | none or fallback | `GET/PATCH /jockeys/me` | short seeded profile names/license numbers |

## Admin Routes

| Route | Screen | Current mock/fallback | API/source to use | Seed records |
|---|---|---|---|---|
| `/admin` | Admin dashboard | no operational records | workspace navigation | 11 users, 2 pending registrations, 5 tournaments, 15 races |
| `/admin/users` | Users | connected live data | `GET /admin/users` | 11 short demo accounts |
| `/admin/registrations` | Race registration approvals | connected live data | `GET /registrations`, approve/reject endpoints | Night Arrow and Dawn Velvet pending |
| `/admin/results` | Results | connected live data | `GET /race-results`, race-level `/race-results/races/:raceId/confirm` and `/publish` | 4 published, 1 confirmed |
| `/admin/tournament`, `/admin/schedule` | Competition planning | connected live data | tournament, round, and race CRUD | seed supports tournaments, rounds, races |
| `/admin/jockeys`, `/admin/referees` | Profile directories | connected live data | role-filtered admin users | seeded role profiles |

## Spectator Routes

| Route | Screen | Current mock/fallback | API/source to use | Seed records |
|---|---|---|---|---|
| `/spectator` | Spectator home | hardcoded sections/cards | tournaments, races, race results, bets if endpoint exists | 5 tournaments, 15 races, 4 published results |
| `/spectator/tournaments` | Tournament list | `tournamentData.js` fallback | `GET /tournaments` | Spring Cup, Derby Trial, Autumn Sprint, Coastal Derby, Night Track |
| `/spectator/tournaments/:id` | Tournament detail | `tournamentData.js` fallback | `GET /tournaments/:id`, `GET /races?tournament_id=...` | multiple scheduled/running/completed races |
| `/spectator/results` | Results | connected; remove sample fallback | `GET /race-results?status=published`; backend also mounts `/users/spectator/races/:raceId/results` outside current `/api` proxy | Derby Final and Coastal Final published results |
| `/spectator/leaderboard` | Leaderboard | sample rows | aggregate from published race results | Golden Mane, River Flash, Shadow Lake, Coastal King |
| `/spectator/predictions` | Prediction hub | mock/prototype | backend betting contracts still needed | bets are seeded but endpoint coverage must be confirmed |

## Referee Routes

| Route | Screen | Current migration debt | API/source to use | Required behavior |
|---|---|---|---|---|
| `/referee` | Referee dashboard | remove `refereeData.js` fallback | assigned race reads | Empty/error responses never render sample races |
| `/referee/races` | Race list | remove fallback races | assigned race reads | Show only races assigned to the current referee |
| `/referee/races/:raceId` | Shared race workspace | new orchestration APIs not wired | race detail, participants, readiness, checks, violations, results, reports | Shared pre/during/post context |
| horse inspection | Pre/post checks | current UI is not fully phase-aware | `GET/POST/PATCH /horse-checks` | Distinct records by race, horse, and phase |
| race monitor | During-race incidents | start/complete controls not wired; realtime timer still unsupported | `POST /races/:id/start`, `/complete`, plus during-race checks | Backend lifecycle is authoritative; no local timer authority |
| jockey inspection | Eligibility | mock persistence | pending backend contract | API or unavailable state only |
| violations | Violations | policy/decision endpoints not wired | options, penalty-preview, `GET/POST/PATCH`, confirm, dismiss | Backend policy owns penalties |
| race report | Reports | remove fallback mutation path | `GET/POST/PATCH/submit /referee-reports` | Draft then submitted/read-only |
| race result | Results | migrate legacy per-result creation | participants, readiness, finalize, apply penalties, `GET/PATCH /race-results` | Race Engine creates drafts; referee reviews; admin confirms/publishes by race |

## Mock Removal Priority

1. Owner dashboard, schedule, results.
2. Jockey dashboard, schedule, results.
3. Admin dashboard metrics and result/prediction module rows.
4. Spectator home, tournament fallback, leaderboard fallback.
5. Referee dashboard/list/detail fallbacks.
6. Public landing precise stats.
7. Realtime betting mock transport after backend contract is ready.
