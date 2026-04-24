# Features

本文件記錄功能狀態與使用者可見行為。API 端點細節請看 `API_REFERENCE.md`；架構與資料流請看 `ARCHITECTURE.md`。

## 功能狀態總覽

| 功能 | 狀態 | 主要文件 |
| --- | --- | --- |
| 會員註冊/登入/profile | 已完成 | `API_REFERENCE.md#auth` |
| 公開商品列表/詳情 | 已完成 | `API_REFERENCE.md#products` |
| 購物車 | 已完成 | `API_REFERENCE.md#cart` |
| 建立訂單/我的訂單/訂單詳情 | 已完成 | `API_REFERENCE.md#orders` |
| ECPay 第三方金流 | 已完成，本地端主動查詢驗證 | `ECPAY_SETUP.md`、`API_REFERENCE.md#ecpay-payment` |
| 後台商品管理 | 已完成 | `API_REFERENCE.md#admin-products` |
| 後台訂單管理 | 已完成 | `API_REFERENCE.md#admin-orders` |
| 前端頁面 | 已完成 | `ARCHITECTURE.md#頁面路由總覽` |

## 認證功能

使用者可以註冊一般會員、使用 email/password 登入，並透過 JWT 取得個人資料。註冊與登入都會回傳相同的前端登入資料形狀：`user` 與 `token`。

JWT payload 包含 `userId`、`email`、`role`，有效期 7 天。後端驗證 token 時不只驗 JWT，也會查詢 `users` 表確認使用者仍存在。

前端將 token 存入 `localStorage.flower_token`，user 存入 `localStorage.flower_user`。

## 公開商品功能

首頁使用商品列表 API，預設前端每頁抓 9 筆；API 預設每頁 10 筆。商品依 `created_at DESC` 排序。

商品詳情頁從 EJS route 的 `data-product-id` 取得商品 ID，再呼叫 API 載入資料。

商品 seed 只在 `products` 表為空時建立，因此本機資料庫若已有資料，首頁看到的商品不一定是預設八筆。

## 購物車功能

購物車支援登入會員與訪客 session：

- 有有效 Bearer JWT 時使用 `user_id`。
- 沒有 Bearer JWT 時使用 `X-Session-Id` 對應 `session_id`。
- 若送了無效 Bearer JWT，固定回未授權，不可退回 session。

同商品重複加入時會累加數量。購物車 badge 顯示 cart item 筆數，不是商品數量總和；加入同商品導致數量累加時，前端可能短暫顯示 `+1`，重新載入後會以 API 回傳 item 長度為準。

## 訂單功能

登入會員可以從購物車建立訂單、查看自己的訂單列表與訂單詳情。

建立訂單必須使用 SQLite transaction，同步完成：

- 建立 `orders`。
- 建立 `order_items`。
- 扣除商品庫存。
- 清空登入會員購物車。

訂單詳情頁會顯示商品明細、收件資訊、付款狀態與 ECPay 付款操作。

## ECPay 付款功能

付款使用綠界 AIO，`ChoosePayment=ALL`。本專案保留綠界成功頁與取號頁，使用者按「返回商店」後才回到本站。

本地端付款驗證流程：

1. 使用者在訂單詳情頁點擊「前往綠界付款」。
2. 後端建立 AIO form，前端 POST 到綠界付款頁。
3. 綠界 browser return 先進到本站公開 `/ecpay/*` 路由。
4. 本站後端主動呼叫 `QueryTradeInfo/V5` 驗證付款狀態。
5. 後端 redirect 回 `/orders/:id?payment=success|failed|returned`。
6. 訂單頁以後端 redirect 結果為主，保留手動查詢付款狀態。

ATM/CVS/BARCODE 取號完成後會透過 `ClientRedirectURL` 回站；若交易仍 pending，後端會補查 `QueryPaymentInfo` 並儲存 `ecpay_payment_info`，訂單頁提示使用者完成繳費後再手動查詢。

舊的 `/api/orders/:id/pay` 模擬付款端點已停用，固定回 `410 PAYMENT_FLOW_REMOVED`。

## 後台商品管理

後台商品 API 全部需要 Bearer JWT 且 role 必須為 `admin`。前端後台 layout 會執行 `Auth.requireAdmin()`，但權限安全以 API middleware 為準。

管理員可以：

- 查看商品列表。
- 新增商品。
- 編輯商品。
- 刪除商品。

商品新增與編輯要求 `price`、`stock` 是 JavaScript number 且整數。前端使用 `v-model.number` 讓 number input 轉成數字；其他 client 傳字串 `"500"` 會被後端視為 validation error。

## 後台訂單管理

後台訂單 API 全部需要 Bearer JWT 且 role 必須為 `admin`。

管理員可以查看所有訂單列表與單筆訂單詳情。列表包含會員 email 與 name，詳情包含訂單明細與收件資訊。

## 前端頁面功能

Header 在 DOMContentLoaded 後依登入狀態顯示會員名稱、登出按鈕、登入按鈕、訂單連結與後台管理連結。

結帳頁會要求登入、載入購物車、驗證收件姓名/Email/地址、建立訂單，成功後導向訂單詳情頁。

訂單詳情頁會：

- 載入 `/api/orders/:id`。
- pending 訂單可建立 ECPay AIO checkout form 並導向綠界。
- 可手動呼叫本機後端查詢綠界付款狀態。
- 若網址帶 `payment=success|failed`，只顯示後端已驗證過的結果。
- 若網址帶 `payment=returned` 且訂單仍 pending，只做有限次退避補查；若已取得離線繳費資訊，提示先完成繳費再手動查詢。

後台頁面的前端權限檢查只負責使用者體驗；後台 API 仍有後端 admin middleware 防護。
