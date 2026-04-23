# Features

## 功能狀態總覽

| 功能 | 狀態 | 主要檔案 |
| --- | --- | --- |
| 會員註冊/登入/profile | 已完成 | `src/routes/authRoutes.js`、`public/js/pages/login.js` |
| 公開商品列表/詳情 | 已完成 | `src/routes/productRoutes.js`、`public/js/pages/index.js`、`public/js/pages/product-detail.js` |
| 購物車 | 已完成 | `src/routes/cartRoutes.js`、`public/js/pages/cart.js` |
| 建立訂單/我的訂單/訂單詳情 | 已完成 | `src/routes/orderRoutes.js`、checkout/orders/order-detail page scripts |
| 模擬付款 | 已完成，非真實金流 | `src/routes/orderRoutes.js`、`public/js/pages/order-detail.js` |
| 後台商品管理 | 已完成 | `src/routes/adminProductRoutes.js`、`public/js/pages/admin-products.js` |
| 後台訂單管理 | 已完成 | `src/routes/adminOrderRoutes.js`、`public/js/pages/admin-orders.js` |
| ECPay 第三方金流 | 未完成 | `.env.example` 僅預留設定 |

## 認證功能

### 行為描述

使用者可以註冊一般會員、使用 email/password 登入，並透過 JWT 取得個人資料。註冊與登入都會回傳相同的前端登入資料形狀：`user` 與 `token`。前端將 token 存入 `localStorage.flower_token`，user 存入 `localStorage.flower_user`。

JWT payload 包含 `userId`、`email`、`role`，有效期 7 天。後端每次驗證 token 時不只驗 JWT，也會查詢 `users` 表確認使用者仍存在。

### `POST /api/auth/register`

必填 body：

| 欄位 | 型別 | 驗證 |
| --- | --- | --- |
| `email` | string | 必填，需符合簡易 email regex |
| `password` | string | 必填，長度至少 6 |
| `name` | string | 必填 |

業務邏輯：

1. 驗證三個欄位是否存在。
2. 驗證 email 格式。
3. 驗證密碼長度。
4. 查詢 email 是否已存在。
5. 使用 bcrypt hash password，salt rounds 固定為 10。
6. 建立 role `user` 的使用者。
7. 簽發 7 天 JWT。

錯誤情境：

| 狀態碼 | error | 情境 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 缺欄位、email 格式錯、密碼太短 |
| 409 | `CONFLICT` | email 已註冊 |

### `POST /api/auth/login`

必填 body：

| 欄位 | 型別 | 驗證 |
| --- | --- | --- |
| `email` | string | 必填 |
| `password` | string | 必填 |

業務邏輯：

1. 驗證 email/password 是否存在。
2. 用 email 查詢使用者。
3. 使用 bcrypt compare 驗證密碼。
4. 簽發 7 天 JWT。

錯誤情境：

| 狀態碼 | error | 情境 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | email 或 password 缺失 |
| 401 | `UNAUTHORIZED` | 使用者不存在或密碼錯誤 |

### `GET /api/auth/profile`

認證：Bearer JWT。

業務邏輯：

1. `authMiddleware` 驗證 token。
2. 使用 `req.user.userId` 查詢 `users` 表。
3. 回傳 `id`、`email`、`name`、`role`、`created_at`。

錯誤情境：

| 狀態碼 | error | 情境 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 無 token、token 無效、token 過期、user 不存在 |
| 404 | `NOT_FOUND` | middleware 通過後再次查詢 profile 找不到 user |

## 公開商品功能

### 行為描述

公開商品 API 不需要登入。首頁使用商品列表 API，預設前端每頁抓 9 筆；API 預設每頁 10 筆。商品依 `created_at DESC` 排序。商品詳情頁從 EJS route 的 `data-product-id` 取得商品 ID，再呼叫 API 載入資料。

商品 seed 只在 products 表為空時建立，因此本機資料庫若已有資料，首頁看到的商品不一定是預設八筆。

### `GET /api/products`

查詢參數：

| 參數 | 預設值 | 限制 | 說明 |
| --- | --- | --- | --- |
| `page` | `1` | 小於 1 時修正為 1；非數字時使用 1 | 目前頁 |
| `limit` | `10` | 最小 1，最大 100；非數字時使用 10 | 每頁筆數 |

回傳：

