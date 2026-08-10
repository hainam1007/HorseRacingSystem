# Frontend API Integration Plan - Admin Dashboard and Payment

## Purpose

Tai lieu nay la plan cho frontend noi API admin dashboard va payment theo **code backend moi pull hien tai**.

Nguyen tac uu tien:

1. **Code backend hien tai la source of truth.**
2. Cac docs cu nhu `deposit_api_catalog.md` chi dung de tham khao luong nghiep vu, khong duoc xem la contract chinh neu khac code.
3. Neu frontend can field/endpoint chua co trong code, ghi ro la **backend gap** thay vi gia dinh API da co.
4. Truoc khi wire UI, phai sua cac diem contract dang lech trong code moi pull.

## Verified Backend Routes From Current Code

### Spectator Deposit

Mounted in `app.js` at `/api/deposit`.

Source routes: `routes/deposit.js`

| Method | URL | Auth | Current purpose |
| --- | --- | --- | --- |
| `POST` | `/api/deposit/webhook/payment` | Public, signature-based | Gateway callback. Do not send JWT. |
| `GET` | `/api/deposit/packages` | JWT | List active deposit packages. |
| `POST` | `/api/deposit/preview-custom` | JWT | Preview custom token top-up. |
| `POST` | `/api/deposit/intent` | JWT | Create payment intent and return gateway URL. |
| `GET` | `/api/deposit/history` | JWT | Current user's paginated deposit orders. |

### Admin Deposit Packages

Mounted in `app.js` at `/api/admin`.

Source routes: `routes/adminDeposit.js`

| Method | URL | Auth | Current purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/deposit-packages` | Admin JWT | List all packages, active and inactive. |
| `POST` | `/api/admin/deposit-packages` | Admin JWT | Create package. |
| `PUT` | `/api/admin/deposit-packages/:id` | Admin JWT | Update package by Mongo `_id`; `package_id` immutable. |
| `DELETE` | `/api/admin/deposit-packages/:id` | Admin JWT | Soft-delete/deactivate package. |

### Admin Dashboard

Mounted in `app.js` at `/api/admin`.

Source routes: `routes/adminDashboard.js`

| Method | URL | Auth | Current purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/dashboard` | Admin JWT | Basic aggregate: users, wallets, token circulation, successful deposit VND, pending queues. |
| `GET` | `/api/admin/betting-summary` | Admin JWT | Bet aggregates by status, optional `from`, `to`. |
| `GET` | `/api/admin/deposit-requests` | Admin JWT | Paginated deposit ledger, optional `from`, `to`, `status`, `page`, `limit`. |
| `GET` | `/api/admin/prize-awards/summary` | Admin JWT | Prize award summary grouped by currency/status, optional `from`, `to`. |

## Current Backend Response Shapes To Use First

These shapes are from the current service code, not old docs.

### `GET /api/admin/dashboard`

Current service returns:

```json
{
  "total_users": 0,
  "active_wallets": 0,
  "total_tokens_in_circulation": 0,
  "total_successful_deposit_vnd": 0,
  "queues": {
    "pending_deposits": 0,
    "pending_bets": 0
  }
}
```

Frontend must either adapt this shape directly or backend should expand it to the richer dashboard shape before removing mock fallback.

### `GET /api/admin/betting-summary?from=YYYY-MM-DD&to=YYYY-MM-DD`

Current service returns:

```json
{
  "pending_bets": 0,
  "settled_bets": 0,
  "refunded_bets": 0,
  "token_staked": 0,
  "token_paid_out": 0,
  "token_refunded": 0,
  "breakdown": [
    { "status": "pending", "count": 0 }
  ]
}
```

### `GET /api/admin/deposit-requests`

Current service returns:

```json
{
  "list": [],
  "summary": {
    "pending_count": 0,
    "success_count": 0,
    "failed_count": 0,
    "total_vnd": 0,
    "total_token": 0
  },
  "page": 1,
  "limit": 20
}
```

Known missing for frontend-grade pagination: `total`, `total_pages`.

### `GET /api/admin/prize-awards/summary`

Current service returns dynamic currency keys:

```json
{
  "VND": {
    "total_count": 0,
    "total_amount": 0,
    "statuses": {
      "paid": {
        "count": 0,
        "amount": 0
      }
    }
  },
  "TOKEN": {
    "total_count": 0,
    "total_amount": 0,
    "statuses": {}
  }
}
```

Frontend must handle missing currency keys safely.

## Contract Gaps Found In Current Code

These should be fixed or consciously handled before final frontend integration.

### 1. `MOCK` payment method mismatch

Current code has a mismatch:

- `constants/depositStatuses.js` includes `MOCK`.
- `validators/depositValidator.js` accepts all `PAYMENT_METHOD` values, so `MOCK` validates.
- `routes/deposit.js` comments mention `MOCK`.
- `controllers/depositController.js` defaults webhook method to `MOCK`.
- But `services/paymentGatewayService.js` currently only supports `VNPAY` and `MOMO`.

Impact:

