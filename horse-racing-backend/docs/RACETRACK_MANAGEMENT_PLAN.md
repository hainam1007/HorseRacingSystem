# Bàn giao thay đổi — Racetrack, eligibility và các hạng mục liên quan

> Cập nhật: 2026-08-20 · Nhánh bàn giao: `feat/nam/racetrack`

## 0. Tóm tắt implementation thực tế

Tài liệu này là điểm bàn giao cho người tiếp tục phát triển. Phần đầu mô tả chính xác những gì hiện đã được thêm vào working tree; các phần sau giữ lại thiết kế, rule và kế hoạch kiểm thử chi tiết để làm tài liệu tham chiếu.

### 0.1. Chức năng chính đã thêm

1. **Danh mục racetrack và rule eligibility**
   - Thêm bảng `racetracks`, Sequelize model, repository, service, validator, controller và route `/api/racetracks`.
   - Có ba rule được hỗ trợ: `horse_weight_range`, `horse_age_range`, `horse_breed`; mỗi racetrack chỉ có một rule.
   - CRUD bị giới hạn cho Admin; mọi người dùng đã đăng nhập có thể đọc danh sách/chi tiết. Archive chuyển track sang `inactive`, không xóa lịch sử.
   - Mỗi lần thay đổi `eligibility_rule` sẽ tăng `rule_version`; mã track không được đổi sau khi đã có race liên kết.

2. **Race dùng snapshot, không dùng rule động**
   - Race mới bắt buộc chọn một racetrack `active`; backend tự điền `location` và `venue_code` để tương thích client/model cũ.
   - Khi tạo hoặc đổi track, `eligibility_rule_snapshot` lưu `racetrack_id`, `racetrack_code`, `rule_version` và toàn bộ rule. Vì vậy thay đổi rule sau này không làm thay đổi điều kiện của race đã tạo.
   - Không thể đổi racetrack sau khi có registration chưa hủy, payment pending/paid, slot giữ chỗ, odds market, entries đã finalized, betting mở, hoặc race đã bắt đầu/kết thúc.

3. **Eligibility được kiểm soát ở backend**
   - `services/racetrackEligibilityService.js` là nguồn kiểm tra chung cho owner, admin registration, pre-race check và race readiness.
   - Trạng thái trả về: `eligible`, `conditional_ballast`, `ineligible`. Với rule cân nặng, ngựa nhẹ hơn ngưỡng tối thiểu chỉ được đăng ký nếu `ballast_allowed`; ngựa quá cân hoặc thiếu dữ liệu vẫn bị chặn.
   - Có reason code ổn định cho UI/API (ví dụ `HORSE_WEIGHT_BELOW_MIN`, `HORSE_AGE_ABOVE_MAX`, `HORSE_BREED_NOT_ALLOWED`, `BALLAST_CONFIRMATION_REQUIRED`). Tuổi tính tại `race_date`; breed được so sánh sau khi trim/collapse space/lowercase.
   - `registrations` lưu eligibility status, snapshot và thời điểm kiểm tra để audit.

4. **Pre-race ballast và chặn start race**
   - `horse_checks` bổ sung các trường ballast/audit: số kg cần thêm/đã thêm, xác nhận, người xác nhận, thời điểm xác nhận và kết quả eligibility.
   - Có endpoint `POST /api/horse-checks/:id/confirm-ballast`. Chỉ referee được phân công race có thể xác nhận; backend tự tính lại eligibility, không tin `is_eligible` gửi từ client.
   - `startRace` và race-readiness đều kiểm tra mọi participant approved bằng evaluator. Race không thể bắt đầu hoặc kết quả không thể sẵn sàng nếu còn ngựa không pass pre-race eligibility.

5. **UI admin, owner và referee**
   - Admin có mục **Racetracks** (`/admin/racetracks`) để search/filter, create/edit/archive track; form tạo race chuyển từ nhập location/venue tự do sang dropdown racetrack.
   - Owner chọn race trước, sau đó UI gọi `GET /api/horse-owner/races/:raceId/eligible-horses`; chỉ hiển thị ngựa `eligible` và `conditional_ballast`, đồng thời cảnh báo số kg ballast cần xác nhận.
   - Referee pre-race hiển thị trạng thái eligibility/ballast và có thao tác xác nhận ballast.

### 0.2. Database và dữ liệu demo

- `003_add_racetracks_and_eligibility.sql` tạo schema, index, foreign key, bốn track chuẩn (`PHU_THO`, `THIEN_MA`, `QUAN_NGUA`, `SOC_SON`) và một `LEGACY_VN` inactive; migration backfill race cũ rồi tạo snapshot ổn định cho chúng.
- `004_rename_phu_tho_racetrack.sql` và `005_rename_remaining_racetracks.sql` chuẩn hóa tên hiển thị tiếng Anh, kể cả `races.location` tương thích ngược.
- `scripts/seedFullDemo.js` được mở rộng để seed racetrack/race/horses phù hợp rule và dữ liệu demo phong phú hơn. Chạy migration trước khi seed:

```bash
cd horse-racing-backend
npm run migrate
npm run seed:demo:full
```

### 0.3. Các thay đổi đi kèm đang nằm trong cùng nhánh

| Hạng mục | Nội dung | File chính |
| --- | --- | --- |
| Payment return của owner | Payment mang tiền tố `REG-` được đưa tới `/owner/payment-success`; trang mới đọc payment, poll trạng thái và hiển thị entry/payment record. URL cũ `/payment-success` tự redirect theo order ID. | `controllers/depositController.js`, `src/App.jsx`, `pages/owner/OwnerPaymentReturn.jsx` |
| Jockey invitation/contract | Hỗ trợ dữ liệu primary/standby contract nhất quán; cột URL đổi sang `TEXT` để không cắt data URI khi Cloudinary chưa cấu hình. | `JockeyAssignment*Contract.js`, `jockeyAssignmentRepository.js`, `JockeyInvitations.jsx` |
| Race engine | Section 2 của thuật toán three-section dùng multiplier `0.70–1.50` như spec; engine/readiness trả blocker eligibility chi tiết. | `services/raceEngineService.js`, `services/raceResultService.js` |
| Competition và upload | Race repository include racetrack; màn competition hiển thị racetrack và nạp dropdown; test image upload thêm round/race context. | `repositories/sequelize/raceRepository.js`, `AdminCompetitionModule.jsx` |
| Tài liệu renderer | Có prompt/spec độc lập cho renderer 2D ba section để tái sử dụng ở dự án khác. | `horse-racing-frontend/docs/THREE_SECTION_2D_RACE_RENDERER.md` |

### 0.4. Bản đồ file để tiếp tục bảo trì

| Khu vực | File cần đọc đầu tiên |
| --- | --- |
| Rule và logic eligibility | `services/racetrackEligibilityService.js` |
| CRUD racetrack | `services/racetrackService.js`, `validators/racetrackValidator.js`, `routes/racetracks.js` |
| Race snapshot / khóa đổi track | `services/raceService.js`, `validators/raceValidator.js` |
| Owner registration | `services/horseOwnerService.js`, `pages/owner/OwnerPages.jsx`, `pages/owner/useOwnerData.js` |
| Pre-race ballast | `services/horseCheckService.js`, `Referee/HorseInspection.jsx` |
| Schema/migration | `db/migrations/003_add_racetracks_and_eligibility.sql` |
| Test regression | `tests/racetrack*.test.js`, `tests/*Eligibility*.test.js`, `tests/horseCheckBallast.test.js` |

### 0.5. API contract mới

```text
GET    /api/racetracks?status=active|draft|inactive|all
GET    /api/racetracks/:id
POST   /api/racetracks                         (Admin)
PATCH  /api/racetracks/:id                     (Admin)
POST   /api/racetracks/:id/archive             (Admin)

GET    /api/horse-owner/races/:raceId/eligible-horses
POST   /api/horse-checks/:id/confirm-ballast
```

### 0.6. Checklist trước khi merge / deploy

- Chạy `npm run migrate:status` để chắc chắn migration `003`–`005` đã được áp dụng đúng thứ tự ở môi trường đích.
- Không bỏ qua `eligibility_rule_snapshot` khi tạo race bằng script/API nội bộ: đây là điều kiện bắt buộc để evaluator hoạt động.
- Khi thêm loại rule mới, cập nhật đồng thời validator, eligibility service, admin form, API label và test; không chỉ thêm option trên UI.
- Kiểm tra luồng manual: tạo track active → tạo race → owner đăng ký ngựa đúng/sai/thiếu cân → referee xác nhận ballast → start race.
- Những thay đổi cùng working tree ở mục 0.3 là một phần của commit bàn giao; tách thành commit/PR riêng nếu đội muốn review nhỏ hơn.

---

## Thiết kế và kế hoạch chi tiết

# Kế hoạch triển khai quản lý trường đua và điều kiện tham gia

## 1. Mục tiêu

Xây dựng tính năng quản lý trường đua tại Việt Nam, cho phép:

- Admin tạo, cập nhật và ngừng sử dụng trường đua.
- Admin chọn trường đua từ dropdown khi tạo race.
- Mỗi trường đua có đúng một điều kiện dành cho ngựa.
- Horse owner chỉ chọn được ngựa đạt điều kiện hoặc ngựa thiếu cân nhưng có thể bổ sung tạ trước race.
- Trọng tài xác nhận việc bổ sung tạ trong bước kiểm tra pre-race.
- Backend kiểm tra lại điều kiện tại mọi điểm quan trọng để không thể bypass bằng cách gọi API trực tiếp.
- Race đã tạo giữ nguyên điều kiện của trường đua tại thời điểm tạo, kể cả khi admin sửa trường đua sau đó.

## 2. Phạm vi đã chốt

### 2.1. Trong phạm vi

