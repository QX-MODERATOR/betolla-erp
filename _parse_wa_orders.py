# -*- coding: utf-8 -*-
"""Parse WhatsApp marketing-orders chat into structured rows."""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime
from pathlib import Path

SRC = Path(r"C:\Users\QX\AppData\Local\Temp\whatsapp-marketing-orders.txt")
OUT_JSON = Path(r"C:\Users\QX\AppData\Local\Temp\wa-orders.json")
OUT_XLSX = Path(r"C:\Users\QX\Desktop\اوردرات_قسم_الماركيتنغ.xlsx")

AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
WEEKDAYS = (
    "السبت",
    "الأحد",
    "الاحد",
    "الإثنين",
    "الاثنين",
    "الثلاثاء",
    "الأربعاء",
    "الاربعاء",
    "الخميس",
    "الجمعة",
)
MONTH_NAMES = {
    1: "يناير",
    2: "فبراير",
    3: "مارس",
    4: "أبريل",
    5: "مايو",
    6: "يونيو",
    7: "يوليو",
    8: "أغسطس",
    9: "سبتمبر",
    10: "أكتوبر",
    11: "نوفمبر",
    12: "ديسمبر",
}

SKIP_SENDERS_EXACT = {
    "ضياء توصيل",
}
SYSTEM_RE = re.compile(
    r"(أنشأ مجموعة|أضافك|أضاف |أوقفتَ|ثبّت|حدَّثت|تغيّر رمز|انضم |أضافك|الرسائل والمكالمات|"
    r"تم حذف هذه الرسالة|تم استبعاد الوسائط|معرفة المزيد)"
)
MSG_SPLIT = re.compile(
    r"(?:^|\n)(\d{1,2}[‏\u200f]*/[‏\u200f]*\d{1,2}[‏\u200f]*/[‏\u200f]*\d{4}،\s*"
    r"\d{1,2}:\d{2}\s*[صم])\s*-\s*"
)

PHONE_RE = re.compile(
    r"(?:\+?962[\s\-]*7[\s\-]*\d(?:[\s\-]?\d){7}|0?7\d{8}|٠?٧[٠-٩]{8})"
)
PRICE_RE = re.compile(
    r"(?:السعر\s*[:\-]?\s*|سعر\s*[:\-]?\s*)?"
    r"(\d+(?:\.\d+)?)\s*(?:دينار|د\.?|jd|JD)?\b|"
    r"(?:السعر\s*[:\-]?\s*)(صفر)",
    re.IGNORECASE,
)
DATE_IN_BODY_RE = re.compile(
    r"(?:" + "|".join(WEEKDAYS) + r")?\s*"
    r"(\d{1,2})\s*/\s*(\d{1,2})(?:\s*/\s*(\d{2,4}))?",
)
WA_TS_RE = re.compile(
    r"(\d{1,2})[‏\u200f]*/[‏\u200f]*(\d{1,2})[‏\u200f]*/[‏\u200f]*(\d{4})،\s*"
    r"(\d{1,2}):(\d{2})\s*([صم])"
)

AGENT_HINTS = (
    "شهد ماركيتينج",
    "شهد ماركتينج",
    "شهد ماركيتنج",
    "حنين بيتولا ميديا",
    "حنين بيتولا ماركتنح",
    "حنين بيتولا",
    "رحمه الجمّال",
    "رحمه الجمال",
    "رحمة ناجح",
    "رحمة /",
    "رحمه بيتولا",
    "رهف القيسي",
    "مسلم مغاريز",
    "سوشال ميديا",
    "ميديا",
    "داتا",
    "sales",
    "رشا",
    "حنان",
)


def n(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    s = s.translate(AR_DIGITS)
    s = s.replace("\u200f", "").replace("\u200e", "").replace("\ufeff", "")
    s = s.replace("‏", "").replace("‎", "")
    return s


def clean_space(s: str) -> str:
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip(" \t-:\n")


def parse_wa_ts(ts: str):
    ts = n(ts)
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})،\s*(\d{1,2}):(\d{2})\s*([صم])", ts)
    if not m:
        return None
    d, mo, y, h, mi, ampm = m.groups()
    hour = int(h)
    if ampm == "م" and hour < 12:
        hour += 12
    if ampm == "ص" and hour == 12:
        hour = 0
    try:
        return datetime(int(y), int(mo), int(d), hour, int(mi))
    except ValueError:
        return None


