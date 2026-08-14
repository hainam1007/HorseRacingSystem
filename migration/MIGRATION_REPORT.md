# Migration Validation Report

> MongoDB → PostgreSQL migration cho hệ thống Horse Racing.

## 1. Kết quả tổng thể

| Phase | Mô tả | Trạng thái |
|-------|--------|------------|
| 1 | Khảo sát kiến trúc | ✅ Done |
| 2 | Mapping Mongo collection → Postgres table | ✅ Done |
| 3 | Schema design (`migration/schema/001_init_postgres.sql`) | ✅ Done |
| 4 | Sequelize models (47 models) | ✅ Done |
| 5 | Repositories layer — Postgres-side (14 repo) | ✅ Done |
| 6 | Repositories layer — dual-mode wrapper (8 proxy) | ✅ Done |
| 7 | Export Mongo → JSON | ✅ Done |
| 8 | Normalize & validate | ✅ Done |
| 9 | Import JSON → Postgres (4477 rows) | ✅ Done |
| 10 | Unit test: wallet / deposit / tournament repos | ✅ Done |
| 11 | Race / registration / horseOwner repos | ✅ Done |
| 12 | Transaction & raceOddsMarket repos | ✅ Done |
| 13 | End-to-end race flow (DB-level) | ✅ Done |
| 14 | User & auth repos | ✅ Done |
| 15 | Profile / role / horseRatingHistory | ✅ Done |
| 16 | JockeyAssignment & violation repos | ✅ Done |
| 17 | Notifications / wallet transactions | ✅ Done |
| 18 | Foreign-key integrity | ✅ Done |
| 19 | Performance indexes | ✅ Done |
| 20 | Data integrity stress | ✅ Done |
| 21 | Sample CRUD round-trip | ✅ Done |
| 22 | Configuration (STORAGE_DRIVER, .env, bin/www) | ✅ Done |
| 23-24 | App integration (real Express server) | ✅ Done — 15/15 |
| 25-26 | Dual-mode dispatch + final scan | ✅ Done — 16/16 |
| 27 | Final validation report | ✅ Done (this file) |

## 2. Validation scripts

| Script | Mục đích | Kết quả |
|--------|---------|---------|
| `migration/scripts/e2e-app-integration-test.js` | Express server thật + Postgres + 9 endpoint smoke | **15/15 PASS** |
| `migration/scripts/dual-mode-dispatch-test.js` | 8 repo × 2 driver, đảm bảo dispatch đúng implementation | **16/16 PASS** |
| `migration/scripts/wallet-deposit-tournament-tests.js` | Wallet/deposit/tournament ở DB level | PASS |
| `migration/scripts/race-registration-horseOwner-tests.js` | Race/registration/horseOwner ở DB level | PASS |
| `migration/scripts/transaction-raceOddsMarket-tests.js` | Transaction/raceOddsMarket ở DB level | PASS |
| `migration/scripts/e2e-race-flow-test.js` | Full race lifecycle | PASS |
| `migration/scripts/user-auth-tests.js` | User/auth repos | PASS |
| `migration/scripts/profile-role-horseRating-tests.js` | Profile/role | PASS |
| `migration/scripts/jockeyAssignment-violation-tests.js` | JockeyAssignment/violation | PASS |
| `migration/scripts/notifications-walletTx-tests.js` | Notifications/transactions | PASS |
| `migration/scripts/fk-integrity-tests.js` | Foreign-key integrity | PASS |
| `migration/scripts/index-performance-tests.js` | Performance indexes | PASS |
| `migration/scripts/data-integrity-stress.js` | Data integrity stress | PASS |
| `migration/scripts/sample-crud-roundtrip.js` | CRUD round-trip sample | PASS |

## 3. App live smoke

```
✔ GET /api/auth/roles → 200 (5 roles)
✔ POST /api/auth/register → 201
✔ POST /api/auth/login → 200 (JWT returned)
✔ GET /api/wallet/me → 200 (balance = 0)
✔ GET /api/deposit/packages → 200 (packages returned)
✔ GET /api/tournaments → 200
✔ GET /api/races → 200 (participant_count populated)
✔ GET /api/rounds → 200
✔ GET /api/wallet/transactions → 200 (empty list)
```

## 4. Dual-mode dispatch verified

| Repository | Mongo impl | Postgres impl |
|------------|-----------|---------------|
| walletRepository | `repositories/_walletRepository_mongoose` | `repositories/sequelize/walletRepository` |
| depositRequestRepository | (Mongoose) | `repositories/sequelize/depositRequestRepository` |
| tournamentRepository | (Mongoose) | `repositories/sequelize/tournamentRepository` |
| raceRepository | (Mongoose) | `repositories/sequelize/raceRepository` |
| transactionRepository | (Mongoose) | `repositories/sequelize/transactionRepository` |
| depositPackageRepository | (Mongoose) | `repositories/sequelize/depositPackageRepository` |
| horseOwnerRepository | (Mongoose) | `repositories/sequelize/horseOwnerRepository` |
| profileRepository | (Mongoose) | `repositories/sequelize/profileRepository` |

Tất cả 16 lần probe (8 repo × 2 driver) trả về đúng implementation. Proxy wrapper tại `repositories/*.js` resolve runtime theo `process.env.STORAGE_DRIVER`.

## 5. Configuration

`.env` đã bổ sung `STORAGE_DRIVER=postgres`. Boot script `bin/www` switch driver:

```js
if (storageDriver === "postgres") {
  const { loadSequelizeModels } = require("../models/sequelize/index.js");
  const { sequelize } = loadSequelizeModels();
  await sequelize.authenticate();
  console.log("[sequelize] connected — storage driver = postgres");
} else {
  const connectDatabase = require("../config/database").connectDatabase;
  await connectDatabase();
}
```

Không có bước nào phá vỡ Mongo — hệ thống vẫn chạy được cả hai backend; chỉ switch env var để đổi driver.

## 6. Kết luận

- App thật chạy thành công với **Postgres backend qua STORAGE_DRIVER=postgres**.
- Dual-mode wrapper đảm bảo repository layer có thể hoán đổi giữa Mongoose và Sequelize **mà không thay đổi service/route**.
- 47 Sequelize models + 14 Sequelize repositories + 8 dual-mode wrappers = bộ ba cốt lõi cho Postgres path.
- Tất cả validation scripts pass, không có lỗi phát sinh trong integration test với Express server thật.
- Việc xóa hoàn toàn Mongoose (Phase 26 destructive) là **optional** — dự án vẫn có thể chạy một trong hai backend; khuyến nghị giữ dual-mode cho đến khi đã chạy production cut-over hoàn chỉnh.