- Quản lý danh mục trường đua tại Việt Nam.
- Mỗi trường đua chỉ có một loại điều kiện.
- Điều kiện cân nặng ngựa.
- Điều kiện tuổi ngựa.
- Điều kiện giống ngựa.
- Chọn trường đua khi tạo race.
- Lọc ngựa theo race trên trang đăng ký của horse owner.
- Hỗ trợ trạng thái cần bổ sung tạ đối với ngựa thiếu cân.
- Trọng tài xác nhận bổ sung tạ tại pre-race.
- Lưu snapshot và thông tin audit của kết quả kiểm tra.
- Cập nhật dữ liệu demo để luôn có ngựa phù hợp với từng trường đua.

### 2.2. Ngoài phạm vi

- Không cấu hình nhiều điều kiện đồng thời cho một trường đua.
- Không có điều kiện dành cho jockey trong phiên bản này.
- Không có admin override để ép ngựa không đủ điều kiện được tham gia.
- Không xây dựng rule builder tổng quát với AND/OR hoặc operator động.
- Không tạo danh mục giống ngựa mới; sử dụng dropdown giống ngựa hiện có.
- Không thay đổi chính sách hoàn tiền hiện tại chỉ vì ngựa không vượt qua pre-race.

## 3. Điều kiện của các trường đua

| Mã | Trường đua | Loại điều kiện | Giá trị | Có thể khắc phục bằng tạ |
| --- | --- | --- | --- | --- |
| `PHU_THO` | Phu Tho Racetrack | Khoảng cân nặng | 450–500 kg | Có, nếu thấp hơn 450 kg |
| `THIEN_MA` | Thien Ma Racetrack | Khoảng cân nặng | 400–450 kg | Có, nếu thấp hơn 400 kg |
| `QUAN_NGUA` | Quan Ngua Racetrack | Khoảng tuổi | 4–5 tuổi | Không |
| `SOC_SON` | Soc Son Racetrack | Giống ngựa | Thoroughbred | Không |

Quy ước:

- Các cận đều được tính inclusive.
- Ngựa đúng 450 kg hoặc 500 kg đều đạt điều kiện Phú Thọ.
- Ngựa đúng 400 kg hoặc 450 kg đều đạt điều kiện Thiên Mã.
- Ngựa 4 tuổi hoặc 5 tuổi đều đạt điều kiện Quần Ngựa.
- Tuổi được tính tại `race_date`, không tính tại ngày đăng ký.
- So sánh giống ngựa không phân biệt chữ hoa/thường và bỏ khoảng trắng thừa.
- Thiếu dữ liệu bắt buộc của điều kiện thì ngựa không đủ điều kiện.

## 4. Trạng thái eligibility

Backend sử dụng ba trạng thái:

### 4.1. `eligible`

Ngựa đạt điều kiện của trường đua và có thể đăng ký bình thường.

### 4.2. `conditional_ballast`

Chỉ áp dụng cho trường đua có điều kiện cân nặng và `ballast_allowed = true`.

Ngựa có cân nặng thấp hơn mức tối thiểu nhưng có thể đăng ký với điều kiện phải được trọng tài xác nhận bổ sung đủ tạ tại pre-race.

Ví dụ:

- Phú Thọ yêu cầu tối thiểu 450 kg.
- Ngựa đang có cân nặng 438 kg.
- Kết quả registration eligibility là `conditional_ballast`.
- Hệ thống thông báo cần bổ sung tối thiểu 12 kg.

### 4.3. `ineligible`

Ngựa không thể đăng ký cho race.

Các trường hợp gồm:

- Ngựa vượt cân nặng tối đa.
- Không có thông tin cân nặng khi trường đua yêu cầu cân nặng.
- Không đạt điều kiện tuổi.
- Không có ngày sinh khi trường đua yêu cầu tuổi.
- Không đạt điều kiện giống.
- Không có giống ngựa khi trường đua yêu cầu giống.
- Ngựa không có trạng thái `active`.

## 5. Quy tắc hiển thị trên trang horse owner

Sau khi owner chọn race:

- Hiển thị ngựa có trạng thái `eligible`.
- Hiển thị ngựa có trạng thái `conditional_ballast` cùng cảnh báo rõ ràng.
- Không hiển thị ngựa có trạng thái `ineligible` trong danh sách chọn.
- Khi owner đổi race, hệ thống phải reset ngựa đang được chọn.
- Không sử dụng frontend làm nguồn quyết định cuối cùng; backend phải kiểm tra lại khi submit.

Ngựa `conditional_ballast` được phép đăng ký vì nếu bị ẩn hoặc bị chặn hoàn toàn thì sẽ không thể đi đến bước pre-race để trọng tài xác nhận bổ sung tạ.

## 6. Thiết kế dữ liệu

### 6.1. Bảng `racetracks`

Tạo bảng mới:

```text
racetracks
├── id UUID PK
├── code VARCHAR UNIQUE NOT NULL
├── name VARCHAR NOT NULL
├── address VARCHAR NULL
├── province VARCHAR NULL
├── country_code VARCHAR NOT NULL DEFAULT 'VN'
├── status VARCHAR NOT NULL DEFAULT 'draft'
├── eligibility_rule JSONB NOT NULL
├── rule_version INTEGER NOT NULL DEFAULT 1
├── created_by UUID NULL FK users
├── updated_by UUID NULL FK users
├── created_at TIMESTAMPTZ
├── updated_at TIMESTAMPTZ
└── deleted_at TIMESTAMPTZ NULL
```

Giá trị `status`:

- `draft`
- `active`
- `inactive`

Quy tắc:

- `country_code` luôn là `VN` trong UI và validator.
- `code` là duy nhất và không đổi sau khi trường đua đã có race.
- Trường đua đã được race sử dụng không được xóa vật lý.
- Khi không còn sử dụng, admin chuyển trường đua sang `inactive`.
- Trường đua inactive vẫn hiển thị trong dữ liệu lịch sử nhưng không xuất hiện trong dropdown tạo race mới.

### 6.2. Cấu trúc `eligibility_rule`

#### Điều kiện cân nặng

```json
{
  "schema_version": 1,
  "type": "horse_weight_range",
  "min_kg": 450,
  "max_kg": 500,
  "ballast_allowed": true
}
```

#### Điều kiện tuổi

```json
{
  "schema_version": 1,
  "type": "horse_age_range",
  "min_years": 4,
  "max_years": 5
}
```

#### Điều kiện giống

```json
{
  "schema_version": 1,
  "type": "horse_breed",
  "allowed_values": ["Thoroughbred"]
}
```

Validator phải bảo đảm:

- Chỉ chấp nhận một `type` trong mỗi rule.
- `min_kg <= max_kg`.
- `min_years <= max_years`.
- Các số phải lớn hơn hoặc bằng 0.
- `allowed_values` phải có ít nhất một giá trị hợp lệ với rule giống.
- Không chấp nhận field của một loại rule khác trong cùng payload.

### 6.3. Thay đổi bảng `races`

Thêm:

```text
racetrack_id UUID NULL/NOT NULL theo từng bước migration
eligibility_rule_snapshot JSONB
```

Quy tắc:

- Race mới bắt buộc phải có `racetrack_id`.
- Khi tạo race, backend copy rule hiện tại của racetrack vào `eligibility_rule_snapshot`.
- Snapshot gồm `racetrack_id`, `racetrack_code`, `rule_version` và nội dung rule.
- Race luôn kiểm tra bằng snapshot, không đọc rule hiện hành của racetrack.
- Việc sửa rule trường đua chỉ áp dụng cho race tạo sau đó.

Trong giai đoạn chuyển đổi, tiếp tục giữ:

- `location`
- `venue_code`

Hai trường này được backend tự điền từ racetrack để giữ tương thích với frontend hiện tại và probability model. Form admin không còn cho nhập tự do hai giá trị này khi tạo race mới.

### 6.4. Thay đổi bảng `registrations`

Thêm:

```text
eligibility_status VARCHAR
eligibility_snapshot JSONB
eligibility_checked_at TIMESTAMPTZ
```

Snapshot nên lưu:

```json
{
  "status": "conditional_ballast",
  "race_id": "...",
  "racetrack_id": "...",
  "rule_version": 1,
  "rule": {},
  "horse_facts": {
    "weight_kg": 438,
    "breed": "Thoroughbred",
    "date_of_birth": "2021-05-10"
  },
  "required_ballast_kg": 12,
  "reasons": [
    {
      "code": "HORSE_WEIGHT_BELOW_MIN",
      "actual": 438,
      "required_min": 450
    }
  ],
  "evaluated_at": "..."
}
```

### 6.5. Thay đổi bảng `horse_checks`

Tận dụng trường `weight` hiện có làm cân nặng thực tế được đo tại pre-race.

Thêm:

```text
ballast_required_kg NUMERIC(6,2)
ballast_added_kg NUMERIC(6,2)
ballast_confirmed BOOLEAN DEFAULT FALSE
ballast_confirmed_by UUID NULL FK users
ballast_confirmed_at TIMESTAMPTZ NULL
eligibility_result JSONB
```

Không cho frontend tự đặt `is_eligible = true` sau khi thêm tạ. Backend phải tự tính và ghi kết quả.

## 7. Migration và backfill

Tạo migration dự kiến:

```text
db/migrations/003_add_racetracks_and_eligibility.sql
```

Thứ tự migration:

1. Tạo bảng `racetracks`.
2. Seed hoặc insert bốn trường đua chuẩn.
3. Thêm `racetrack_id` nullable vào `races`.
4. Backfill race cũ dựa trên `location` và `venue_code` nếu có thể.
5. Race không map được sẽ được gắn vào một racetrack legacy/inactive tại Việt Nam.
6. Thêm `eligibility_rule_snapshot` và tạo snapshot cho race cũ.
7. Thêm các trường eligibility vào `registrations`.
8. Thêm các trường ballast vào `horse_checks`.
9. Thêm foreign key và index.
10. Sau khi bảo đảm toàn bộ race đã có racetrack, cân nhắc chuyển `racetrack_id` thành `NOT NULL`.

