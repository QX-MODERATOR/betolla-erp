import { splitOutsideBrackets } from "@/lib/package-items";
/**
 * Advanced Arabic WhatsApp Order Parser for Betolla ERP
 * Specifically trained on Jordanian cosmetics marketing, center, and sales team chat patterns.
 * Supports:
 * - Complex Jordanian phone numbers (+962, spaces, dashes, international, glued phones)
 * - Eastern Arabic (Hindi) numeral normalization (٠١٢٣٤٥٦٧٨٩ -> 0123456789)
 * - Anti-date collision (distinguishes dates like 14/9, 10/9 from order prices)
 * - Products, bundles, sizes recognition (ثيربي, ثيرابي 300مل, SP gold, بكج رباعي, مفتح حراشف, etc.)
 * - Jordanian cities, towns, and regions (Deir Alla, Aqaba, Salt, Madaba, Amman neighborhoods)
 * - Automatic Driver / Logistics dispatch recommendation (Ali, Khalid, BX Arabia, External)
 * - Credit / Installment terms recognition (استحقاق شهر, استحقاق أسبوع, دفعة كاش + ذمة)
 * - Sales/Marketing representative and source channel attribution
 */

export interface ParsedOrderItem {
  productName: string;
  quantity: number;
}

export interface ParsedWhatsAppOrder {
  customerName: string;
  customerType: 'salon' | 'individual';
  phone: string;
  city: string;
  address: string;
  items: ParsedOrderItem[];
  itemsSummary: string;
  totalAmount: number;
  cashAmount: number;
  creditAmount: number;
  repName: string;
  source: string;
  isReservation: boolean;
  paymentMethod: 'cash_on_delivery' | 'installment' | 'cliq';
  installmentNotes?: string;
  deliveryNotes?: string;
  suggestedDriver?: string;
  rawText: string;
}

interface LocationMapping {
  key: string;
  city: string;
  driver: string;
  region: string;
}