- `data.products`：商品陣列。
- `data.pagination.total`：總商品數。
- `data.pagination.page`：實際使用頁碼。
- `data.pagination.limit`：實際使用每頁筆數。
- `data.pagination.totalPages`：`Math.ceil(total / limit)`。

錯誤情境：目前 route 未定義業務錯誤；DB 例外會進入全域 error handler。

### `GET /api/products/:id`

path 參數：

| 參數 | 說明 |
| --- | --- |
| `id` | products.id |

錯誤情境：

| 狀態碼 | error | 情境 |
| --- | --- | --- |
| 404 | `NOT_FOUND` | 商品不存在 |

## 購物車功能

### 行為描述

購物車支援訪客與登入會員。這是專案最重要的非標準機制之一：

- 訪客購物車使用 `X-Session-Id` header，資料寫入 `cart_items.session_id`。
- 登入會員購物車使用 Bearer JWT，資料寫入 `cart_items.user_id`。
- 如果同時送 Bearer JWT 與 `X-Session-Id`，會優先使用 JWT。
- 如果 Bearer JWT 無效，不會退回 session，會直接回 401。

前端 `Auth.getSessionId()` 會用 `crypto.randomUUID()` 產生並保存 `flower_session_id`，`Auth.getAuthHeaders()` 每次都會附上 `X-Session-Id`。

目前登入後不會自動合併訪客購物車到會員購物車。使用者登入前加入的訪客購物車資料仍留在 `session_id`，登入後 API 會改讀 `user_id` 購物車。

### `GET /api/cart`

認證：Bearer JWT 或 `X-Session-Id`。

業務邏輯：

1. 透過 `dualAuth()` 決定 owner 欄位。
2. join `cart_items` 與 `products`。
3. 回傳 `items`，每筆 item 內含 `product.name`、`product.price`、`product.stock`、`product.image_url`。
4. 用 `price * quantity` 加總 `total`。

錯誤情境：

| 狀態碼 | error | 情境 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 沒有 token/session、token 無效、token 使用者不存在 |

### `POST /api/cart`

認證：Bearer JWT 或 `X-Session-Id`。

body：

| 欄位 | 必填 | 預設值 | 驗證 |
| --- | --- | --- | --- |
| `productId` | 是 | 無 | 商品必須存在 |
| `quantity` | 否 | `1` | `parseInt` 後必須為正整數 |

業務邏輯：

1. 驗證 `productId`。
2. 將 `quantity` 轉成整數，預設 1。
3. 查詢商品。
4. 決定購物車 owner。
5. 查詢同 owner 是否已有同商品。
6. 若已有同商品，將既有 quantity 加上本次 quantity。
7. 若新增後數量超過庫存，回 `STOCK_INSUFFICIENT`。
8. 若沒有既有項目，新增 cart item。

錯誤情境：

| 狀態碼 | error | 情境 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `productId` 缺失或 `quantity` 不是正整數 |
| 400 | `STOCK_INSUFFICIENT` | 本次新增或累加後超過庫存 |
| 401 | `UNAUTHORIZED` | 認證資訊缺失或無效 |
| 404 | `NOT_FOUND` | 商品不存在 |

### `PATCH /api/cart/:itemId`

認證：Bearer JWT 或 `X-Session-Id`。

body：

| 欄位 | 必填 | 驗證 |
| --- | --- | --- |
| `quantity` | 是 | `parseInt` 後必須為正整數，且不可超過商品庫存 |

業務邏輯：

1. 依 owner 與 `itemId` 查詢 cart item。
2. 查詢該商品庫存。
3. 更新 cart item quantity。

錯誤情境：

| 狀態碼 | error | 情境 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | quantity 無效 |
| 400 | `STOCK_INSUFFICIENT` | quantity 大於庫存 |
| 404 | `NOT_FOUND` | cart item 不屬於目前 owner 或不存在 |

### `DELETE /api/cart/:itemId`

認證：Bearer JWT 或 `X-Session-Id`。

業務邏輯：

1. 依 owner 與 `itemId` 查詢 cart item。
2. 找到後刪除。

錯誤情境：

| 狀態碼 | error | 情境 |
| --- | --- | --- |
| 404 | `NOT_FOUND` | cart item 不屬於目前 owner 或不存在 |

## 訂單功能

### 行為描述

訂單只能由登入會員建立，訪客購物車不能直接結帳。前端 `/checkout` 會先呼叫 `Auth.requireAuth()`，未登入時導向 `/login?redirect=/checkout`。後端 `orderRoutes` 全 route 使用 `router.use(authMiddleware)`，所以 API 層也強制 Bearer JWT。

