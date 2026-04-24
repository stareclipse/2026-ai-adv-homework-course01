# Architecture

## 架構總覽

本專案是單一 Node.js 行程的 Express 應用程式。`server.js` 負責檢查必要環境變數並監聽 port；`app.js` 建立 Express instance、初始化資料庫、掛載 middleware、API routes、page routes、404 與錯誤處理。資料庫使用 `better-sqlite3` 同步操作本機 SQLite 檔案。

前端不是獨立 SPA build。EJS 負責輸出頁面骨架與資料屬性，Vue 3 透過 CDN 在各頁面掛載局部互動。所有前端互動統一透過 `public/js/api.js` 的 `apiFetch()` 呼叫 REST API，並由 `public/js/auth.js` 自動附上 JWT 與 `X-Session-Id`。

## 啟動流程

1. `node server.js` 載入 `app.js`。
2. `server.js` 讀取 `PORT`，預設 `3001`。
3. 若 `server.js` 是主程式入口，會檢查 `process.env.JWT_SECRET`；缺少時直接 `process.exit(1)`。
4. `app.js` 執行 `require('dotenv').config()` 載入 `.env`。
5. `app.js` 載入 `src/database.js`。此步驟會：
   - 開啟根目錄 `database.sqlite`
   - 設定 `journal_mode = WAL`
   - 設定 `foreign_keys = ON`
   - 建立五張資料表
   - 建立預設管理員
   - 在商品表空白時寫入八筆種子商品
6. `app.js` 設定 EJS view engine 與 `views/` 目錄。
7. Express 掛載靜態檔案、CORS、JSON parser、URL encoded parser、session middleware。
8. Express 掛載 API routes 與 page routes。
9. Express 掛載 API/頁面 404 handler。
10. Express 掛載全域 `errorHandler`。

## 請求資料流

API 請求：

```text
client fetch
  -> app.js global middleware
  -> sessionMiddleware
  -> route-level auth/admin middleware
  -> route handler
  -> better-sqlite3 prepared statement 或 transaction
  -> JSON { data, error, message }
```

頁面請求：

```text
browser GET page URL
  -> pageRoutes
  -> renderFront/renderAdmin
  -> EJS page partial
  -> layout
  -> browser loads Vue CDN and page script
  -> page script calls API with apiFetch()
```

前端認證資料流：

```text
login/register API returns token + user
  -> Auth.login stores flower_token and flower_user in localStorage
  -> Auth.getAuthHeaders adds Authorization if token exists
  -> Auth.getAuthHeaders always adds X-Session-Id
```

## 目錄與檔案用途

