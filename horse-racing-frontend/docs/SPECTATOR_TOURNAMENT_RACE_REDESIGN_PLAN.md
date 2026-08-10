# Spectator Tournament and Race Redesign Plan

## 1. Mục tiêu

Thiết kế lại luồng spectator bắt đầu từ trang chi tiết giải đấu, với ba màn hình có trách nhiệm tách biệt:

1. **Tournament Detail**: xem toàn bộ race thuộc giải đấu và trạng thái hiện tại của từng race.
2. **Race Detail / Race Viewer**: xem thông tin race, danh sách ngựa và đường đua 2D, tuyệt đối không có form đặt cược.
3. **Fixed-Odds Betting**: chọn thể thức cược, lựa chọn ngựa, nhập stake và xác nhận cược tại một trang riêng.

Luồng chính:

```text
Tournament List
  -> Tournament Detail
      -> View Race
      -> Bet Now, chỉ khi betting market đang open

Predictions navigation
  -> Race Market Board
      -> Race Prediction Page theo raceId
```

## 2. Design Read

Đây là redesign một race-day product workspace cho spectator, ưu tiên khả năng quét nhanh lịch đua, trạng thái race và hành động phù hợp.

- Design variance: `5/10`
- Motion intensity: `4/10`, riêng race viewer tối đa `7/10`
- Visual density: `8/10`
- Nền tảng: React, native CSS và Lucide hiện có trong dự án
- Giữ nhận diện xanh đậm, màu sáng trung tính và accent amber hiện tại
- Card radius tối đa `8px`
- Không dùng card lồng card
- Loading phải dùng skeleton đúng hình dạng component

## 3. Kết quả audit hiện tại

### 3.1 Frontend hiện có

- Route tournament detail: `/spectator/tournaments/:tournamentId`.
- Trang đã gọi:
  - `GET /api/tournaments/:id`
  - `GET /api/races?tournament_id=<id>`
- Danh sách race hiện chỉ hiển thị thời gian, tên, cự ly và một badge trạng thái.
- CTA `Open Prediction Room` đang dẫn đến trang prediction chung, chưa gắn với một race cụ thể.
- Route `/spectator/predictions` hiện hiển thị tournament thay vì race.
- Route `/spectator/predictions/:tournamentId` đang dùng tournament ID để mở một mock race room.
- Race viewer và betting panel hiện đang nằm chung trong `PredictionDetail.jsx`.

### 3.2 Vấn đề trạng thái hiện tại

Frontend đang normalize các race status sau thành `Prediction Open`:

```text
active, open, scheduled, upcoming
```

Điều này không an toàn. `scheduled` chỉ thể hiện trạng thái lịch đua, không chứng minh betting market đã mở.

### 3.3 Backend hiện có

`Race` hiện có các trường:

```text
tournament_id
round_id
name
race_date
distance
max_participants
location
referee_id
status
```

`status` là chuỗi tự do, mặc định `scheduled`. Backend chưa có enum chính thức trong schema.

Các giá trị đang được backend nhắc đến gồm:

```text
scheduled
started
running
ongoing
in_progress
completed
finished
```

Backend hiện có model `Bet`, nhưng mới chỉ hỗ trợ một lựa chọn ngựa và vị trí dự đoán:

```text
spectator_id
race_id
predicted_horse_id
predicted_position
status
reward_amount
submitted_at
checked_at
```

Schema này chưa đủ cho fixed odds và các loại cược nhiều lựa chọn.

## 4. Nguyên tắc trạng thái

### 4.1 Tách hai state machine

Frontend không được suy ra quyền đặt cược trực tiếp từ `race.status`.

```text
Race lifecycle          Betting market lifecycle
------------------      ------------------------
scheduled               unavailable
running                 open
completed               suspended
cancelled               closed
postponed               settled
                        void
```

Tên chính thức phải được backend xác nhận. Frontend sẽ normalize dữ liệu về hai field canonical:

```js
{
  raceStatus: "scheduled" | "running" | "completed" | "cancelled" | "postponed",
  bettingStatus: "unavailable" | "scheduled" | "open" | "suspended" | "closed" | "settled" | "void"
}
```

### 4.2 Điều kiện hiển thị CTA