- Frontend currently lists `["MOCK", "VNPAY", "MOMO"]`.
- If user selects `MOCK`, `POST /api/deposit/intent` can pass validator then fail in gateway service.
- If gateway callback omits method, backend defaults to `MOCK` then fails signature verification support.

Decision required:

- Option A: restore real `MOCK` support for local dev and tests.
- Option B: remove `MOCK` from constants, validator, route comments, controller default, frontend list, and tests.

Recommended for frontend stability: **Option A for local/dev**, then allow production to hide `MOCK` via config.

### 2. Payment service logs secrets

`services/paymentGatewayService.js` currently logs:

- `MOMO_SECRET_KEY`
- `VNPAY_HASH_SECRET`
- `VNPAY_TMN_CODE`

Impact:

- Unsafe for development screenshots/log sharing.
- Should not ship.

Required fix before team QA:

- Remove secret logs or mask them.

### 3. Admin dashboard aggregate is too small for existing frontend dashboard

Current `/api/admin/dashboard` returns only:

- total users
- active wallets
- total token circulation
- successful deposit VND
- pending deposits
- pending bets

Existing frontend `src/Admin/AdminDashboard.jsx` expects broader operational sections:

- approvals
- competition
- result publication
- incidents
- finance
- action queues

Decision required:

- Option A: frontend dashboard adapts to current small API and keeps composing other modules.
- Option B: backend expands `/api/admin/dashboard` to match full dashboard UI.

Recommended: **Option B**, because frontend already wants a command dashboard and current client-composed fallback is expensive/noisy.

### 4. Admin deposit ledger lacks full pagination metadata

Current `/api/admin/deposit-requests` returns `page` and `limit`, but not `total` or `total_pages`.

Required for robust frontend table:

- add `total`
- add `total_pages`
- optionally add `has_next_page`, `has_prev_page`

### 5. Payment return route is not finalized

`.env.example` uses:

```env
MOMO_REDIRECT_URL=http://localhost:3000/payment-success
```

Frontend route currently known from `App.jsx` includes `/spectator/deposit`, but payment success route must be confirmed/implemented.

Required:

- choose final frontend return route.
- make VNPAY/MOMO return URLs point there or to backend callback as intended.
- frontend should refresh deposit history/order status after redirect.

## Frontend Integration Plan

## Phase 0 - Runtime Prerequisite

Frontend cannot verify dashboard/payment until backend starts successfully.

Current local issue:

- `.env` points to `mongodb://127.0.0.1:27017/horse_racing`.
- Local machine currently has no MongoDB service/process.

Acceptance:

- Backend `npm start` runs without `ECONNREFUSED 127.0.0.1:27017`.
- Admin login token works.
- Frontend API client can call at least `GET /api/admin/dashboard`.

## Phase 1 - Freeze API Contract From Current Code

Tasks:

- Treat tables in this doc as the current contract.
- Do not copy response shapes from old deposit catalog unless verified against code.
- Add frontend adapters that tolerate wrapped responses from `sendSuccess`, for example:
  - direct payload
  - `payload.data`
  - nested `payload.data.list`
  - nested `payload.data.summary`
- In frontend API layer, add admin dashboard helper methods:

```js
getBettingSummary(params)
getDepositRequests(params)
getPrizeAwardsSummary(params)
```

Files:

- Frontend: `src/api/adminApi.js`
- Frontend: `src/api/depositApi.js`

Acceptance:

- Frontend API methods match backend route names exactly.
- No frontend call uses a route that is only described in old docs.

## Phase 2 - Fix Payment Method Contract

Tasks:

- Choose `MOCK` policy:
  - if keeping `MOCK`, implement it in `paymentGatewayService`.
  - if removing `MOCK`, remove it from frontend `paymentMethods`.
- Update frontend `src/pages/spectator/Deposit.jsx`:
  - payment method options must come from backend-compatible config.
  - default should not be `MOCK` unless backend supports it.
- Update webhook method behavior:
  - do not default to unsupported `MOCK`.
  - infer method from payload shape if possible, or require explicit method.
- Remove/mask secret logs in payment service.

Acceptance:

- Selecting any payment method in UI can create a payment intent.
- Unsupported payment method is impossible in UI and returns clear backend error if manually sent.
- No secrets appear in terminal logs.

## Phase 3 - Wire Admin Dashboard Finance Cards

Use the current backend finance APIs first:

- `/api/admin/dashboard`
- `/api/admin/betting-summary`
- `/api/admin/deposit-requests`
- `/api/admin/prize-awards/summary`

Frontend mapping:

| Frontend value | Current backend source |
| --- | --- |
| Total users | `dashboard.total_users` |
| Active wallets | `dashboard.active_wallets` |
| Tokens in circulation | `dashboard.total_tokens_in_circulation` |
| Successful deposits VND | `dashboard.total_successful_deposit_vnd` or `depositRequests.summary.total_vnd` filtered to success |
| Pending deposits | `dashboard.queues.pending_deposits` or `depositRequests.summary.pending_count` |
| Pending bets | `dashboard.queues.pending_bets` or `bettingSummary.pending_bets` |
| Token staked | `bettingSummary.token_staked` |
| Token paid out | `bettingSummary.token_paid_out` |
| Token refunded | `bettingSummary.token_refunded` |
| Prize totals | `prizeAwardsSummary` currency/status map |

