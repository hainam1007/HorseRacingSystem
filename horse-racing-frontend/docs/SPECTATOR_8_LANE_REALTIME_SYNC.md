# Spectator 2D Race Viewer — 8-Lane & Real-Time Sync Specification

Đây là tài liệu chi tiết mô tả cách thức nâng cấp bộ hiển thị đua ngựa 2D của spectator từ 5 làn lên 8 làn, đồng bộ hóa thời gian bắt đầu thực tế từ Trọng tài và cấu hình để hiển thị con ngựa chiến thắng thực tế từ backend.

## 1. Giao diện 8 làn đua (8 Horses Layout)

Hiện tại giao diện đường đua hình bầu dục (`RaceViewer2D.jsx`) chỉ định vị tọa độ và vẽ sẵn CSS cho tối đa 5 làn đua. Để hỗ trợ 8 làn:

### CSS định vị (trong `spectator.css`)
Cần thêm các luật định vị `inset` cho các làn 6, 7, 8 tương ứng với các biến tỉ lệ khoảng cách tương đối (cho cả phiên bản Desktop và Mobile):
```css
/* Desktop */
.live-race-oval__lane--6 { inset: calc(var(--track-inset-y) + 50px) calc(var(--track-inset-x) + 65px); }
.live-race-oval__lane--7 { inset: calc(var(--track-inset-y) + 60px) calc(var(--track-inset-x) + 78px); }
.live-race-oval__lane--8 { inset: calc(var(--track-inset-y) + 70px) calc(var(--track-inset-x) + 91px); }

/* Mobile / Small Screens */
@media (max-width: 768px) {
  .live-race-oval__lane--6 { inset: calc(var(--track-inset-y) + 40px) calc(var(--track-inset-x) + 50px); }
  .live-race-oval__lane--7 { inset: calc(var(--track-inset-y) + 48px) calc(var(--track-inset-x) + 60px); }
  .live-race-oval__lane--8 { inset: calc(var(--track-inset-y) + 56px) calc(var(--track-inset-x) + 70px); }
}
```

### Mở rộng Fixtures & Kịch bản (trong `mockRaceFixtures.js`)
Mở rộng mảng tọa độ checkpoints và thời gian chạy thử nghiệm lên đủ 8 làn để tránh bị crash khi vòng lặp vượt quá 5:
- Mảng `checkpointDistances` cần định nghĩa thêm 3 hàng tọa độ (đại diện cho làn 6, 7, 8).
- Mảng `mockFinishTimes` cần khai báo đủ 8 mốc thời gian hoàn thành.
- Hàm `createMockRaceScript(raceId, startsAt, contenders)` sẽ duyệt qua mảng `contenders` động truyền từ component để sinh ra kịch bản 2D tương ứng cho tối đa 8 làn.

---

## 2. Đồng bộ thời gian bắt đầu thực tế (Real-Time Trigger Sync)

Hoạt cảnh 2D cần chạy đồng bộ thời gian thực dựa vào thời điểm Trọng tài bấm nút bắt đầu đua (`status = running`):

1. **Lấy mốc thời gian bắt đầu:** Khi cuộc đua ở trạng thái `running`, lấy thuộc tính `updatedAt` của đối tượng `race` (được cập nhật trên DB khi Trọng tài gọi API `/api/races/:id/start`).
2. **Thiết lập thời gian hoạt cảnh:**
   - Trong `useRaceViewerSession.js`, khi trạng thái trận đấu là `RUNNING`, đặt mốc thời gian xuất phát của kịch bản là `startsAt = new Date(race.updatedAt).getTime()`.
   - Giao diện phát hoạt cảnh (`useRacePlayback.js`) sẽ tự động tính toán thời gian trôi qua so với `startsAt` để vẽ ngựa ở vị trí thực tế tương ứng.
   - Nếu người dùng tải lại trang khi trận đấu đang diễn ra nửa chừng, các con ngựa vẫn ở vị trí chính xác của giây đó trên đường chạy.
   - Nếu thời gian hiện tại đã vượt quá thời lượng trận đấu (68 giây), ngựa đứng im ở vạch đích và hiển thị trạng thái chờ kết quả.

---

## 3. Sắp xếp ngựa chiến thắng thực tế lên làn đua (Winner Alignment)

Hệ thống kịch bản 2D hoạt động dựa vào việc gán mảng contenders vào các đường chạy cố định. Trong kịch bản mặc định, con ngựa nằm ở vị trí chỉ số **index 2** (chạy trên làn 3) có thời gian về đích ngắn nhất (56.0 giây) và luôn thắng cuộc đua.

Để hiển thị con ngựa chiến thắng thực tế từ kết quả của backend:
1. **Kiểm tra kết quả thật:** Khi trận đấu kết thúc và kết quả đã được công bố (`published`), frontend sẽ gọi API lấy thông tin kết quả và tìm con ngựa có `position === 1`.
2. **Thay đổi vị trí mảng (Swap Winner):**
   - Lọc lấy đối tượng thông tin của con ngựa chiến thắng đó.
   - Đưa con ngựa này vào đúng vị trí **index 2** của mảng `contenders` truyền vào hàm sinh hoạt cảnh.
   - Sắp xếp các ngựa thực tế còn lại và các ngựa mock điền thêm vào các vị trí còn lại (từ index 0, 1, và 3 đến 7).
3. **Hiển thị:** Hoạt cảnh 2D chạy xong sẽ hiển thị chính xác tên con ngựa chiến thắng từ backend về đích đầu tiên và đứng trên bục vinh quang số #1.