| Race status | Betting status | CTA chính | CTA phụ |
|---|---|---|---|
| scheduled | open | `Bet Now` | `View Race` |
| scheduled | scheduled | `View Race` | Không có nút cược |
| running | closed | `Watch Live` | Không có nút cược |
| completed | settled | `View Result` | Không có nút cược |
| cancelled | void | `View Details` | Không có nút cược |
| postponed | suspended | `View Details` | Không có nút cược |

Quy tắc bắt buộc:

```js
canBet = bettingStatus === "open"
```

Không dùng `raceStatus === "scheduled"` để bật đặt cược.

## 5. Kiến trúc route đề xuất

### 5.1 Prediction Race Market Board

```text
/spectator/predictions
```

Thay đổi cốt lõi:

- Không hiển thị tournament cards hoặc tournament portfolio làm đơn vị chính.
- Mỗi item là một race cụ thể, có `raceId`, tournament context, thời gian và market status riêng.
- Race có betting market `open` được ưu tiên đầu tiên.
- Sau đó là race sắp tới gần nhất theo `race_date` tăng dần.
- Click race dẫn đến prediction page của chính race đó.

Route prediction theo race:

```text
/spectator/predictions/races/:raceId
```

Tournament name vẫn xuất hiện như context phụ trên race row, nhưng không còn là đối tượng người dùng phải click trước.

### 5.2 Tournament Detail

```text
/spectator/tournaments/:tournamentId
```

Vai trò:

- Hiển thị thông tin tổng quan giải đấu.
- Hiển thị tất cả race thuộc giải.
- Điều hướng đến race viewer hoặc betting page theo trạng thái.

### 5.3 Race Detail / Viewer

```text
/spectator/tournaments/:tournamentId/races/:raceId
```

Vai trò:

- Hiển thị thông tin race.
- Hiển thị danh sách ngựa, jockey, lane và trạng thái eligibility.
- Hiển thị đường đua oval 2D.
- Khi race đang chạy, animate theo `race_script`.
- Khi hoàn thành, hiển thị kết quả và Top 3.
- Không hiển thị wallet, odds selector, stake input, bet slip hoặc nút xác nhận cược.

### 5.4 Fixed-Odds Betting Page

```text
/spectator/predictions/races/:raceId
```

Vai trò:

- Chỉ cho phép truy cập khi market tồn tại.
- Chỉ cho phép submit khi `bettingStatus === "open"`.
- Hiển thị fixed odds cho từng selection.
- Khóa form ngay khi nhận `stop_betting`, market suspended hoặc market closed.
- Có link `View Race` quay về trang race detail.
- Race và tournament context được resolve từ `raceId`, không phụ thuộc vào tournament được chọn trước đó.

### 5.5 Route cũ

Route hiện tại:

```text
/spectator/predictions/:tournamentId
```

Kế hoạch migration:

- Không xóa ngay để tránh làm hỏng link hiện có.
- Không tiếp tục dùng route động một segment cho dữ liệu mới vì không thể phân biệt `tournamentId` và `raceId` an toàn.
- Chuyển link mới sang `/spectator/predictions/races/:raceId`.
- Trong giai đoạn chuyển đổi, route cũ redirect về `/spectator/predictions`.
- Sau khi toàn bộ link được chuyển sang race-based route, mới cân nhắc loại bỏ route cũ.

## 6. Prediction Race Market Board

### 6.1 Mục tiêu

Khi spectator click `Predictions` trên navigation, màn hình đầu tiên phải trả lời ngay:

1. Race nào đang đặt cược được?
2. Race nào sắp mở hoặc sắp chạy?
3. Betting sẽ đóng lúc nào?
4. Fixed odds hiện tại cho race là gì?

Không yêu cầu người dùng chọn tournament trước khi tìm race có thể cược.

### 6.2 Thứ tự ưu tiên

Sort canonical đề xuất:

1. `bettingStatus === "open"`, sort theo `bettingClosesAt` tăng dần.
2. Race sắp tới có `bettingStatus === "scheduled"`, sort theo `raceDate` tăng dần.
3. Race sắp tới nhưng market chưa có hoặc `unavailable`, sort theo `raceDate` tăng dần.
4. `raceStatus === "running"`, chỉ để theo dõi trạng thái, không cho đặt cược.
5. Race `completed`, `cancelled` hoặc `postponed` không nằm trong feed mặc định; truy cập qua filter tương ứng hoặc Results.