訂單的總金額 `total_amount` 只計算商品小計，不包含前端顯示的運費。購物車與結帳頁會顯示滿 500 免運、未滿運費 150，但此運費沒有存入資料庫或訂單 API。

### `POST /api/orders`

認證：Bearer JWT。

body：

| 欄位 | 必填 | 驗證 |
| --- | --- | --- |
| `recipientName` | 是 | 不可缺 |
| `recipientEmail` | 是 | 簡易 email regex |
| `recipientAddress` | 是 | 不可缺 |

業務邏輯：

1. 驗證收件資訊。
2. 查詢目前會員 `cart_items.user_id` 的購物車內容並 join product。
3. 若購物車為空，回 `CART_EMPTY`。
4. 檢查每個 item quantity 是否大於目前庫存。
5. 計算 `totalAmount = sum(product_price * quantity)`。
6. 產生 order id 與 order no。格式為 `ORD-YYYYMMDD-` 加 UUID 前 5 碼大寫。
7. 使用 `db.transaction()` 一次完成：
   - 建立 `orders`
   - 建立每筆 `order_items`
   - 以 `stock = stock - quantity` 扣庫存
   - 刪除該會員購物車
8. 回傳建立後訂單與明細快照。

錯誤情境：

| 狀態碼 | error | 情境 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 收件資訊缺失或 email 格式錯誤 |
| 400 | `CART_EMPTY` | 會員購物車沒有商品 |
| 400 | `STOCK_INSUFFICIENT` | 任一商品庫存不足，訊息會列出商品名稱 |
| 401 | `UNAUTHORIZED` | 無 token、token 無效或過期 |

### `GET /api/orders`

認證：Bearer JWT。

業務邏輯：

1. 查詢目前會員自己的訂單。
2. 依 `created_at DESC` 排序。
3. 回傳 `id`、`order_no`、`total_amount`、`status`、`created_at`。

此 API 沒有分頁。

### `GET /api/orders/:id`

認證：Bearer JWT。

業務邏輯：

1. 使用 `id` 與 `req.user.userId` 查詢訂單。
2. 只允許查自己的訂單。
3. 查詢 `order_items`。
4. 回傳訂單全部欄位與 `items`。

錯誤情境：

| 狀態碼 | error | 情境 |
| --- | --- | --- |
| 404 | `NOT_FOUND` | 訂單不存在或不屬於目前會員 |

## 模擬付款功能

### 行為描述

目前付款不是 ECPay，也不是任何真實金流。這個功能只讓使用者在訂單詳情頁按下成功或失敗，並把訂單狀態從 `pending` 改成 `paid` 或 `failed`。

前端 `order-detail.js` 對應：

- `handlePaySuccess()` 呼叫 `simulatePay('success')`
- `handlePayFail()` 呼叫 `simulatePay('fail')`

### `PATCH /api/orders/:id/pay`

認證：Bearer JWT。

body：

| 欄位 | 必填 | 允許值 |
| --- | --- | --- |
| `action` | 是 | `success` 或 `fail` |

業務邏輯：

1. 驗證 `action`。
2. 依 `id` 與 `user_id` 查詢自己的訂單。
3. 只有 `pending` 可更新。
4. `success` 更新為 `paid`。
5. `fail` 更新為 `failed`。
6. 回傳更新後訂單與明細。

錯誤情境：

| 狀態碼 | error | 情境 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | action 缺失或不是 `success`/`fail` |
| 400 | `INVALID_STATUS` | 訂單不是 `pending` |
| 404 | `NOT_FOUND` | 訂單不存在或不屬於目前會員 |

## 後台商品管理

### 行為描述

後台商品 API 全部需要 Bearer JWT 且 role 必須為 `admin`。前端後台 layout 也會執行 `Auth.requireAdmin()`，但權限安全以 API middleware 為準。

商品新增與編輯要求 `price`、`stock` 是 JavaScript number 且整數。前端使用 `v-model.number` 讓 number input 轉成數字；若其他 client 傳字串 `"500"`，後端會因 `Number.isInteger("500")` 失敗而回 validation error。

### `GET /api/admin/products`

查詢參數：

| 參數 | 預設值 | 限制 |
| --- | --- | --- |
| `page` | `1` | 最小 1 |
| `limit` | `10` | 最小 1，最大 100 |

