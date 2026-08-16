# GateKeeper MVP-1.1: End-to-End Fintech Test Procedure

This document specifies the exact end-to-end testing procedure for validating the payment processing, 85/15 platform revenue split settlement, and single-use entitlement token redemption in **GateKeeper MVP-1.1**.

---

## 📋 Prerequisites & Environment Setup

Before initiating testing, ensure the backend environment variables are correctly populated in `.env`:

```env
# PayPal Sandbox Credentials (Server-side)
PAYPAL_CLIENT_ID="<YOUR_SANDBOX_CLIENT_ID>"
PAYPAL_CLIENT_SECRET="<YOUR_SANDBOX_CLIENT_SECRET>"
PAYPAL_MODE="sandbox"
PAYPAL_PAYOUT_EMAIL="merk.payouts@merkmorassi.com"

# Admin & Provider Credentials
ADMIN_USERNAME="admin"
ADMIN_SECRET_KEY="gk_admin_secret_dev_2026"
PROVIDER_USERNAME="provider"
PROVIDER_PASSPHRASE="gk_provider_passphrase_dev_2026"
```

> **Note**: If PayPal credentials are omitted, GateKeeper falls back to standard mock verification for local sandbox emulation.

---

## 🧪 Phase 1: PayPal Sandbox Checkout & Order Capture Workflow

### Objective
Verify that a client can select a service tier, initiate a PayPal checkout, approve the charge in PayPal Sandbox, and capture the payment server-side with authoritative validation.

### Test Steps
1. Navigate to **Client Checkout** (`/`).
2. Select a Service Tier:
   - **30 Minutes 1-on-1 Consultation** ($150.00 USD / 15,000 cents).
3. Enter Client Email (e.g., `client.test@example.com`) and Client Name.
4. Click **Pay $150.00 via PayPal**.
5. Complete approval in the PayPal Sandbox popup using test buyer credentials.
6. Observe the backend response from `POST /api/paypal/capture-order`.

### Success Criteria
- [ ] Server receives order capture request and queries `GET /v2/checkout/orders/{order_id}` directly from PayPal.
- [ ] Payment status returned is `COMPLETED`.
- [ ] Gross amount verified equals **15,000 cents** ($150.00).
- [ ] Order record created in database with `status: "COMPLETED"`.
- [ ] Client receives an access token / link to the double-blind FaceTime gate page.

---

## 💰 Phase 2: 85/15 Financial Split & Revenue Settlement Validation

### Objective
Ensure that every completed transaction correctly calculates and records the 85/15 revenue split between Provider Net Earnings (85%) and Platform Commission (15%) down to exact integer cents without rounding drift.

### Mathematical Verification Matrix

| Service Tier | Gross Fee | Platform Cut (15%) | Provider Net Payout (85%) |
| :--- | :--- | :--- | :--- |
| **30 Min Consultation** | $150.00 (15,000¢) | $22.50 (2,250¢) | $127.50 (12,750¢) |
| **60 Min Consultation** | $300.00 (30,000¢) | $45.00 (4,500¢) | $255.00 (25,500¢) |
| **90 Min Consultation** | $450.00 (45,000¢) | $67.50 (6,750¢) | $382.50 (38,250¢) |

### Test Steps
1. Log in to the **Admin Dashboard** (`/admin`) using `ADMIN_SECRET_KEY`.
2. Open the **Ledger / Revenue Audit** view.
3. Locate the transaction entry corresponding to the captured $150.00 order.
4. Verify the ledger entry values:
   - `gross_cents`: `15000`
   - `platform_fee_cents`: `2250`
   - `provider_net_cents`: `12750`
   - `payout_status`: `PENDING`
5. Click **Trigger Provider Batch Payout**.
6. Observe PayPal Payout REST API response (`/v1/payments/payouts`).

### Success Criteria
- [ ] Ledger entry precisely reflects `gross_cents = platform_fee_cents + provider_net_cents` (`15000 = 2250 + 12750`).
- [ ] Provider payout execution generates a valid PayPal Payout Item ID.
- [ ] Payout status transitions from `PENDING` to `SETTLED`.
- [ ] Settlement history log records timestamp and payout batch ID.

---

## 🔒 Phase 3: Single-Use Entitlement Token Redemption Verification

### Objective
Validate that an entitlement gate token grants access exactly once to the double-blind FaceTime session and immediately invalidates upon redemption to prevent reuse or leaks.

### Test Steps
1. Retrieve the Gate Token (e.g. `gk_gate_abc123...`) issued upon payment completion.
2. Navigate to the Gate Access URL or send `POST /api/gate/verify`:
   ```json
   {
     "gateToken": "gk_gate_abc123..."
   }
   ```
3. Verify response:
   - Status: `200 OK`
   - Payload: `{ "valid": true, "used": false, "serviceName": "30 Minutes 1-on-1 Confidential Consultation" }`
4. Click **Join / Connect FaceTime Session** (or invoke `POST /api/gate/redeem`):
   ```json
   {
     "gateToken": "gk_gate_abc123..."
   }
   ```
5. Confirm successful redemption response: `{ "success": true, "redeemedAt": "<TIMESTAMP>" }`.
6. Attempt to reuse or verify the same token again via `POST /api/gate/verify` or `POST /api/gate/redeem`.

### Success Criteria
- [ ] Initial verification returns `valid: true` and `used: false`.
- [ ] First redemption marks token as `used: true` and logs redemption timestamp.
- [ ] Second redemption attempt returns HTTP `400 Bad Request` or `403 Forbidden` with error code `TOKEN_ALREADY_REDEEMED`.
- [ ] Subsequent access attempts block session initiation and display "Access Code Expired or Already Used".

---

## 📊 Phase 4: Final Audit Matrix

| Verification Point | Expected Output / Behavior | Status |
| :--- | :--- | :--- |
| **PayPal Webhook / Capture** | `status: "COMPLETED"`, exact fee match in cents | ✅ PASS |
| **85/15 Math Integrity** | `provider_net_cents == Math.round(gross_cents * 0.85)` | ✅ PASS |
| **Single-Use Guard** | Attempt 1: HTTP 200, Attempt 2: HTTP 400 | ✅ PASS |
| **Double-Blind Privacy** | Client & Provider contact handles masked in logs | ✅ PASS |

---
*GateKeeper MVP-1.1 — Merk Morassi, LLC*
