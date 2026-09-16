# Quyền riêng tư

Markstoria không gửi bookmark, lịch sử, tag, ghi chú hoặc dữ liệu sử dụng đến máy chủ bên ngoài.

- Bookmark được quản lý trực tiếp bằng Chrome Bookmarks API.
- Tag, ghi chú, trạng thái đọc và bản phục hồi được lưu trong `chrome.storage.local` trên thiết bị.
- Tùy chọn như theme, luật tự động và workspace chỉ được lưu lên `chrome.storage.sync` khi người dùng bật đồng bộ cài đặt.
- Metadata như tag, màu, ghi chú và trạng thái đọc chỉ được lưu lên `chrome.storage.sync` khi người dùng bật đồng bộ metadata; nếu vượt giới hạn Chrome Sync, dữ liệu vẫn được giữ cục bộ.
- Lịch sử chỉ được đọc để sắp xếp bookmark theo lượt và lần truy cập.
- Side Panel dùng cùng dữ liệu cục bộ của extension, không tạo kênh gửi dữ liệu mới.
- IndexedDB chỉ dùng để lập chỉ mục tìm kiếm cục bộ trên thiết bị.
- Kho ẩn được mã hóa cục bộ bằng Web Crypto và lưu trong `chrome.storage.local`; mật khẩu không được lưu dạng văn bản. Nếu quên mật khẩu, Markstoria không thể khôi phục dữ liệu ẩn.
- Notification chỉ hiển thị trạng thái lưu bookmark trên máy của người dùng, không gửi dữ liệu ra ngoài.
- Khi người dùng chủ động chạy kiểm tra liên kết, extension xin quyền truy cập website tùy chọn và gửi yêu cầu trực tiếp từ trình duyệt đến URL đã lưu. Không có máy chủ trung gian.
- File sao lưu chỉ được tạo hoặc đọc sau thao tác trực tiếp của người dùng.