業務邏輯：與公開商品列表相同，依 `created_at DESC` 排序並回傳 pagination。

錯誤情境：

| 狀態碼 | error | 情境 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登入或 token 無效 |
| 403 | `FORBIDDEN` | 登入者不是 admin |

### `POST /api/admin/products`

body：

| 欄位 | 必填 | 驗證 |
| --- | --- | --- |
| `name` | 是 | truthy |
| `description` | 否 | 未提供時存 `null` |
| `price` | 是 | number integer 且大於 0 |
| `stock` | 是 | number integer 且大於等於 0 |
| `image_url` | 否 | 未提供時存 `null` |

錯誤情境：

| 狀態碼 | error | 情境 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | name 缺失、price 無效、stock 無效 |

### `PUT /api/admin/products/:id`

body 全欄位選填。未提供欄位會沿用既有值。

欄位規則：

- `name` 若提供，不可 trim 後為空字串。
- `price` 若提供，必須是整數且大於 0。
- `stock` 若提供，必須是整數且大於等於 0。
- `description` 與 `image_url` 若提供，可以更新為提供值。

業務邏輯：

1. 先查詢商品是否存在。
2. 驗證提供的欄位。
3. 合併既有資料與更新資料。
4. 更新 `updated_at = datetime('now')`。
5. 回傳更新後商品。

錯誤情境：

| 狀態碼 | error | 情境 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | name/price/stock 無效 |
| 404 | `NOT_FOUND` | 商品不存在 |

### `DELETE /api/admin/products/:id`

業務邏輯：

1. 查詢商品是否存在。
2. 查詢是否有 pending 訂單包含此商品。
3. 若存在 pending 訂單，禁止刪除。
4. 否則刪除商品。

錯誤情境：

| 狀態碼 | error | 情境 |
| --- | --- | --- |
| 404 | `NOT_FOUND` | 商品不存在 |
| 409 | `CONFLICT` | 商品存在未完成訂單 |

## 後台訂單管理

### 行為描述

後台訂單管理讓 admin 查看所有使用者的訂單。列表可以依狀態篩選；若 query `status` 不是 `pending`、`paid`、`failed`，後端會忽略篩選並回全部訂單，不回 validation error。

### `GET /api/admin/orders`

查詢參數：

| 參數 | 預設值 | 限制 | 說明 |
| --- | --- | --- | --- |
| `page` | `1` | 最小 1 | 頁碼 |
| `limit` | `10` | 最小 1，最大 100 | 每頁筆數 |
| `status` | 無 | 只接受 `pending`、`paid`、`failed` | 狀態篩選；無效值會被忽略 |

業務邏輯：

1. 組合 count SQL 與 query SQL。
2. status 合法時加上 `WHERE status = ?`。
3. 依 `created_at DESC` 排序。
4. 回傳 orders 與 pagination。

### `GET /api/admin/orders/:id`

業務邏輯：

1. 查詢任一使用者的訂單。
2. 查詢該訂單 items。
3. 查詢下單 user 的 `name` 與 `email`。
4. 回傳 `user`；若 user 找不到則為 `null`。

錯誤情境：

| 狀態碼 | error | 情境 |
| --- | --- | --- |
| 404 | `NOT_FOUND` | 訂單不存在 |

## 前端頁面功能

### Header 與登入狀態

`header-init.js` 在 DOMContentLoaded 後：

- 若登入，顯示 user name 與登出按鈕。
- 若 user role 是 admin，額外顯示後台管理連結。
- 若未登入，顯示登入按鈕。
- 訂單連結只在登入時顯示。
- 讀取 `/api/cart` 更新購物車 badge。

購物車 badge 顯示的是 cart item 筆數，不是商品數量總和。加入同商品導致數量累加時，前端仍以 badge `+1` 更新，可能與實際 item 筆數短暫不一致，重新載入後會以 API 回傳 item 長度為準。

### 結帳頁

`checkout.js` 會：

1. 要求登入。
2. 載入 `/api/cart`。
3. 若購物車空白，導回 `/cart`。
4. 驗證收件姓名、Email、地址。
5. 呼叫 `POST /api/orders`。
6. 成功後導向 `/orders/:id`。

### 後台頁

`views/layouts/admin.ejs` 在前端呼叫 `Auth.requireAdmin()`。這只負責使用者體驗；後台 API 仍有後端 admin middleware 防護。

