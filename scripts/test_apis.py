import os
import urllib.request
import json
import sys

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

base = os.environ.get('TEST_BASE_URL', 'http://localhost:3005')

# As of the Phase 1 security hardening, every one of these endpoints except
# /api/leads requires an authenticated staff session cookie, and /api/leads
# requires the X-Webhook-Secret header. This script no longer assumes
# anonymous access succeeds (that used to be the vulnerability) — it
# demonstrates that protected endpoints correctly reject unauthenticated
# calls, and optionally exercises them for real if you provide a session
# cookie captured from a real login.
#
# Optional env vars:
#   TEST_BASE_URL        default http://localhost:3005
#   TEST_WEBHOOK_SECRET   value of WEBHOOK_SHARED_SECRET, to test /api/leads for real
#   TEST_SESSION_COOKIE   a real "Cookie:" header value from a logged-in browser session,
#                         to test the authenticated endpoints for real instead of just
#                         confirming they reject anonymous requests

webhook_secret = os.environ.get('TEST_WEBHOOK_SECRET')
session_cookie = os.environ.get('TEST_SESSION_COOKIE')


def request_json(endpoint, data, headers=None):
    all_headers = {'Content-Type': 'application/json'}
    if headers:
        all_headers.update(headers)
    req = urllib.request.Request(
        base + endpoint,
        data=json.dumps(data).encode('utf-8'),
        headers=all_headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            return res.getcode(), json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(body)
        except json.JSONDecodeError:
            return e.code, {'raw': body}


print("=== TESTING API AUTHORIZATION & WORKFLOWS ===")

# 1. Lead Ingestion (public webhook — gated by X-Webhook-Secret)
if webhook_secret:
    code, res = request_json('/api/leads', {
        'name': 'دانة خليل', 'phone': '0791112233', 'city': 'عمان',
        'notes': 'سألت عن بكجات مورفوزيس', 'source': 'facebook_leads', 'rep_name': 'auto',
    }, headers={'X-Webhook-Secret': webhook_secret})
    print(f"[POST /api/leads] with correct secret -> HTTP {code}: {res.get('message', res)}")
else:
    print("[POST /api/leads] skipped real call — set TEST_WEBHOOK_SECRET to test with a valid secret")

code, res = request_json('/api/leads', {'phone': '0791112233'})
status = "PASS (correctly rejected)" if code == 401 else "FAIL (expected 401)"
print(f"[POST /api/leads] without secret -> HTTP {code}: {status}")

# 2-5. Authenticated staff endpoints
auth_headers = {'Cookie': session_cookie} if session_cookie else None
protected_checks = [
    ('/api/orders', {'rawText': '0793937385\nشامبو بلازما\n24 د'}),
    ('/api/calls', {'customerName': 'سدين غنايم', 'phone': '0793937385', 'outcome': 'answered'}),
    ('/api/inventory', {'sku': 'PL-SHAMP-02', 'type': 'purchase_in', 'quantity': 25}),
    ('/api/finance', {'invoice_id': 'INV-2026-003', 'amount': 50.0, 'payment_method': 'cliq'}),
]

for endpoint, payload in protected_checks:
    if session_cookie:
        code, res = request_json(endpoint, payload, headers=auth_headers)
        print(f"[POST {endpoint}] with session cookie -> HTTP {code}: {res.get('message', res)}")
    else:
        code, res = request_json(endpoint, payload)
        status = "PASS (correctly rejected)" if code == 401 else f"FAIL (expected 401, got {code})"
        print(f"[POST {endpoint}] without session -> HTTP {code}: {status}")

print("\nDone. Set TEST_SESSION_COOKIE (from a real logged-in session) to exercise the authenticated workflows for real.")
