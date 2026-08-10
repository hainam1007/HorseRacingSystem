# Công Thức Xác Suất Và Tỷ Lệ Cược

## 1. Mục đích

Tài liệu này giải thích cách hệ thống hiện tại chuyển kết quả của AI thành tỷ lệ cược, cách tính tiền trả thưởng, lý do sử dụng hệ số `0.85`, và các giới hạn cần xử lý để odds phù hợp với Race Engine.

Phạm vi hiện tại:

```text
Loại cược: Win only
Đơn vị cược: TOKEN ảo
Nguồn xác suất: probability_engine_history_v1
Kết quả chính thức: Race Engine và luồng referee/race result
```

Model chỉ tạo odds trước cuộc đua. Model không trực tiếp quyết định kết quả chính thức của cuộc đua trong implementation hiện tại.

## 2. Thuật ngữ

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| `stake` | Số TOKEN người chơi đặt cược |
| `raw_probability` | Xác suất thô LightGBM trả về cho từng ngựa |
| `win_probability` | Xác suất thắng sau khi chuẩn hóa trong cùng race |
| `fair_odds` | Decimal odds hòa vốn, chưa trừ lợi thế của hệ thống |
| `game_odds` | Decimal odds thực tế dùng để trả thưởng |
| `payout` | Tổng TOKEN trả về khi thắng, đã bao gồm stake |
| `profit` | Lợi nhuận thực tế sau khi trừ stake |
| `RTP` | Return To Player, tỷ lệ hoàn trả kỳ vọng cho người chơi |
| `house_edge` | Lợi thế kỳ vọng của hệ thống |

## 3. Luồng tính hiện tại

```text
Input của race và từng ngựa
  -> LightGBM dự đoán raw probability
  -> Softmax giữa các ngựa trong race
  -> win_probability
  -> fair_odds = 1 / win_probability
  -> game_odds = fair_odds * 0.85
  -> Lưu snapshot odds
  -> payout = stake * game_odds
```

Các file nguồn:

```text
app_probability_engine_history_v1_runtime/engine/probability_engine.py
app_probability_engine_history_v1_runtime/engine/odds.py
constants/probabilityModel.js
services/raceOddsService.js
services/betService.js
models/Bet.js
```

## 4. Công thức xác suất hiện tại

Giả sử LightGBM trả về một giá trị `q_i` cho ngựa `i`.

Implementation hiện tại chuẩn hóa bằng softmax:

```text
p_i = exp(q_i - max(q)) / sum(exp(q_j - max(q)))
```

Trong đó:

```text
p_i = win_probability của ngựa i
sum(p_i) = 1 trong cùng một race
```

Trừ `max(q)` không thay đổi kết quả softmax. Nó chỉ tránh lỗi tràn số khi tính hàm mũ.

### Vì sao phải chuẩn hóa theo race?

Một race chỉ có một ngựa thắng. Vì vậy tổng xác suất thắng của tất cả ngựa phải bằng `1`, tương đương `100%`.

Ví dụ:

```text
Horse A: 30%
Horse B: 25%
Horse C: 20%
Horse D: 15%
Horse E: 10%

Total: 100%
```

Backend kiểm tra tổng xác suất và từ chối kết quả model nếu:

```text
abs(sum(win_probability) - 1) > 0.0001
```

## 5. Công thức fair odds

Với xác suất thắng `p`:

```text
fair_odds = 1 / p
```

Ví dụ một ngựa có xác suất thắng `25%`:

```text
p = 0.25
fair_odds = 1 / 0.25 = 4.00
```

Nếu trả đúng fair odds và xác suất hoàn toàn chính xác, người chơi và hệ thống sẽ hòa vốn trong dài hạn.

Ví dụ đặt `100 TOKEN`:

```text
Payout nếu thắng = 100 * 4.00 = 400 TOKEN
Expected payout = 25% * 400 = 100 TOKEN
```

Người chơi bỏ ra `100 TOKEN` và kỳ vọng nhận lại đúng `100 TOKEN`, nên house edge bằng `0%`.

## 6. Công thức game odds

Hệ thống không trả toàn bộ fair odds. Hệ thống áp dụng payout factor:

```text
PAYOUT_FACTOR = 0.85
game_odds = fair_odds * PAYOUT_FACTOR
```

Sau đó odds được giới hạn:

```text
game_odds = clamp(game_odds, 1.01, 99.0)
```

Công thức đầy đủ:

```text
game_odds = clamp((1 / p) * 0.85, 1.01, 99.0)
```

### Ví dụ

```text
p = 0.25
fair_odds = 1 / 0.25 = 4.00
game_odds = 4.00 * 0.85 = 3.40
```

Người chơi đặt `100 TOKEN`:

```text
Payout nếu thắng = 100 * 3.40 = 340 TOKEN
Profit nếu thắng = 340 - 100 = 240 TOKEN
```

