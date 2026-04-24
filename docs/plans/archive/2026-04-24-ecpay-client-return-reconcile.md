# ECPay 本地端主動驗證流程重整計畫

## Summary

- 目標是保留綠界成功頁／取號頁後的「返回商店」體驗：使用者回到本站訂單頁時，由本站後端先向綠界主動查詢，再決定顯示成功、失敗或離線繳費資訊。
- 採用公開 `/ecpay/*` 回跳路由處理 browser return，不再把固定 5 秒輪詢當成主流程。
- 保留 `ChoosePayment=ALL`，不加入 `OrderResultURL`，避免覆蓋綠界成功頁與「返回商店」按鈕。

## Key Changes

- 新增公開 ECPay 路由：
  - `GET /ecpay/client-back`
  - `POST /ecpay/client-redirect`
  - `POST /ecpay/notify`
- 抽出共用 reconcile helper，統一處理：
  - `QueryTradeInfo` 驗證
  - 本地訂單欄位比對
  - `TradeStatus` 對應 paid / failed / pending
  - ATM/CVS/BARCODE 的 `QueryPaymentInfo`
  - 寫回 `orders` 的交易欄位與 `ecpay_payment_info`
- `POST /api/orders/:id/ecpay/checkout` 使用：
  - `ClientBackURL = {BASE_URL}/ecpay/client-back?orderId=...`
  - `ClientRedirectURL = {BASE_URL}/ecpay/client-redirect?orderId=...`
  - `ReturnURL = {BASE_URL}/ecpay/notify`
- `public/js/pages/order-detail.js` 改成以 server-side redirect 結果為主：
  - `payment=success|failed` 只載入訂單
  - `payment=returned` 顯示中性提示
  - 移除固定 5 秒輪詢
  - 僅在 `payment=returned` 且沒有離線繳費資訊時，做有限次退避補查
- `views/pages/order-detail.ejs` 補上 returned 提示與離線繳費說明。

## Test Plan

- 更新 `tests/ecpayService.test.js`，驗證新 `ClientBackURL` / `ClientRedirectURL` / `ReturnURL`。
- 重整 `tests/orders.test.js`，改用專用測試商品，避免 seed 商品庫存被重複測試耗盡。
- 新增 `tests/ecpayRoutes.test.js`，涵蓋：
  - `GET /ecpay/client-back` redirect success / failed / returned
  - `POST /ecpay/client-redirect` 在 pending offline payment 時寫入 `ecpay_payment_info`
  - `POST /ecpay/notify` 固定回 `1|OK`，且可觸發同一套 reconcile

## Documentation Follow-up

- 更新 `docs/README.md`、`docs/FEATURES.md`、`docs/TESTING.md`、`docs/CHANGELOG.md`。
- 完成後移至 `docs/plans/archive/`。