Race được xem là sắp tới khi:

```js
isUpcoming = raceDate > serverTime
  && !["running", "completed", "cancelled", "postponed"].includes(raceStatus)
```

Backend hiện chưa có field market status. Vì vậy:

- Chỉ dữ liệu market trả rõ `open` mới được gắn nhãn `Betting Open`.
- `Race.status === "scheduled"` chỉ được dùng để xác định race sắp tới.
- Không tự chuyển `scheduled` thành `open`.

### 6.3 Race market row

Mỗi race row hiển thị:

```text
Scheduled time hoặc countdown
Race name
Tournament name
Round
Track / distance
Runner count
Race status
Betting status
Market closes at
Supported bet types
Primary fixed odds preview, khi backend có
```

Hành vi click:

- Click toàn bộ race row hoặc CTA `Open Market` đi tới `/spectator/predictions/races/:raceId`.
- Market `open`: prediction page cho phép chọn và submit bet.
- Market `scheduled`: prediction page ở trạng thái read-only, hiển thị thời điểm mở nếu backend cung cấp.
- Market `suspended`, `closed`, `settled` hoặc `void`: prediction page khóa form và giải thích trạng thái.
- Race `running`: CTA ưu tiên đổi thành `Watch Race`, dẫn sang Race Detail thay vì tạo cảm giác vẫn cược được.

### 6.4 Filters

```text
Available
Opening Soon
Live Races
All Upcoming
```

Default filter là `Available`, nhưng nếu không có market open thì tự chuyển sang `Opening Soon` và hiển thị race sắp tới gần nhất.

### 6.5 Empty states

- Không có market open: hiển thị race sắp tới và thời gian dự kiến.
- Không có race sắp tới: điều hướng sang tournament board hoặc results.
- Market API lỗi: không dùng fallback để giả lập `open`; hiển thị unavailable và retry.
- Race list lỗi: skeleton chuyển sang inline error với retry, không để trang trắng.

## 7. Redesign Tournament Detail

### 7.1 Cấu trúc desktop

```text
Back navigation

Tournament identity and status
Location / date range / track / total races

Race status summary
All / Betting Open / Live / Completed

Race list
  Race number and scheduled time
  Race name, round, distance, location
  Race status badge
  Betting status badge
  Runner count
  View Race
  Bet Now, conditional
```

Không dùng hero marketing quá lớn. Tournament identity chỉ nên chiếm phần đầu viewport vừa đủ để race list xuất hiện ngay bên dưới.

### 7.2 Cấu trúc mobile

- Header giải đấu dạng compact.
- Filter race dùng horizontal segmented control có scroll containment.
- Mỗi race là một row hoặc compact panel toàn chiều rộng.
- Trạng thái, giờ bắt đầu và race name phải xuất hiện trước CTA.
- Hai CTA xếp ngang khi đủ chỗ, xếp dọc dưới `360px`.
- Không để badge hoặc button làm thay đổi chiều cao row khi trạng thái cập nhật.

### 7.3 Bộ lọc race

Các view đề xuất:

```text
All
Betting Open
Live
Completed
```

Mỗi filter hiển thị count từ dữ liệu thực tế.

Sort mặc định:

1. Race đang diễn ra.
2. Race đang mở cược.
3. Race sắp diễn ra theo `race_date` tăng dần.
4. Race đã hoàn thành theo thời gian mới nhất.
5. Race cancelled hoặc postponed ở cuối danh sách.

### 7.4 Race row data

Frontend cần nhận hoặc dựng được:

```js
{
  id,
  tournamentId,
  roundId,
  roundName,
  raceNumber,
  name,
  raceDate,
  distance,
  location,
  runnerCount,
  maxParticipants,
  raceStatus,
  bettingStatus,
  bettingClosesAt,
  resultStatus
}
```

## 8. Race Detail / Race Viewer

### 8.1 Nội dung bắt buộc

- Breadcrumb về tournament detail.
- Race name, round, race number và giờ bắt đầu.
- Race status và betting status chỉ để thông tin.
- Cự ly, địa điểm, số runner và track condition nếu backend có.
- Danh sách ngựa tham gia đã được approved.
- Jockey assignment và lane.
- Đường đua oval 2D.
- Live ranking khi đang chạy.
- Official result khi đã publish.