const JORDAN_LOCATIONS: LocationMapping[] = [
  // Jordan Valley & Governorates -> BX Arabia
  { key: "دير علا", city: "دير علا", driver: "بي اكس (BX Arabia)", region: "المحافظات والأغوار" },
  { key: "الغور", city: "الأغوار", driver: "بي اكس (BX Arabia)", region: "المحافظات والأغوار" },
  { key: "الشونة", city: "الشونة", driver: "بي اكس (BX Arabia)", region: "المحافظات والأغوار" },
  { key: "العقبة", city: "العقبة", driver: "بي اكس (BX Arabia)", region: "العقبة" },
  { key: "إربد", city: "إربد", driver: "بي اكس (BX Arabia)", region: "الشمال" },
  { key: "اربد", city: "إربد", driver: "بي اكس (BX Arabia)", region: "الشمال" },
  { key: "السلط", city: "السلط", driver: "بي اكس (BX Arabia)", region: "السلط" },
  { key: "علان", city: "السلط / علان", driver: "بي اكس (BX Arabia)", region: "السلط" },
  { key: "مادبا", city: "مادبا", driver: "بي اكس (BX Arabia)", region: "مادبا" },
  { key: "المفرق", city: "المفرق", driver: "بي اكس (BX Arabia)", region: "المفرق" },
  { key: "جرش", city: "جرش", driver: "بي اكس (BX Arabia)", region: "جرش" },
  { key: "سوف", city: "جرش / سوف", driver: "بي اكس (BX Arabia)", region: "جرش" },
  { key: "عجلون", city: "عجلون", driver: "بي اكس (BX Arabia)", region: "عجلون" },
  { key: "الكرك", city: "الكرك", driver: "بي اكس (BX Arabia)", region: "الجنوب" },
  { key: "الطفيلة", city: "الطفيلة", driver: "بي اكس (BX Arabia)", region: "الجنوب" },
  { key: "معان", city: "معان", driver: "بي اكس (BX Arabia)", region: "الجنوب" },
  { key: "الزرقاء", city: "الزرقاء", driver: "بي اكس (BX Arabia)", region: "الزرقاء" },
  { key: "الزرقا", city: "الزرقاء", driver: "بي اكس (BX Arabia)", region: "الزرقاء" },
  { key: "ياجوز", city: "الزرقاء / ياجوز", driver: "بي اكس (BX Arabia)", region: "الزرقاء" },
  { key: "الهاشمية", city: "الزرقاء / الجامعة الهاشمية", driver: "بي اكس (BX Arabia)", region: "الزرقاء" },
  { key: "الرصيفة", city: "الرصيفة", driver: "بي اكس (BX Arabia)", region: "الزرقاء" },
  
  // West & North Amman -> Driver Ali
  { key: "صويلح", city: "صويلح", driver: "علي", region: "شمال عمان" },
  { key: "طبربور", city: "طبربور", driver: "علي", region: "شمال عمان" },
  { key: "ضاحية الرشيد", city: "ضاحية الرشيد", driver: "علي", region: "شمال عمان" },
  { key: "خلدا", city: "خلدا", driver: "علي", region: "غرب عمان" },
  { key: "الشميساني", city: "الشميساني", driver: "علي", region: "وسط عمان" },
  { key: "الشمساني", city: "الشميساني", driver: "علي", region: "وسط عمان" },
  { key: "دير غبار", city: "دير غبار", driver: "علي", region: "غرب عمان" },
  { key: "تلاع العلي", city: "تلاع العلي", driver: "علي", region: "غرب عمان" },
  { key: "الجبيهة", city: "الجبيهة", driver: "علي", region: "شمال عمان" },
  { key: "شفا بدران", city: "شفا بدران", driver: "علي", region: "شمال عمان" },
  { key: "عبدون", city: "عبدون", driver: "علي", region: "غرب عمان" },
  { key: "الصويفية", city: "الصويفية", driver: "علي", region: "غرب عمان" },
  { key: "ابو نصير", city: "ابو نصير", driver: "علي", region: "شمال عمان" },
  { key: "البيادر", city: "بيادر وادي السير", driver: "علي", region: "غرب عمان" },
  { key: "ضاحية الاستقلال", city: "ضاحية الاستقلال", driver: "علي", region: "وسط عمان" },
  { key: "ضاحية الاقصى", city: "ضاحية الأقصى", driver: "علي", region: "وسط عمان" },
  { key: "اللويبده", city: "جبل اللويبدة", driver: "علي", region: "وسط عمان" },

  // South & East Amman -> Driver Khalid
  { key: "ابو علندا", city: "ابو علندا", driver: "خالد", region: "جنوب شرق عمان" },
  { key: "القويسمة", city: "القويسمة", driver: "خالد", region: "جنوب شرق عمان" },
  { key: "مرج الحمام", city: "مرج الحمام", driver: "خالد", region: "جنوب عمان" },
  { key: "جاوا", city: "جاوا", driver: "خالد", region: "جنوب عمان" },
  { key: "اليادودة", city: "اليادودة", driver: "خالد", region: "جنوب عمان" },
  { key: "اليادوده", city: "اليادودة", driver: "خالد", region: "جنوب عمان" },
  { key: "سحاب", city: "سحاب", driver: "خالد", region: "شرق عمان" },
  { key: "البنيات", city: "البنيات", driver: "خالد", region: "جنوب عمان" },
  { key: "خريبة السوق", city: "خريبة السوق", driver: "خالد", region: "جنوب عمان" },
  { key: "المقابلين", city: "المقابلين", driver: "خالد", region: "جنوب عمان" },
  { key: "المنارة", city: "المنارة", driver: "خالد", region: "شرق عمان" },
  { key: "المناره", city: "المنارة", driver: "خالد", region: "شرق عمان" },
  { key: "حي الصحابة", city: "حي الصحابة", driver: "خالد", region: "جنوب عمان" },

  // Palestine / Jerusalem / External
  { key: "بيت حنينا", city: "القدس - بيت حنينا", driver: "شركة خارجية", region: "فلسطين" },
  { key: "القدس", city: "القدس", driver: "شركة خارجية", region: "فلسطين" },
  { key: "رام الله", city: "رام الله", driver: "شركة خارجية", region: "فلسطين" },
];

