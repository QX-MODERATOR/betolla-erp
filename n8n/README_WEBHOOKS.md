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

## 3. Recommended n8n Workflow Node Setup

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