| 路徑 | 用途 |
| --- | --- |
| `app.js` | Express app 建立、資料庫初始化、middleware 與 routes 掛載、404 與錯誤處理 |
| `server.js` | production/dev server 入口，檢查 `JWT_SECRET` 並監聽 port |
| `package.json` | scripts、dependencies、devDependencies |
| `package-lock.json` | npm 鎖定依賴版本 |
| `.env.example` | 環境變數範本，包含 JWT、server、admin seed、ECPay 測試環境變數 |
| `.gitignore` | 忽略依賴、CSS build output、SQLite、env、coverage、IDE 檔 |
| `swagger-config.js` | OpenAPI 3.0.3 設定與 security schemes |
| `generate-openapi.js` | 使用 `swagger-jsdoc` 產生 `openapi.json` |
| `vitest.config.js` | Vitest 設定，停用測試檔平行化並固定順序 |
| `database.sqlite` | 本機 SQLite 資料庫，已被 `.gitignore` 忽略 |
| `database.sqlite-shm` | SQLite WAL shared memory 檔，已被 `.gitignore` 忽略 |
| `database.sqlite-wal` | SQLite WAL log 檔，已被 `.gitignore` 忽略 |
| `src/database.js` | SQLite 連線、PRAGMA、schema 建立、admin seed、products seed |
| `src/middleware/authMiddleware.js` | Bearer JWT 驗證，查 DB 確認 user 存在，寫入 `req.user` |
| `src/middleware/adminMiddleware.js` | 檢查 `req.user.role === 'admin'` |
| `src/middleware/sessionMiddleware.js` | 從 `x-session-id` header 寫入 `req.sessionId` |
| `src/middleware/errorHandler.js` | 全域未捕捉錯誤 JSON 化與安全訊息處理 |
| `src/routes/authRoutes.js` | 註冊、登入、profile API |
| `src/routes/productRoutes.js` | 公開商品列表與商品詳情 API |
| `src/routes/cartRoutes.js` | 購物車 API，包含內部 `dualAuth()` |
| `src/routes/orderRoutes.js` | 會員訂單 API 與會員主動查詢付款狀態 API |
| `src/routes/ecpayRoutes.js` | 公開 ECPay browser return / notify 路由 |
| `src/services/ecpayService.js` | ECPay AIO CheckMacValue、付款表單與查詢 API helper |
| `src/services/ecpayOrderService.js` | 綠界查詢驗證、訂單 reconcile、離線繳費資訊補查 |
| `src/routes/adminProductRoutes.js` | 管理員商品 CRUD API |
| `src/routes/adminOrderRoutes.js` | 管理員訂單列表、狀態篩選、詳情 API |
| `src/routes/pageRoutes.js` | 前台與後台 EJS page routes |
| `public/css/input.css` | Tailwind v4 輸入與專案 theme tokens |
| `public/css/output.css` | Tailwind CLI 輸出，忽略於 git |
| `public/stylesheets/style.css` | Express generator 遺留樣式，目前 layout 未引用 |
| `public/js/auth.js` | localStorage token/user/session 管理與前端路由守衛 |
| `public/js/api.js` | fetch wrapper，統一 headers、401 redirect、錯誤拋出 |
| `public/js/header-init.js` | 前台 header 登入狀態、後台入口、購物車 badge 初始化 |
| `public/js/notification.js` | toast 顯示工具 |
| `public/js/pages/index.js` | 首頁商品列表、分頁、加入購物車 |
| `public/js/pages/product-detail.js` | 商品詳情、數量選擇、加入購物車 |
| `public/js/pages/cart.js` | 購物車查詢、數量更新、刪除、結帳導向 |
| `public/js/pages/checkout.js` | 結帳表單驗證、建立訂單 |
| `public/js/pages/login.js` | 登入/註冊 tab、表單驗證、登入後 redirect |
| `public/js/pages/orders.js` | 會員訂單列表 |
| `public/js/pages/order-detail.js` | 訂單詳情、綠界付款導向與付款狀態查詢 |
| `public/js/pages/admin-products.js` | 後台商品列表、modal 新增/編輯/刪除 |
| `public/js/pages/admin-orders.js` | 後台訂單列表、狀態篩選、詳情 modal |
| `views/layouts/front.ejs` | 前台 layout，載入 Vue、auth/api/notification/header-init 與 page script |
| `views/layouts/admin.ejs` | 後台 layout，執行 `Auth.requireAdmin()` 並載入 page script |
| `views/partials/head.ejs` | HTML head、字型、CSS |
| `views/partials/header.ejs` | 前台 header、購物車 badge、登入區 |
| `views/partials/footer.ejs` | 頁尾 |
| `views/partials/notification.ejs` | toast 容器 |
| `views/partials/admin-header.ejs` | 後台 header、返回前台、登出 |
| `views/partials/admin-sidebar.ejs` | 後台側欄與目前路徑 highlight |
| `views/pages/index.ejs` | 首頁、精選推薦、商品列表、品牌故事、服務說明 |
| `views/pages/product-detail.ejs` | 商品詳情頁 |
| `views/pages/cart.ejs` | 購物車頁 |
| `views/pages/checkout.ejs` | 結帳頁 |
| `views/pages/login.ejs` | 登入/註冊頁 |
| `views/pages/orders.ejs` | 我的訂單頁 |
| `views/pages/order-detail.ejs` | 訂單詳情與付款按鈕頁 |
| `views/pages/404.ejs` | 非 API route 的 404 頁 |
| `views/pages/admin/products.ejs` | 後台商品管理頁 |
| `views/pages/admin/orders.ejs` | 後台訂單管理頁 |
| `tests/setup.js` | Supertest app helper、admin login、user registration helper |
| `tests/auth.test.js` | 認證 API 測試 |
| `tests/products.test.js` | 公開商品 API 測試 |
| `tests/cart.test.js` | 訪客/會員購物車 API 測試 |
| `tests/orders.test.js` | 會員訂單 API 測試 |
| `tests/adminProducts.test.js` | 後台商品 API 與權限測試 |
| `tests/adminOrders.test.js` | 後台訂單 API 與權限測試 |
| `docs/` | 專案文件 |