const KNOWN_REPS_MAPPING: { pattern: RegExp; repName: string; source: string }[] = [
  { pattern: /(?:^|[^\p{L}\p{N}])صابرين(?:[^\p{L}\p{N}]|$)/u, repName: "صابرين", source: "مبيعات مباشرة (Sales)" },
  { pattern: /(?:^|[^\p{L}\p{N}])رشا(?:[^\p{L}\p{N}]|$)/u, repName: "رشا (مديرة المبيعات)", source: "مبيعات مباشرة (Sales VIP)" },
  // Ensure "حنين" does not match "بيت حنينا"
  { pattern: /(?<!بيت\s+)(?:^|[^\p{L}\p{N}])حنين(?:[^\p{L}\p{N}]|$)(?!ا)/u, repName: "حنين", source: "سوشال ميديا" },
  { pattern: /(?:^|[^\p{L}\p{N}])حنان(?:[^\p{L}\p{N}]|$)/u, repName: "حنان", source: "مبيعات مباشرة (Sales VIP)" },
  { pattern: /(?:^|[^\p{L}\p{N}])حمزة(?:[^\p{L}\p{N}]|$)/u, repName: "حمزة - سارة", source: "مبيعات مباشرة" },
  { pattern: /(?:^|[^\p{L}\p{N}])سارة(?:[^\p{L}\p{N}]|$)/u, repName: "سارة", source: "مبيعات مباشرة" },
  { pattern: /(?:^|[^\p{L}\p{N}])[آا]ية(?:[^\p{L}\p{N}]|$)/u, repName: "آية", source: "مبيعات مباشرة" },
  { pattern: /(?:^|[^\p{L}\p{N}])سنتر(?:[^\p{L}\p{N}]|$)/u, repName: "السنتر", source: "مبيعات مباشرة" },
];

function normalizeArabicDigits(str: string): string {
  const easternDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return str.replace(/[٠-٩]/g, (w) => {
    const idx = easternDigits.indexOf(w);
    return idx !== -1 ? idx.toString() : w;
  });
}

