# Changelog

本文件記錄專案重要變更。格式參考 Keep a Changelog，但以本專案需要為主。

## 2026-04-23

### Added

- 建立專案文件系統：
  - `AGENTS.md`
  - `docs/README.md`
  - `docs/ARCHITECTURE.md`
  - `docs/DEVELOPMENT.md`
  - `docs/FEATURES.md`
  - `docs/TESTING.md`
  - `docs/CHANGELOG.md`
  - `docs/plans/`
  - `docs/plans/archive/`
- 文件化目前 Express + SQLite + EJS/Vue 架構、API route、認證流程、DB schema、測試流程與開發規範。
- 記錄計畫歸檔流程：計畫放在 `docs/plans/`，完成後移至 `docs/plans/archive/`，並更新 `FEATURES.md` 與 `CHANGELOG.md`。

### Documented

- JWT 認證規則：Bearer token、HS256 驗證、7 天有效期、payload 欄位、user 存在性檢查。
- 購物車雙模式認證：Bearer JWT 優先，其次 `X-Session-Id`，無效 JWT 不退回 session。
- 訂單建立 transaction：建立訂單、建立明細、扣庫存、清空會員購物車。
- 模擬付款現況：`PATCH /api/orders/:id/pay` 只更新訂單狀態，尚未串接真實金流。
- ECPay 現況：`.env.example` 已預留變數，但程式碼沒有讀取或呼叫 ECPay。

## 初始功能狀態

### Available

- 前台首頁與商品列表。
- 商品詳情與加入購物車。
- 會員註冊、登入、profile。
- 訪客購物車與會員購物車。
- 會員結帳建立訂單。
- 會員訂單列表與訂單詳情。
- 模擬付款成功/失敗。
- 後台商品列表、新增、編輯、刪除。
- 後台訂單列表、狀態篩選與詳情。
- API 整合測試。

### Not Available

- 真實 ECPay/綠界金流。
- 訪客購物車登入後自動合併至會員購物車。
- 訂單運費入庫。
- DB migration tool。
- 前端單元測試或瀏覽器 E2E 測試。

