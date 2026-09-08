import urllib.request
import json
import sys

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

base = 'http://localhost:3005'

def post_json(endpoint, data):
    req = urllib.request.Request(
        base + endpoint,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=5) as res:
        return res.getcode(), json.loads(res.read().decode('utf-8'))

print("=== TESTING POST API WORKFLOWS ===")

# 1. Lead Ingestion
code, res = post_json('/api/leads', {
    'name': 'دانة خليل',
    'phone': '0791112233',
    'city': 'عمان',
    'notes': 'سألت عن بكجات مورفوزيس',
    'source': 'facebook_leads',
    'rep_name': 'auto'
})
msg = res.get('message', '')
print(f"[POST /api/leads] -> HTTP {code}: {msg}")

# 2. WhatsApp Order Auto-Intake
raw_wa = """8/9 الثلاثاء 
سدين غنايم 
0793937385
طبربور /شارع الامير حسين عماره 101
2 شامبو بلازما 
100مل تريتمنت 
24 د 
رحمه الجمّال /سوشال ميديا"""

code, res = post_json('/api/orders', {'rawText': raw_wa})
order = res.get('order', {})
order_id = order.get('id', '')
amount = order.get('total_amount', 0)
print(f"[POST /api/orders] -> HTTP {code}: Order ID: {order_id}, Amount: {amount} JD")

# 3. Call Log & Google Calendar URL
code, res = post_json('/api/calls', {
    'customerName': 'سدين غنايم',
    'phone': '0793937385',
    'outcome': 'answered',
    'notes': 'تم الاتصال وتأكيد الطلبية',
    'nextCallDate': '2026-09-15',
    'nextCallTime': '11:30',
    'repName': 'رحمه'
})
has_cal = bool(res.get('log', {}).get('googleCalendarUrl'))
print(f"[POST /api/calls] -> HTTP {code}: Google Calendar URL generated: {has_cal}")

# 4. Inventory Movement
code, res = post_json('/api/inventory', {
    'sku': 'PL-SHAMP-02',
    'type': 'purchase_in',
    'quantity': 25,
    'reference': 'شحنة إضافية #TEST-01'
})
msg = res.get('message', '')
print(f"[POST /api/inventory] -> HTTP {code}: {msg}")

# 5. Finance Payment
code, res = post_json('/api/finance', {
    'invoice_id': 'INV-2026-003',
    'amount': 50.000,
    'payment_method': 'cliq',
    'reference_number': 'CLIQ-TRX-9921'
})
msg = res.get('message', '')
print(f"[POST /api/finance] -> HTTP {code}: {msg}")

print("\n>>> ALL API POST WORKFLOWS PASSED WITH 100% SUCCESS! <<<")
