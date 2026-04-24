# Changelog

本文件記錄專案重要變更。格式參考 Keep a Changelog，但以本專案需要為主。

## 2026-04-23

### Added

- 串接綠界 ECPay AIO 金流：
  - 新增 `src/services/ecpayService.js`，處理 AIO CheckMacValue、付款表單、`QueryTradeInfo/V5` 與 `QueryPaymentInfo`。
  - 新增 `/api/orders/:id/ecpay/checkout` 建立 `ChoosePayment=ALL` 綠界付款表單。
  - 新增 `/api/orders/:id/ecpay/query`，由本地端主動呼叫綠界查詢 API 驗證付款結果後更新訂單。
  - 訂單資料新增 ECPay 交易編號、付款方式、交易狀態、付款日期、繳費資訊與最後查詢時間欄位。
  - 訂單詳情頁改為前往綠界付款與更新付款狀態，不再提供前端模擬付款成功/失敗按鈕。
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
- ECPay 本地端架構：本機不依賴 Server Notify，訂單付款狀態以主動查詢綠界 API 並驗證 CheckMacValue 為準。

## 2026-04-24

### Changed

- 重整 Codex 文件結構：
  - 新增 `docs/API_REFERENCE.md`，集中維護 API 端點、認證需求、錯誤碼與 ECPay 狀態 mapping。
  - 精簡 `docs/FEATURES.md` 為功能狀態與使用者可見行為摘要，確保 docs 單檔維持 500 行內。
  - 更新 `AGENTS.md` 的 ECPay 狀態描述，避免 Codex 讀到過期的模擬付款資訊。
- 重整 ECPay 本地端返回商店流程：
  - 新增 `src/routes/ecpayRoutes.js`，提供 `/ecpay/client-back`、`/ecpay/client-redirect`、`/ecpay/notify`。
  - 新增 `src/services/ecpayOrderService.js`，集中處理綠界查詢驗證、失敗碼 mapping、離線繳費資訊補查與訂單寫回。
  - `src/services/ecpayService.js` 的 checkout form 改為使用新的公開回跳 URL，不再把 `ClientBackURL` 指向前端頁面。
  - 訂單詳情頁改成以後端 redirect 結果為主，移除固定 5 秒輪詢，只保留有限次退避補查與手動查詢。
- 測試重整：
  - 新增 `tests/ecpayRoutes.test.js`。
  - `tests/orders.test.js` 改用專用測試商品，避免 seed 商品庫存被重複測試耗盡。
  - 補上 `10100058`、`10100248`、`10100254` 失敗狀態 mapping 驗證。

## 初始功能狀態

### Available

- 前台首頁與商品列表。
- 商品詳情與加入購物車。
- 會員註冊、登入、profile。
- 訪客購物車與會員購物車。
- 會員結帳建立訂單。
- 會員訂單列表與訂單詳情。
- 綠界 AIO 付款與本地端主動查詢付款狀態。
- 後台商品列表、新增、編輯、刪除。
- 後台訂單列表、狀態篩選與詳情。
- API 整合測試。

### Not Available

- 訪客購物車登入後自動合併至會員購物車。
- 訂單運費入庫。
- DB migration tool。
- 前端單元測試或瀏覽器 E2E 測試。