### 8.2 Quy tắc không đặt cược

Trang này không được render:

- Wallet balance.
- Stake input.
- Quick stake.
- Bet type selector.
- Fixed odds selection control.
- Bet slip.
- Confirm bet modal.

Nếu betting market đang open, có thể hiển thị duy nhất một CTA điều hướng:

```text
Bet on this race
```

CTA này chỉ điều hướng sang betting page, không mở form cược trên race viewer.

### 8.3 Trạng thái viewer

```text
Scheduled: oval track tĩnh và danh sách lane.
Ready: countdown đến giờ bắt đầu.
Running: animate 5 hoặc N runner từ race_script.
Completed: đường đua dừng ở finish và hiển thị Top 3.
Postponed: thông báo lịch thay đổi.
Cancelled: thông báo race bị hủy.
Disconnected: giữ frame cuối, không tự giả lập tiến độ.
```

## 9. Fixed-Odds Betting Page

### 9.1 Nguyên tắc fixed odds

- Odds hiển thị khi người dùng tạo bet slip.
- Odds phải được backend xác nhận khi submit.
- Bet receipt lưu `accepted_odds`, không dùng odds mới sau khi bet đã accepted.
- Potential return chỉ là preview trước submit.
- Backend là nguồn sự thật cho stake, odds, acceptance và settlement.
- Nếu odds thay đổi trước khi accepted, backend phải trả trạng thái yêu cầu người dùng xác nhận lại hoặc reject theo contract đã thống nhất.

### 9.2 Các thể thức cược

| Bet type | Selection requirement | Ý nghĩa đề xuất |
|---|---:|---|
| Win | 1 horse | Ngựa về nhất |
| Place | 1 horse | Ngựa nằm trong nhóm trả thưởng Place |
| Show | 1 horse | Ngựa nằm trong nhóm trả thưởng Show |
| Quinella | 2 horses, không thứ tự | Hai ngựa về nhất và nhì, không cần đúng thứ tự |
| Exacta | 2 horses, có thứ tự | Chọn đúng ngựa hạng nhất và hạng nhì theo thứ tự |
| Trifecta | 3 horses, có thứ tự | Chọn đúng Top 3 theo thứ tự |

Quy tắc Place và Show khác nhau theo thị trường. Backend phải xác nhận chính xác:

- Place trả cho Top 2 hay Top 3.
- Show trả cho Top 3 hay quy tắc khác.
- Dead heat, scratched horse và race có ít runner được xử lý thế nào.

Frontend chưa hard-code các quy tắc trả thưởng này trong giai đoạn UI prototype.

### 9.3 Betting page layout

Desktop:

```text
Race context and market countdown

Runner and odds board             Bet slip
Bet type segmented control        Selection order
Horse selections                  Stake
                                  Accepted odds preview
                                  Potential return preview
                                  Confirm bet
```

Mobile:

```text
Race context
Countdown and market status
Bet type selector
Runner odds board
Sticky bet slip summary
Confirm flow in modal or bottom sheet
```

Sticky bet slip không được che runner list hoặc nút hệ thống của trình duyệt.

### 9.4 Selection behavior

- Win, Place, Show: chọn đúng một ngựa.
- Quinella: chọn hai ngựa, không hiển thị position slot.
- Exacta: có slot `1st` và `2nd`, cho phép reorder.
- Trifecta: có slot `1st`, `2nd`, `3rd`, cho phép reorder.
- Không cho cùng một ngựa xuất hiện ở nhiều slot của cùng một bet.
- Đổi bet type phải cảnh báo hoặc reset selection không tương thích.
- Odds phải gắn với combination, không chỉ gắn từng horse riêng lẻ đối với Quinella, Exacta và Trifecta.

## 10. Backend contract còn thiếu

### 10.1 Betting market

Backend cần một market snapshot tương đương:

```json
{
  "race_id": "race_id",
  "status": "open",
  "opens_at": "2026-06-13T08:30:00.000Z",
  "closes_at": "2026-06-13T08:59:30.000Z",
  "server_time": "2026-06-13T08:45:00.000Z",
  "currency": "PTS",
  "min_stake": 10,
  "max_stake": 1000,
  "supported_bet_types": ["win", "place", "show", "quinella", "exacta", "trifecta"]
}
```

