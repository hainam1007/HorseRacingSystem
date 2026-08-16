# Audit Report — 100% PostgreSQL Migration

> **Verdict cuối cùng: ❌ FAIL — Project CHƯA chuyển 100% sang PostgreSQL**
>
> Backend có **dual-mode runtime**: storage driver được chọn theo `STORAGE_DRIVER` env var. Một số layer (services, validators) vẫn `require('mongoose')` trực tiếp. App đang chạy dạng **"Postgres cho repository layer + MongoDB cho service/validator layer"** khi `STORAGE_DRIVER=postgres`.

---

## Chi tiết từng hạng mục

### [PASS] PostgreSQL connection
**File**: `horse-racing-backend/config/sequelize.js` (line 65-89)
- `new Sequelize({ dialect: 'postgres', host: PGHOST, ... })` — hợp lệ
- `.authenticate()` gọi thành công (đã verify qua dev server log: `[sequelize] connected to PostgreSQL`)
- .env có đầy đủ `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`
- Pool config: `max=10, idle=30s, acquire=10s, statement_timeout=30s`

✅ **PASS**

### [PASS] ORM
**Files**: `horse-racing-backend/models/sequelize/*.js` (47 models)
- Sequelize 6.x, dialect postgres
- Loader tại `models/sequelize/index.js` (`loadSequelizeModels()`)
- Mỗi model export `(sequelize, DataTypes) => Model` factory
- Indexes + associations đã khai báo

✅ **PASS**

### [FAIL] Repository
**Files**: `horse-racing-backend/repositories/*.js` (8 proxy) + `repositories/sequelize/*.js` (14 impl)
- **8/8 proxy** dispatch đúng giữa Mongoose và Sequelize (đã test 16/16 case)
- ⚠️ **NHƯNG**: `repositories/storage-driver.js` chỉ swap 2 file (`userRepository`, `roleRepository`) bằng cách ghi `require.cache`. Các proxy ở thư mục gốc dùng `Proxy` getter — pattern **chỉ chạy khi proxy được require và method được gọi**, không phải static swap.
- Các repository **không tự gọi Mongoose API** — toàn bộ qua ORM. **Không có raw SQL.**

✅ **PASS** (về mặt ORM access — repositories an toàn)

### [FAIL] Service
**Files**: `horse-racing-backend/services/*.js` (24 service)

**Service vẫn `require('mongoose')` hoặc `require('../models/<X>')` (Mongoose models):**

| File | Line | Vấn đề |
|---|---|---|
| `services/adminDashboardService.js` | 1-9 | `require('../models/User'/'Wallet'/'DepositRequest'/'Bet'/'PrizeAward'/'Race'/'Tournament'/'Violation'/'RaceResult')` — **toàn bộ queries dùng `Model.aggregate()`, `countDocuments()`, `.populate()`, `.lean()`** |
| `services/raceService.js` | 1 | `require('mongoose')` |
| `services/raceEngineService.js` | 2 | `require('mongoose')` |
| `services/raceResultService.js` | 1 | `require('mongoose')` |
| `services/jockeyAssignmentService.js` | 1 | `require('mongoose')` |
| `services/horseOwnerService.js` | 1 | `require('mongoose')` |
| `services/registrationCancellationTicketService.js` | 1 | `require('mongoose')` |

**Service dùng Mongoose API methods** (`countDocuments/aggregate/populate/lean/findOneAndUpdate/findByIdAnd`): 17 file

Đây là **runtime failure**: Khi `STORAGE_DRIVER=postgres`, các service này vẫn query vào **MongoDB thật** (hoặc throw `ReferenceError` nếu không có MongoDB connection), không qua Postgres.

❌ **FAIL**

### [FAIL] API
**Files**: `horse-racing-backend/routes/*.js` (24 routes) + `controllers/*.js`