export function parseWhatsAppOrderText(raw: string): ParsedWhatsAppOrder {
  const cleanRaw = raw.trim();
  const normalized = normalizeArabicDigits(cleanRaw);
  const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Phone number extraction (Jordanian formats: +962 7..., 07..., international: 054..., +44...)
  let phone = "";
  for (const line of lines) {
    const jordanMatch = line.match(/(?:\+?962\s*|0)?(7[789][\s\d]{7,12})/);
    if (jordanMatch) {
      const rawDigits = jordanMatch[0].replace(/\D/g, '');
      if (rawDigits.startsWith('962')) {
        phone = '0' + rawDigits.slice(3);
      } else if (!rawDigits.startsWith('0') && rawDigits.length === 9) {
        phone = '0' + rawDigits;
      } else {
        phone = rawDigits;
      }
      if (phone.startsWith('07') && phone.length === 10) {
        break;
      }
    }
  }

  // Fallback for international / Jerusalem / Palestine
  if (!phone) {
    for (const line of lines) {
      const intMatch = line.match(/(\+?\d[\d\s-]{8,15}\d)/);
      if (intMatch) {
        const d = intMatch[0].replace(/\D/g, '');
        if (d.length >= 9) {
          phone = intMatch[0].replace(/\s+/g, ' ').trim();
          break;
        }
      }
    }
  }

  // 2. Price extraction (Anti-date collision & downpayment/debt detection)
  let totalAmount = 0;
  let cashAmount = 0;
  let creditAmount = 0;

  const downpaymentMatch = normalized.match(/(?:دفعه|دفعة)\s*:?\s*(\d+(?:\.\d+)?)\s*(?:د|د\.أ|دينار|JD)?/);
  const debtMatch = normalized.match(/(?:باقي\s*ذمة|ذمة|متبقي)\s*:?\s*(\d+(?:\.\d+)?)\s*(?:د|د\.أ|دينار|JD)?/);

  if (downpaymentMatch) cashAmount = parseFloat(downpaymentMatch[1]);
  if (debtMatch) creditAmount = parseFloat(debtMatch[1]);

  for (const line of lines) {
    // Avoid date slashes or hyphens (e.g. 14/9, 10/9, 12-9)
    if (line.includes('/') || line.includes('-') || /\d{1,2}[\/\.-]\d{1,2}/.test(line)) {
      continue;
    }
    // Avoid phone numbers or lines containing phone format
    if (phone && (line.replace(/\D/g, '').includes(phone.slice(-7)) || line.startsWith('+') || /(?:\+?962|07[789])/.test(line))) {
      continue;
    }

    // Lone number on line (e.g. "45", "95", "12", "37 د", "24 د")
    const loneMatch = line.match(/^\(?(\d+(?:\.\d+)?)\s*(?:د|د\.أ|دينار|JD)?\)?$/);
    // Explicit price keyword
    const explicitMatch = line.match(/(?:السعر|المبلغ|المجموع|قيمة الأوردر|قيمة الاوردر|الاوردر|أوردر|اوردر)\s*:?\s*\(?(\d+(?:\.\d+)?)\s*(?:د|د\.أ|دينار|JD)?\)?/);

    const target = loneMatch || explicitMatch;
    if (target) {
      const val = parseFloat(target[1]);
      // Ignore sizes like 100مل, 250مل, 300مل, 500مل
      if ([100, 250, 300, 500, 1000].includes(val) && line.includes('مل')) {
        continue;
      }
      if (val > 0 && val < 3000) {
        totalAmount = val;
        break;
      }
    }
  }

  if (totalAmount === 0 && (cashAmount > 0 || creditAmount > 0)) {
    totalAmount = cashAmount + creditAmount;
  }
  if (cashAmount === 0 && creditAmount === 0 && totalAmount > 0) {
    cashAmount = totalAmount;
  }

  // 3. Known Reps & Source Channel
  let repName = "مبيعات عامة";
  let source = "واتساب";

  for (const mapping of KNOWN_REPS_MAPPING) {
    if (mapping.pattern.test(normalized)) {
      repName = mapping.repName;
      source = mapping.source;
      break;
    }
  }

  if (normalized.includes("سوشال ميديا") || normalized.includes("سوشيال") || normalized.includes("صفحة")) {
    source = "سوشال ميديا";
  } else if (normalized.includes("Sales") || normalized.includes("مبيعات")) {
    source = "مبيعات مباشرة";
  }

  // 4. Payment terms & Credit / Installment
  let paymentMethod: 'cash_on_delivery' | 'installment' | 'cliq' = 'cash_on_delivery';
  let installmentNotes: string | undefined = undefined;

  if (creditAmount > 0) {
    paymentMethod = "installment";
    installmentNotes = `دفعة كاش (${cashAmount} د) + متبقي ذمة (${creditAmount} د)`;
  } else if (lines.some(l => l === "شهر") || normalized.includes("خلال الشهر") || normalized.includes("حجز شهر")) {
    paymentMethod = "installment";
    installmentNotes = "دفع آجل / استحقاق شهر";
  } else if (lines.some(l => l === "اسبوع" || l === "أسبوع")) {
    paymentMethod = "installment";
    installmentNotes = "دفع آجل / استحقاق أسبوع";
  } else if (normalized.includes("كليك") || normalized.toLowerCase().includes("cliq") || normalized.includes("حوالة")) {
    paymentMethod = "cliq";
    installmentNotes = "مدفوع إلكترونياً (CliQ / حوالة)";
  }

  const isReservation = normalized.includes("حجز") || normalized.includes("حجزز");

  // 5. Customer Name & Type extraction
  const daysOfWeek = ["السبت", "الأحد", "الاحد", "الاثنين", "الإثنين", "الثلاثاء", "الأربعاء", "الاربعاء", "الخميس", "الجمعة"];
  const metadataTerms = ["sales", "sales vip", "شهر", "اسبوع", "أسبوع", "حجز", "حجزز", "كاش", "ذمة", "ذمم", "توصيل", "الاوردر", "الأوردر", "السعر", "المبلغ", "الموقع", "قطر", "px"];
  const singleRepSignatures = ["صابرين", "رشا", "حنان", "حنين", "سنتر", "سارة", "حمزة"];

  const isPhoneLine = (l: string) => {
    const digits = l.replace(/\D/g, '');
    return digits.length >= 8 && (/^[\+\d\s().-]{7,}$/.test(l) || digits.startsWith('07') || digits.startsWith('962') || digits.startsWith('05'));
  };

  const isDateLine = (l: string) => {
    return daysOfWeek.some(d => l.includes(d)) || /\d{1,2}[\/\.-]\d{1,2}/.test(l);
  };

  let candidateName = "عميل واتساب";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip date lines
    if (isDateLine(line)) continue;
    // Skip phone lines
    if (isPhoneLine(line)) continue;

    // Strip attached phone numbers (e.g. "صالون ميسون 0796130234")
    const cleanLine = line
      .replace(/(?:\+?962\s*|0)?7[789][\s\d]{7,12}/g, '')
      .replace(/[\+0]\d{8,}/g, '')
      .trim();

    if (!cleanLine || cleanLine.length < 2) continue;

    const lower = cleanLine.toLowerCase();
    if (metadataTerms.includes(lower)) continue;

    // If it's a lone single rep signature in the last 3 lines, skip
    if (i >= lines.length - 3 && singleRepSignatures.includes(cleanLine)) continue;

    // Skip price lines
    if (/^\d+\s*(?:د|د\.أ|دينار|JD)?$/.test(cleanLine)) continue;

    // Skip obvious product names
    if (["شامبو", "بلسم", "ثيربي", "ثيرابي", "بروتين", "بكج", "تريتمنت", "ماسك", "سيروم", "مورفوسيس", "ديفاي"].some(p => cleanLine.includes(p))) {
      continue;
    }

    // Skip notes / instructions
    if (["تواصل", "واتس", "ساعة", "ساعه", "صباحا", "مساء", "الموقع", "توصيل", "ملاحظة", "ملاحظه"].some(w => cleanLine.includes(w))) {
      continue;
    }

    candidateName = cleanLine;
    break;
  }

  const isSalon = ["صالون", "مركز", "بيوتي", "سبا", "مشغل"].some(w => candidateName.includes(w));
  const customerType: 'salon' | 'individual' = isSalon ? 'salon' : 'individual';

  // 6. City, Address & Recommended Logistics / Driver
  let detectedCity = "عمان";
  let suggestedDriver = "علي";
  let detectedAddress = "عمان";

  for (const loc of JORDAN_LOCATIONS) {
    if (normalized.includes(loc.key)) {
      detectedCity = loc.city;
      suggestedDriver = loc.driver;
      detectedAddress = loc.city;
      break;
    }
  }

  // Look for detailed address line
  for (const line of lines) {
    if (["شارع", "عمارة", "عماره", "قرب", "حي", "مقابل", "جبل", "خلف", "دوار", "منطقة", "مجمع"].some(w => line.includes(w))) {
      detectedAddress = line;
      break;
    }
  }

  // 7. Products line items extraction
  const items: ParsedOrderItem[] = [];
  const productKeywords = [
    "ثيربي", "ثيرابي", "ثيرابى",
    "شامبو", "بلسم", "سيروم", "ماسك", "بكج", "البكج", "بكجات",
    "مورفوسيس", "مورفوزيس", "مورفوسيز",
    "ديفاي", "ماركوجا", "ماراكوجا", "بروتين", "sp", "تريتمنت",
    "ليف أن", "ليف ان", "مفتح حراشف", "تفتيح حراشف", "سشوار", "مملس", "عدسات"
  ];

  for (const line of lines) {
    const lLower = line.toLowerCase();
    if (productKeywords.some(kw => lLower.includes(kw)) && !line.startsWith("Sales") && !line.startsWith("دفعه") && !line.startsWith("باقي")) {
      if (line.includes("السعر") || line.includes("المبلغ") || line.includes("قيمة الأوردر") || line.includes("قيمة الاوردر")) {
        continue;
      }

      // Split compound products separated by '+' (e.g. "بكج ارغان هايدرو+ ١٠٠ مل تريتمنت" or
      // "2شامبو بلازما+ليف أن +تريتمنت 100مل") — but NOT inside brackets, where the '+' lists what
      // is in a package rather than separating two products. A plain split turned the single line
      // "بكج رباعي بلازما [شامبو + بلسم + تريتمنت + سيروم]" into four separate items of one each,
      // so one package was ordered, picked and invoiced as four products.
      const parts = splitOutsideBrackets(line);
      for (const part of parts) {
        let qty = 1;
        let pName = part;

        // Volume at start: e.g. "300مل ثيربي" -> volume 300ml, qty 1, name "ثيربي (300 مل)"
        const volMatch = part.match(/^(\d+)\s*(مل|لتر)\s*(.*)/);
        // Dual Arabic prefix: e.g. "علبتين ثيربي", "بكجين"
        const dualMatch = part.match(/^(علبتين|عبوتين|قطعتين|يكجين|بكجين)\s*(.*)/);
        // Explicit numeric quantity at start: e.g. "2 شامبو", "عدد 2 لتر"
        const numMatch = part.match(/^(?:عدد\s*)?(\d+)\s*(.*)/);

        if (volMatch) {
          qty = 1;
          pName = volMatch[3] ? `${volMatch[3].trim()} (${volMatch[1]} ${volMatch[2]})` : part;
        } else if (dualMatch) {
          qty = 2;
          pName = dualMatch[2].trim();
        } else if (numMatch) {
          qty = parseInt(numMatch[1], 10);
          pName = numMatch[2].trim();
        }

        items.push({
          quantity: qty,
          productName: pName
        });
      }
    }
  }

  const itemsSummary = items.length > 0 
    ? items.map(it => `${it.quantity > 1 ? it.quantity + ' ' : ''}${it.productName}`).join(' + ')
    : "مستحضرات عناية وتجميل";

  // 8. Delivery Notes
  const notesList: string[] = [];
  for (const line of lines) {
    if (["توصيل", "ساعة", "ساعه", "صباحا", "مساء", "واتس", "ملاحظة", "ملاحظه", "ستوري", "ترشيح", "قبل", "بعد", "دوار"].some(term => line.includes(term))) {
      if (!productKeywords.some(p => line.includes(p)) && !line.includes("السعر") && !line.includes("المبلغ")) {
        notesList.push(line);
      }
    }
  }

  const deliveryNotes = notesList.length > 0 ? notesList.join(' / ') : undefined;

  return {
    customerName: candidateName,
    customerType,
    phone,
    city: detectedCity,
    address: detectedAddress,
    items,
    itemsSummary,
    totalAmount,
    cashAmount,
    creditAmount,
    repName,
    source,
    isReservation,
    paymentMethod,
    installmentNotes,
    deliveryNotes,
    suggestedDriver,
    rawText: cleanRaw,
  };
}