## API 路由總覽

| 前綴 | 檔案 | 認證 | 說明 |
| --- | --- | --- | --- |
| `/api/auth` | `src/routes/authRoutes.js` | register/login 無；profile 需 Bearer JWT | 會員註冊、登入、取得個人資料 |
| `/api/products` | `src/routes/productRoutes.js` | 無 | 公開商品列表與商品詳情 |
| `/api/cart` | `src/routes/cartRoutes.js` | Bearer JWT 或 `X-Session-Id` | 購物車查詢、新增、更新、刪除 |
| `/api/orders` | `src/routes/orderRoutes.js` | Bearer JWT | 建立訂單、會員訂單列表、詳情、ECPay 付款與查詢 |
| `/api/admin/products` | `src/routes/adminProductRoutes.js` | Bearer JWT + admin role | 後台商品列表、新增、編輯、刪除 |
| `/api/admin/orders` | `src/routes/adminOrderRoutes.js` | Bearer JWT + admin role | 後台訂單列表、狀態篩選、詳情 |

## 頁面路由總覽

| 路徑 | EJS page | Layout | Page script | 說明 |
| --- | --- | --- | --- | --- |
| `/` | `views/pages/index.ejs` | `front` | `index` | 首頁與商品列表 |
| `/products/:id` | `views/pages/product-detail.ejs` | `front` | `product-detail` | 商品詳情 |
| `/cart` | `views/pages/cart.ejs` | `front` | `cart` | 購物車 |
| `/checkout` | `views/pages/checkout.ejs` | `front` | `checkout` | 結帳，前端要求登入 |
| `/login` | `views/pages/login.ejs` | `front` | `login` | 登入與註冊 |
| `/orders` | `views/pages/orders.ejs` | `front` | `orders` | 會員訂單列表，前端要求登入 |
| `/orders/:id` | `views/pages/order-detail.ejs` | `front` | `order-detail` | 訂單詳情、綠界付款與付款狀態查詢 |
| `/admin/products` | `views/pages/admin/products.ejs` | `admin` | `admin-products` | 管理員商品管理 |
| `/admin/orders` | `views/pages/admin/orders.ejs` | `admin` | `admin-orders` | 管理員訂單管理 |

## 統一回應格式

成功回應：

```json
{
  "data": {
    "id": "uuid",
    "name": "粉色玫瑰花束"
  },
  "error": null,
  "message": "成功"
}
```

錯誤回應：

```json
{
  "data": null,
  "error": "VALIDATION_ERROR",
  "message": "email、password、name 為必填欄位"
}
```

API 404 由 `app.js` 特別處理：

```json
{
  "data": null,
  "error": "NOT_FOUND",
  "message": "找不到該路徑"
}
```

未捕捉例外由 `errorHandler` 回應。即使狀態碼是 400/401/403/404/409 等，`error` 目前固定為 `INTERNAL_ERROR`，`message` 會依 operational flag 或安全訊息決定。一般 route 內自行處理的錯誤才會使用更具體的 error code。

## 認證與授權

### JWT 簽發

註冊與登入成功都會簽發 JWT：

| 參數 | 值 |
| --- | --- |
| 簽章 secret | `process.env.JWT_SECRET` |
| 演算法 | jsonwebtoken 預設簽發，驗證時限定 `HS256` |
| 有效期 | `7d` |
| payload | `{ userId, email, role }` |

### `authMiddleware`

`src/middleware/authMiddleware.js` 行為：

1. 讀取 `Authorization` header。
2. header 必須存在且以 `Bearer ` 開頭，否則回 401 `UNAUTHORIZED`，訊息 `請先登入`。
3. 使用 `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })` 驗證。
4. 以 decoded `userId` 查詢 `users` 表，只確認使用者存在。
5. 找不到 user 時回 401 `UNAUTHORIZED`，訊息 `使用者不存在，請重新登入`。
6. 驗證成功後寫入：

```js
req.user = {
  userId: decoded.userId,
  email: decoded.email,
  role: decoded.role
};
```

7. token 無效或過期時回 401 `UNAUTHORIZED`，訊息 `Token 無效或已過期`。

### `adminMiddleware`

`src/middleware/adminMiddleware.js` 行為：

1. 要求前一個 middleware 已建立 `req.user`。
2. 檢查 `req.user.role === 'admin'`。
3. 不符合時回 403 `FORBIDDEN`，訊息 `權限不足`。