Giá trị kỳ vọng:

```text
Expected payout = 25% * 340 = 85 TOKEN
Expected loss = 100 - 85 = 15 TOKEN
```

Do đó, khi `p` phản ánh đúng xác suất kết quả:

```text
RTP = 85%
house_edge = 15%
```

## 7. Vì sao chọn hệ số 0.85?

Hệ số `0.85` có các lợi ích cho ứng dụng demo:

1. Công thức đơn giản và dễ kiểm tra.
2. Mọi lựa chọn có RTP lý thuyết giống nhau khi xác suất chính xác.
3. Hạn chế lạm phát TOKEN do payout.
4. Không cần xây dựng bookmaker liability engine phức tạp.
5. FE có thể hiển thị decimal odds trực tiếp.
6. Backend có thể snapshot odds và settlement ổn định.

Tuy nhiên, `0.85` không phải kết quả do model AI học được. Đây là một cấu hình kinh doanh được hard-code cho nền kinh tế TOKEN ảo.

Ý nghĩa của một số payout factor:

| Payout factor | RTP lý thuyết | House edge lý thuyết |
| ---: | ---: | ---: |
| `0.80` | 80% | 20% |
| `0.85` | 85% | 15% |
| `0.90` | 90% | 10% |
| `0.95` | 95% | 5% |

Tên tham số `margin=0.85` trong `odds.py` có thể gây hiểu nhầm. Về nghiệp vụ, tên chính xác hơn là `payout_factor=0.85`; margin thực tế là:

```text
house_margin = 1 - payout_factor = 0.15
```

## 8. Công thức payout

Khi đặt cược, backend lưu snapshot gồm:

```text
model_name
model_version
generated_at
payout_factor
win_probability
fair_odds
game_odds
probability_rank
```

Payout tiềm năng:

```text
potential_payout = round(stake_amount * game_odds, 2)
```

Khi kết quả được publish:

```text
Nếu predicted_horse_id là ngựa có final_position = 1:
  bet = won
  payout_amount = potential_payout

Nếu không:
  bet = lost
  payout_amount = 0
```

Snapshot bảo đảm odds của bet cũ không thay đổi nếu admin generate odds lại sau đó.

## 9. Tác động của giới hạn odds

Hệ thống giới hạn odds trong khoảng:

```text
1.01 <= game_odds <= 99.0
```

Mục đích:

- Không cho odds thấp hơn `1.01`, vì thắng nhưng payout thấp hơn hoặc bằng stake là không hợp lý.
- Không cho odds quá `99.0`, tránh payout cực lớn do xác suất gần bằng `0`.
- Giảm rủi ro số học và rủi ro nền kinh tế TOKEN.

Khi odds bị clamp, RTP thực tế không còn chính xác bằng `85%`. Ngựa có xác suất cực thấp có thể bị giảm payout nhiều hơn dự kiến.

## 10. Vấn đề normalization hiện tại

LightGBM binary classifier hiện trả về probability-like output trong khoảng `[0, 1]`. Runtime tiếp tục áp dụng softmax lên các giá trị này.

Ví dụ raw output:

```text
[0.30, 0.20, 0.15, 0.12, 0.08, 0.05]
```

Nếu normalize trực tiếp:

```text
p_i = q_i / sum(q_j)

[33.3%, 22.2%, 16.7%, 13.3%, 8.9%, 5.6%]
```

Nếu softmax probability như implementation hiện tại:

```text
[19.3%, 17.5%, 16.6%, 16.1%, 15.5%, 15.0%]
```

Softmax làm khoảng cách giữa ngựa mạnh và ngựa yếu bị nén đáng kể. Kết quả là odds khá phẳng.

### Hướng đánh giá đề xuất

Không nên đổi công thức mà không chạy lại validation. Cần so sánh tối thiểu:

```text
Phương án A: softmax trên probability hiện tại
Phương án B: q_i / sum(q_j)
Phương án C: lấy raw LightGBM score rồi softmax
```

Các metric phải chạy lại:

```text
Log Loss
Brier Score
Top-1 Accuracy
Top-3 Capture
Calibration MAE
Probability sum per race
```

Sau khi thay normalization, metrics cũ không được xem là metrics chính thức của pipeline mới.

## 11. Vấn đề giữa odds và Race Engine

Race Engine hiện tạo finish order bằng Fisher-Yates shuffle. Mỗi ngựa đủ điều kiện có cơ hội thắng gần bằng:

```text
true_race_probability = 1 / participant_count
```

Race Engine chưa sử dụng `win_probability` của model.

Điều này làm giả định RTP `85%` không còn đúng. House edge `15%` chỉ đúng khi xác suất thắng thực tế bằng xác suất dùng để tính odds.

### Ví dụ lỗi kinh tế

Race có sáu ngựa. Race Engine cho mỗi ngựa xác suất thắng khoảng:

```text
1 / 6 = 16.67%
```

Model đánh giá một ngựa có xác suất `8%`:

```text
fair_odds = 1 / 0.08 = 12.50
game_odds = 12.50 * 0.85 = 10.625
```

Nhưng Race Engine vẫn cho ngựa đó cơ hội thắng `16.67%`:

```text
Expected return = 16.67% * 10.625 = 177.1%
```

Người chơi có thể liên tục chọn ngựa model đánh giá thấp nhưng Race Engine vẫn cho cơ hội thắng đồng đều. Đây là chiến lược có expected profit dương và có thể làm mất cân bằng TOKEN.

## 12. Kiến trúc mục tiêu đề xuất

Race Engine vẫn có thể giữ yếu tố random để phục vụ demo, nhưng random cần có trọng số theo model:

```text
RaceOddsMarket.win_probability
  -> weighted random selection
  -> provisional finish order
  -> referee checks and violations
  -> final result
  -> bet settlement
```

Nguyên tắc:

1. Ngựa có `win_probability = 30%` phải có xấp xỉ `30%` cơ hội thắng qua nhiều lần mô phỏng.
2. Dùng seeded random để cùng seed và cùng input tạo cùng kết quả.
3. Dùng weighted sampling without replacement để tạo toàn bộ thứ tự.
4. Nếu chưa có odds market hợp lệ, Race Engine có thể fallback về uniform random.
5. Penalty và disqualification vẫn được áp dụng sau provisional result.
6. Betting phải đóng trước khi Race Engine tạo hoặc công khai finish order.

Weighted random không làm cuộc đua trở thành deterministic. Model chỉ điều chỉnh xác suất; kết quả cụ thể vẫn ngẫu nhiên.

## 13. Công thức mục tiêu

Phương án ngắn hạn cần được kiểm chứng bằng validation:

```text
q_i = LightGBM predicted probability
p_i = q_i / sum(q_j)

fair_odds_i = 1 / p_i
game_odds_i = clamp(fair_odds_i * payout_factor, 1.01, 99.0)

winner ~ WeightedRandom(p_1, p_2, ..., p_n)
payout = stake * game_odds_winner
```

Trong điều kiện:

```text
Race Engine sử dụng cùng p_i
Không có clamp tác động đáng kể
Không có penalty làm thay đổi winner
Model probability được calibration phù hợp
```

thì:

```text
Expected RTP ~= payout_factor
Expected house edge ~= 1 - payout_factor
```

Với payout factor hiện tại:

```text
Expected RTP ~= 85%
Expected house edge ~= 15%
```

## 14. Trạng thái implementation

### Đã có

- LightGBM probability model.
- Chuẩn hóa xác suất để tổng trong race bằng `1`.
- `fair_odds` và `game_odds`.
- Payout factor `0.85`.
- Odds snapshot trên từng bet.
- Wallet deduction, refund và settlement.
- Odds clamp `1.01-99.0`.
- Seeded random trong Race Engine.

### Chưa có

- Validation so sánh ba phương án normalization.
- Weighted Race Engine sử dụng model probability.
- Mô phỏng RTP qua số lượng race lớn.
- Calibration lại probability cho domain của app.
- Model V2 dùng dữ liệu và category của app.

## 15. Checklist trước khi thay đổi production flow

```text
[ ] Chạy lại validation 2018 cho từng normalization
[ ] Xác nhận sum(win_probability) = 1 cho mọi race
[ ] Kiểm tra fair_odds ~= 1 / win_probability
[ ] Kiểm tra game_odds ~= fair_odds * payout_factor
[ ] Test min/max odds clamp
[ ] Test weighted random có tính reproducible theo seed
[ ] Mô phỏng ít nhất 10,000 race
[ ] So sánh observed win rate với predicted probability
[ ] Đo RTP tổng thể và RTP theo từng odds bucket
[ ] Xác nhận betting đóng trước khi finish order được tạo
[ ] Test penalty và disqualification sau provisional result
[ ] Cập nhật model metrics và API documentation
```

## 16. Kết luận

Các công thức sau có cơ sở toán học rõ ràng và có thể giữ lại:

```text
fair_odds = 1 / win_probability
game_odds = fair_odds * payout_factor
payout = stake * game_odds
```

Hệ số `0.85` phù hợp cho demo TOKEN nếu mục tiêu là RTP khoảng `85%`, nhưng đây là cấu hình sản phẩm chứ không phải output của AI.

Hai điểm cần đánh giá trước khi xem odds là cân bằng:

1. Chọn lại cách chuẩn hóa output LightGBM dựa trên validation.
2. Cho Race Engine random có trọng số theo cùng `win_probability` dùng để tính odds.

Nếu Race Engine tiếp tục shuffle đồng đều độc lập với model, fair odds và house edge chỉ đúng trên giấy, không đúng với xác suất kết quả thật của ứng dụng.