def extract_phones(text: str) -> list[str]:
    text_n = n(text)
    found = []
    for m in PHONE_RE.finditer(text_n):
        raw = re.sub(r"\D", "", m.group(0))
        if raw.startswith("962") and len(raw) >= 12:
            raw = "0" + raw[3:]
        if raw.startswith("7") and len(raw) == 9:
            raw = "0" + raw
        if len(raw) == 10 and raw.startswith("07"):
            if raw not in found:
                found.append(raw)
    return found


def looks_like_order(body: str) -> bool:
    b = n(body)
    if SYSTEM_RE.search(body):
        return False
    if "تم حذف هذه الرسالة" in body:
        return False
    phones = extract_phones(b)
    if not phones:
        return False
    clues = (
        "اوردر" in b
        or "الاوردر" in b
        or "السعر" in b
        or "دينار" in b
        or re.search(r"\d+\s*د\b", b)
        or "شامبو" in b
        or "بلازما" in b
        or "بكج" in b
        or "بكجات" in b
        or "سيروم" in b
        or "بلسم" in b
        or "تريتمنت" in b
        or "sp gold" in b.lower()
        or "ديفاي" in b
        or "عدسات" in b
        or "ارجان" in b
        or "هدية" in b
        or "استبدال" in b
    )
    return bool(clues)


def split_sender_body(rest: str):
    rest = rest.lstrip()
    # "Name: body" — name rarely contains newline before colon on same first line
    first, _, after = rest.partition("\n")
    if ":" in first:
        sender, _, first_body = first.partition(":")
        sender = sender.strip()
        body = (first_body + ("\n" + after if after else "")).strip()
        return sender, body
    return "", rest.strip()


def extract_order_date(body: str, wa_dt: datetime | None):
    b = n(body)
    lines = [ln.strip() for ln in b.splitlines() if ln.strip()]
    header = " ".join(lines[:2]) if lines else b[:80]
    year = wa_dt.year if wa_dt else 2026
    m = DATE_IN_BODY_RE.search(header)
    if m:
        d, mo, y = m.group(1), m.group(2), m.group(3)
        dd, mm = int(d), int(mo)
        # Heuristic: if first number > 12 and second <= 12, it's D/M.
        # If first <= 12 and second > 12, it's M/D.
        # Ambiguous (both <=12): Jordan orders usually D/M, but some write 7/4 meaning 4 July.
        # Prefer D/M unless day>31 then swap; if day>12 and month>12 invalid.
        if mm > 12 and dd <= 12:
            dd, mm = mm, dd
        if dd > 31:
            dd, mm = mm, dd
        yy = int(y) if y else year
        if yy < 100:
            yy += 2000
        try:
            return datetime(yy, mm, dd)
        except ValueError:
            pass
    return wa_dt


def strip_date_header(body: str) -> str:
    b = n(body)
    lines = b.splitlines()
    if not lines:
        return body
    first = lines[0].strip()
    if any(w in first for w in WEEKDAYS) or re.match(r"^\d{1,2}\s*/\s*\d{1,2}", first):
        # also "تعديل" / "الغاء" prefixes on same or previous
        rest = "\n".join(lines[1:])
        return rest
    return body


def extract_price(body: str):
    b = n(body)
    # explicit صفر
    if re.search(r"السعر\s*[:\-]?\s*صفر", b) or re.search(r"سعر\s*[:\-]?\s*صفر", b):
        return 0.0
    # السعر N
    m = re.search(r"السعر\s*[:\-]?\s*(\d+(?:\.\d+)?)", b)
    if m:
        return float(m.group(1))
    m = re.search(r"\((\d+(?:\.\d+)?)\s*دينار\)", b)
    if m:
        return float(m.group(1))
    m = re.search(r"(?:^|\n)\s*(\d+(?:\.\d+)?)\s*(?:دينار|د\.?)\s*(?:\n|$)", b)
    if m:
        return float(m.group(1))
    m = re.search(r"(\d+(?:\.\d+)?)\s*دينار", b)
    if m:
        return float(m.group(1))
    return None