### 10.2 Odds board

Single-selection market:

```json
{
  "market_id": "market_id",
  "bet_type": "win",
  "selections": [
    {
      "selection_id": "selection_id",
      "horse_ids": ["horse_id"],
      "odds": 2.4,
      "status": "active"
    }
  ]
}
```

Combination market phải có odds riêng cho combination:

```json
{
  "selection_id": "exacta_h1_h2",
  "horse_ids": ["horse_1", "horse_2"],
  "ordered": true,
  "odds": 8.5
}
```

### 10.3 Submit bet

Payload đề xuất:

```json
{
  "race_id": "race_id",
  "market_id": "market_id",
  "bet_type": "exacta",
  "selection_ids": ["horse_1", "horse_2"],
  "stake": 200,
  "displayed_odds": 8.5,
  "client_request_id": "uuid"
}
```

Receipt tối thiểu:

```json
{
  "bet_id": "bet_id",
  "status": "accepted",
  "accepted_odds": 8.5,
  "stake": 200,
  "potential_return": 1700,
  "wallet_balance": 1080,
  "accepted_at": "2026-06-13T08:45:04.000Z"
}
```

### 10.4 Thay đổi cần thiết cho model Bet

Model hiện tại cần được mở rộng hoặc thay bằng cấu trúc market/selection rõ ràng:

```text
market_id
bet_type
selection_ids hoặc selections[]
stake
displayed_odds
accepted_odds
potential_return
currency
client_request_id, unique
status
rejection_reason
settled_at
```

`predicted_horse_id` đơn lẻ không thể biểu diễn Quinella, Exacta hoặc Trifecta.

### 10.5 Spectator-safe race data

Frontend cần endpoint spectator-readable cho:

- Race detail.
- Approved participants của race.
- Jockey assignment.
- Lane assignment.
- Published results.
- Betting market và odds.

Backend code hiện cho phép spectator đã đăng nhập gọi `GET /api/race-results`. Backend cũng mount endpoint chỉ trả kết quả `published` tại `GET /users/spectator/races/:raceId/results`, nhưng route này nằm ngoài prefix `/api` nên frontend client/proxy hiện tại chưa gọi trực tiếp được. Spectator-safe participant endpoint vẫn còn thiếu.

### 10.6 Race market discovery

Prediction Race Market Board cần endpoint hoặc aggregate response có thể lấy race từ nhiều tournament:

```text
GET /api/races?from=<server_time>&include=betting_market,tournament
```

Hoặc endpoint chuyên biệt:

```text
GET /api/spectator/race-markets?status=open,scheduled
```

Response cần chứa `server_time` để frontend sort và countdown nhất quán. Không nên tải từng tournament rồi gọi races theo vòng lặp vì tạo N+1 requests.

## 11. Frontend module plan

```text
src/pages/spectator/
  TournamentDetail.jsx
  PredictionRaceBoard.jsx
  RaceDetail.jsx
  RaceBetting.jsx
  race/
    RaceMarketList.jsx
    RaceMarketRow.jsx
    RaceList.jsx
    RaceListRow.jsx
    RaceStatusBadge.jsx
    BettingStatusBadge.jsx
    RaceSummary.jsx
    RaceParticipants.jsx
    raceStatus.js
  betting/
    FixedOddsBoard.jsx
    BetTypeSelector.jsx
    OrderedSelectionSlots.jsx
    BetSlip.jsx
    BetConfirmation.jsx
    fixedOddsRules.js
```

Tái sử dụng:

- `RaceViewer2D.jsx`
- `raceScriptAdapter.js`
- `raceMath.js`
- `useRacePlayback.js`

Không tái sử dụng betting panel bên trong Race Detail.

## 12. API adapter plan

### 12.1 Không gộp status

Thay `normalizeRaceStatus()` hiện tại bằng hai adapter riêng:

```js
normalizeRaceLifecycle(status)
normalizeBettingMarketStatus(status)
```

### 12.2 Không dùng fallback để mở cược

- Fallback race có thể dùng để render prototype.
- Fallback không được mặc định `bettingStatus: "open"`.
- Khi market status thiếu, dùng `unavailable` và ẩn nút `Bet Now`.

