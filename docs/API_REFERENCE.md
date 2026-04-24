# API Reference

本文件記錄後端 API 的認證需求、主要行為與錯誤碼。功能狀態請看 `FEATURES.md`；ECPay 本地測試操作請看 `ECPAY_SETUP.md`。

## 通用規則

所有 JSON API 使用統一回應格式：

```json
{
  "data": {},
  "error": null,
  "message": "操作成功"
}
```

錯誤回應固定為 `data: null`，成功回應固定為 `error: null`。

常見錯誤碼：

| 狀態碼 | error | 說明 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 請求欄位或格式錯誤 |
| 401 | `UNAUTHORIZED` | 未登入、token 無效或 token 過期 |
| 403 | `FORBIDDEN` | 權限不足 |
| 404 | `NOT_FOUND` | 資源不存在或不屬於目前使用者 |
| 409 | `CONFLICT` | 資源衝突 |
| 500 | `INTERNAL_ERROR` | 未預期伺服器錯誤 |

## Auth

### `POST /api/auth/register`

註冊一般會員並回傳 `user` 與 7 天有效 JWT。

必填 body：

| 欄位 | 型別 | 驗證 |
| --- | --- | --- |
| `email` | string | 必填，需符合簡易 email regex |
| `password` | string | 必填，長度至少 6 |
| `name` | string | 必填 |

錯誤：`VALIDATION_ERROR`、`CONFLICT`。

### `POST /api/auth/login`

使用 email/password 登入並回傳 `user` 與 7 天有效 JWT。

必填 body：`email`、`password`。錯誤：`VALIDATION_ERROR`、`UNAUTHORIZED`。

### `GET /api/auth/profile`

認證：Bearer JWT。回傳目前登入會員的 `id`、`email`、`name`、`role`、`created_at`。

錯誤：`UNAUTHORIZED`、`NOT_FOUND`。

## Products

### `GET /api/products`

公開商品列表。依 `created_at DESC` 排序。

查詢參數：

| 參數 | 預設 | 限制 |
| --- | --- | --- |
| `page` | `1` | 小於 1 或非數字時使用 1 |
| `limit` | `10` | 最小 1，最大 100 |

回傳 `products` 與 `pagination`。

### `GET /api/products/:id`

公開商品詳情。錯誤：`NOT_FOUND`。

## Cart

購物車支援雙模式認證：

| 情境 | 身分來源 |
| --- | --- |
| 有有效 Bearer JWT | `user_id` |
| 沒有 Bearer JWT | `X-Session-Id` |
| Bearer JWT 無效 | 回 `UNAUTHORIZED`，不可退回 session |

### `GET /api/cart`

回傳目前會員或訪客 session 的購物車項目與總金額。

### `POST /api/cart`

新增商品到購物車；同商品已存在時累加數量。

必填 body：`productId`、`quantity`。錯誤：`VALIDATION_ERROR`、`NOT_FOUND`。

### `PATCH /api/cart/:itemId`

更新購物車項目數量。錯誤：`VALIDATION_ERROR`、`NOT_FOUND`。

### `DELETE /api/cart/:itemId`

刪除購物車項目。錯誤：`NOT_FOUND`。

## Orders

### `POST /api/orders`

認證：Bearer JWT。建立訂單時必須使用 SQLite transaction，同步建立訂單、建立明細、扣庫存、清空登入會員購物車。

必填 body：

| 欄位 | 型別 |
| --- | --- |
| `recipientName` | string |
| `recipientEmail` | string |
| `shippingAddress` | string |

錯誤：`UNAUTHORIZED`、`VALIDATION_ERROR`、`OUT_OF_STOCK`、`CART_EMPTY`。

### `GET /api/orders`

認證：Bearer JWT。回傳目前會員自己的訂單列表。

### `GET /api/orders/:id`

認證：Bearer JWT。回傳目前會員自己的單筆訂單與明細。錯誤：`NOT_FOUND`。

## ECPay Payment

付款使用 ECPay AIO，`ChoosePayment=ALL`。本專案不直接信任綠界 callback body；所有付款結果都以本機後端主動呼叫 `QueryTradeInfo/V5` 或 `QueryPaymentInfo` 驗證後更新。

### `POST /api/orders/:id/ecpay/checkout`

認證：Bearer JWT。為目前會員自己的 pending 訂單建立綠界 AIO checkout form。

主要行為：

- 每次導向付款前重新產生 20 字元內的英數 `ecpay_merchant_trade_no`。
- 回傳 action URL、method 與 form params。
- Form params 包含 `ReturnURL=/ecpay/notify`、`ClientBackURL=/ecpay/client-back?orderId=...`、`ClientRedirectURL=/ecpay/client-redirect?orderId=...`、`ChoosePayment=ALL`。
- 不暴露 HashKey 或 HashIV。

錯誤：`INVALID_STATUS`、`NOT_FOUND`。

### `POST /api/orders/:id/ecpay/query`

認證：Bearer JWT。主動查詢綠界付款狀態並更新本地訂單。

狀態 mapping：

| 綠界狀態 | 本地狀態 |
| --- | --- |
| `1` | `paid` |
| `10100058`、`10100248`、`10100254`、`10200095`、`10200163` | `failed` |
| 其他狀態 | 維持 `pending` |

若 ATM/CVS/BARCODE 仍 pending，會嘗試取得 `ecpay_payment_info` 供訂單頁顯示。

錯誤：`PAYMENT_NOT_STARTED`、`ECPAY_VERIFY_FAILED`、`ECPAY_ORDER_MISMATCH`、`NOT_FOUND`。

### `GET /ecpay/client-back`

公開 browser return route。讀取 `orderId`，以該訂單的 `ecpay_merchant_trade_no` 主動查詢綠界，再 redirect 到 `/orders/:id?payment=success|failed|returned`。

### `POST /ecpay/client-redirect`

公開 browser POST return route。用於 ATM/CVS/BARCODE 取號完成後回站；會先主動查詢，必要時補查離線繳費資訊，最後以 `303` redirect 回訂單頁。

### `POST /ecpay/notify`

公開 server notify stub。永遠回 `1|OK`；若 request body 能對應到本地訂單，才走同一套主動查詢 reconcile helper。

### `PATCH /api/orders/:id/pay`

舊模擬付款端點已停用，固定回 `410 PAYMENT_FLOW_REMOVED`。

## Admin Products

後台商品 API 必須先套用 `authMiddleware`，再套用 `adminMiddleware`。

### `GET /api/admin/products`

認證：admin Bearer JWT。支援與公開商品列表相同的 pagination。

### `POST /api/admin/products`

認證：admin Bearer JWT。新增商品。

必填 body：`name`、`description`、`price`、`stock`、`image_url`。`price` 與 `stock` 必須是 JavaScript number 且整數。

### `PUT /api/admin/products/:id`

認證：admin Bearer JWT。完整更新商品。錯誤：`VALIDATION_ERROR`、`NOT_FOUND`。

### `DELETE /api/admin/products/:id`

認證：admin Bearer JWT。刪除商品。錯誤：`NOT_FOUND`。

## Admin Orders

後台訂單 API 必須先套用 `authMiddleware`，再套用 `adminMiddleware`。

### `GET /api/admin/orders`

認證：admin Bearer JWT。回傳所有訂單，包含會員 email 與 name。

### `GET /api/admin/orders/:id`

認證：admin Bearer JWT。回傳單筆訂單與明細。錯誤：`NOT_FOUND`。