def extract_name(body: str, phones: list[str]) -> str:
    b = n(body)
    m = re.search(r"(?:الاسم|اسم الزبون|اسم العميل)\s*[:\-]\s*(.+)", b)
    if m:
        return clean_space(m.group(1).split("\n")[0])
    # remove header date
    text = strip_date_header(b)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    skip_starts = (
        "الاوردر",
        "اوردر",
        "السعر",
        "العنوان",
        "الرقم",
        "الموقع",
        "التوصيل",
        "تعديل",
        "الغاء",
        "استبدال",
        "رقم",
        "+",
        "0",
        "7",
    )
    for ln in lines[:8]:
        compact = ln.replace(" ", "")
        if any(p in compact for p in phones):
            # name and phone on same line
            before = PHONE_RE.split(ln)[0]
            before = re.sub(r"(الاسم|اسم الزبون)\s*[:\-]?", "", before).strip(" -:،,")
            if before and len(before) > 1:
                return clean_space(before)
            continue
        low = ln.lower()
        if ln.startswith(skip_starts):
            continue
        if re.fullmatch(r"\d{1,2}/\d{1,2}(/\d{2,4})?", ln):
            continue
        if any(w == ln or ln.startswith(w + " ") for w in WEEKDAYS):
            continue
        if "دينار" in ln or re.search(r"^\d+(\.\d+)?\s*د$", ln):
            continue
        if any(h in ln for h in AGENT_HINTS) and len(ln) < 40:
            continue
        if ln in ("New", "new", "NEW", "Sales", "sales", "VIP", "vip"):
            continue
        if len(ln) > 60:
            continue
        # skip obvious addresses (street keywords) if a later short name exists? name usually first
        if re.match(r"^(شارع|حي |عمان|الزرقاء|المفرق|مادبا|الكرك|العقبة|جرش|اربد|إربد)", ln):
            continue
        return clean_space(ln)
    return ""


def extract_item(body: str) -> str:
    b = n(body)
    m = re.search(
        r"(?:الاوردر|اوردر|الطلب)\s*[:\-]?\s*\n?(.*?)(?=\n\s*(?:السعر|سعر|\d+\s*دينار|\d+\s*د\b)|$)",
        b,
        re.S | re.I,
    )
    if m:
        item = clean_space(m.group(1))
        item = re.sub(r"\n+", " | ", item)
        if item and item.lower() not in ("الاوردر", "اوردر"):
            return item[:300]
    # product-like lines
    keys = (
        "شامبو",
        "بلسم",
        "سيروم",
        "تريتمنت",
        "بلازما",
        "بكج",
        "بكجات",
        "ارجان",
        "sp gold",
        "ديفاي",
        "عدسات",
        "ليف",
        "سشت",
        "ثيرابي",
        "بروتين",
        "مفتح",
        "هدية",
        "استبدال",
    )
    lines = [ln.strip() for ln in b.splitlines() if ln.strip()]
    picked = []
    for ln in lines:
        low = ln.lower()
        if any(k in low for k in keys):
            if any(h in ln for h in ("ماركيت", "ميديا", "سوشال")):
                continue
            if ln.startswith(("الاسم", "الرقم", "العنوان")):
                continue
            picked.append(ln)
    return clean_space(" | ".join(picked))[:300]


