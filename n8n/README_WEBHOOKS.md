# Betolla ERP - n8n & Marketing Automation Guide

This guide explains how to connect **n8n** or any external marketing tool directly to Betolla ERP to eliminate manual paper printing and Excel copy-pasting.

---

## 1. Automated Lead Intake (التسويق / أرقام الهاتف الجديدة)

**Endpoint:**
```http
POST /api/leads
Content-Type: application/json
```

**Payload Example:**
```json
{
  "name": "سدين غنايم",
  "phone": "0793937385",
  "city": "طبربور",
  "address": "طبربور / شارع الامير حسين عماره 101",
  "notes": "2 شامبو بلازما + 100مل تريتمنت",
  "source": "social_media",
  "rep_name": "auto"
}
```

**What the ERP does automatically:**
1. Sanitizes and normalizes the phone number.
2. If `rep_name` is `"auto"`, the system applies **Round-Robin** distribution among active sales reps (حمزة، رحمه، صابرين، حنان).
3. The lead appears **instantly** in the assigned sales rep's daily call queue on mobile.
4. Returns HTTP `201 Created` with full assigned lead details.

---

## 2. Google Calendar Integration & Next Call Scheduling

**Endpoint:**
```http
POST /api/calendar
Content-Type: application/json
```

**Payload Example:**
```json
{
  "customerName": "سدين غنايم",
  "customerPhone": "0793937385",
  "startDate": "2026-09-15",
  "startTime": "11:30",
  "address": "طبربور",
  "repName": "رحمه",
  "notes": "متابعة نتائج شامبو وتريتمنت البلازما"
}
```

**Response:**
Returns a `calendarUrl` that directly opens the **Google Calendar app** on the rep's Android device or web browser with all fields pre-filled and a 30-minute notification set.

---

## 3. Landing Page Order Sync (PLASMA Checkout)

**Endpoint:**
```http
POST /api/orders/webhook
Content-Type: application/json
X-Erp-Signature: t=<unix-ms>,v1=<hex hmac-sha256(ORDERS_WEBHOOK_SECRET, "<t>.<raw JSON body>")>
Idempotency-Key: <uuid>
```

Called by the Betolla PLASMA landing page's own backend (a separate Firebase project) right
after a customer completes checkout — never called from a browser. Unlike `/api/leads`'s bare
shared-secret header, this endpoint requires an HMAC signature over the exact request body plus a
timestamp (see `lib/hmac.ts`): a request older or newer than 5 minutes is rejected as expired, and
a tampered body no longer matches its signature. Unlike `/api/leads`, this also creates a real
order (visible immediately in every order list, status **draft** — see point 4 below), so the
secret is mandatory: an unset `ORDERS_WEBHOOK_SECRET` refuses every request (401) instead of
defaulting to open. A replayed
(but still fresh and correctly signed) request is not separately blocked by a nonce store —
`business_create_order`'s own `Idempotency-Key` check, which every caller already relies on, makes
a replay harmless (it returns the original order instead of creating another one).

**Payload Example:**
```json
{
  "packageId": "plasma-complete",
  "quantity": 1,
  "fullName": "سارة أحمد",
  "phone": "0791234567",
  "city": "عمّان",
  "address": "الدوار السابع، شارع الملكة رانيا",
  "notes": "",
  "language": "ar"
}
```

`packageId` is `plasma-complete` (30 JOD) or `plasma-duo` (20 JOD) — the landing page's own
checkout price, intentionally below the bundle's catalog `retail_price` (40/25 JOD), the same way
a hand-typed total or a promo code already can be.

**What the ERP does automatically:**
1. Verifies the HMAC signature and timestamp freshness, then rate-limits by client IP and in total.
2. Validates and normalizes every field again (never trusts the caller, even though it's our own
   landing page).
3. Reuses the existing customer by phone number if one exists (`reuse_phone`, company-wide — not
   scoped to a single rep), otherwise creates a new customer.
4. Creates a **draft** order for the matching PLASMA bundle at the landing page's price — draft,
   not confirmed, because this is an unattended submission no staff member has reviewed yet.
   `business_create_order` only deducts real component stock (shampoo/conditioner/mask/serum, via
   the existing bundle expansion, migration 037) for `status: 'confirmed'`, so **no inventory
   moves until a rep reviews the order and moves it to confirmed** through the existing
   `business_status` RPC — the same review step a WhatsApp "reservation" already goes through.
5. The `Idempotency-Key` is the same UUID the landing page used for its own record: a retried sync
   (network blip, redeploy, cold start) replays the same order and never creates a duplicate.
6. Returns the ERP's own readable order number (`BET-2026-00042`) and the total — nothing else;
   no customer or order internals are ever returned.

This order appears in every existing report and CSV/finance export exactly like any other order
(`source: "plasma-landing-page"` distinguishes it) — no separate export was built or is needed.

## 4. Recommended n8n Workflow Node Setup

```
[ Facebook / TikTok / Web Form Lead ]
                  │
                  ▼
          [ n8n Webhook Node ]
                  │
                  ▼
        [ Code / Format Node ]
                  │
                  ▼
  [ HTTP Request Node -> Betolla ERP ]
       POST http://localhost:3000/api/leads
                  │
                  ▼
  [ WhatsApp Notification to Assigned Rep ]
```
