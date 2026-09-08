/**
 * Advanced Arabic WhatsApp Order Parser for Betolla ERP
 * Specifically parses Jordanian cosmetics marketing and sales order templates.
 */

export interface ParsedOrderItem {
  productName: string;
  quantity: number;
}

export interface ParsedWhatsAppOrder {
  customerName: string;
  phone: string;
  city: string;
  address: string;
  items: ParsedOrderItem[];
  itemsSummary: string;
  totalAmount: number;
  repName: string;
  source: string;
  isReservation: boolean;
  paymentMethod: 'cash_on_delivery' | 'installment' | 'cliq';
  installmentNotes?: string;
  rawText: string;
}

const JORDAN_CITIES = [
  "طبربور", "عمان", "الزرقاء", "الزرقا", "إربد", "اربد", "الرصيفة", "السلط", 
  "مادبا", "العقبة", "الكرك", "معان", "المفرق", "جرش", "عجلون", "الطفيلة", 
  "مرج الحمام", "شفا بدران", "سحاب", "ضاحية الرشيد", "المقابلين", "خلدا", 
  "تلاع العلي", "ماركا", "الجبيهة", "صويلح", "الشميساني", "عبدون", "البيادر"
];

const KNOWN_REPS = ["رحمه", "حمزة", "صابرين", "حنان", "سارة", "حنين", "شهد", "رشا", "كريمة", "حليمة", "عرين", "لارا", "رهف", "مسلم"];

export function parseWhatsAppOrderText(raw: string): ParsedWhatsAppOrder {
  const cleanRaw = raw.trim();
  const lines = cleanRaw.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Phone number
  const phoneMatch = cleanRaw.match(/07[789]\d{7}/);
  const phone = phoneMatch ? phoneMatch[0] : "";

  // 2. City extraction
  let detectedCity = "عمان";
  for (const city of JORDAN_CITIES) {
    if (cleanRaw.includes(city)) {
      detectedCity = city === "الزرقا" ? "الزرقاء" : city === "اربد" ? "إربد" : city;
      break;
    }
  }

  // 3. Price extraction
  // Finds standalone numbers or numbers followed by د / JD / دينار
  let totalAmount = 0;
  const priceMatches = cleanRaw.match(/(\b\d+(\.\d+)?)\s*(د\.?أ?|د|JD|دينار)?/g);
  if (priceMatches) {
    for (const match of priceMatches) {
      const numMatch = match.match(/\d+(\.\d+)?/);
      if (numMatch) {
        const val = parseFloat(numMatch[0]);
        // Filter out dates (like 8/9, 10/9), volumes (like 100, 250), quantities (like 2, 3), and phone digits
        if (val > 10 && val < 1000 && !phone.includes(numMatch[0]) && !match.includes('/') && val !== 100 && val !== 250 && val !== 500 && val !== 1000) {
          totalAmount = val;
          break;
        }
      }
    }
  }
  // Fallback: search for lone numeric line (e.g. "95" or "24 د")
  if (totalAmount === 0) {
    for (const line of lines) {
      const match = line.match(/^(\d+)\s*(د|JD|دينار)?$/);
      if (match) {
        const val = parseFloat(match[1]);
        if (val >= 10 && val < 1000) {
          totalAmount = val;
          break;
        }
      }
    }
  }

  // 4. Sales Rep & Source
  let repName = "مبيعات عامة";
  let source = "whatsapp";

  for (const rep of KNOWN_REPS) {
    if (cleanRaw.includes(rep)) {
      repName = rep;
      break;
    }
  }

  if (cleanRaw.includes("سوشال ميديا") || cleanRaw.includes("سوشيال") || cleanRaw.includes("سوشال")) {
    source = "سوشال ميديا";
  } else if (cleanRaw.includes("Sales") || cleanRaw.includes("مبيعات")) {
    source = "مبيعات مباشرة";
  }

  // 5. Payment terms & Installment
  let paymentMethod: 'cash_on_delivery' | 'installment' | 'cliq' = 'cash_on_delivery';
  let installmentNotes: string | undefined = undefined;

  if (cleanRaw.includes("شهر") || cleanRaw.includes("قسط") || cleanRaw.includes("أقساط")) {
    paymentMethod = "installment";
    installmentNotes = "دفع آجل / استحقاق شهر";
  }

  const isReservation = cleanRaw.includes("حجز");

  // 6. Name and Address Extraction
  let customerName = "عميل واتساب";
  let address = detectedCity;

  // Typical pattern: line 0 is date/header, line 1 is customer name, line 2 is phone
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(phone) && i > 0) {
      // The line before the phone is usually the name
      const candidateName = lines[i - 1];
      if (!candidateName.includes('/') && !candidateName.includes('حجز') && !candidateName.includes('السبت') && !candidateName.includes('الأحد') && !candidateName.includes('الاثنين') && !candidateName.includes('الثلاثاء') && !candidateName.includes('الأربعاء') && !candidateName.includes('الخميس') && !candidateName.includes('الجمعة')) {
        customerName = candidateName;
      }
    }
    // Lines indicating address
    if (line.includes('شارع') || line.includes('عمارة') || line.includes('عماره') || line.includes('قرب') || line.includes('مركز') || line.includes('حي') || line.includes('مقابل') || line.includes('جبل') || line.includes('الجبل')) {
      address = line;
    }
  }

  // 7. Products line items extraction
  const items: ParsedOrderItem[] = [];
  const productKeywords = ["شامبو", "بلسم", "ماسك", "سيروم", "مورفوزيس", "بكج", "بكجات", "تريتمنت", "ليف", "ليف أن", "سيشتات", "بروتين", "ماراكوجا", "أرجان", "ارغان", "عدسات", "سشوار", "مملس"];
  
  for (const line of lines) {
    if (productKeywords.some(k => line.includes(k))) {
      // Check if starts with quantity (e.g. "2 شامبو", "3بكجات", "5سيشتات")
      const qtyMatch = line.match(/^(\d+)\s*(.*)/);
      if (qtyMatch) {
        items.push({
          quantity: parseInt(qtyMatch[1], 10),
          productName: qtyMatch[2].trim()
        });
      } else {
        items.push({
          quantity: 1,
          productName: line
        });
      }
    }
  }

  const itemsSummary = items.length > 0 
    ? items.map(it => `${it.quantity > 1 ? it.quantity + ' ' : ''}${it.productName}`).join(' + ')
    : "مستحضرات عناية وتجميل";

  return {
    customerName,
    phone,
    city: detectedCity,
    address,
    items,
    itemsSummary,
    totalAmount,
    repName,
    source,
    isReservation,
    paymentMethod,
    installmentNotes,
    rawText: cleanRaw,
  };
}