def extract_notes(body: str, name: str, phones: list[str], item: str, price) -> str:
    b = n(body)
    lines = [ln.strip() for ln in b.splitlines() if ln.strip()]
    drop = set()
    if name:
        drop.add(name)
    notes = []
    for ln in lines:
        if any(p in ln.replace(" ", "") or p in n(ln) for p in phones):
            # keep extra text besides phone
            leftover = ln
            for p in phones:
                leftover = leftover.replace(p, "")
            leftover = PHONE_RE.sub("", leftover)
            leftover = clean_space(leftover)
            if leftover and leftover not in (name, "") and "رقم" not in leftover[:6]:
                notes.append(leftover)
            continue
        if ln == name:
            continue
        if any(w in ln and len(ln) < 25 for w in WEEKDAYS):
            continue
        if re.match(r"^\d{1,2}/\d{1,2}", ln) and len(ln) < 30:
            continue
        if ln.startswith(("الاوردر", "اوردر")):
            continue
        if item and ln in item:
            continue
        if re.match(r"^السعر", ln):
            continue
        if re.match(r"^\(?\d+(\.\d+)?\s*(دينار|د)\)?$", ln):
            continue
        if ln in ("تعديل", "تعديل ****", "الغاء"):
            continue
        notes.append(ln)
    # collapse
    text = " | ".join(notes)
    text = re.sub(r"\s*\|\s*", " | ", text)
    return clean_space(text)[:500]


def extract_status(body: str) -> str:
    b = n(body)
    first = b.strip()[:80]
    if re.match(r"^\s*الغاء", b) or "الغاء" == b.strip() or b.strip().startswith("الغاء"):
        return "الغاء"
    if "تعديل" in first or b.strip().startswith("تعديل"):
        return "تعديل"
    if "استبدال" in first:
        return "استبدال"
    if "لارد" in b and len(b) < 40:
        return "لارد"
    return ""


def extract_customer_type(body: str) -> str:
    b = n(body)
    low = b.lower()
    if re.search(r"صيدلي|صالون|السنتر|سنتر", b):
        return "السنتر"
    if re.search(r"\bnew\b|تأسيس", low):
        return "New"
    if "حجز" in b:
        return "حجز مسبق"
    if "داتا" in b:
        return "داتا"
    if "end user" in low or "اند يوزر" in b:
        return "بيع"
    if re.search(r"\bsales\b", low):
        return "بيع"
    return "بيع"


def parse_messages(raw: str):
    raw = raw.replace("\r\n", "\n")
    parts = MSG_SPLIT.split(raw)
    # parts[0] preamble, then ts, rest, ts, rest...
    msgs = []
    i = 1
    while i + 1 < len(parts):
        ts, rest = parts[i], parts[i + 1]
        sender, body = split_sender_body(rest)
        msgs.append({"ts": ts, "sender": sender, "body": body})
        i += 2
    return msgs


def main():
    raw = SRC.read_bytes().decode("utf-8-sig")
    msgs = parse_messages(raw)
    rows = []
    for msg in msgs:
        sender = msg["sender"]
        body = msg["body"]
        if sender in SKIP_SENDERS_EXACT:
            continue
        full = body if body else sender
        # some messages have no colon so sender is empty and body has all
        if not looks_like_order(full if sender else (sender + "\n" + body)):
            # try combined
            combined = f"{sender}\n{body}" if sender else body
            if not looks_like_order(combined):
                continue
            full = combined
        else:
            full = body or sender

        phones = extract_phones(full)
        if not phones:
            continue
        wa_dt = parse_wa_ts(msg["ts"])
        odt = extract_order_date(full, wa_dt)
        name = extract_name(full, phones)
        item = extract_item(full)
        price = extract_price(full)
        status = extract_status(full)
        ctype = extract_customer_type(full)
        notes = extract_notes(full, name, phones, item, price)
        rows.append(
            {
                "التاريخ": odt.strftime("%Y-%m-%d") if odt else "",
                "التاريخ_عرض": odt.strftime("%d-%b") if odt else "",
                "نوع العميل": ctype,
                "Name": name,
                "phone number": phones[0],
                "extra_phones": ",".join(phones[1:]),
                "اسم الصنف": item,
                "كاش": price,
                "الحالة": status,
                "notes": notes,
                "المرسل": sender,
                "وقت_الواتساب": msg["ts"],
                "raw": full[:800],
            }
        )

    OUT_JSON.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print("messages", len(msgs), "orders", len(rows))


if __name__ == "__main__":
    main()
