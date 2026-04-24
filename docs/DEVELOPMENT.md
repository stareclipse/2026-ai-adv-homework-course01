# Development Guide

## 開發原則

本專案是教學型 Express monolith。新增功能時應優先維持既有形狀：CommonJS route/middleware、同步 `better-sqlite3` 查詢、EJS 頁面搭配 Vue CDN page script、API 回應 `{ data, error, message }`。不要在單一功能中引入新的前端 build system、ORM、session store 或不同的 API response shape。

## 模組系統說明

| 區域 | 模組系統 | 實例 | 注意事項 |
| --- | --- | --- | --- |
| 應用程式程式碼 | CommonJS | `require(...)`、`module.exports` | `app.js`、`server.js`、`src/**/*.js` 全部使用 CommonJS |
| Vitest config | ESM | `import { defineConfig } from 'vitest/config'` | `vitest.config.js` 使用 ESM 語法 |
| 前端頁面腳本 | browser global | `const { createApp } = Vue` | 依賴 layout 先載入 Vue CDN、`auth.js`、`api.js` |
| EJS templates | EJS include/render | `<%- include(...) %>` | page route 先 render page，再塞進 layout |

不要在 route 檔案直接改成 ESM import，除非同步調整整個 Node 執行設定與測試。

## 命名規則對照表

| 類型 | 命名格式 | 範例 | 說明 |
| --- | --- | --- | --- |
| route 檔 | lower camel + `Routes.js` | `adminProductRoutes.js` | 掛載於 `app.js` 的 API 或 page route |
| middleware 檔 | lower camel + `Middleware.js` | `authMiddleware.js` | Express middleware |
| 測試檔 | 功能名 + `.test.js` | `adminOrders.test.js` | 放在 `tests/` |
| EJS page | kebab-case | `product-detail.ejs` | 前台 page 放 `views/pages/`，後台放 `views/pages/admin/` |
| page script | kebab-case | `product-detail.js` | 與 EJS `pageScript` 同名 |
| 資料表 | snake_case 複數 | `cart_items` | SQLite schema |
| DB 欄位 | snake_case | `recipient_email` | API response 多數直接沿用 DB 欄位 |
| API body | camelCase | `recipientEmail` | 前端傳入 body 使用 camelCase |
| localStorage key | snake-ish prefix | `flower_token` | 定義於 `Auth` 物件 |
| error code | UPPER_SNAKE_CASE | `VALIDATION_ERROR` | 回應中的 `error` |
| UUID 變數 | lower camel | `productId`、`orderId` | JS 內部變數 |

## API 開發規範

### 回應格式

所有 API 成功回應：

```js
res.json({
  data: result,
  error: null,
  message: '成功'
});
```

所有 API 業務錯誤：

```js
return res.status(400).json({
  data: null,
  error: 'VALIDATION_ERROR',
  message: '欄位說明'
});
```

不要讓 route 直接回傳裸陣列、裸字串或沒有 `message` 的 JSON。

### 常用錯誤碼

| error | 建議狀態碼 | 用途 |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | 欄位缺失、格式錯誤、非法 action |
| `UNAUTHORIZED` | 401 | 未登入、token 無效、token 過期 |
| `FORBIDDEN` | 403 | 已登入但權限不足 |
| `NOT_FOUND` | 404 | 商品、購物車項目、訂單或路徑不存在 |
| `CONFLICT` | 409 | 重複 email、商品存在未完成訂單 |
| `STOCK_INSUFFICIENT` | 400 | 庫存不足 |
| `CART_EMPTY` | 400 | 結帳時購物車為空 |
| `INVALID_STATUS` | 400 | 訂單狀態不允許操作 |

### 新增 API 步驟

1. 決定 route 所屬檔案。公開商品用 `productRoutes.js`，會員訂單用 `orderRoutes.js`，後台商品用 `adminProductRoutes.js`。
2. 若是新資源，建立 `src/routes/<name>Routes.js`，並在 `app.js` 掛載明確前綴。
3. 先確認認證層級：
   - 公開：不加 middleware。
   - 會員：使用 `authMiddleware`。
   - 後台：使用 `authMiddleware, adminMiddleware`。
   - 購物車：若要延續訪客/會員雙模式，必須使用或抽出 `dualAuth()`，不可只套 `authMiddleware`。
4. 新增 `@openapi` JSDoc，至少包含 path、method、summary、tags、security、parameters/requestBody、responses。
5. 使用 prepared statement，不用字串串接未驗證的使用者輸入。
6. 回應遵守 `{ data, error, message }`。
7. 補上 Supertest 整合測試。
8. 若功能影響文件，更新 `docs/FEATURES.md`、`docs/ARCHITECTURE.md` 或 `docs/TESTING.md`。

### OpenAPI JSDoc 範例

```js
/**
 * @openapi
 * /api/example:
 *   post:
 *     summary: 建立範例資源
 *     tags: [Example]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: 建立成功
 *       400:
 *         description: 參數錯誤
 */
router.post('/', authMiddleware, (req, res) => {
  // implementation
});
```

## Middleware 開發規範

### 新增 middleware 步驟

1. 在 `src/middleware/` 新增 `<name>Middleware.js`。
2. 使用 CommonJS 匯出 function。
3. 若 middleware 會拒絕請求，回應格式仍要是 `{ data: null, error, message }`。
4. 若 middleware 要供多個 routes 使用，避免直接 import 特定 route 的 helper。
5. 在 route 或 `app.js` 掛載時注意順序。需要 `req.user` 的 middleware 必須放在 `authMiddleware` 後面。

範例：

```js
function exampleMiddleware(req, res, next) {
  if (!req.headers['x-example']) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'x-example 為必填 header'
    });
  }
  next();
}

module.exports = exampleMiddleware;
```