- Routes pass: `/api/auth/roles`, `/api/tournaments`, `/api/races`, `/api/auth/register`, `/api/auth/login`, `/api/wallet/me`, `/api/deposit/packages`, `/api/wallet/transactions` — các endpoint này **đi qua repositories** (Sequelize) → OK
- Routes bị ảnh hưởng bởi service Mongoose:
  - `/api/admin/dashboard` → `adminDashboardService` → Mongoose queries → FAIL
  - `/api/admin/betting-summary` → same — FAIL
  - `/api/admin/deposit-requests` → same — FAIL
  - `/api/admin/prize-awards/summary` → same — FAIL
  - `/api/races/*` (nhiều) → `raceService` + `raceEngineService` + `raceResultService` — FAIL
  - `/api/horseOwner/*` → `horseOwnerService` — FAIL
  - `/api/jockeyAssignments/*` → `jockeyAssignmentService` — FAIL
  - `/api/registration-cancellation-tickets/*` → `registrationCancellationTicketService` — FAIL

❌ **FAIL**

### [PASS] Data migration
**Files**: `migration/schema/001_init_postgres.sql`, `migration/scripts/import-to-postgres.js`
- 47 bảng Postgres, 4477+ rows đã import (đã verify qua các test phase 5-21)
- FK mapping: ObjectId → UUID với `migration/utils/uuid-mapper.js`
- Backup MongoDB giữ nguyên ở `migration/backup/`

✅ **PASS**

### [PASS] Relationships
**Files**: `migration/schema/001_init_postgres.sql`
- FK constraints đầy đủ giữa các bảng
- 47 models Sequelize có `Model.associate()` chain loaded
- Đã verify qua `fk-integrity-tests.js` (PASS)

✅ **PASS**

### [FAIL] No MongoDB runtime
**Bằng chứng còn lại trong runtime**:

1. `bin/www` line 67-70: vẫn switch sang `connectDatabase()` (Mongoose) nếu `STORAGE_DRIVER=mongo`
2. `config/database.js`: file Mongoose-only (line 1-70) — vẫn được `require` khi runtime chọn mongo
3. `services/*.js` (7 file): `require('mongoose')` hoặc `require('../models/<MongooseModel>')`
4. `validators/commonValidator.js` line 1-6: dùng `mongoose.Types.ObjectId.isValid()` — runtime check
5. `models/*.js` (37 file Mongoose) — vẫn còn, dù dual-mode wrapper bỏ qua
6. `package.json` line 13-40: `mongoose` là dependency bắt buộc

Khi `STORAGE_DRIVER=postgres`:
- `connectDatabase()` **không được gọi** → Mongoose KHÔNG connect
- Nhưng **service code gọi `require('../models/User')` vẫn load Mongoose model**, dù model đó không connect → query sẽ **fail** với `MongooseError: Cannot call ... before connection`

❌ **FAIL**

### [PASS] No Raw SQL
- Toàn bộ DB access từ Sequelize repository qua ORM methods (`findAll`, `findOne`, `create`, `update`, `destroy`, aggregation thay bằng `Op` + `findAll`)
- Tìm `sequelize.query(`, `Raw SQL`, `SELECT ` — không thấy raw SQL trong runtime code
- Migration scripts có raw SQL trong `001_init_postgres.sql` (DDL) — chấp nhận được

✅ **PASS**

### [FAIL] Tests
**Files**: `horse-racing-backend/tests/*.js` (17 test files)

**Tests vẫn dùng Mongoose:**

| File | Vấn đề |
|---|---|
| `tests/jockeyAssignmentBackup.test.js` | `require('../models/JockeyAssignment').schema.indexes()` |
| `tests/jockeyAssignmentCancellation.test.js` | `require('../models/JockeyAssignment')` |
| 14 tests khác | `require('mongoose')` ở top — chạy cần Mongoose connection |

Các test này **chỉ pass khi chạy với MongoDB** hoặc **mock Mongoose**. Khi `STORAGE_DRIVER=postgres` → fail.

Service tests pass trên Postgres: chỉ giới hạn ở `migration/scripts/*` (kiểm tra repository level, không touch service Mongoose).

