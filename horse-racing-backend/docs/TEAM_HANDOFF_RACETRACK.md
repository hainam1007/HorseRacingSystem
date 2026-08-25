# Tổng hợp bàn giao cho nhóm — Racetrack & Race Eligibility

> Người thực hiện: Nam  
> Nhánh: `feat/nam/racetrack`  
> Commit chính: `f1cf949` — `feat(racetrack): add eligibility management flow`  
> PR tạo khi cần review: https://github.com/hainam1007/HorseRacingSystem/pull/new/feat/nam/racetrack

## 1. Phạm vi đã hoàn thành

Đã triển khai luồng quản lý trường đua và kiểm tra điều kiện ngựa xuyên suốt từ database đến UI:

1. Admin quản lý danh mục racetrack và rule eligibility.
2. Race bắt buộc chọn racetrack; rule được snapshot ngay lúc tạo race.
3. Owner chỉ đăng ký được ngựa đạt rule hoặc ngựa được phép bổ sung ballast.
4. Referee xác nhận ballast ở bước pre-race; backend tự tính eligibility.
5. Race không thể start khi còn participant không đạt pre-race readiness.

## 2. Dữ liệu racetrack được seed

| Code | Tên | Rule | Ballast |
| --- | --- | --- | --- |
| `PHU_THO` | Phu Tho Racetrack | Cân nặng 450–500 kg | Có, nếu thấp hơn 450 kg |
| `THIEN_MA` | Thien Ma Racetrack | Cân nặng 400–450 kg | Có, nếu thấp hơn 400 kg |
| `QUAN_NGUA` | Quan Ngua Racetrack | Tuổi 4–5 tại ngày race | Không |
| `SOC_SON` | Soc Son Racetrack | Giống `Thoroughbred` | Không |
| `LEGACY_VN` | Track legacy/inactive | Dùng để backfill race cũ không nhận diện được | Không dùng cho race mới |

Mỗi racetrack có đúng một `eligibility_rule` và `rule_version`. Khi Admin sửa rule, version tự tăng.

## 3. Rule nghiệp vụ quan trọng

- Race mới chỉ dùng racetrack có `status = active`.
- Race lưu `eligibility_rule_snapshot`; rule của racetrack bị sửa sau này **không** thay đổi race đã tạo.
- `location` và `venue_code` vẫn được backend tự gán từ racetrack để tương thích với code cũ.
- Không thể đổi racetrack nếu race đã có registration chưa hủy, payment pending/paid, slot được giữ, odds market, entries finalized, betting mở, hoặc race đã chạy/kết thúc.
- Eligibility trả một trong ba trạng thái:
  - `eligible`: được đăng ký bình thường.
  - `conditional_ballast`: được đăng ký nhưng referee phải xác nhận số kg ballast ở pre-race.
  - `ineligible`: bị chặn ở backend, kể cả khi gọi API trực tiếp.
- Tuổi được tính tại `race_date`, không dùng phép chia số ngày cho 365.
- So sánh breed không phân biệt hoa/thường và bỏ khoảng trắng thừa.

## 4. Migration và cách chạy dữ liệu demo

Migration mới:

```text
003_add_racetracks_and_eligibility.sql
004_rename_phu_tho_racetrack.sql
005_rename_remaining_racetracks.sql
```

Chạy theo thứ tự sau trước khi seed/demo:

```bash
cd horse-racing-backend
npm run migrate
npm run seed:demo:full
```

Migration `003` tạo các bảng/cột/index/foreign key sau:

- Bảng `racetracks`.
- `races.racetrack_id`, `races.eligibility_rule_snapshot`.
- `registrations.eligibility_status`, `eligibility_snapshot`, `eligibility_checked_at`.
- `horse_checks.ballast_required_kg`, `ballast_added_kg`, `ballast_confirmed`, người/thời điểm xác nhận và `eligibility_result`.
- Backfill race cũ sang track phù hợp hoặc `LEGACY_VN`, đồng thời tạo snapshot để lịch sử vẫn ổn định.

