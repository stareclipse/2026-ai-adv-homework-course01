# 綠界金流整合指南

本文檔說明如何在本地端測試綠界 ECPay 金流功能。由於本地開發環境無法接收綠界伺服器回調，系統採用 **本地端主動查詢** 架構。

## 架構設計

### 付款流程

```
1. 使用者點擊「前往綠界付款」
   ↓
2. 後端建立付款表單 (POST /api/orders/{id}/ecpay/checkout)
   ↓
3. 前端提交表單到綠界支付頁面
   ↓
4. 使用者在綠界完成付款
   ↓
5. 綠界先導向回本站 `/ecpay/client-back` 或 `/ecpay/client-redirect`
   ↓
6. 後端先向綠界查詢一次並 redirect 回 `/orders/{orderId}?payment=success|failed|returned`
   ↓
7. 訂單頁只在 `payment=returned` 且尚未取得離線繳費資訊時做有限次退避補查
```

### 關鍵特性

- ✅ **不直接信任回調 body** - 所有結果都以本地再次查詢綠界為準
- ✅ **回跳先查** - 綠界返回商店時，由後端先查一次再 redirect
- ✅ **離線支付支持** - 支持 ATM、超商等離線支付方式
- ✅ **安全驗證** - 使用 SHA256 和 TimingSafeEqual 驗證所有交易
- ✅ **狀態同步** - 確保本地訂單狀態與綠界保持一致

## 環境設定

### 1. 檢查 `.env` 配置

確保 `.env` 包含以下設定：

```env
# Server
BASE_URL=http://localhost:3001
FRONTEND_URL=http://localhost:5173

# ECPay 測試環境
ECPAY_ENV=staging
ECPAY_MERCHANT_ID=3002607
ECPAY_HASH_KEY=pwFHCqoQZGmho4w6
ECPAY_HASH_IV=EkRm7iFT261dpevs
```

**注意：** 不要使用生產環境密鑰在本地測試。上述密鑰是綠界官方提供的測試商號。

### 2. 啟動伺服器

```bash
# 終端 1：啟動後端伺服器
npm run dev:server

# 終端 2（可選）：監控 CSS 變更
npm run dev:css
```

伺服器應該在 `http://localhost:3001` 啟動。

## 完整測試流程

### 步驟 1：建立訂單

1. 訪問 `http://localhost:3001`
2. 登入或註冊帳號
3. 加入商品到購物車
4. 進行結帳（填寫收件資訊）
5. 建立訂單

### 步驟 2：進行綠界付款

1. 進入訂單詳情頁面
2. 點擊「前往綠界付款」按鈕
3. 被導向到綠界付款頁面（`https://payment-stage.ecpay.com.tw`）

### 步驟 3：模擬付款（綠界測試環境）

在綠界測試頁面，選擇付款方式：

#### 信用卡付款（推薦）

- 選擇「信用卡」
- 卡號：`4111111111111111`
- 有效期：任意未來日期（如 `12/25`）
- CVV：任意 3 位數字（如 `123`）
- 點擊「送出」

#### ATM 轉帳

- 選擇「ATM」
- 綠界會顯示虛擬帳號和轉帳資訊
- 在綠界測試環境中模擬轉帳完成
- （本地環境可能無法完成，但會顯示轉帳資訊）

#### 超商代碼繳費

- 選擇「超商代碼」
- 綠界會顯示繳費代碼和條碼
- 類似 ATM，本地環境顯示資訊

### 步驟 4：返回商店與狀態更新

1. 付款後，綠界會先回到本站 `/ecpay/client-back` 或 `/ecpay/client-redirect`
2. 後端會立即向綠界查詢一次付款狀態，再 redirect 回 `http://localhost:3001/orders/{orderId}?payment=success|failed|returned`
3. 若是 ATM/CVS/BARCODE 且尚未付款完成，系統會先寫入繳費資訊
4. 訂單頁只在 `payment=returned` 且沒有繳費資訊時做有限次退避補查
5. 使用者可隨時點擊「手動查詢付款狀態」

## 測試檢查清單