### 12.3 Race market board

Hook đề xuất:

```js
useSpectatorRaceMarkets()
```

Trách nhiệm:

- Load race và market context trên toàn bộ tournament.
- Normalize riêng race status và betting status.
- Sort market open và race sắp tới theo quy tắc canonical.
- Dùng `server_time`, không phụ thuộc hoàn toàn vào đồng hồ thiết bị.
- Không đánh dấu market open khi API market thiếu hoặc lỗi.

### 12.4 Race detail snapshot

Hook đề xuất:

```js
useSpectatorRaceDetail(tournamentId, raceId)
```

Kết quả:

```js
{
  tournament,
  race,
  participants,
  publishedResults,
  bettingMarket,
  isLoading,
  error,
  reload
}
```

Betting page có hook riêng để tránh Race Detail vô tình phụ thuộc vào betting state:

```js
useFixedOddsMarket(raceId)
```

## 13. UI states bắt buộc

### Prediction Race Market Board

- Loading skeleton theo race rows.
- Betting open.
- Opening soon.
- Không có market open nhưng có upcoming races.
- Live race không còn quyền cược.
- Empty upcoming schedule.
- Partial market API error.
- Realtime market status update không làm đảo vị trí khi người dùng đang thao tác trên row.

### Tournament Detail

- Loading skeleton theo race rows.
- Empty tournament với thông báo chưa có race.
- Partial error khi tournament load được nhưng race list lỗi.
- Refresh action.
- Live state update không làm nhảy layout.

### Race Detail

- Scheduled static track.
- Running animation.
- Completed result.
- Missing race script.
- Disconnected/reconnecting.
- Cancelled/postponed.

### Betting Page

- Market loading.
- Market scheduled.
- Market open.
- Odds refreshing.
- Selection incomplete.
- Stake invalid.
- Confirmation pending.
- Accepted.
- Rejected.
- Suspended.
- Closed bởi `stop_betting`.
- Duplicate request trả lại receipt cũ.

## 14. Implementation phases

### Phase 0: Race-first Prediction Board

- [x] Thay tournament list trong `/spectator/predictions` bằng race market list.
- [x] Thêm canonical sorting cho market open và upcoming races.
- [x] Thêm filters `Available`, `Opening Soon`, `Live Races`, `All Upcoming`.
- [x] Thêm route `/spectator/predictions/races/:raceId`.
- [x] Chuyển mọi CTA prediction sang sử dụng `raceId`.
- [x] Route cũ `/spectator/predictions/:tournamentId` redirect về race market board.
- [x] Không dùng race `scheduled` để tự bật betting.
- [x] Thêm skeleton, empty, API error và responsive states.

Phase 0 verification:

- `artifacts/race-market-board-phase-0/verification-report.json`
- `artifacts/race-market-board-phase-0/race-market-board-desktop-1440x1000.png`
- `artifacts/race-market-board-phase-0/race-market-board-mobile-390x844.png`
- Repeatable harness: `node scripts/verify-race-market-board-phase0.mjs`.
- Backend hiện chưa có aggregate market endpoint. Preview market chỉ được dùng trong development và được gắn nhãn rõ; production API failure không tự tạo market open.

### Phase 1: Contract-safe Tournament Detail redesign

- [x] Tạo canonical race lifecycle mapping.
- [x] Loại bỏ mapping `scheduled -> Prediction Open`.
- [x] Thiết kế race summary counts và filters.
- [x] Hiển thị toàn bộ race của tournament.
- [x] Thêm `View Race` cho mọi race hợp lệ.
- [x] Chỉ thêm `Bet Now` khi `bettingStatus === "open"`.
- [x] Thêm skeleton, empty, partial error và responsive states.

Phase 1 verification:

- `artifacts/tournament-phase-1/verification-report.json`
- `artifacts/tournament-phase-1/tournament-detail-desktop-1440x1000.png`
- `artifacts/tournament-phase-1/tournament-detail-mobile-390x844.png`
- `artifacts/tournament-phase-1/race-detail-desktop-1440x1000.png`
- Repeatable harness: `node scripts/verify-tournament-phase1.mjs`

### Phase 2: Race Detail route

