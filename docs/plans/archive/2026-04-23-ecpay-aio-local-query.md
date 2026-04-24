# ECPay AIO Local Query Implementation Plan

> Completed and archived on 2026-04-23.

**Goal:** Replace simulated order payment with ECPay AIO checkout and local server-side payment verification.

**Architecture:** The browser submits an AIO form to ECPay with `ChoosePayment=ALL`. Because this project runs on localhost and cannot receive Server Notify reliably, local order status is updated only after the backend calls `QueryTradeInfo/V5` and verifies the response `CheckMacValue`.

**Tech Stack:** Node.js, Express, better-sqlite3, EJS, Vue 3 CDN, Vitest, Supertest, ECPay AIO CMV-SHA256.

---

## Implemented Scope

- Added ECPay CheckMacValue helpers, AIO checkout form generation, `QueryTradeInfo/V5`, and offline `QueryPaymentInfo` support.
- Added order columns for ECPay merchant trade number, trade number, payment type, trade status, payment date, payment info, and last checked time.
- Added authenticated order endpoints for creating an ECPay checkout form and querying verified payment status.
- Replaced order detail simulated payment buttons with ECPay checkout and local status refresh actions.
- Disabled the legacy simulated payment endpoint.

## Verification

- Added service tests for CheckMacValue and AIO form generation.
- Added order API tests for checkout form generation, verified paid status update, and legacy simulated payment rejection.