- [ ] 後端伺服器正常啟動
- [ ] 能登入系統
- [ ] 能建立訂單
- [ ] 能進入綠界付款頁面
- [ ] 使用信用卡完成付款後，返回商店即可看到成功或失敗結果
- [ ] 使用 ATM 方式時，顯示虛擬帳號資訊
- [ ] 返回訂單頁面時，後端已先完成一次查詢
- [ ] 手動點擊「手動查詢付款狀態」可即時更新

## API 端點

ECPay 相關 API 規格集中維護於 `API_REFERENCE.md#ecpay-payment`。本文件只保留本地設定、手動測試流程與故障排除。

## 故障排除

### 問題 1：無法連到綠界頁面（203.66.132.14 拒絕連線）

**原因：** 本地開發環境無法直接連到綠界伺服器

**解決方案：**
1. 檢查網路連線
2. 確認防火牆或公司網路沒有阻擋外部連線
3. 使用 ngrok 等工具暴露本地伺服器（見下節）

### 問題 2：ATM 付款流程無法完成

**原因：** 本地環境無法接收綠界伺服器的回調

**預期行為：**
- 綠界會顯示虛擬帳號和轉帳資訊
- 返回商店時，後端會先查一次並寫入可用的繳費資訊
- 若未顯示「已返回商店」，可手動點擊「手動查詢付款狀態」

### 問題 3：付款狀態未更新

**解決方案：**
1. 檢查後端伺服器是否正常運作
2. 點擊「手動查詢付款狀態」按鈕
3. 檢查瀏覽器控制台有無錯誤訊息
4. 確認 `.env` 中的 ECPay 設定正確

## 進階：使用 ngrok 進行完整測試

如果需要完整測試綠界伺服器回調功能，可使用 ngrok：

### 安裝 ngrok

```bash
choco install ngrok  # Windows (使用 Chocolatey)
brew install ngrok   # macOS (使用 Homebrew)
```

或從 [ngrok.com](https://ngrok.com) 下載。

### 啟動 ngrok

```bash
# 在新終端中執行
ngrok http 3001
```

### 更新環境變數

```env
BASE_URL=https://xxxx-xxx-xxx.ngrok.io  # 使用 ngrok 提供的 URL
```

重啟伺服器後，綠界就能正常回調。

## 單元測試

運行 ECPay 相關的測試：

```bash
npm test

# 結果：
# ✓ tests/ecpayService.test.js (3 tests)
#   - should generate the official SHA256 CheckMacValue test vector
#   - should verify CheckMacValue using a timing-safe comparison
#   - should build an ALL payment checkout form without exposing secrets
```

## 生產環境部署

當準備上線到生產環境時：

1. **更新環境變數**

```env
BASE_URL=https://your-production-domain.com
ECPAY_ENV=production
ECPAY_MERCHANT_ID=your-production-merchant-id
ECPAY_HASH_KEY=your-production-hash-key
ECPAY_HASH_IV=your-production-hash-iv
```

2. **設定伺服器回調處理**

生產環境應該設定 `/ecpay/notify` 來處理綠界的伺服器回調。

3. **啟用 HTTPS**

綠界生產環境要求 HTTPS 連線。

## 參考資源

- [綠界官方文檔](https://www.ecpay.com.tw/)
- [ECPay AIO API 說明](https://www.ecpay.com.tw/API_Specification)
- [本地 ecpayService 實現](../src/services/ecpayService.js)
- [訂單路由實現](../src/routes/orderRoutes.js)

## 常見問題

### Q：為什麼本地不收綠界回調？

A：本地 `localhost:3001` 是本地地址，綠界伺服器無法從網際網路連線回來。這是正常的開發環境限制。系統改用主動查詢方案解決。

### Q：如何測試完整的綠界伺服器回調？

A：使用 ngrok 或類似工具暴露本地伺服器到網際網路，這樣綠界才能回調。

### Q：是否需要修改程式碼才能上線？

A：主要修改是環境變數（商號、密鑰等）。若要啟用伺服器回調，可延伸 `/ecpay/notify` 與既有 reconcile helper。

### Q：本地測試是否與生產環境相同？

A：基本邏輯相同。主要差別是本地用主動查詢，生產環境可同時支持伺服器回調和主動查詢。
