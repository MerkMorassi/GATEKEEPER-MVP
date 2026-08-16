# GATEKEEPER MVP-1 — CANONICAL RELEASE MANIFEST & HANDOFF SPECIFICATION

## 1. IDENTITY & RELEASE BASELINE
* **Project Name:** GateKeeper
* **Version Identifier:** MVP-1
* **Release Identifier:** `gatekeeper-mvp-1.0.0`
* **Status:** CODE-FROZEN / SECURITY-HARDENED / HANDOFF READY
* **Freeze Date:** August 15, 2026
* **Git Commit SHA:** `8f911cc67244768b00765ee4aeba8f97f0f7dd9c`
* **Copyright:** © 2026 Merk Morassi, LLC

---

## 2. VERIFICATION & BUILD RESULTS
* **Build Result:** PASS (`npm run build` / Vite + Esbuild bundle `dist/server.cjs`)
* **TypeScript Type Check:** PASS (`npm run lint` / `tsc --noEmit`)
* **Black-Box Verification Suite (`scripts/verify-mvp.ts`):** **45 PASSED, 0 FAILED**
* **Verification Status:** 100% Verified (45/45 Tests Green)

---

## 3. VERIFIED SECURITY CONTROLS
1. **Server-Authoritative Financial State:** All transactions, prices, and split calculations are authoritatively generated and validated on the server.
2. **Fixed $150.00 Fee Invariant:** Order price ($150.00 / 15000 cents) is pulled directly from server configuration (`provider.feeCents`). Client payloads cannot alter price.
3. **Integer-Cent 85/15 Settlement:** Deterministic 85% Provider share ($127.50 / 12750 cents) and 15% Agent share ($22.50 / 2250 cents) calculated using integer-cent arithmetic with zero-drift guarantee.
4. **Server-Side PayPal Verification:** Order capture and payment verification occur exclusively via server-to-server PayPal REST API calls.
5. **Single-Use Opaque Access Tokens:** Disposable entitlements use 256-bit cryptographically secure random hexadecimal keys (`gk_tok_...`) containing zero sensitive provider identifiers.
6. **Dynamic QR Entitlements:** Dynamic QR codes generated server-side encode only the opaque token URL.
7. **Replay Protection:** Redeemed tokens permanently transition to `redeemed`. Replay attempts return `HTTP 409 Conflict`.
8. **Admin Authentication:** All `/api/admin/*` routes require `requireAdminAuth` middleware validation (`X-Admin-Key` or `Authorization: Bearer <key>`).
9. **Double-Blind Identity Masking:** Payer IP addresses (`[PROTECTED_IP]`) and emails (`cl***@domain.com`) are masked in default admin overviews.
10. **Break-Glass Escrow Authorization:** Unmasking client email requires an authenticated `/api/admin/escrow/break-glass` POST request with a valid ticket format and operator justification, logged to the audit trail.
11. **Process-Level Concurrency Locks:** Critical endpoints (`/redeem`, `/payments/verify`) utilize `lockManager` mutexes to enforce single-execution invariants.
12. **Atomic Persistence Writes:** Database updates write to a temporary file (`gatekeeper_db.json.tmp`) before atomic replacement (`fs.renameSync`) to eliminate corrupt partial writes.
13. **Fail-Closed Corruption Handling:** `Database.load()` throws `CRITICAL_DATABASE_CORRUPTION` on JSON parse failure, preventing operation on corrupt or empty ledgers.
14. **Fail-Closed Production PayPal Guard:** In `NODE_ENV=production`, missing PayPal credentials trigger a fatal process exception (`FATAL_PRODUCTION_CONFIG_ERROR`), blocking silent mock sandbox execution.
15. **Sanitized Host Header Handling:** Host headers used for QR URL generation are sanitized with regex (`/[^a-zA-Z0-9.:-]/g`) to prevent header injection.
16. **Secret Isolation:** Production secrets exist solely in server environment variables and are never exposed in client Vite bundles or API responses.

---

## 4. KNOWN ARCHITECTURAL CONSTRAINTS
* **AC-01 — Single-Instance Deployment:** GateKeeper MVP-1 relies on process-local concurrency locks (`lockManager`) and local JSON persistence (`gatekeeper_db.json`), and therefore MUST operate as a single authoritative application instance (`max-instances = 1`).
* **AC-02 — Administrative Break-Glass Trust Model:** The current break-glass ticket (`TICKET-*`) is an administrative workflow and audit artifact under `ADMIN_SECRET_KEY` authority, not an independently cryptographically signed support ticket credential.
* **AC-03 — Persistent Storage:** `gatekeeper_db.json` must reside on persistent block/disk storage that survives application/container restart and replacement.

---

## 5. REQUIRED ENVIRONMENT VARIABLES
```env
# Application Runtime Environment
NODE_ENV=production
PORT=3000

# Server Administrative Security
ADMIN_SECRET_KEY=your_admin_secret_key_here

# PayPal Integration Credentials
PAYPAL_CLIENT_ID=your_paypal_client_id_here
PAYPAL_CLIENT_SECRET=your_paypal_client_secret_here
PAYPAL_ENVIRONMENT=sandbox_or_live

# Canonical Public Origin
APP_URL=https://your-domain.com
```