Index cần có:

- Unique index cho `racetracks.code`.
- Index cho `racetracks.status`.
- Index cho `races.racetrack_id`.
- Index cho `registrations.eligibility_status` nếu cần lọc/report.
- Index cho `horse_checks.ballast_confirmed` nếu cần dashboard pre-race.

## 8. Backend API quản lý trường đua

### 8.1. Endpoints

```text
GET    /api/racetracks
GET    /api/racetracks/:id
POST   /api/racetracks
PATCH  /api/racetracks/:id
POST   /api/racetracks/:id/archive
```

Quyền:

- User đã đăng nhập được đọc danh sách hoặc chi tiết trường đua khi cần.
- Chỉ admin được tạo, sửa và archive.

### 8.2. Files dự kiến

```text
models/sequelize/Racetrack.js
repositories/racetrackRepository.js
repositories/sequelize/racetrackRepository.js
services/racetrackService.js
controllers/racetrackController.js
validators/racetrackValidator.js
routes/racetracks.js
```

Sửa thêm:

```text
app.js
models/sequelize/Race.js
models/sequelize/Registration.js
models/sequelize/HorseCheck.js
```

### 8.3. Quy tắc update racetrack

- Sửa thông tin mô tả hoặc địa chỉ không ảnh hưởng race cũ.
- Sửa eligibility rule làm tăng `rule_version`.
- Race đã tạo vẫn sử dụng snapshot cũ.
- Không cho sửa code nếu đã có race liên kết.
- Archive không xóa dữ liệu lịch sử.

## 9. Eligibility service dùng chung

Tạo:

```text
services/racetrackEligibilityService.js
```

Các hàm chính:

```js
evaluateHorseForRace(race, horse)
evaluatePreRaceEligibility(race, horse, horseCheck)
assertHorseCanRegister(race, horse)
buildEligibilityReason(code, context)
```

Service phải là nguồn kiểm tra duy nhất cho:

- API danh sách ngựa theo race.
- Owner đăng ký race.
- Admin tạo registration.
- Pre-race horse inspection.
- Readiness trước khi start race.

### 9.1. Reason codes

Tối thiểu gồm:

```text
HORSE_NOT_ACTIVE
HORSE_WEIGHT_MISSING
HORSE_WEIGHT_BELOW_MIN
HORSE_WEIGHT_ABOVE_MAX
HORSE_DOB_MISSING
HORSE_AGE_BELOW_MIN
HORSE_AGE_ABOVE_MAX
HORSE_BREED_MISSING
HORSE_BREED_NOT_ALLOWED
BALLAST_CONFIRMATION_REQUIRED
BALLAST_AMOUNT_INSUFFICIENT
BALLAST_EFFECTIVE_WEIGHT_ABOVE_MAX
```

API trả reason code ổn định cùng dữ liệu `actual`, `required_min`, `required_max`. Frontend chuyển reason code thành nội dung tiếng Việt/Anh phù hợp.

## 10. Thuật toán kiểm tra

### 10.1. Điều kiện cân nặng tại registration

```text
Nếu horse.status != active
    => ineligible

Nếu horse.weight không tồn tại
    => ineligible

Nếu min_kg <= horse.weight <= max_kg
    => eligible

Nếu horse.weight < min_kg và ballast_allowed = true
    => conditional_ballast
    => required_ballast_kg = min_kg - horse.weight

Nếu horse.weight > max_kg
    => ineligible
```

### 10.2. Điều kiện cân nặng tại pre-race

```text
measured_weight = horse_check.weight
effective_weight = measured_weight + ballast_added_kg
```

Trường hợp:

- Nếu measured weight nằm trong khoảng: pass, không cần ballast.
- Nếu measured weight dưới min: yêu cầu referee xác nhận ballast.
- Nếu measured weight trên max: fail, không có cách khắc phục bằng ballast.
- Nếu thiếu measured weight: không thể hoàn tất pre-race.

Chỉ pass sau bổ sung tạ khi:

```text
ballast_confirmed = true
ballast_added_kg >= min_kg - measured_weight
min_kg <= effective_weight <= max_kg
```

### 10.3. Điều kiện tuổi

Tuổi nguyên được tính tại ngày race:

```text
age = số sinh nhật ngựa đã trải qua tính đến race_date
```

Không tính bằng cách lấy số ngày chia cho 365 vì sẽ sai ở sinh nhật và năm nhuận.

### 10.4. Điều kiện giống

Chuẩn hóa trước khi so sánh:

```text
trim
collapse whitespace
lowercase
```

Ví dụ `Thoroughbred`, ` thoroughbred ` và `THOROUGHBRED` được xem là cùng một giá trị.

## 11. Tích hợp tạo và cập nhật race

### 11.1. Validator

Sửa `validators/raceValidator.js`:

- Thêm `racetrack_id`.
- Bắt buộc `racetrack_id` khi tạo race mới.
- Không nhận `location` và `venue_code` từ client cho race mới.

### 11.2. Race service