後台 route 必須依序掛載：

```js
router.use(authMiddleware, adminMiddleware);
```

### `sessionMiddleware`

`src/middleware/sessionMiddleware.js` 只做一件事：若請求 header 有 `x-session-id`，就寫入 `req.sessionId`。它不會產生 session、驗證格式、設定 cookie 或保存伺服器端 session。

### 購物車雙模式認證

`src/routes/cartRoutes.js` 內部 `dualAuth()` 是非標準機制，僅購物車 API 使用。

決策順序：

1. 若有 `Authorization: Bearer <token>`：
   - 驗證 JWT。
   - 查詢 user 是否存在。
   - 成功時使用 `req.user.userId` 對應 `cart_items.user_id`。
   - 若 token 無效、過期或 user 不存在，立即回 401，不退回 session。
2. 若沒有 Bearer token，但有 `req.sessionId`：
   - 使用 `cart_items.session_id`。
3. 兩者都沒有：
   - 回 401 `UNAUTHORIZED`，訊息 `請提供有效的登入 Token 或 X-Session-Id`。

前端 `Auth.getAuthHeaders()` 永遠附上 `X-Session-Id`，有登入時額外附上 JWT。因此登入會員呼叫購物車 API 時會優先使用會員購物車，不會讀訪客購物車。

## 資料庫 Schema

資料庫檔案：根目錄 `database.sqlite`。

PRAGMA：

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
```

### `users`

| 欄位 | 型別 | 約束 | 說明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | `PRIMARY KEY` | UUID v4 |
| `email` | `TEXT` | `UNIQUE NOT NULL` | 登入帳號 |
| `password_hash` | `TEXT` | `NOT NULL` | bcrypt hash |
| `name` | `TEXT` | `NOT NULL` | 顯示名稱 |
| `role` | `TEXT` | `NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin'))` | 權限角色 |
| `created_at` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` | 建立時間 |

### `products`

| 欄位 | 型別 | 約束 | 說明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | `PRIMARY KEY` | UUID v4 |
| `name` | `TEXT` | `NOT NULL` | 商品名稱 |
| `description` | `TEXT` | 無 | 商品描述，可為 null |
| `price` | `INTEGER` | `NOT NULL CHECK(price > 0)` | 商品單價，整數 |
| `stock` | `INTEGER` | `NOT NULL DEFAULT 0 CHECK(stock >= 0)` | 庫存 |
| `image_url` | `TEXT` | 無 | 商品圖片 URL，可為 null |
| `created_at` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` | 建立時間 |
| `updated_at` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` | 更新時間 |

`updated_at` 只在後台商品更新 API 中手動設為 `datetime('now')`，沒有 DB trigger。

### `cart_items`

| 欄位 | 型別 | 約束 | 說明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | `PRIMARY KEY` | UUID v4 |
| `session_id` | `TEXT` | 無 | 訪客購物車 owner |
| `user_id` | `TEXT` | `FOREIGN KEY REFERENCES users(id)` | 會員購物車 owner |
| `product_id` | `TEXT` | `NOT NULL FOREIGN KEY REFERENCES products(id)` | 商品 |
| `quantity` | `INTEGER` | `NOT NULL DEFAULT 1 CHECK(quantity > 0)` | 數量 |

沒有資料庫層級約束要求 `session_id` 與 `user_id` 必須擇一。此規則由 route 的 `getOwnerCondition()` 決定。

### `orders`

| 欄位 | 型別 | 約束 | 說明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | `PRIMARY KEY` | UUID v4 |
| `order_no` | `TEXT` | `UNIQUE NOT NULL` | `ORD-YYYYMMDD-XXXXX` |
| `user_id` | `TEXT` | `NOT NULL FOREIGN KEY REFERENCES users(id)` | 下單會員 |
| `recipient_name` | `TEXT` | `NOT NULL` | 收件人姓名 |
| `recipient_email` | `TEXT` | `NOT NULL` | 收件 Email |
| `recipient_address` | `TEXT` | `NOT NULL` | 收件地址 |
| `total_amount` | `INTEGER` | `NOT NULL` | 商品總額，不含前端顯示運費 |
| `status` | `TEXT` | `NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'failed'))` | 訂單狀態 |
| `ecpay_merchant_trade_no` | `TEXT` | `UNIQUE` | 綠界特店交易編號，20 字元內英數 |
| `ecpay_trade_no` | `TEXT` | 無 | 綠界交易編號 |
| `ecpay_payment_type` | `TEXT` | 無 | 綠界付款方式回覆值 |
| `ecpay_trade_status` | `TEXT` | 無 | 綠界 `TradeStatus` 查詢結果 |
| `ecpay_payment_date` | `TEXT` | 無 | 綠界付款時間 |
| `ecpay_payment_info` | `TEXT` | 無 | ATM/CVS/BARCODE 繳費資訊 JSON |
| `ecpay_last_checked_at` | `TEXT` | 無 | 最後主動查詢綠界時間 |
| `created_at` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` | 建立時間 |

