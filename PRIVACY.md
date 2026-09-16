# Quyền riêng tư

Bookmark Lens không gửi bookmark, lịch sử, tag, ghi chú hoặc dữ liệu sử dụng đến máy chủ bên ngoài.

- Bookmark được quản lý trực tiếp bằng Chrome Bookmarks API.
- Tag, ghi chú, trạng thái đọc và bản phục hồi được lưu trong `chrome.storage.local` trên thiết bị.
- Tùy chọn như theme, luật tự động và workspace chỉ được lưu lên `chrome.storage.sync` khi người dùng bật đồng bộ cài đặt.
- Lịch sử chỉ được đọc để sắp xếp bookmark theo lượt và lần truy cập.
- Side Panel dùng cùng dữ liệu cục bộ của extension, không tạo kênh gửi dữ liệu mới.
- Khi người dùng chủ động chạy kiểm tra liên kết, extension xin quyền truy cập website tùy chọn và gửi yêu cầu trực tiếp từ trình duyệt đến URL đã lưu. Không có máy chủ trung gian.
- File sao lưu chỉ được tạo hoặc đọc sau thao tác trực tiếp của người dùng.
