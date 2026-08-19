# Hướng Dẫn Vận Hành & Tính Năng Dự Án AI API Reseller V4

Tài liệu này tổng hợp toàn bộ các tính năng đã được hoàn thiện và hướng dẫn vận hành hệ thống thanh toán qua STK/VietQR và quản trị Admin.

---

## 1. Luồng Thanh Toán STK / VietQR & Duyệt Tiền Admin

### A. Khách Hàng Nạp Tiền:
1. Khách truy cập vào **Nạp tiền VietQR** (`/dashboard/billing`).
2. Chọn gói nạp (50k, 100k, 200k, 500k +5%, 1M +10%, 2M +15%).
3. Hệ thống tạo mã **VietQR động** chuẩn NAPAS kèm sẵn số tiền và cú pháp `NAP <MÃ_ĐƠN>`.
4. Khách mở App ngân hàng quét mã QR hoặc bấm nút **Sao chép** nhanh STK và Nội dung chuyển khoản.

### B. Admin Kiểm Tra & Duyệt Tiền 1-Click:
1. Bạn đăng nhập tài khoản Admin (`loi822004@gmail.com`) $\rightarrow$ Vào **[Quản lý Nạp tiền](/admin/topups)**.
2. Tại tab **"⏳ Đơn Chờ Duyệt"**:
   - Bạn thấy danh sách các đơn khách vừa tạo (Email, Số tiền, Cú pháp chuyển khoản, Thời gian).
   - Kiểm tra tài khoản ngân hàng cá nhân của bạn thấy tiền về.
   - Bấm nút **"✓ Duyệt & Cộng tiền"** $\rightarrow$ Tiền lập tức được nạp vào ví của khách, khách dùng được ngay!
3. Tại tab **"➕ Nạp / Thưởng Credit Thủ Công"**:
   - Bạn có thể nhập bất kỳ Email nào + Số tiền VNĐ để nạp credit trực tiếp (dành cho nạp riêng qua Zalo/Facebook hoặc tặng quà khách).

---

## 2. Cách Thay Đổi STK Ngân Hàng Của Bạn

Bạn có thể chỉnh sửa thông tin STK bất kỳ lúc nào bằng 1 trong 2 cách:

### Cách 1: Sửa trong file `apps/web/src/lib/bank-config.ts`
```typescript
export const defaultBankConfig: BankConfig = {
  bankId: 'MB', // Mã ngân hàng (MB, VCB, TCB, VPB, ACB, TPB, ICB,...)
  bankName: 'Ngân hàng Quân Đội (MBBank)',
  accountNo: '0987654321', // Số tài khoản thật của bạn
  accountName: 'NGUYEN VAN LOI', // Tên chủ tài khoản in hoa không dấu
}
```

### Cách 2: Cài đặt trên Vercel Environment Variables:
- `NEXT_PUBLIC_BANK_ID`: Mã ngân hàng (ví dụ `MB` hoặc `VCB`)
- `NEXT_PUBLIC_BANK_NAME`: Tên ngân hàng
- `NEXT_PUBLIC_BANK_ACCOUNT_NO`: Số tài khoản của bạn
- `NEXT_PUBLIC_BANK_ACCOUNT_NAME`: Tên chủ tài khoản của bạn

---

## 3. Danh Mục Các Trang Hệ Thống

| Trang | Đường dẫn | Mục đích |
|---|---|---|
| **Trang chủ** | `/` | Giới thiệu, bảng giá VNĐ/1M token |
| **Dùng thử** | `/dashboard/playground` | Chat AI trực tiếp trên web không cần API Key |
| **Quản lý API Key**| `/dashboard/api-keys` | Tạo key `ak_live_...`, copy 1-click, thu hồi key |
| **Nạp tiền VietQR**| `/dashboard/billing` | Quét mã VietQR chuyển khoản ngân hàng |
| **Lịch sử Chi tiêu**| `/dashboard/usage` | Báo cáo chi tiết từng request, input/output tokens |
| **Danh mục Models**| `/dashboard/models` | Xem thông số kỹ thuật và giá của 6 model AI |
| **Tài liệu API** | `/docs` | Hướng dẫn tích hợp Python, Node.js, cURL, Cursor IDE |
| **Admin KPIs** | `/admin` | Tổng quan doanh thu, chi phí A6, lợi nhuận gộp |
| **Admin Nạp tiền** | `/admin/topups` | Duyệt đơn nạp tiền 1-click & cộng credit thủ công |
| **Admin Models** | `/admin/models` | Cấu hình định tuyến và giá bán lẻ |
| **Admin Requests** | `/admin/requests` | Đối soát toàn bộ lượt gọi API toàn hệ thống |