Sửa `services/raceService.js`:

- Kiểm tra racetrack tồn tại và active.
- Lấy tên/mã trường đua để điền `location` và `venue_code`.
- Lưu `eligibility_rule_snapshot`.
- Trả racetrack trong race response.

Không cho đổi trường đua nếu race đã có một trong các dữ liệu sau:

- Registration chưa bị hủy.
- Payment đang pending hoặc đã paid.
- Slot đã được giữ.
- Entry đã finalized.
- Odds market đã được tạo.
- Betting đã mở.
- Race đã bắt đầu hoặc kết thúc.

## 12. Trang admin quản lý trường đua

Tạo trang:

```text
/admin/racetracks
```

File dự kiến:

```text
horse-racing-frontend/src/Admin/AdminRacetrackModule.jsx
```

Sửa:

```text
src/Admin/AdminLayout.jsx
src/Admin/AdminModulePage.jsx
src/api/adminApi.js
src/Admin/admin.css
```

### 12.1. Danh sách

Hiển thị:

- Tên trường đua.
- Mã.
- Tỉnh/thành phố.
- Trạng thái.
- Điều kiện hiện hành.
- Rule version.
- Số race liên kết.
- Actions edit/archive.

### 12.2. Form

Form gồm:

1. Tên trường đua.
2. Mã trường đua.
3. Địa chỉ.
4. Tỉnh/thành phố.
5. Trạng thái.
6. Loại điều kiện.
7. Cấu hình tương ứng với loại điều kiện.

Khi chọn điều kiện cân nặng, chỉ hiện:

- Minimum weight.
- Maximum weight.
- Cho phép bổ sung tạ.

Khi chọn điều kiện tuổi, chỉ hiện:

- Minimum age.
- Maximum age.

Khi chọn điều kiện giống, chỉ hiện:

- Dropdown/multi-select giống ngựa hiện có.

Không có UI để thêm điều kiện thứ hai.

## 13. Dropdown trường đua trong form race

Sửa `src/Admin/AdminCompetitionModule.jsx`:

- Load danh sách racetrack active.
- Thay input Location và Venue code bằng dropdown trường đua bắt buộc.
- Hiển thị preview thông tin và điều kiện sau khi chọn.
- Khi edit race cũ, vẫn hiển thị racetrack inactive nếu race đang tham chiếu tới nó.
- Disable dropdown nếu race đã có registration/payment/entries/odds/betting.

Payload tạo race gửi:

```json
{
  "tournament_id": "...",
  "round_id": "...",
  "racetrack_id": "...",
  "name": "...",
  "race_date": "..."
}
```

## 14. Tích hợp trang đăng ký horse owner

### 14.1. Endpoint eligibility

Thêm:

```text
GET /api/horse-owner/races/:raceId/eligible-horses
```

Response mẫu:

```json
{
  "race": {},
  "racetrack": {},
  "condition": {
    "label": "Ngựa từ 450 đến 500 kg"
  },
  "horses": [
    {
      "horse": {},
      "eligibility_status": "eligible",
      "required_ballast_kg": 0,
      "reasons": []
    },
    {
      "horse": {},
      "eligibility_status": "conditional_ballast",
      "required_ballast_kg": 12,
      "reasons": [
        {
          "code": "HORSE_WEIGHT_BELOW_MIN",
          "actual": 438,
          "required_min": 450
        }
      ]
    }
  ],
  "excluded_count": 2
}
```

### 14.2. Frontend flow

Sửa:

```text
src/api/ownerApi.js
src/pages/owner/useOwnerData.js
src/pages/owner/ownerAdapters.js
src/pages/owner/OwnerPages.jsx
src/pages/owner/owner.css
```

Flow:

1. Owner chọn tournament.
2. Owner chọn race.
3. Frontend gọi eligible-horses endpoint.
4. Reset horse đã chọn trước đó.
5. Hiển thị điều kiện của trường đua.
6. Hiển thị ngựa eligible.
7. Hiển thị ngựa conditional với warning và số kg tạ cần bổ sung.
8. Không hiển thị ngựa ineligible.
9. Owner xác nhận điều khoản và submit.

### 14.3. Backend registration enforcement

Sửa:

```text
services/horseOwnerService.js
services/registrationService.js
```

Backend phải kiểm tra eligibility lại:

- Sau khi xác thực ngựa thuộc owner.
- Trước khi reserve slot.
- Trước khi tạo registration/payment order.
- Trước khi tạo VNPay URL.

Nếu kết quả là:

- `eligible`: cho phép tiếp tục.
- `conditional_ballast`: cho phép tiếp tục và lưu snapshot/cảnh báo.
- `ineligible`: trả HTTP `422` cùng reason codes.

Admin registration API cũng phải dùng cùng eligibility service để không tạo đường bypass.

## 15. Tích hợp referee pre-race

Sửa màn hình Horse Inspection:

```text
horse-racing-frontend/src/Referee/HorseInspection.jsx
```

### 15.1. Giao diện

Trọng tài nhập cân nặng đo thực tế.

