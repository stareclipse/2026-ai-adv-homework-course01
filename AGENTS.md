# AGENTS.md

## 專案概述

backend-project - 花卉電商 Demo。技術棧為 Node.js、Express 4、EJS、Vue 3 CDN、Tailwind CSS v4 CLI、better-sqlite3、JWT、bcrypt、Vitest、Supertest。

## 常用指令

| 指令 | 用途 | 備註 |
| --- | --- | --- |
| `npm install` | 安裝依賴 | 依 `package-lock.json` 還原套件版本 |
| `npm start` | 建置 Tailwind CSS 並啟動伺服器 | 會先執行 `css:build`，再跑 `node server.js` |
| `npm run dev:server` | 只啟動 Express 伺服器 | 不會監看或重建 CSS |
| `npm run dev:css` | 監看 Tailwind CSS 輸入並輸出 `public/css/output.css` | 開發前端樣式時另開終端執行 |
| `npm run css:build` | 建置壓縮版 Tailwind CSS | 輸出檔案被 `.gitignore` 忽略 |
| `npm run openapi` | 由 route JSDoc 產生 `openapi.json` | 使用 `swagger-jsdoc` 與 `swagger-config.js` |
| `npm test` | 執行 Vitest API 測試 | `vitest.config.js` 停用檔案平行化；測試不可依賴跨檔副作用 |

## 關鍵規則

- API 回應統一使用 `{ data, error, message }`；錯誤時 `data` 必須為 `null`，成功時 `error` 必須為 `null`。
- 後台 API 必須先套用 `authMiddleware`，再套用 `adminMiddleware`；不可只檢查前端登入狀態。
- 購物車是雙模式認證：有有效 Bearer JWT 時使用 `user_id`，否則使用 `X-Session-Id` 對應 `session_id`；若送了無效 JWT 不可退回 session。
- 訂單建立必須使用 SQLite transaction，同步建立訂單、建立明細、扣庫存、清空登入會員購物車。
- `.env.example` 已保留 ECPay 變數，但目前程式碼沒有真正串接綠界；付款功能是 `/api/orders/:id/pay` 的模擬狀態更新。
- 功能開發使用 `docs/plans/` 記錄計畫；完成後移至 `docs/plans/archive/`，並同步更新 `docs/FEATURES.md` 和 `docs/CHANGELOG.md`。

## 詳細文件

- `./docs/README.md` - 項目介紹與快速開始
- `./docs/ARCHITECTURE.md` - 架構、目錄結構、資料流
- `./docs/DEVELOPMENT.md` - 開發規範、命名規則
- `./docs/FEATURES.md` - 功能列表與完成狀態
- `./docs/TESTING.md` - 測試規範與指南
- `./docs/CHANGELOG.md` - 更新日誌
