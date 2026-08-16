# GateKeeper MVP-1.1: End-to-End Fintech Test Procedure

This procedural document details the step-by-step verification process for validating **GateKeeper MVP-1.1** payment flows, client session journeys, backend 85/15 revenue settlements, and single-use entitlement security.

---

## 1. PayPal Sandbox Initialization Steps

1. **Configure Environment Variables**:
   Ensure `.env` contains active PayPal Sandbox API credentials:
   - `PAYPAL_CLIENT_ID`: Sandbox REST App Client ID from PayPal Developer Dashboard.
   - `PAYPAL_CLIENT_SECRET`: Sandbox REST App Secret Key.
   - `PAYPAL_MODE`: Set explicitly to `"sandbox"`.
   - `PAYPAL_PAYOUT_EMAIL`: Valid PayPal Sandbox business email for creator payouts (e.g., `merk.payouts@merkmorassi.com`).

2. **Prepare Sandbox Test Accounts**:
   - Log in to the [PayPal Developer Portal](https://developer.paypal.com).
   - Verify presence of a **Sandbox Personal (Buyer)** test account with mock funds.
   - Verify presence of a **Sandbox Business (Merchant)** test account.

3. **Verify Server Readiness**:
   - Execute GET request to `/api/config`.
   - Confirm server responds with HTTP 200 and returns active provider configuration and service tier listings.

---

## 2. Client-Side Journey: From Gate Entry to Final FaceTime Access

### Step 2.1: Gate Entry & Service Selection
1. Open the Client Checkout page (`/`).
2. Review available provider consultation tiers (e.g., 30 Minutes @ $150.00 USD, 60 Minutes @ $300.00 USD).
3. Select a consultation tier.

### Step 2.2: Client Information Entry
1. Enter a valid Client Name and Email address.
2. Verify that total fee updates dynamically according to the selected tier.

### Step 2.3: PayPal Sandbox Authorization
1. Click **Pay via PayPal**.
2. When the PayPal Sandbox pop-up modal opens, log in using the Sandbox Personal (Buyer) account credentials.
3. Review order summary and click **Complete Purchase / Pay Now**.

### Step 2.4: Capture & Entitlement Issuance
1. The modal closes and triggers server-authoritative payment capture (`POST /api/paypal/capture-order`).
2. Confirm payment receipt screen displays order ID, transaction status (`COMPLETED`), and unique Gate Access Token.

### Step 2.5: Double-Blind FaceTime Access
1. Click **Launch Confidential FaceTime Session** to open `/gate/:gateToken`.
2. Confirm session status displays "Entitlement Active — Ready to Connect".
3. Click **Connect FaceTime Call** to initiate the double-blind session.

---

## 3. Backend 85/15 Settlement Validation Logic

### Step 3.1: Gross Payment & Split Calculation Verification
Every transaction must adhere strictly to integer-cent split math without rounding drift:

1. **Gross Fee Calculation**:
   - Total charged to client = `gross_cents` (e.g., $150.00 = 15,000 cents).

2. **Platform Commission Calculation (15%)**:
   - `platform_fee_cents = Math.round(gross_cents * 0.15)`
   - $150.00 × 15% = **$22.50** (2,250 cents).

3. **Provider Net Payout Calculation (85%)**:
   - `provider_net_cents = gross_cents - platform_fee_cents`
   - $150.00 - $22.50 = **$127.50** (12,750 cents).

### Step 3.2: Database Ledger Verification
1. Log in to **Admin Dashboard** (`/admin`).
2. Open **Settlement & Ledger Audit**.
3. Verify ledger entry matches expected breakdown:
   - Gross Amount = `15000`
   - Platform Fee = `2250`
   - Provider Net = `12750`
   - Settlement Status = `PENDING`

### Step 3.3: Payout Execution Verification
1. Click **Trigger Provider Batch Payout** in Admin Dashboard.
2. Confirm status transitions from `PENDING` to `SETTLED`.
3. Confirm record logs a valid PayPal Payout Item ID.

---

## 4. Success Criteria for Single-Use Token Invalidation Post-Redemption

| Stage | Test Step | Expected Response / Status | Success Pass Criteria |
| :--- | :--- | :--- | :--- |
| **1. Unused Gate Verification** | Submit `POST /api/gate/verify` with new token | HTTP 200 OK | `{ "valid": true, "used": false }` |
| **2. Session Redemption** | Submit `POST /api/gate/redeem` to join call | HTTP 200 OK | `{ "success": true, "redeemedAt": "<TIMESTAMP>" }` |
| **3. Post-Redemption Verification** | Re-submit `POST /api/gate/verify` with same token | HTTP 200 OK | `{ "valid": true, "used": true }` |
| **4. Invalidation Guard** | Re-submit `POST /api/gate/redeem` with used token | HTTP 400 Bad Request / HTTP 403 Forbidden | Error payload: `"TOKEN_ALREADY_REDEEMED"` |
| **5. UI Lockout** | Reload `/gate/:gateToken` after redemption | Lockout Banner | Display "Access Code Expired or Already Used" |

---
*GateKeeper MVP-1.1 — Procedural Verification Guide*