### `order_items`

| 欄位 | 型別 | 約束 | 說明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | `PRIMARY KEY` | UUID v4 |
| `order_id` | `TEXT` | `NOT NULL FOREIGN KEY REFERENCES orders(id)` | 所屬訂單 |
| `product_id` | `TEXT` | `NOT NULL` | 商品 ID |
| `product_name` | `TEXT` | `NOT NULL` | 下單當下商品名稱快照 |
| `product_price` | `INTEGER` | `NOT NULL` | 下單當下商品價格快照 |
| `quantity` | `INTEGER` | `NOT NULL` | 購買數量 |

`order_items.product_id` 沒有宣告 foreign key。這讓商品刪除後仍可保留訂單明細快照，但目前刪除商品時仍會檢查是否存在 pending 訂單。

## Seed 行為

### 管理員 seed

`seedAdminUser()` 使用：

- `ADMIN_EMAIL`，預設 `admin@hexschool.com`
- `ADMIN_PASSWORD`，預設 `12345678`

若該 email 不存在，會建立 role `admin` 的使用者。bcrypt salt rounds 在 `NODE_ENV === 'test'` 時為 `1`，其他環境為 `10`。

### 商品 seed

`seedProducts()` 先查 `SELECT COUNT(*) FROM products`。只要 products 有任何資料，就不會再次 seed。空表時會建立八筆花卉商品。

## 金流與第三方整合

本專案串接綠界 ECPay AIO。付款方式使用 `ChoosePayment=ALL`，由前端取得後端產生的 AIO 表單參數後，以瀏覽器 POST 導向綠界付款頁。

| 變數 | 用途 |
| --- | --- |
| `ECPAY_MERCHANT_ID` | 綠界特店編號，未設定時使用測試帳號 `3002607` |
| `ECPAY_HASH_KEY` | AIO CheckMacValue HashKey |
| `ECPAY_HASH_IV` | AIO CheckMacValue HashIV |
| `ECPAY_ENV` | `staging` 使用測試環境；`production`/`prod` 使用正式環境 |

本地端限制與付款狀態更新流程：

1. 會員建立訂單後狀態為 `pending`。
2. 前端訂單詳情頁呼叫 `POST /api/orders/:id/ecpay/checkout`。
3. 後端每次付款導向前都重新產生 `ecpay_merchant_trade_no`，組出 AIO form params 與 `CheckMacValue`，避免綠界拒絕重複的 `MerchantTradeNo`。
4. 前端用 hidden form POST 到綠界 AIO 付款頁。
5. 綠界 Server Notify 不可作為本機主流程，因此 `ReturnURL`、`ClientBackURL`、`ClientRedirectURL` 都先進入本站公開 `/ecpay/*` 路由。
6. `/ecpay/client-back` 與 `/ecpay/client-redirect` 會先呼叫同一套 reconcile helper，再 redirect 到 `/orders/:id?payment=success|failed|returned`。
7. `POST /api/orders/:id/ecpay/query` 與 `/ecpay/*` 共用同一套 `QueryTradeInfo/V5` 驗證與訂單更新邏輯。
8. `TradeStatus=1` 更新為 `paid`；`10100058`、`10100248`、`10100254`、`10200095`、`10200163` 更新為 `failed`；其他狀態維持 `pending`。
9. ATM/CVS/BARCODE pending 訂單會嘗試呼叫 `QueryPaymentInfo` 取得繳費資訊；訂單頁只做有限次退避補查，不做固定輪詢。

`PATCH /api/orders/:id/pay` 模擬付款端點已停用，固定回 `410 PAYMENT_FLOW_REMOVED`。
