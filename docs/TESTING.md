# Testing Guide

## 測試架構

專案使用 Vitest 與 Supertest 做 API 整合測試。測試直接 import `app.js`，不透過 `server.js` listen port，因此不需要啟動伺服器。

```js
const request = require('supertest');
const app = require('../app');
```

測試會使用同一個本機 SQLite 檔案與同一個 Express app。`app.js` import 時會初始化資料庫與 seed data，因此測試彼此可能受到資料狀態影響。`vitest.config.js` 已將 `fileParallelism` 設為 `false` 來避免多個測試檔同時寫同一個 SQLite DB；設定檔也列出預期測試檔順序，但測試設計不可依賴跨檔副作用或假設 Vitest 輸出順序一定等於該列表。

## 執行測試

```powershell
npm test
```

執行單一測試檔：

```powershell
npx vitest run tests/cart.test.js
```

執行單一測試名稱：

```powershell
npx vitest run tests/orders.test.js -t "should create an order from cart"
```

## 測試設定

`vitest.config.js`：

```js
export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    sequence: {
      files: [
        'tests/ecpayService.test.js',
        'tests/ecpayRoutes.test.js',
        'tests/auth.test.js',
        'tests/products.test.js',
        'tests/cart.test.js',
        'tests/orders.test.js',
        'tests/adminProducts.test.js',
        'tests/adminOrders.test.js',
      ],
    },
    hookTimeout: 10000,
  },
});
```

關鍵設定：

| 設定 | 原因 |
| --- | --- |
| `globals: true` | 測試直接使用 `describe`、`it`、`expect` |
| `fileParallelism: false` | 避免多個測試檔同時寫同一個 SQLite DB |
| `sequence.files` | 記錄此專案預期測試檔順序；不要把跨檔副作用當成測試前置條件 |
| `hookTimeout: 10000` | 給 bcrypt、DB 初始化與整合測試較寬鬆 timeout |

## 測試檔案表

| 檔案 | 覆蓋功能 | 重要依賴 |
| --- | --- | --- |
| `tests/setup.js` | 共用 helper | import `app` 會初始化 DB |
| `tests/ecpayService.test.js` | ECPay CheckMacValue、AIO 表單參數 | 不呼叫外部綠界服務 |
| `tests/ecpayRoutes.test.js` | 公開 `/ecpay/*` 回跳、redirect 與 notify reconcile | 直接建立測試訂單並 mock 綠界查詢 |
| `tests/auth.test.js` | 註冊、重複 email、登入、錯誤密碼、profile、未登入 profile | 依賴 seed admin |
| `tests/products.test.js` | 公開商品列表、分頁、詳情、404 | 依賴 seed products |
| `tests/cart.test.js` | 訪客購物車新增/查詢/更新/刪除、會員購物車、新增不存在商品 | 依賴產品資料與 `X-Session-Id` |
| `tests/orders.test.js` | 建立訂單、空購物車失敗、未登入失敗、列表、詳情、404 | 建立訂單會扣庫存與清購物車 |
| `tests/adminProducts.test.js` | 後台商品列表、新增、更新、刪除、一般會員拒絕、未登入拒絕 | 依賴 seed admin |
| `tests/adminOrders.test.js` | 後台訂單列表、status 篩選、詳情、一般會員拒絕 | beforeAll 會建立會員訂單 |

## 輔助函式

### `getAdminToken()`

位置：`tests/setup.js`。

用途：使用 seed admin 登入並回傳 JWT token。

```js
const token = await getAdminToken();
```

預設帳密：

| email | password |
| --- | --- |
| `admin@hexschool.com` | `12345678` |

如果 `.env` 中 `ADMIN_EMAIL` 或 `ADMIN_PASSWORD` 改變，這個 helper 也必須同步調整，否則後台測試會失敗。

### `registerUser(overrides = {})`

位置：`tests/setup.js`。

用途：註冊一個新使用者，回傳 `{ token, user }`。

預設值：

| 欄位 | 預設 |
| --- | --- |
| `email` | `test-${Date.now()}-${random}@example.com` |
| `password` | `password123` |
| `name` | `測試使用者` |

範例：

```js
const { token, user } = await registerUser({
  name: '自訂測試者'
});
```

### `app` 與 `request`

`tests/setup.js` export `app` 與 `request`，測試檔可直接：

```js
const { app, request } = require('./setup');

const res = await request(app).get('/api/products');
```

## 撰寫新測試的步驟

1. 選擇對應測試檔。新會員訂單行為放 `orders.test.js`，後台商品行為放 `adminProducts.test.js`。
2. 若測試需要登入，使用 `registerUser()` 或 `getAdminToken()`。
3. 若測試需要商品，優先建立自己的測試商品；不要依賴 seed 商品仍有足夠庫存。
4. 每個 API 測試至少 assert：
   - HTTP status。
   - `res.body` 有 `data`。
   - 成功時 `error === null`。
   - 錯誤時 `data === null` 且 `error` 不為 null。
