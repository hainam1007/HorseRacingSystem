# Demo Data Reset Plan

This plan defines how to rebuild demo data so frontend flows can use real backend data instead of long generated accounts and mock fallback records.

## 1. Goals

- Replace long AI-generated emails with short stable test accounts.
- Seed deterministic data, not timestamp/random data.
- Cover the main frontend workflows with real backend records.
- Make reset repeatable through one backend script.
- Keep data names short enough for UI tables, cards, filters, and mobile layouts.

## 2. Safety Decision Required

Current backend can point to a shared MongoDB database. Before running any reset script, choose one mode:

```text
Mode A - Full demo database reset
  Delete all records in demo collections, then recreate the full dataset.
  Use only when the target database is disposable.

Mode B - Demo-prefix reset
  Delete only records owned by demo accounts and seeded IDs/names.
  Safer when the database may contain useful manual data.
```

Chosen reset mode:

```text
Mode A - Full demo database reset
```

The old long AI-generated accounts are intentionally removed by the full reset.

## 3. Short Test Accounts

All demo accounts should use:

```text
Password123
```

Seed these accounts:

| Role | Email | Name | Purpose |
|---|---|---|---|
| Admin | admin@racing.test | Admin Racing | Review registrations and manage system data |
| Horse Owner | owner1@racing.test | Owner Stable One | Main owner flow with several horses |
| Horse Owner | owner2@racing.test | Owner Stable Two | Secondary owner for filtering/permissions |
| Jockey | jockey1@racing.test | Jockey Alpha | Available jockey |
| Jockey | jockey2@racing.test | Jockey Bravo | Invited jockey |
| Jockey | jockey3@racing.test | Jockey Charlie | Accepted/assigned jockey |
| Jockey | jockey4@racing.test | Jockey Delta | Contract review scenario |
| Race Referee | referee1@racing.test | Referee One | Assigned referee for active races |
| Race Referee | referee2@racing.test | Referee Two | Secondary referee |
| Spectator | spectator1@racing.test | Spectator One | Result and betting demo |
| Spectator | spectator2@racing.test | Spectator Two | Extra spectator activity |

## 4. Reset Order

Delete child collections before parent collections to avoid stale references.

### Reset children first

```text
notifications
bets
prize_awards
prizes
referee_reports
violations
horse_checks
race_results
jockey_assignments
registrations
role_applications
```

### Reset race domain

```text
races
rounds
tournaments
horses
```

### Reset profiles and accounts

```text
race_referees
jockeys
horse_owners
user_roles
users
roles
```

Notes:

- `roles` can be upserted instead of deleted.
- `users.email` is unique.
- `horses.registration_number` is unique.
- `registrations` has unique `race_id + horse_id`.
- `jockey_assignments` has unique `race_id + horse_id`.
- `race_results` has unique `race_id + horse_id`.

## 5. Seed Order

Create parent records before child records.

```text
1. roles
2. users
3. user_roles
4. horse_owners, jockeys, race_referees
5. tournaments
6. rounds
7. races
8. horses
9. registrations
10. jockey_assignments
11. horse_checks
12. violations
13. race_results
14. prizes
15. prize_awards
16. bets
17. notifications
18. role_applications
```

## 6. Demo Scenario Matrix

### Tournaments and races

Seed at least two tournaments:

| Tournament | Status | Purpose |
|---|---|---|
| Spring Cup 2026 | active | Main owner/admin/jockey flow |
| Derby Trial 2026 | active | Referee/result/spectator flow |

Seed rounds and races:

| Tournament | Round | Race | Status | Purpose |
|---|---|---|---|---|
| Spring Cup 2026 | Qualifier | Spring Heat 1 | scheduled | Approved registration, no jockey yet |
| Spring Cup 2026 | Qualifier | Spring Heat 2 | scheduled | Approved registration with invited jockey |
| Spring Cup 2026 | Final | Spring Final | scheduled | Pending/rejected registration cases |
| Derby Trial 2026 | Qualifier | Derby Heat 1 | scheduled | Accepted assignment and referee checks |
| Derby Trial 2026 | Final | Derby Final | completed | Published results and spectator leaderboard |

Expanded Phase 1 seed also adds:

| Tournament | Race mix | Purpose |
|---|---|---|
| Autumn Sprint 2026 | scheduled, running, completed, cancelled | Owner dashboard, schedule, confirmed result, no-jockey invite case |
| Coastal Derby 2026 | scheduled, completed | Admin pending queue, referee check, published result, bet data |
| Night Track Series 2026 | scheduled, running, completed | Contract rejected, failed horse check, night race scenarios |

