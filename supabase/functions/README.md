# Betolla ERP - Supabase Edge Functions Documentation

This directory contains the production-ready **Supabase Edge Functions** (built with Deno & TypeScript) powering the serverless backend of the Betolla Cosmetics ERP.

---

## Functions Overview

| Function Name | Path | Purpose |
|---|---|---|
| **`ingest-lead`** | `supabase/functions/ingest-lead` | Receives incoming marketing leads (Meta Ads, n8n, Web) and performs phone sanitization, duplicates checking, and automated Round-Robin sales rep assignment. |
| **`whatsapp-order`** | `supabase/functions/whatsapp-order` | Webhook that accepts raw Arabic WhatsApp order text, parses items, prices in JD, delivery cities, and rep names, and inserts orders directly into PostgreSQL. |
| **`calendar-reminder`** | `supabase/functions/calendar-reminder` | Integrates with Google Calendar API using your API key and provides daily follow-up notifications. |
| **`stock-alert`** | `supabase/functions/stock-alert` | Monitors inventory levels and triggers warnings when products fall below their reorder safety thresholds. |

---

## How to Deploy to Supabase

### 1. Install Supabase CLI (if not already installed)
```bash
npm install -g supabase
```

### 2. Login & Link to your Supabase Project
```bash
supabase login
supabase link --project-ref fdsawfdnxwzshlbcramf
```

### 3. Set Environment Secrets
```bash
supabase secrets set GOOGLE_CALENDAR_API_KEY=AIzaSyC4J_78XoISPpQye7Uy731n6YkHaw_qElE
```

### 4. Deploy All Edge Functions
```bash
supabase functions deploy ingest-lead --no-verify-jwt
supabase functions deploy whatsapp-order --no-verify-jwt
supabase functions deploy calendar-reminder --no-verify-jwt
supabase functions deploy stock-alert --no-verify-jwt
```

---

## Live Webhook URLs

Once deployed, your live Supabase Edge Functions URLs are:
- `https://fdsawfdnxwzshlbcramf.supabase.co/functions/v1/ingest-lead`
- `https://fdsawfdnxwzshlbcramf.supabase.co/functions/v1/whatsapp-order`
- `https://fdsawfdnxwzshlbcramf.supabase.co/functions/v1/calendar-reminder`
- `https://fdsawfdnxwzshlbcramf.supabase.co/functions/v1/stock-alert`