Nếu thấp hơn minimum, hiển thị:

```text
Cân nặng đo được: 438 kg
Mức tối thiểu: 450 kg
Thiếu: 12 kg
```

Hiện input:

```text
Khối lượng tạ đã bổ sung
```

Và nút:

```text
Xác nhận đã bổ sung tạ
```

Nút chỉ xuất hiện khi:

- Race dùng điều kiện cân nặng.
- Rule cho phép ballast.
- Cân nặng đo thực tế thấp hơn minimum.

### 15.2. Backend action

Có thể bổ sung endpoint riêng:

```text
POST /api/horse-checks/:id/confirm-ballast
```

Payload:

```json
{
  "ballast_added_kg": 12
}
```

Backend kiểm tra:

- Horse check tồn tại.
- Phase là `pre_race`.
- User là referee được phân công cho race.
- Rule snapshot là `horse_weight_range`.
- `ballast_allowed = true`.
- Measured weight thấp hơn minimum.
- Số tạ đủ bù phần thiếu.
- Effective weight không vượt maximum.

Sau khi thành công:

- `ballast_confirmed = true`.
- Lưu `ballast_confirmed_by`.
- Lưu `ballast_confirmed_at`.
- Lưu `ballast_added_kg`.
- Tính và lưu `eligibility_result`.
- Cập nhật `is_eligible = true` nếu tất cả điều kiện đạt.

Nếu measured weight nằm sẵn trong khoảng, backend tự đánh dấu pass mà không cần nút xác nhận tạ.

Nếu measured weight vượt maximum, `is_eligible = false` và không hiển thị cách khắc phục bằng tạ.

## 16. Race readiness và start race

Luồng start race hiện đã dựa vào pre-race check và `is_eligible`. Cần bảo đảm participant bị chặn khi:

- Chưa có pre-race check.
- Thiếu measured weight đối với race có rule cân nặng.
- Đang `conditional_ballast` nhưng chưa được referee xác nhận.
- Ballast bổ sung chưa đủ.
- Effective weight vượt maximum.
- Không đạt tuổi.
- Không đạt giống.

Không cho frontend hoặc referee tự gửi `is_eligible = true` để bypass kết quả evaluator.

## 17. Cập nhật dữ liệu demo

Sửa:

```text
scripts/seedFullDemo.js
```

### 17.1. Seed trường đua

Tạo hoặc cập nhật idempotent bốn racetrack và eligibility rule tương ứng.

### 17.2. Seed ngựa

Dữ liệu hiện tại chủ yếu có cân nặng khoảng 486–500 kg, khiến Thiên Mã không có ngựa phù hợp. Cần phân phối lại:

- Nhóm 410–445 kg để đủ điều kiện Thiên Mã.
- Nhóm 460–495 kg để đủ điều kiện Phú Thọ.
- Một số ngựa thiếu 5–15 kg để demo `conditional_ballast`.
- Một số ngựa 4–5 tuổi để đủ điều kiện Quần Ngựa.
- Một số ngựa ngoài khoảng tuổi để test bị lọc.
- Phần lớn ngựa Thoroughbred để đủ điều kiện Sóc Sơn.
- Một số ngựa giống khác để test bị lọc.

### 17.3. Seed race và participant

- Chia race demo luân phiên qua bốn trường đua.
- Race lưu `racetrack_id` và rule snapshot.
- Không chọn participant theo vòng lặp ngẫu nhiên hiện tại nếu participant không đạt rule.
- Dùng eligibility evaluator hoặc fixture mapping để chọn ngựa phù hợp cho mỗi race.
- Với participant conditional, tạo horse check có ballast đã được xác nhận nếu race demo cần ở trạng thái sẵn sàng.

### 17.4. Nhánh demo đã tồn tại

`seedFullDemo.js` hiện return sớm khi phát hiện tournament demo đã tồn tại. Cần sửa nhánh này để trước khi return vẫn:

- Tạo/update racetrack.
- Backfill `racetrack_id` cho demo race.
- Backfill rule snapshot.
- Điều chỉnh horse demo theo dải cân nặng/tuổi cần thiết.
- Bảo đảm horse check demo phù hợp với rule.

## 18. Kế hoạch kiểm thử

### 18.1. Unit tests eligibility

#### Phú Thọ

- 450 kg: `eligible`.
- 500 kg: `eligible`.
- 449 kg: `conditional_ballast`, cần 1 kg.
- 501 kg: `ineligible`.
- Không có weight: `ineligible`.

#### Thiên Mã

- 400 kg: `eligible`.
- 450 kg: `eligible`.
- 390 kg: `conditional_ballast`, cần 10 kg.
- 451 kg: `ineligible`.

#### Quần Ngựa

- Đúng 4 tuổi tại race date: `eligible`.
- Đúng 5 tuổi tại race date: `eligible`.
- Chưa tới sinh nhật 4 tuổi: `ineligible`.
- Đã sang tuổi 6: `ineligible`.
- Test ngày sinh quanh năm nhuận.
- Không có ngày sinh: `ineligible`.

