# Bookmark Lens 3.0.1

Developed by **Kenzy**.

Tiện ích Chrome giúp tìm, lọc, tổ chức và bảo trì toàn bộ thư viện bookmark. Popup phục vụ thao tác nhanh; Side Panel hỗ trợ làm việc song song; trang quản lý toàn màn hình dành cho các công việc lớn.

## Cài đặt

1. Mở `chrome://extensions/` trong Google Chrome.
2. Bật **Chế độ dành cho nhà phát triển**.
3. Chọn **Tải tiện ích đã giải nén**.
4. Chọn thư mục `bookmark-lens` này.

## Tính năng chính

- Tìm gần đúng và cú pháp nâng cao: `site:`, `folder:`, `tag:`, `status:`, `is:`.
- Lọc website bằng dropdown hoặc bấm trực tiếp vào domain trên từng bookmark.
- Sắp xếp theo tên, thư mục, thời gian, lượt truy cập, lần truy cập gần nhất hoặc thứ tự thủ công.
- Chọn nhiều để mở, sao chép, di chuyển, đánh dấu đã đọc hoặc xóa.
- Kéo bookmark vào thư mục và kéo lên vị trí mong muốn.
- Phát hiện bản trùng, đề xuất bản nên giữ và tạo bản phục hồi trước khi xóa.
- Kiểm tra liên kết hỏng/chuyển hướng sau khi người dùng cấp quyền website tùy chọn.
- Tag có màu, ghi chú, ghim, danh sách đọc sau và ngày đọc gần nhất.
- Lưu tab hiện tại hoặc toàn bộ cửa sổ; cảnh báo khi URL đã tồn tại.
- Side Panel để tìm, lọc domain, mở workspace và lưu tab mà không rời trang hiện tại.
- Luật tự động sắp xếp theo domain, tiêu đề, URL, thư mục hoặc tag; có thể tự áp khi lưu bookmark mới.
- Gợi ý tạo luật từ domain phổ biến và workspace để lưu bộ lọc hay dùng.
- Command palette `Ctrl/⌘ + Shift + K`, trợ giúp nhanh và preview website trong màn hình chỉnh sửa.
- Chuyển ngôn ngữ giao diện giữa Tiếng Việt và English trong popup, Side Panel và dashboard.
- Đồng bộ tùy chọn qua `chrome.storage.sync` khi người dùng bật.
- Chế độ gọn, lazy favicon và tùy chỉnh số dòng tải thêm cho thư viện lớn.
- Dashboard thống kê tên miền, thư mục và hoạt động theo tháng.
- Xuất/nhập JSON đầy đủ hoặc HTML tương thích trình duyệt.
- Menu chuột phải và phím tắt `Ctrl+Shift+Y`, `Alt+Shift+B`; khi lưu bằng phím tắt sẽ có badge/notification báo kết quả.
- Giao diện sáng/tối; dữ liệu xử lý cục bộ, không có máy chủ bên ngoài.

## Cú pháp tìm kiếm

- `site:github.com`: lọc theo tên miền.
- `folder:Công việc`: lọc theo tên thư mục.
- `tag:học tập`: lọc theo tag.
- `status:unread` hoặc `status:broken`: trạng thái đọc/liên kết.
- `is:pinned` hoặc `is:duplicate`: bookmark ghim/trùng lặp.

## Cấu trúc

- `manifest.json`: cấu hình Chrome Extension Manifest V3.
- `popup.html`: giao diện popup.
- `sidepanel.html`: giao diện Side Panel.
- `dashboard.html`: trình quản lý toàn màn hình.
- `core.js`: dữ liệu và tiện ích dùng chung.
- `i18n.js`: chuyển ngôn ngữ giao diện Tiếng Việt/English.
- `background.js`: menu chuột phải, phím tắt và dọn metadata.

## Quyền sử dụng

- `bookmarks`: đọc và thay đổi bookmark theo thao tác của người dùng.
- `storage`: lưu tag, ghi chú, trạng thái và tùy chọn.
- `history`: hỗ trợ sắp xếp theo lượt/lần truy cập.
- `tabs`: lưu tab hiện tại hoặc toàn bộ cửa sổ.
- `contextMenus`: cung cấp menu chuột phải.
- `sidePanel`: mở Bookmark Lens trong panel cạnh của Chrome.
- `notifications`: báo kết quả khi lưu bookmark bằng phím tắt hoặc menu chuột phải.
- Quyền truy cập `http://*/*` và `https://*/*` là **tùy chọn**, chỉ được hỏi khi bắt đầu kiểm tra liên kết.

Nếu `Alt+Shift+B` không chạy sau khi cài lại, mở `chrome://extensions/shortcuts` và kiểm tra shortcut **Lưu trang hiện tại vào Bookmark Lens** đã được gán đúng chưa.