## 5. API mới / thay đổi

```text
GET    /api/racetracks?status=active|draft|inactive|all
GET    /api/racetracks/:id
POST   /api/racetracks                         # Admin
PATCH  /api/racetracks/:id                     # Admin
POST   /api/racetracks/:id/archive             # Admin

GET    /api/horse-owner/races/:raceId/eligible-horses
POST   /api/horse-checks/:id/confirm-ballast
```

API eligibility trả `reasons` theo code ổn định, ví dụ:

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

## 6. Thay đổi UI

### Admin

- Thêm màn `/admin/racetracks`: tìm kiếm, filter trạng thái, create/edit/archive racetrack.
- Form tạo/sửa race dùng dropdown racetrack thay cho nhập tự do `location`/`venue_code`.
- Race schedule/competition hiển thị thông tin racetrack.

### Horse owner

- Khi chọn race, UI gọi API eligibility rồi chỉ hiển thị ngựa `eligible` hoặc `conditional_ballast`.
- Ngựa thiếu cân hiển thị số kg ballast cần xác nhận.
- Đổi race sẽ reset ngựa đang chọn để tránh đăng ký sai condition.

### Referee

- Pre-race inspection hiển thị kết quả eligibility và trạng thái ballast.
- Chỉ referee được phân công vào race mới xác nhận được ballast.
- Client không thể tự set `is_eligible = true`; backend luôn tính lại.

## 7. Các hạng mục phụ trợ đã đi kèm trong commit

| Hạng mục | Nội dung |
| --- | --- |
| Owner payment return | Payment registration có prefix `REG-` được redirect sang `/owner/payment-success`; trang mới poll và hiển thị kết quả thanh toán/entry. |
| Jockey contract/invitation | Chuẩn hóa primary/standby contract; `file_url` đổi thành `TEXT` để không cắt data URI khi chưa dùng Cloudinary. |
| Race engine | Sửa multiplier section 2 theo spec `0.70–1.50`; readiness trả blocker eligibility chi tiết. |
| Renderer documentation | Thêm spec/prompt tái sử dụng cho renderer 2D three-section tại `horse-racing-frontend/docs/THREE_SECTION_2D_RACE_RENDERER.md`. |
| Seed demo | `seedFullDemo.js` mở rộng dữ liệu racetrack/race/horse để demo đúng theo rule. |

## 8. Kiểm thử đã chạy

```text
Backend: npm test
Kết quả: 125 passed, 0 failed, 4 skipped

Frontend: npm run build
Kết quả: build production thành công
```

Test mới bao phủ validator, service, race snapshot, owner eligibility, registration enforcement và referee ballast.

## 9. Lưu ý cho người tiếp tục phát triển

1. Luôn dùng `racetrackEligibilityService` cho nghiệp vụ eligibility mới; không sao chép điều kiện sang controller/UI.
2. Không bỏ qua `eligibility_rule_snapshot` khi tạo race bằng script hoặc API nội bộ.
3. Nếu thêm loại rule mới, cập nhật đồng thời:
   - `racetrackValidator`;
   - `racetrackEligibilityService`;
   - admin racetrack form;
   - label/adapter frontend owner;
   - seed và test.
4. Đừng xóa racetrack đã được dùng trong lịch sử; dùng archive (`inactive`).
5. Trước khi test demo trên môi trường có DB cũ, bắt buộc chạy migration 003–005.

## 10. File tham chiếu chi tiết

- Thiết kế đầy đủ, API contract và plan test: [`RACETRACK_MANAGEMENT_PLAN.md`](./RACETRACK_MANAGEMENT_PLAN.md)
- Eligibility core: `services/racetrackEligibilityService.js`
- Race integration: `services/raceService.js`
- Owner flow: `services/horseOwnerService.js`
- Referee ballast flow: `services/horseCheckService.js`
- Frontend admin: `horse-racing-frontend/src/Admin/AdminRacetrackModule.jsx`