Bulk expansion seed adds 10 more tournaments, 30 more races, 28 more horses, and 8 more jockey accounts so frontend list, dashboard, filter, and pagination-like states have enough real database records.

### Horses

| Owner | Horse | Registration No. | Status | Purpose |
|---|---|---|---|---|
| owner1 | Thunder Bolt | HR-THUNDER-001 | active | Approved race entry, no jockey |
| owner1 | Silver Wind | HR-SILVER-002 | active | Approved race entry, jockey invited |
| owner1 | Night Arrow | HR-NIGHT-003 | active | Pending registration |
| owner1 | Ember Crown | HR-EMBER-004 | active | Rejected registration |
| owner2 | River Flash | HR-RIVER-005 | active | Accepted assignment and results |
| owner2 | Golden Mane | HR-GOLDEN-006 | active | Extra race data |

### Race registrations

| Horse | Race | Status | Purpose |
|---|---|---|---|
| Thunder Bolt | Spring Heat 1 | approved | Must appear in owner jockey invitation picker |
| Silver Wind | Spring Heat 2 | approved | Must not appear if it already has assignment |
| Night Arrow | Spring Final | pending | Admin approval queue |
| Ember Crown | Spring Final | rejected | Rejected state |
| River Flash | Derby Heat 1 | approved | Referee and assignment state |
| Golden Mane | Derby Final | approved | Results and spectator data |

### Jockey assignments

| Horse | Race | Jockey | Status | Purpose |
|---|---|---|---|---|
| Silver Wind | Spring Heat 2 | jockey2 | meeting_invited | Jockey invitation list |
| River Flash | Derby Heat 1 | jockey3 | accepted | Active assignment |
| Golden Mane | Derby Final | jockey4 | contract_uploaded | Contract review scenario |

No assignment should be created for Thunder Bolt in Spring Heat 1. This is the clean test case for owner inviting a jockey.

No assignment should be created for Copper Comet in Autumn Opener. This is the second clean owner invite case after the expanded Phase 1 seed.

### Referee operations

Seed referee records for Derby Heat 1 and Derby Final:

- Horse checks for River Flash and Golden Mane.
- One violation linked to a horse check.
- One draft referee report.
- One submitted referee report.

### Results, prizes, and spectator data

Seed published results for Derby Final:

- Golden Mane position 1.
- River Flash position 2.

Seed:

- race_results with `published` status.
- prizes for top positions.
- prize_awards linked to race_results.
- bets by spectator accounts so spectator pages have real rows.

## 7. Frontend Mock Removal Targets

The seed data should allow these screens to run from backend data:

| Frontend area | Backend data needed |
|---|---|
| Owner horse list/detail | users, horse_owners, horses |
| Owner race registration | tournaments, rounds, races, registrations |
| Owner invite jockey | approved registrations with no jockey assignment, jockeys |
| Admin registrations | registrations pending/approved/rejected |
| Jockey invitations | jockey_assignments with meeting statuses |
| Referee workspace | races, assignments, checks, violations, reports |
| Spectator tournaments/results | tournaments, races, race_results |
| Spectator leaderboard/bets | race_results, bets, prize_awards |

## 8. Script Plan

Backend script:

```text
scripts/seedDemoData.js
```

Package script:

```json
{
  "seed:demo:reset": "node scripts/seedDemoData.js --reset --mode full --confirm full-reset"
}
```

Script requirements:

- Load `.env`.
- Connect through existing `connectDatabase`.
- Hash password using bcrypt.
- Upsert roles by `role_name`.
- Create deterministic users by email.
- Support `--reset`.
- Support `--mode full`.
- Print a final account table.
- Refuse full reset unless `--confirm full-reset` is provided.

## 9. Acceptance Criteria

- Test account emails are short and stable.
- `TEST_ACCOUNTS.md` matches backend seed output.
- Owner invitation picker shows only Thunder Bolt / Spring Heat 1 at first.
- Admin registration page shows Night Arrow pending.
- Jockey invitation page shows Silver Wind invitation for jockey2.
- Referee workspace has assigned races and at least one horse check/report.
- Spectator results page shows published Derby Final results.
- Frontend build still passes after mock fallbacks are reduced.

## 10. Questions To Confirm

1. Should the seed script later add a safer `demo-prefix` mode for shared environments?
2. Should additional Cloudinary URLs replace the current remote image references later?
3. Which frontend mock modules should be removed first after API verification?
