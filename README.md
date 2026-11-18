# CareTalk Pulse

Dashboard đo performance và comment seeding cho series **UMC Nursing CareTalk** (28 tập, phát sóng Thứ 6 hằng tuần), chia 2 module **MCV Group** và **UMC**, trên YouTube, Facebook và TikTok.

Nguồn dữ liệu duy nhất là Google Sheet **Master Plan Truyền Thông | YTĐP Care Talk**. Team nhập vào sheet, dashboard tự đọc.

## Kiến trúc

```
Google Sheet (Master Plan)
 ├─ REPORT            ← team nhập: post Best cut / Short cut / BTS, số liệu, "Comment seeding", "Save"
 ├─ YT_AUTO           ← apps-script/Code.gs tự kéo YouTube mỗi giờ
 ├─ DASHBOARD_CONFIG  ← kênh thuộc MCV hay UMC, kênh chính hay hỗ trợ
 └─ KPI               ← 5.200.000 views / series
        │
        ├─► apps-script-public/  Web App công khai (ai có link cũng xem, chỉ đọc)
        └─► web/                 Bản trên claude.ai (đọc sheet qua Google Drive connector của người xem)
```

| Thư mục | Nội dung |
|---|---|
| `apps-script/Code.gs` | Script gắn vào sheet: kéo YouTube (MCV TV: title chứa "Care Talk"; UMC: mô tả chứa "UMC Nursing CareTalk"), đánh số tập theo tuần phát sóng, tạo tab và cột, trigger mỗi giờ |
| `apps-script-public/` | Project Apps Script riêng để deploy Web App công khai (`WebApp.gs` + `Dashboard.html`) |
| `web/caretalk-pulse.html` | **File nguồn giao diện.** Mọi chỉnh sửa UI làm ở đây |
| `build_webapp.py`, `transpile.js` | Build `Dashboard.html` cho Web App từ file nguồn |

## Luật KPI

| Hạng mục | KPI |
|---|---|
| Views | 5.200.000 / series, gộp MCV Network + UMC, mọi nền tảng → 185.714 views/tập (÷ 28) |
| Seeding Best cut / Short cut, kênh chính | 30 comment/post |
| Seeding Best cut / Short cut, kênh hỗ trợ | 15 comment/post |
| Seeding tập Full trên UMC (YouTube + Facebook BV ĐH Y Dược) | 40 comment/post |
| YouTube MCV TV | không seeding |

Luật seeding nằm trong `SeedingPolicy`, luật views trong `ViewKpi`, cùng ở `web/caretalk-pulse.html`.

## Nhập liệu

- **Post Facebook / TikTok:** mỗi post một dòng trong tab REPORT. Số tập ghi ở cột Note (`Tập 3`) theo **thứ tự phát sóng**.
- **Comment seeding:** tổng số comment đã rải tính đến hiện tại, ghi ở cột **Comment seeding** (tab REPORT cho Facebook/TikTok, tab YT_AUTO cho YouTube).
- **Sửa số tập / loại video YouTube:** cột "Tập (sửa tay)" / "Loại (sửa tay)" trong YT_AUTO. Script không ghi đè các cột này.

## Sửa giao diện và deploy lại

```bash
npm install
npm run build
```

1. Sửa `web/caretalk-pulse.html`, rồi chạy `npm run build`.
2. Dán `apps-script-public/Dashboard.html` vào project Apps Script public.
3. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.** Link giữ nguyên.

Bước build bắt buộc: HtmlService của Apps Script làm hỏng chuỗi chứa `//` (ví dụ `https://`) trong `<script>`. `transpile.js` hạ cú pháp xuống ES2017, xoá comment và thoát `//` → `\/\/`, `</` → `<\/`.

## Cài đặt lần đầu

**Script đồng bộ (trong sheet):** Extensions → Apps Script → dán `apps-script/Code.gs` → Services: thêm **YouTube Data API v3** → chạy `setup()`.

**Web App công khai:** script.google.com → New project → dán `WebApp.gs` và file HTML `Dashboard` → chạy `testRead()` → Deploy → Web app · Execute as **Me** · Who has access **Anyone**.

Nếu mở link báo "Rất tiếc, không thể mở tệp" trong trình duyệt đang đăng nhập nhiều tài khoản Google thì đó là lỗi đã biết của Google. Mở bằng cửa sổ ẩn danh.