## DB 開發規範

### 新增資料表或欄位

目前沒有 migration tool。schema 寫在 `src/database.js` 的 `initializeDatabase()`。新增 DB 結構時請遵守：

1. 使用 `CREATE TABLE IF NOT EXISTS` 新增表。
2. 若新增欄位，需考慮既有 `database.sqlite` 已存在，單純修改 `CREATE TABLE` 不會改到舊表。
3. 需要修改既有表時，新增明確的 `ALTER TABLE` 或 migration helper，並確保重複啟動不會失敗。
4. 測試前注意本機 SQLite 可能保留舊 schema；必要時刪除忽略的 `database.sqlite*` 後重跑。
5. 若需要多步寫入，使用 `db.transaction()`。
6. 對 money/price 仍使用 integer，不引入浮點金額。

### Transaction 使用規則

訂單建立是目前最重要的 transaction 範例。任何跨表且需要一致性的流程，例如金流 callback 同時更新訂單與紀錄付款事件，都應使用 `db.transaction()`。

```js
const updateOrder = db.transaction(() => {
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, orderId);
  db.prepare('INSERT INTO payment_logs (...) VALUES (...)').run(...values);
});

updateOrder();
```

## 前端頁面開發規範

### 新增前台頁面

1. 在 `views/pages/` 新增 EJS page。
2. 在 `public/js/pages/` 新增同名 page script。
3. 在 `src/routes/pageRoutes.js` 新增 route，使用 `renderFront(res, page, { title, pageScript })`。
4. page script 使用 Vue global：

```js
const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    const loading = ref(true);
    onMounted(async function () {
      loading.value = false;
    });
    return { loading };
  }
}).mount('#app');
```

5. API 呼叫使用 `apiFetch()`，不要直接散落 token/header 邏輯。
6. 需要登入時先呼叫 `Auth.requireAuth()`。

### 新增後台頁面

1. EJS 放 `views/pages/admin/`。
2. page script 放 `public/js/pages/`。
3. route 使用 `renderAdmin()`，並傳入 `currentPath`。
4. 後台 layout 已做前端 `Auth.requireAdmin()`，但後端 API 仍必須加 admin middleware。

## 環境變數表

| 變數 | 用途 | 必要性 | 預設值 | 讀取位置 |
| --- | --- | --- | --- | --- |
| `JWT_SECRET` | JWT 簽發與驗證 secret | 正式啟動必填 | 無 | `server.js`、auth/cart middleware |
| `PORT` | Express listen port | 選填 | `3001` | `server.js` |
| `BASE_URL` | 應用 base URL，用於 ECPay `ReturnURL`、`ClientBackURL`、`ClientRedirectURL` | 選填 | `http://localhost:3001` | `src/services/ecpayService.js` |
| `FRONTEND_URL` | CORS origin | 選填 | `http://localhost:3001` in code；example 為 `http://localhost:5173` | `app.js` |
| `ADMIN_EMAIL` | seed admin email | 選填 | `admin@hexschool.com` | `src/database.js` |
| `ADMIN_PASSWORD` | seed admin password | 選填 | `12345678` | `src/database.js` |
| `NODE_ENV` | 測試時降低 bcrypt salt rounds | 選填 | 無 | `src/database.js` |
| `ECPAY_MERCHANT_ID` | ECPay 商店代號 | 選填 | `3002607` | `src/services/ecpayService.js` |
| `ECPAY_HASH_KEY` | ECPay HashKey | 選填 | 測試 HashKey | `src/services/ecpayService.js` |
| `ECPAY_HASH_IV` | ECPay HashIV | 選填 | 測試 HashIV | `src/services/ecpayService.js` |
| `ECPAY_ENV` | ECPay 環境，`staging` 或 `production`/`prod` | 選填 | `staging` | `src/services/ecpayService.js` |

## JSDoc 與註解規範

目前專案的 JSDoc 主要用於 OpenAPI。新增 route 時請優先維持既有格式，不需要替每個普通函式都加 JSDoc。

應加註解的情境：

- OpenAPI route 文件。
- 非標準認證流程，例如購物車 dual auth。
- 跨表 transaction 或容易破壞資料一致性的流程。

避免的註解：

- 重述程式碼本身，例如 `// Get id`。
- 與程式碼不一致的歷史說明。

## 計畫歸檔流程

1. 計畫檔案命名格式：`YYYY-MM-DD-<feature-name>.md`
2. 計畫文件結構：User Story -> Spec -> Tasks
3. 功能完成後：移至 `docs/plans/archive/`
4. 更新 `docs/FEATURES.md` 和 `docs/CHANGELOG.md`

建議計畫內容最少包含：

```markdown
# Feature Name

## User Story

身為某角色，我想要某能力，以便達成某目的。

## Spec

- API 或頁面行為
- 欄位與驗證
- 權限
- 錯誤情境
- 資料庫影響

## Tasks

- [ ] 新增或更新測試
- [ ] 實作 API/頁面/DB
- [ ] 更新文件
- [ ] 執行驗證
```

## 文件更新規則

| 變更 | 必須更新 |
| --- | --- |
| 新增 API、修改 request/response | `docs/FEATURES.md`、`docs/ARCHITECTURE.md` |
| 新增資料表或欄位 | `docs/ARCHITECTURE.md`、`docs/DEVELOPMENT.md` 如流程改變 |
| 新增測試 helper 或改測試順序 | `docs/TESTING.md` |
| 新增 npm script | `AGENTS.md`、`docs/README.md` |
| 完成功能或修復重要 bug | `docs/CHANGELOG.md` |
| 新增第三方整合 | `docs/ARCHITECTURE.md`、`docs/FEATURES.md`、`.env.example` |