❌ **FAIL**

---

## Tổng kết

| Hạng mục | Kết quả |
|---|---|
| PostgreSQL connection | ✅ PASS |
| ORM | ✅ PASS |
| Repository | ✅ PASS |
| Service | ❌ **FAIL** |
| API | ❌ **FAIL** |
| Data migration | ✅ PASS |
| Relationships | ✅ PASS |
| No MongoDB runtime | ❌ **FAIL** |
| No Raw SQL | ✅ PASS |
| Tests | ❌ **FAIL** |

**Verdict: ❌ PROJECT CHƯA CHUYỂN 100% SANG POSTGRESQL**

---

## Danh sách file cần xử lý để đạt 100% PostgreSQL

### Service rewrite (7 file — ưu tiên 1)
```
horse-racing-backend/services/adminDashboardService.js    (CRITICAL — 9 Mongoose models, 4 aggregation pipelines)
horse-racing-backend/services/raceService.js
horse-racing-backend/services/raceEngineService.js
horse-racing-backend/services/raceResultService.js
horse-racing-backend/services/jockeyAssignmentService.js
horse-racing-backend/services/horseOwnerService.js
horse-racing-backend/services/registrationCancellationTicketService.js
```
→ Tất cả `require('mongoose')` → bỏ
→ Tất cả `require('../models/<X>')` → chuyển sang repository hoặc `models/sequelize/<X>`
→ `Model.aggregate([...])` → `sequelize.repository.findAll({ include, group, ... })` hoặc `Sequelize.literal()`
→ `Model.countDocuments()` → `Model.count()`
→ `Model.findById()` → `repository.findById()` (Sequelize)
→ `.populate()` → `include` option trong Sequelize

### Validator rewrite (1 file — ưu tiên 2)
```
horse-racing-backend/validators/commonValidator.js
```
→ Tách `isObjectId` thành validator UUID format (Postgres id dùng UUID), không `require('mongoose')`

### Test rewrite (17 file — ưu tiên 3)
```
horse-racing-backend/tests/*.js
```
→ Mock hoặc convert sang dùng Sequelize models / repositories

### Runtime config cleanup (3 file — ưu tiên 4)
```
horse-racing-backend/bin/www                              ← bỏ switch, chỉ init Sequelize
horse-racing-backend/config/database.js                   ← xóa (Mongoose-only)
horse-racing-backend/models/*.js   (37 file Mongoose)     ← xóa sau khi service rewrite xong
```

### Dependencies (1 file — ưu tiên 5)
```
horse-racing-backend/package.json
```
→ `npm uninstall mongoose` sau khi code base sạch Mongoose

### .env cleanup (1 file)
```
horse-racing-backend/.env
```
→ Xóa MONGODB_URI, MONGODB_DB_NAME, MONGODB_SERVER_SELECTION_TIMEOUT_MS, MONGODB_DNS_SERVERS

### Migration script (giữ nguyên)
```
horse-racing-backend/scripts/*.js         ← Mongoose migration tools, được phép giữ
migration/                                ← Export/transform/import pipeline, được phép giữ
```

---

## Hướng xử lý tiếp

Có 3 mức độ cutover:

**Mức 1 (Conservative)**: Giữ dual-mode. Production chạy `STORAGE_DRIVER=postgres` chỉ cho các endpoint đi qua repository. Service Mongoose chỉ chạy khi dev/test local. ⚠️ Vẫn risk khi deploy sai.

**Mức 2 (Recommended)**: Service rewrite toàn bộ Mongoose → Sequelize. Đây là khối lượng lớn (7 service + 17 test), business logic cần preserve. Cần ước lượng 2-3 ngày làm việc.

**Mức 3 (Big-bang)**: Xóa sạch Mongoose + service rewrite + test rewrite + xóa Mongoose dep. Cần 4-5 ngày + smoke test toàn bộ API.

Bạn muốn tôi bắt đầu theo mức nào?