# Hướng dẫn bàn giao & Tóm tắt Phase 12: Đếm ngược 3s & Đồng bộ 8 làn đua Spectator

Tài liệu này tóm tắt toàn bộ các thay đổi, kết quả nghiên cứu và quy trình vận hành sau khi hoàn thành Phase 12 (Đồng bộ thời gian thực 2D, hiển thị 8 làn đua, đếm ngược 3 giây và sửa luồng Trọng tài).

---

## 1. Các thay đổi đã thực hiện (Frontend)

Toàn bộ mã nguồn đã được compile sạch lỗi (`npm run build` thành công) và push lên nhánh `nam` của repo:

### A. Đồng bộ 8 làn đua & Đứng sẵn ở vạch xuất phát
*   **[useRaceViewerSession.js](file:///d:/WDP/horse-racing-frontend/src/pages/spectator/live-race/useRaceViewerSession.js):** 
    *   Cấu hình để sinh `raceScript` cho cả trạng thái `scheduled`. Đặt mốc thời gian xuất phát ở tương lai xa (1 giờ sau).
    *   Nhờ đó, 8 con ngựa (kết hợp giữa ngựa thật và ngựa mock điền thêm) sẽ tự động hiển thị tĩnh ngay ngắn tại vạch xuất phát thay vì bị trống màn hình.
*   **[TournamentDetail.jsx](file:///d:/WDP/horse-racing-frontend/src/pages/spectator/TournamentDetail.jsx):** 
    *   Sửa bộ lọc danh sách trận đấu của giải đấu để hiển thị các trận ở trạng thái `scheduled` (Đã lên lịch) thay vì ẩn đi như trước.

### B. Đếm ngược 3 giây & Hoạt cảnh chạy 1 lần
*   **[useRaceViewerSession.js](file:///d:/WDP/horse-racing-frontend/src/pages/spectator/live-race/useRaceViewerSession.js):**
    *   Khi cuộc đua chuyển sang `running`, thời gian bắt đầu thực tế `startsAt` được đặt lùi lại 3 giây (`race.updatedAt + 3000`).
*   **[RaceViewer2D.jsx](file:///d:/WDP/horse-racing-frontend/src/pages/spectator/live-race/RaceViewer2D.jsx):**
    *   Tính toán thời gian đếm ngược còn lại: `const msRemaining = startsAt - Date.now()`.
    *   Khi cuộc đua chuẩn bị bắt đầu (`playbackState === "ready"`) và thời gian đếm ngược $\le$ 3 giây, hiển thị một lớp kính mờ overlay cùng bộ đếm số `3` $\rightarrow$ `2` $\rightarrow$ `1` động ở giữa đường đua. Ngựa sẽ đứng yên tại chỗ và chỉ bắt đầu chạy khi đếm ngược kết thúc.
    *   Thời gian chạy được tính đồng bộ tuyệt đối theo mốc thời gian thực từ database nên cuộc đua chỉ chạy duy nhất 1 lần, F5 trang sẽ giữ nguyên trạng thái hiện tại chứ không chạy lại từ đầu.
*   **[spectator.css](file:///d:/WDP/horse-racing-frontend/src/pages/spectator/spectator.css):**
    *   Bổ sung styles `.live-race-countdown-overlay` và `.live-race-countdown-number` cùng hiệu ứng phóng to động (`pulseCountdown`) để tạo hiệu ứng đếm ngược 3D mượt mà.

### C. Khôi phục luồng điều khiển của Trọng tài (Sửa lỗi 404 Not Found)
*   **[RaceLifecycleControls.jsx](file:///d:/WDP/horse-racing-frontend/src/Referee/RaceLifecycleControls.jsx):**
    *   Do backend đã được khôi phục sạch sẽ (không có trạng thái trung gian `ready` và không có API `/races/:id/ready`), nên đã sửa lại bảng điều khiển của Trọng tài trên frontend.
    *   Trọng tài sẽ bấm trực tiếp nút **"Start Race"** khi cuộc đua ở trạng thái `scheduled` (thay vì bấm "Approve and Set At Gate" như trước), gọi API `/api/races/:id/start` chính thức, giải quyết hoàn toàn lỗi `Not Found`.

---

## 2. Quy trình & Lưu ý vận hành (Database & API)

Để thử nghiệm tính năng bắt đầu cuộc đua, bạn cần lưu ý quy định của backend gốc:

### A. Ràng buộc điều kiện bắt đầu cuộc đua (Start Race Requirements)
Khi bấm "Start Race", backend sẽ gọi hàm kiểm tra điều kiện xuất phát. Để cuộc đua bắt đầu thành công, cuộc đua phải có **ít nhất 1 người tham gia đủ điều kiện (eligible participant)**.
Một người tham gia đủ điều kiện cần:
1.  Đăng ký tham gia đã được duyệt (`Registration` status: `approved`).
2.  Yêu cầu bắt buộc phải có Nài ngựa chấp nhận lời mời (`JockeyAssignment` status: **`accepted`**).
3.  Đã hoàn thành kiểm tra sức khỏe trước cuộc đua (`HorseCheck` status: `passed`).

Nếu bạn bấm "Start Race" và gặp lỗi **`Race has no eligible participants`**, có nghĩa là con ngựa đăng ký chưa có nài ngựa đồng ý tham gia (trạng thái lời mời là `meeting_invited` chứ chưa phải `accepted`).

### B. Cách chạy test / kiểm tra luồng:
*   **Cách 1: Khởi tạo lại dữ liệu demo (Nhanh nhất):**
    Chạy lệnh sau ở terminal backend để reset toàn bộ database về trạng thái mẫu ban đầu (đã nạp sẵn các trận đấu hoàn chỉnh có nài ngựa đồng ý và sẵn sàng chạy):
    ```powershell
    npm run seed:demo:reset
    ```
*   **Cách 2: Đồng ý lời mời nài ngựa thủ công:**
    Nếu tự tạo trận đấu mới, bạn cần đăng nhập bằng tài khoản của nài ngựa được mời (ví dụ: **Jockey Harbor** - `jockey8@racing.test` / mật khẩu `Password123`) để nhấn **Accept** lời mời trước khi Trọng tài bấm "Start Race".