#### Sóc Sơn

- `Thoroughbred`: `eligible`.
- ` thoroughbred `: `eligible`.
- `THOROUGHBRED`: `eligible`.
- Giống khác: `ineligible`.
- Không có breed: `ineligible`.

### 18.2. Unit tests ballast

- Measured weight đã trong khoảng: pass không cần ballast.
- Thiếu 12 kg, xác nhận thêm 12 kg: pass.
- Thiếu 12 kg, xác nhận thêm 10 kg: fail.
- Thêm tạ khiến effective weight vượt max: fail.
- Chưa xác nhận: fail readiness.
- User không phải referee được phân công: HTTP `403`.
- Horse check không phải pre-race: reject.
- Race không dùng weight rule: reject confirm-ballast.

### 18.3. Integration tests registration

- Owner chỉ nhận eligible và conditional horses từ endpoint.
- Ineligible horse không xuất hiện.
- Gọi POST registration thủ công với ineligible horse trả `422`.
- Eligibility fail không tăng slot count.
- Eligibility fail không tạo registration.
- Eligibility fail không tạo VNPay URL.
- Conditional horse tạo registration thành công và lưu snapshot.
- Admin registration endpoint không bypass evaluator.

### 18.4. Integration tests race/admin

- Admin CRUD racetrack.
- Không tạo racetrack với hai rule.
- Không tạo weight rule có min lớn hơn max.
- Race mới bắt buộc chọn active racetrack.
- Inactive racetrack không được dùng cho race mới.
- Race response chứa racetrack.
- Sửa rule racetrack không đổi snapshot race cũ.
- Không đổi racetrack sau khi race đã có registration/payment/odds.
- Archive racetrack không làm mất race lịch sử.

### 18.5. Frontend tests

- Trang admin hiển thị đúng một condition editor.
- Race form dùng dropdown racetrack.
- Owner đổi race thì horse selection được reset.
- Conditional horse hiển thị warning và số kg thiếu.
- Ineligible horse không xuất hiện.
- Referee chỉ thấy nút ballast khi đúng điều kiện.
- Sau xác nhận ballast, readiness được refresh.

### 18.6. Regression tests

Chạy lại các nhóm test liên quan:

- Registration và VNPay.
- Registration slot concurrency.
- Jockey assignment.
- Horse check.
- Race engine readiness.
- Race start.
- Odds generation.
- Race result.
- Full demo seed.

## 19. Thứ tự triển khai

### Phase 1 — Database và model

- Migration.
- Racetrack model.
- Race/Registration/HorseCheck fields và associations.
- Backfill cơ bản.

### Phase 2 — Domain service và API

- Racetrack repository/service/controller/routes.
- Racetrack validator.
- Eligibility evaluator.
- Unit tests evaluator.

### Phase 3 — Race integration

- Race create/update validator.
- Race service snapshot.
- API response association.
- Điều kiện khóa đổi racetrack.

### Phase 4 — Admin frontend

- Racetrack management page.
- Admin navigation.
- API client.
- Race form dropdown và rule preview.

### Phase 5 — Owner registration

- Eligible horses endpoint.
- Owner frontend filtering.
- Backend enforcement trước slot/payment.
- Registration snapshot.

### Phase 6 — Referee ballast

- Horse check fields/API.
- Pre-race evaluator.
- Nút xác nhận bổ sung tạ.
- Race readiness/start enforcement.

### Phase 7 — Demo data

- Seed bốn trường đua.
- Phân phối lại cân nặng, tuổi và giống ngựa.
- Gắn racetrack cho demo race.
- Tạo ballast fixtures phù hợp.
- Sửa nhánh idempotent update.

### Phase 8 — Verification

- Unit tests.
- Integration tests.
- Frontend build.
- Backend test suite.
- Chạy seed trên database sạch.
- Chạy lại seed trên database đã có demo để kiểm tra idempotency.

## 20. Tiêu chí hoàn thành

Tính năng được xem là hoàn thành khi:

- Admin quản lý được bốn trường đua trên trang riêng.
- Mỗi trường đua chỉ lưu đúng một điều kiện.
- Admin bắt buộc chọn trường đua từ dropdown khi tạo race.
- Race lưu rule snapshot và không bị ảnh hưởng bởi thay đổi rule sau đó.
- Owner chỉ thấy ngựa eligible hoặc conditional cho race đã chọn.
- Backend không cho đăng ký ngựa ineligible bằng API trực tiếp.
- Conditional horse có thể hoàn tất registration mà chưa bị thu hồi slot ngoài ý muốn.
- Trọng tài có thể nhập cân nặng và xác nhận số tạ đã bổ sung.
- Race không thể start nếu participant chưa hoàn tất pre-race eligibility.
- Không tồn tại admin override.
- Demo data có ngựa phù hợp cho cả bốn trường đua.
- Seed chạy lặp lại không tạo dữ liệu trùng và vẫn backfill dữ liệu mới.
- Các test registration, payment, pre-race và race start đều pass.