---

## 6. STEP-BY-STEP LOCAL INSTALLATION & ENVIRONMENT TRANSITION PROCEDURE

To transition the frozen GateKeeper MVP-1 repository from GitHub to a local development environment (e.g., VS Code) for operational validation without exposing production secrets:

### Step 1: Repository Retrieval & Checkout
```bash
# Clone the repository from GitHub
git clone <your-github-repository-url>
cd gatekeeper

# Checkout the exact frozen release tag or commit
git checkout gatekeeper-mvp-1.0.0
# Alternatively: git checkout feb1a7acf5030833c8b768fb6fa00e9e54f05636

# Verify working tree integrity
git status
# Expected output: "HEAD detached at gatekeeper-mvp-1.0.0" or "On branch master", "nothing to commit, working tree clean"
```

### Step 2: Secret Isolation & Local Environment Configuration
> ⚠️ **CRITICAL SECURITY REQUIREMENT:** Never commit `.env` files, API credentials, or administrative secrets to version control. Confirm `.env` is listed inside `.gitignore`.

```bash
# Create local environment configuration from template
cp .env.example .env

# Edit .env for local sandbox testing (Use standard developer editor or VS Code)
```

**Local `.env` Configuration Rules:**
* Set `NODE_ENV=development` for local testing.
* Generate a strong local admin key for `ADMIN_SECRET_KEY` (e.g., `openssl rand -hex 32` or `local_dev_admin_key_123`).
* Use **PayPal Sandbox** credentials (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`). Set `PAYPAL_ENVIRONMENT=sandbox`.
* Set `APP_URL=http://localhost:3000`.

### Step 3: Dependency Installation & Clean Build Verification
```bash
# Install node dependencies deterministically from package.json
npm install

# Run static type checking
npm run lint

# Compile production bundle (Vite client assets + Esbuild CommonJS server)
npm run build
```

### Step 4: Local Execution of the 45-Test Verification Suite
```bash
# Run the canonical black-box verification engine
npx tsx scripts/verify-mvp.ts
```
* **Expected Output:** `VERIFICATION RESULTS: 45 PASSED, 0 FAILED`

### Step 5: Boot Local Server & Launch Browser Validation
```bash
# Start local development server
npm run dev
```
* Access application at `http://localhost:3000`.
* Test Provider Dashboard, Client Checkout, and QR Access Scanner using local sandbox parameters.
* Transition directly to **Section 7: Local Operational Validation Phase**.

---

## 7. LOCAL OPERATIONAL VALIDATION PHASE

The owner will perform the following validation sequence in their local development environment:

* **Phase A — Repository Verification:** Confirm local workspace matches frozen Git commit `8f911cc67244768b00765ee4aeba8f97f0f7dd9c`.
* **Phase B — Build Verification:** Execute `npm run lint` and `npm run build`. Confirm zero errors.
* **Phase C — 45-Test Verification Suite:** Execute `npx tsx scripts/verify-mvp.ts`. Confirm 45 PASSED, 0 FAILED.
* **Phase D — Local End-to-End Testing:** Test complete flow in browser: Provider Dashboard → Client Checkout → PayPal Sandbox → Payment Verification → 85/15 Settlement → QR Delivery → Mobile Redemption → Single-use Enforcement.
* **Phase E — Persistence Testing:** Create transaction → Stop Node process → Restart Node process → Confirm transaction state is preserved and redeemed tokens remain rejected.
* **Phase F — Security Testing:** Test HTTP endpoints directly using curl/Postman to verify 401 unauth rejections, 409 replay rejections, and double-blind identity masking.
* **Phase G — Production Configuration Rehearsal:** Test fail-closed startup behavior by setting `NODE_ENV=production` without credentials and verifying fatal process exit.
* **Phase H — Infrastructure Validation:** Verify persistent storage mounting and process isolation on the chosen deployment host.
* **Phase I — Live Transaction Acceptance Test:** Execute a single real $150.00 live transaction (Gross: $150.00, Provider: $127.50, Agent: $22.50) followed by live QR redemption and replay rejection.

---

## 8. DEPLOYMENT ASSUMPTIONS & INFRASTRUCTURE STATUS
All hosting and deployment infrastructure assumptions are classified as:

### 🟡 **INFRASTRUCTURE VALIDATION PENDING**

The local handoff phase must independently verify:
- Durable filesystem semantics
- POSIX atomic rename semantics (`fs.renameSync`)
- Single-instance enforcement (`max-instances = 1`)
- Restart persistence across container replacements
- Offsite backup storage in a separate failure domain
- Emergency shutdown procedures
- HTTPS/TLS termination and `APP_URL` header routing
- Secret injection via environment manager

---

## 9. RELEASE IDENTIFIER & HANDOFF SUMMARY
* **Release Tag:** `gatekeeper-mvp-1.0.0`
* **Commit SHA:** `8f911cc67244768b00765ee4aeba8f97f0f7dd9c`
* **Application Modifications:** NONE (Application source code is frozen)
* **Next Environment:** OWNER'S LOCAL DEVELOPMENT ENVIRONMENT
* **Next Phase:** LOCAL OPERATIONAL VALIDATION