- [x] Thêm route race detail.
- [x] Tách RaceViewer2D khỏi betting page để tái sử dụng độc lập.
- [x] Hiển thị race metadata và approved participants.
- [x] Hiển thị static, live và completed track states.
- [x] Đảm bảo không có betting control trên trang.
- [x] Thêm CTA điều hướng sang betting page khi market open.

Phase 2 verification:

- `artifacts/race-detail-phase-2/verification-report.json`
- `artifacts/race-detail-phase-2/race-detail-running-desktop-1440x1100.png`
- `artifacts/race-detail-phase-2/race-detail-completed-desktop-1440x1100.png`
- `artifacts/race-detail-phase-2/race-detail-scheduled-mobile-390x844.png`
- Repeatable harness: `node scripts/verify-race-detail-phase2.mjs`
- Participant, race script và result hiện dùng fixture 5 ngựa; thay bằng spectator-safe API/socket trong Phase 5.

### Phase 3: Fixed-Odds UI prototype

- [x] Thêm route betting theo race.
- [x] Thiết kế odds board cho sáu bet types.
- [x] Xây selection rules cho single, unordered pair và ordered combinations.
- [x] Xây bet slip, stake validation và confirmation modal.
- [x] Dùng mock market contract trước khi backend hoàn tất.
- [x] Khóa form khi market không open hoặc nhận `stop_betting`.

Phase 3 verification:

- `artifacts/fixed-odds-phase-3/verification-report.json`
- `artifacts/fixed-odds-phase-3/fixed-odds-trifecta-desktop-1440x1100.png`
- `artifacts/fixed-odds-phase-3/fixed-odds-mobile-390x844.png`
- Repeatable harness: `node scripts/verify-fixed-odds-phase3.mjs`
- Route mới: `/spectator/predictions/races/:raceId`.
- Odds, receipt và wallet hiện dùng mock contract/transport; backend vẫn là nguồn sự thật khi sang Phase 5.

### Phase 4: Backend contract lock

Frontend contract groundwork:

- [x] Audit model, route và quyền truy cập backend hiện tại.
- [x] Tạo fixed-odds contract version `1` và market validator fail-closed.
- [x] Validate accepted receipt và dùng `accepted_odds`/`potential_return` từ server receipt.
- [x] Định nghĩa đề xuất market states `scheduled`, `open`, `suspended`, `closed`, `settled`, `void`.
- [x] Thêm trạng thái runner `scratched` và tự loại runner không active khỏi slip chưa submit.
- [x] Viết tài liệu handoff tại `BETTING_BACKEND_CONTRACT.md`.

- [ ] Xác nhận race status enum.
- [ ] Xác nhận betting market status enum.
- [ ] Xác nhận Place và Show settlement rules.
- [ ] Xác nhận odds precision và rounding.
- [ ] Xác nhận odds-change acceptance flow.
- [ ] Xác nhận scratched horse, dead heat, cancelled race và void bet.
- [ ] Xác nhận wallet currency và stake limits.
- [x] Mở authenticated spectator read access cho race results.
- [ ] Chuẩn hóa dedicated spectator result route dưới `/api` hoặc thêm transport frontend có chủ đích cho backend mount `/users`.
- [ ] Mở spectator-safe participant access.

Phase 4 status:

- Frontend contract và safety boundary đã hoàn thành.
- Các checkbox xác nhận backend ở trên vẫn mở vì backend hiện chưa có market, odds, wallet hoặc betting routes.
- `models/Bet.js` hiện chưa biểu diễn được Quinella, Exacta hoặc Trifecta.
- `GET /api/race-results` đã cấp quyền đọc cho spectator trong backend code; frontend cần lọc/hiển thị published results và bỏ sample fallback trên màn hình connected.
- Verification: `node scripts/verify-betting-contract-phase4.mjs`.
- Report: `artifacts/betting-contract-phase-4/verification-report.json`.

### Phase 5: Production integration

- [ ] Nối market snapshot và odds API.
- [ ] Nối submit bet API với idempotency key.
- [ ] Nối realtime market, wallet và race events.
- [ ] Reconcile REST snapshot với socket sequence.
- [ ] Thay mock fixtures bằng backend data.

### Phase 6: Verification