5. 測試會改資料時，盡量建立自己的資料，避免依賴上一個 `it` 的副作用；若必須依賴，將狀態變數放在 describe scope 並保持順序明確。
6. 加入新的測試檔時，檢查 `vitest.config.js` 的 `sequence.files` 是否需要更新。

## 測試範例

### 會員 API 範例

```js
const { app, request, registerUser } = require('./setup');

it('should return current user orders', async () => {
  const { token } = await registerUser();

  const res = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('data');
  expect(res.body).toHaveProperty('error', null);
  expect(res.body.data).toHaveProperty('orders');
  expect(Array.isArray(res.body.data.orders)).toBe(true);
});
```

### 訪客購物車範例

```js
it('should read guest cart by session id', async () => {
  const sessionId = `test-session-${Date.now()}`;
  const productsRes = await request(app).get('/api/products');
  const productId = productsRes.body.data.products[0].id;

  await request(app)
    .post('/api/cart')
    .set('X-Session-Id', sessionId)
    .send({ productId, quantity: 1 });

  const res = await request(app)
    .get('/api/cart')
    .set('X-Session-Id', sessionId);

  expect(res.status).toBe(200);
  expect(res.body.data.items.length).toBeGreaterThan(0);
});
```

### 後台權限範例

```js
it('should deny regular users', async () => {
  const { token } = await registerUser();

  const res = await request(app)
    .get('/api/admin/products')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(403);
  expect(res.body).toHaveProperty('error', 'FORBIDDEN');
});
```

## 執行順序與依賴關係

`vitest.config.js` 目前列出的預期測試檔順序是：

1. `ecpayService.test.js`
2. `ecpayRoutes.test.js`
3. `auth.test.js`
4. `products.test.js`
5. `cart.test.js`
6. `orders.test.js`
7. `adminProducts.test.js`
8. `adminOrders.test.js`

設計意圖：

- `ecpayService.test.js` 先驗證純函式與表單參數，不依賴 DB。
- `ecpayRoutes.test.js` 驗證公開回跳路由與同一套 reconcile helper。
- `auth.test.js` 確認 seed admin 可登入，也建立一般會員測試基本認證。
- `products.test.js` 依賴 seed products，並提供其他測試會使用的商品形狀參考。
- `cart.test.js` 驗證訪客與會員購物車，會新增/刪除購物車資料。
- `orders.test.js` 會建立訂單、扣庫存、清空購物車。
- `adminProducts.test.js` 會新增、更新、刪除測試商品。
- `adminOrders.test.js` beforeAll 會建立新會員與訂單，並測後台查詢。

重要限制：`npm test` 的實際輸出順序可能與上述列表不同。新增測試時要把每個檔案需要的資料放在自己的 `beforeAll` 或測試步驟中建立，不要依賴另一個測試檔先執行。

## 常見陷阱

### 1. 測試共用同一個 SQLite 檔案

測試不會為每個檔案建立全新 DB。若本機 `database.sqlite` 累積很多測試資料，分頁總數或資料順序可能不同。測試應避免 assert 精確總數，除非先建立隔離資料或清理資料。

### 2. 訂單測試會扣庫存

`POST /api/orders` 會扣 products stock。多次執行測試可能讓某些 seed 商品庫存下降。現有測試已改成建立專用商品；新增大量下單測試時也應沿用這個模式，避免 seed 商品被重複扣到 0。

### 3. 建立訂單會清空會員購物車

`orders.test.js` 已明確利用這個行為測空購物車失敗。新增測試時如果需要同一位 user 再次建立訂單，必須重新加入購物車。

### 4. 訪客購物車一定要帶 `X-Session-Id`

缺少 Bearer JWT 且缺少 `X-Session-Id` 時，cart API 會回 401。測試訪客購物車時每個請求都要設定同一個 session id。

### 5. 無效 Bearer token 不會退回 session

cart API 如果收到無效 Bearer token，即使也有 `X-Session-Id`，仍會回 401。這是刻意行為，測試時不要同時帶錯 token 與 session 期待訪客模式成功。

### 6. Admin API 需要真的 admin role

只註冊一般使用者再呼叫後台 API 會回 403。後台成功案例使用 `getAdminToken()`。

### 7. 商品 price/stock 必須是 number

後台商品 API 使用 `Number.isInteger(price)`。若 Supertest body 傳 `{ price: '500' }`，會失敗。測試應傳 number。

### 8. `npm run openapi` 會產生檔案

`generate-openapi.js` 會寫入 `openapi.json`。若只是測試 API，不需要執行它；若執行後不打算提交產物，注意 git 狀態。
