# Kế Hoạch Hoàn Thiện Toàn Bộ Dự Án AI API Reseller (`apikeya`)

Tài liệu này vạch ra kế hoạch hoàn thiện toàn bộ các tính năng còn lại của hệ thống, đặc biệt tập trung vào **luồng thanh toán chuyển khoản ngân hàng qua STK / VietQR**, **cổng duyệt tiền và nạp credit thủ công cho Admin**, cùng việc hoàn thiện 100% các trang Dashboard, API Keys, Docs, Models và Landing page.

---

## 1. Cơ Chế Nạp Tiền Bằng STK & Duyệt Credit Thủ Công (Admin Approval Flow)

Hiện tại hệ thống sẽ vận hành theo luồng **Chuyển khoản trực tiếp vào STK cá nhân của bạn**:

```
[Khách chọn gói nạp] 
       │
       ▼
[Tạo đơn nạp + Hiện mã VietQR & STK & Cú pháp NAP_XXXX]
       │
       ▼
[Khách chuyển khoản qua App Ngân Hàng]
       │
       ▼
[Admin vào /admin/topups xem đơn + kiểm tra tài khoản ngân hàng]
       │
       ▼
[Admin bấm nút "✅ Duyệt & Cộng Tiền"] ──> [Hệ thống tự động cộng credit ví khách + Ghi sổ cái Ledger]
```

> 💡 **Lưu ý:** Hệ thống webhook tự động (`/api/payment-webhook`) vẫn được giữ sẵn. Sau này khi bạn đăng ký dịch vụ thông báo biến động số dư (như SePay/Casso), hệ thống có thể chuyển sang tự động 100% mà không cần sửa lại bất kỳ logic core nào.

---

## 2. Các Hạng Mục Chi Tiết Cần Triển Khai

### 🌟 Phần 1: Thanh Toán STK / VietQR Khách Hàng (`/dashboard/billing`)
- **Hiển thị thông tin ngân hàng rõ ràng:** Tên ngân hàng, Số tài khoản, Tên chủ tài khoản.
- **Tạo mã VietQR động:** Tự động tạo mã QR chuẩn NAPAS kèm sẵn số tiền và mã nội dung chuyển khoản `NAP <MÃ_ĐƠN>`.
- **Nút Copy 1-Click:** Cho phép khách bấm sao chép nhanh Số tài khoản, Số tiền, Nội dung chuyển khoản để tránh chuyển nhầm.
- **Trạng thái đơn hàng Realtime:** Đơn hiển thị rõ trạng thái `Đang chờ thanh toán`, `Đã duyệt thành công`, hoặc `Đã hủy`.

### 🛡️ Phần 2: Cổng Quản Lý Nạp Tiền & Duyệt Credit Cho Admin (`/admin/topups`)
- **Trang Quản Trị Đơn Nạp (`/admin/topups`):**
  - Danh sách toàn bộ yêu cầu nạp tiền đang chờ duyệt (`pending`).
  - Hiển thị đầy đủ: Email khách hàng, Số tiền chuyển khoản, Số credit nhận được, Cú pháp chuyển khoản, Thời gian tạo đơn.
  - Nút **"✅ Duyệt & Cộng tiền"**: Gọi trực tiếp RPC `apply_paid_topup` trong database để cộng tiền ngay lập tức cho khách và đổi trạng thái đơn sang `paid`.
  - Nút **"❌ Từ chối / Hủy đơn"**: Hủy các đơn nạp ảo/không hợp lệ.
- **Công cụ Nạp / Trừ Credit Thủ Công Cho Mọi User:**
  - Form cho phép Admin nhập Email bất kỳ + Số tiền (VNĐ) + Lý do (Tặng khuyến mãi, Hoàn tiền sự cố, Nạp tiền mặt riêng).
  - Bấm nạp là credit nhảy ngay vào ví của khách và ghi log vào `wallet_ledger`.

### 🤖 Phần 3: Hoàn Thiện Các Trang Khách Hàng (Customer Portal)
- **Quản lý API Key (`/dashboard/api-keys`):**
  - Modal tạo key mới với nút Copy nhanh key `ak_live_...`.
  - Đổi tên key, thu hồi/xóa key khi không dùng.
- **Danh mục Models & Bảng Giá (`/dashboard/models`):**
  - Hiển thị đầy đủ 6 model (`kimi-k2.6`, `deepseek-v4`, `claude-sonnet-5`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.6-sol`).
  - Hiển thị giá niêm yết chuẩn VNĐ/1M token, thông số kỹ thuật (Context Window, Tốc độ, Mục đích sử dụng).
- **Lịch sử Chi Tiêu (`/dashboard/usage`):**
  - Bảng thống kê chi tiết lượt gọi, lọc theo ngày/tháng, tổng token in/out, cước phí từng lượt.
- **Tài Liệu Tích Hợp API (`/docs`):**
  - Code mẫu hoàn chỉnh cho Python OpenAI SDK, TypeScript/JavaScript, cURL, Cursor IDE, Continue.dev, NextChat.
- **Trang Chủ (Landing Page - `/`):**
  - Cập nhật thông điệp nạp tiền ngân hàng VietQR nhanh chóng, bảng giá cạnh tranh, nút Đăng ký & Trải nghiệm.

---

## 3. Kế Hoạch Thay Đổi Files Cụ Thể

| Thành phần | File | Thay đổi |
|---|---|---|
| **STK Config** | `apps/web/src/lib/bank-config.ts` | **[NEW]** File cấu hình thông tin Ngân hàng, STK, Tên chủ tài khoản |
| **Billing Web** | `apps/web/src/app/dashboard/billing/page.tsx` | **[MODIFY]** Nâng cấp giao diện VietQR động, copy STK, trạng thái đơn |
| **Admin Topups** | `apps/web/src/app/admin/topups/page.tsx` | **[NEW]** Trang duyệt nạp tiền và cộng/trừ credit thủ công cho khách |
| **Topup Actions** | `apps/web/src/app/api/admin/topups/route.ts` | **[NEW]** API route xử lý duyệt đơn, hủy đơn, nạp credit thủ công |
| **Admin Layout** | `apps/web/src/app/admin/layout.tsx` | **[MODIFY]** Thêm menu dẫn vào Quản lý Nạp tiền (`/admin/topups`) |
| **Docs Page** | `apps/web/src/app/docs/page.tsx` | **[MODIFY]** Hoàn thiện tài liệu SDK Python, TS, cURL, Cursor |
| **Landing Page**| `apps/web/src/app/page.tsx` | **[MODIFY]** Tinh chỉnh bảng giá và CTA thanh toán VietQR |
