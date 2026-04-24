# 花漾生活 Flower Life 專案文件

## 項目介紹

花漾生活是一個教學用花卉電商 Demo，提供前台商品瀏覽、會員註冊登入、訪客與會員購物車、結帳建立訂單、ECPay 綠界 AIO 付款、會員訂單查詢，以及管理員商品與訂單管理。專案同時包含 EJS 頁面與 REST API，前端頁面透過 Vue 3 CDN 呼叫同一組 API。

此專案的核心資料存放於本機 SQLite 檔案 `database.sqlite`。啟動應用程式時會載入 `src/database.js`，自動建立資料表、建立預設管理員帳號、在商品表為空時寫入種子商品。這代表第一次啟動不需要額外 migration 指令，但新增 schema 時必須小心既有資料與測試資料庫狀態。

## 技術棧

| 類別 | 技術 | 專案中的用途 |
| --- | --- | --- |
| Runtime | Node.js | 執行 Express、測試與工具腳本 |
| Web framework | Express 4 | API route、EJS page route、middleware 管線 |
| Template engine | EJS | 伺服器端渲染前台與後台頁面外殼 |
| Frontend runtime | Vue 3 CDN | 各頁面 `public/js/pages/*.js` 的互動狀態與 API 呼叫 |
| Styling | Tailwind CSS v4 CLI | 從 `public/css/input.css` 產生 `public/css/output.css` |
| Database | SQLite + better-sqlite3 | 同步 SQL、transaction、啟動時建表與 seed |
| Auth | jsonwebtoken + bcrypt | JWT 登入授權與密碼雜湊 |
| API docs | swagger-jsdoc | 從 routes 的 `@openapi` JSDoc 產生 `openapi.json` |
| Testing | Vitest + Supertest | API 整合測試 |

## 快速開始

```powershell
npm install
Copy-Item .env.example .env
npm run css:build
npm run dev:server
```

開啟瀏覽器：

- 前台首頁：`http://localhost:3001/`
- 後台商品管理：`http://localhost:3001/admin/products`
- 後台訂單管理：`http://localhost:3001/admin/orders`

預設管理員帳號由 `.env` 控制，若直接使用 `.env.example`：

| 欄位 | 值 |
| --- | --- |
| Email | `admin@hexschool.com` |
| Password | `12345678` |

## 開發模式

後端與 Tailwind CSS 監看需要分開執行：

```powershell
npm run dev:server
```

另一個終端：

```powershell
npm run dev:css
```

`npm run dev:server` 不會自動重建 `public/css/output.css`。若只改 API 或測試，不需要啟動 CSS watch。若改 `public/css/input.css` 或 EJS class，請同步執行 `npm run dev:css` 或至少在交付前執行 `npm run css:build`。

## 常用指令

| 指令 | 說明 | 會寫入的主要輸出 |
| --- | --- | --- |
| `npm start` | 建置 CSS 後啟動正式模式伺服器 | `public/css/output.css`、`database.sqlite` |
| `npm run dev:server` | 啟動 Express，適合 API 與頁面開發 | `database.sqlite` |
| `npm run dev:css` | 監看 Tailwind CSS | `public/css/output.css` |
| `npm run css:build` | 產生壓縮 CSS | `public/css/output.css` |
| `npm run openapi` | 依 routes JSDoc 產生 OpenAPI 規格 | `openapi.json` |
| `npm test` | 執行全部 API 測試 | 可能改動本機 `database.sqlite` 測試資料；測試檔不可依賴跨檔副作用 |

## 環境變數最小設定

正式啟動 `server.js` 時必須設定 `JWT_SECRET`。若缺少此變數，程式會印出 `Fatal: JWT_SECRET is not set` 並結束 process。

```env
JWT_SECRET=your-jwt-secret-key-here
BASE_URL=http://localhost:3001
FRONTEND_URL=http://localhost:5173
ADMIN_EMAIL=admin@hexschool.com
ADMIN_PASSWORD=12345678
ECPAY_MERCHANT_ID=3002607
ECPAY_HASH_KEY=pwFHCqoQZGmho4w6
ECPAY_HASH_IV=EkRm7iFT261dpevs
ECPAY_ENV=staging
```

本專案在本地端運行，無法依賴綠界 Server Notify。付款完成後，綠界的「返回商店」會先打到本站公開 `/ecpay/*` 路由，由後端先向綠界查詢一次，再 redirect 回訂單詳情頁；若仍是待付款，頁面只會做有限次退避補查，並保留手動查詢。

## 文件索引

| 文件 | 用途 |
| --- | --- |
| `docs/ARCHITECTURE.md` | 架構、啟動流程、資料流、API route、DB schema、認證與金流現況 |
| `docs/FEATURES.md` | 功能清單、完成狀態、API 參數、業務規則、錯誤情境 |
| `docs/DEVELOPMENT.md` | 開發規範、命名規則、環境變數、新增功能流程、計畫歸檔流程 |
| `docs/TESTING.md` | 測試架構、測試檔案、執行順序、輔助函式、常見陷阱 |
| `docs/CHANGELOG.md` | 更新日誌 |
| `docs/plans/` | 開發計畫工作區 |
| `docs/plans/archive/` | 已完成計畫歸檔 |

## 當前完成狀態摘要

| 模組 | 狀態 | 備註 |
| --- | --- | --- |
| 前台商品瀏覽 | 已完成 | 商品列表、精選商品、商品詳情、分頁 |
| 認證 | 已完成 | 註冊、登入、profile、JWT 7 天 |
| 購物車 | 已完成 | 支援訪客 session 與會員 JWT 雙模式 |
| 訂單 | 已完成 | 登入會員從購物車建立訂單，transaction 扣庫存 |
| 付款 | 已完成 | ECPay AIO `ChoosePayment=ALL`，`/ecpay/*` 回跳先查，再由訂單頁有限次補查 |
| 後台商品 | 已完成 | 管理員列表、新增、編輯、刪除 |
| 後台訂單 | 已完成 | 管理員列表、狀態篩選、詳情 |