- [ ] Production build.
- [ ] Test tất cả race/betting state combinations.
- [ ] Test sáu bet types và selection cardinality.
- [ ] Test anti-cheat lock trong lúc confirmation modal đang mở.
- [ ] Test fixed odds receipt không thay đổi sau acceptance.
- [ ] Test desktop, tablet và mobile screenshots.
- [ ] Audit margin, overflow, clipping và text wrapping.
- [ ] Test keyboard navigation và reduced motion.

## Session Closeout - 2026-06-14

### Delivered spectator surfaces

- Race-first prediction board with open markets prioritized ahead of upcoming races.
- Tournament detail race schedule with separate race information and betting navigation.
- Dedicated race detail route with no betting controls.
- Dedicated fixed-odds betting route supporting Win, Place, Show, Quinella, Exacta, and Trifecta in mock mode.
- Oval 2D viewer implemented with React, DOM elements, CSS, `requestAnimationFrame`, and `translate3d` transforms.

### Latest race viewer behavior

- All five horses begin at `0%` progress on the shared start/finish line.
- A three-second `Runners at the gate` state is shown before movement.
- Deterministic finish order: Golden Gallop, Crimson Comet, Thunderbolt, Silver Flash, Midnight Run.
- Finish times are separated from `56.00s` to `67.00s` so the order is visually obvious.
- Rank-based post-finish offsets prevent runners from collapsing onto the finish marker.
- Live ranking shows leader and distance gaps; completed ranking shows finish times.
- Broadcast telemetry, leader callout, double rails, distance markers, dust motion, Top 3 overlay, and reduced-motion support are implemented.

### Verification

- Production build: passed.
- Harness: `node scripts/verify-race-detail-phase2.mjs`.
- Report: `artifacts/race-detail-phase-2/verification-report.json`.
- Verified start progress for all five horses: `0%`.
- Verified viewer/lower-panel gap: `22px`.
- Verified lower table gap: `20px`.
- Verified finished runner separation and no horizontal overflow on `390x844` mobile.

### Remaining dependency

The viewer remains a deterministic frontend fixture. Production use requires spectator-safe participants/results endpoints plus authenticated realtime `race_script` and authoritative `race_finished` contracts.

## 15. Acceptance criteria

### Prediction Race Market Board

- Navigation `Predictions` mở danh sách race, không mở danh sách tournament.
- Market `open` luôn đứng trước các market khác.
- Nếu không có market open, race sắp tới gần nhất xuất hiện đầu tiên.
- Mỗi row hiển thị tournament context nhưng được định danh bằng `raceId`.
- Click race market dẫn đúng `/spectator/predictions/races/:raceId`.
- Race `scheduled` không tự động được xem là betting open.
- Race running không hiển thị CTA đặt cược.
- Market API lỗi không tạo market open giả từ mock fallback.

### Tournament Detail

- Tất cả race thuộc tournament xuất hiện trong một danh sách rõ ràng.
- Race completed, live, scheduled và cancelled có visual state khác nhau.
- Betting state không bị suy ra từ race status.
- `Bet Now` chỉ xuất hiện khi market trả về `open`.
- `View Race` luôn dẫn đến đúng `raceId`.

### Race Detail

- Đường đua render không blank ở desktop và mobile.
- Không tồn tại input stake, odds selector hoặc confirm bet.
- Live race có runner movement và ranking.
- Completed race hiển thị published result và Top 3.

### Betting Page

- Hỗ trợ Win, Place, Show, Quinella, Exacta và Trifecta.
- Fixed odds được lưu trong accepted receipt.
- Form khóa ngay khi market đóng.
- Không thể submit selection sai số lượng hoặc lặp horse.
- Duplicate `client_request_id` không trừ ví lần hai.

## 16. Các quyết định chờ người dùng/backend

1. Luật trả thưởng cụ thể cho từng bet type.
2. Place là Top 2 hay Top 3.
3. Show là Top 3 hay cấu hình theo số runner.
4. Chính sách odds thay đổi trước acceptance.
5. Cách xử lý dead heat, scratched horse, postponed và cancelled race.
6. Cách tính payout, rounding, fee và currency.
7. Có cho phép cash-out hoặc hủy bet hay không.

Những phần này được giữ dưới dạng contract dependency và không block việc bắt đầu redesign Tournament Detail, Race Detail và fixed-odds UI prototype.