Tasks:

- Remove hard-coded `MOCK_FINANCE` only after these calls are wired.
- Replace "Finance and betting values are mock placeholders" text with API-backed status.
- Keep loading/error states for each finance endpoint independently so one failed summary does not blank the whole dashboard.

Acceptance:

- `/admin` no longer shows mock finance values.
- Refresh reloads all admin summary APIs.
- Missing `TOKEN` or `VND` prize summary does not crash UI.

## Phase 4 - Decide Dashboard Aggregate Expansion

Current frontend dashboard has operational queues not fully covered by `/api/admin/dashboard`.

Option A - Frontend adapts to current backend:

- Keep existing client-composed fallback for approvals/competition/results/incidents.
- Use current dashboard/payment summary endpoints only for finance cards.
- Fastest frontend integration.

Option B - Backend expands aggregate:

- Add nested sections expected by frontend:
  - `summary.users`
  - `summary.competition`
  - `summary.approvals`
  - `summary.results`
  - `summary.incidents`
  - `summary.finance`
  - `queues.pending_registrations`
  - `queues.upcoming_races`
  - `queues.result_publication`
  - `queues.incident_review`
  - `queues.pending_deposits`
  - `queues.unpaid_prize_awards`

Recommended:

- Implement Option A now to unblock frontend.
- Implement Option B next if the dashboard should be a single fast API.

Acceptance for Option A:

- Existing dashboard remains functional.
- Finance/betting cards become real.
- No old-doc-only endpoint is required.

Acceptance for Option B:

- `src/Admin/AdminDashboard.jsx` can remove most client-composition logic.
- Dashboard loads primarily from `/api/admin/dashboard`.

## Phase 5 - Admin Deposit Package UI

Current frontend `src/Admin/AdminDepositModule.jsx` already matches current backend package APIs well.

Tasks:

- Keep:
  - list all packages.
  - create package.
  - update package.
  - deactivate package.
- Verify response unwrapping:
  - backend uses `sendSuccess`, so frontend may need `payload.data.packages` vs `payload.packages`.
- Confirm delete behavior:
  - route comment says soft-delete/deactivate.
  - service behavior should be verified against current code before displaying "deleted".

Acceptance:

- Admin can create, edit, and deactivate a package from `/admin/deposits`.
- Spectator package list only shows active packages.

## Phase 6 - Admin Deposit Ledger UI

Current backend already exposes:

```text
GET /api/admin/deposit-requests?from=&to=&status=&page=&limit=
```

Tasks:

- Add a ledger table in admin deposits or dashboard drill-down.
- Show:
  - order id
  - user username/email
  - package id
  - payment method
  - total VND
  - total token
  - status
  - gateway transaction id if present
  - created date
- Add filters:
  - status
  - date range
  - page/limit
- Backend enhancement recommended:
  - add `total` and `total_pages`.

Acceptance:

- Admin can inspect pending/success/failed deposits.
- UI does not promise manual reconciliation unless backend implements it.

## Phase 7 - Spectator Payment Return Flow

Tasks:

- Confirm final frontend return URL:
  - current env example says `/payment-success`.
  - frontend route should exist and be protected or gracefully handle logged-in user.
- On return page:
  - parse query params.
  - show "processing" if webhook has not completed yet.
  - refetch deposit history.
  - link back to `/spectator/deposit`.
- If gateway redirects before server-to-server webhook completes, poll history briefly by latest order id if available.

Acceptance:

- User sees a clear payment result state after gateway redirect.
- Wallet/history refresh without manually reloading the whole app.

## Phase 8 - Tests To Run After Integration

Backend:

```bash
npm run test:e2e:admin-dashboard
```

Add/update tests for payment contract:

- intent creation with each supported method.
- unsupported method rejection.
- webhook success credits wallet once.
- webhook replay does not double-credit.
- failed webhook does not credit wallet.
- invalid signature is rejected.

Frontend manual QA:

- Admin dashboard loads with real finance values.
- Admin deposit package CRUD works.
- Admin deposit ledger filters work.
- Spectator package top-up intent works.
- Spectator custom top-up preview works.
- Payment redirect and return page work.

## Implementation Priority

1. Fix MongoDB/runtime so backend can run.
2. Fix `MOCK` payment contract mismatch.
3. Remove/mask payment secret logs.
4. Add frontend API helpers for admin dashboard summary endpoints.
5. Wire dashboard finance cards to current backend responses.
6. Add admin deposit ledger UI.
7. Add payment return page.
8. Decide whether to expand `/api/admin/dashboard` into one full aggregate endpoint.

## Do Not Use As Source Of Truth

Do not treat these as final API contract unless re-verified against code:

- downloaded `deposit_api_catalog.md`
- older docs under `docs/`
- route comments that mention behavior no longer implemented, especially `MOCK`

Use these first:

- `app.js`
- `routes/*.js`
- `controllers/*.js`
- `services/*.js`
- `validators/*.js`
- `constants/*.js`
- current frontend API files under `horse-racing-frontend/src/api`

