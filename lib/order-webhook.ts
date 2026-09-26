// Landing-page order intake: validation and package mapping, kept free of any Supabase/Next
// import so it can be unit tested without a database (scripts/test_order_webhook.mjs).
//
// The landing page (a separate Firebase project) sells the same two PLASMA bundles the ERP
// already stocks (migration 037) at a further-discounted checkout price — 30/20 JOD instead of
// the bundle's own catalog price of 40/25 JOD. That is intentional (a promo-style price, exactly
// like a hand-typed order total or a promo code already produces elsewhere in this system) and is
// NOT a bug: the order line records what the customer actually paid, the bundle's retail_price is
// unaffected, and business_create_order never compares the two.

export class OrderWebhookError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// The exact name_ar strings from migration 037 — business_resolve_product matches by exact
// name (case-insensitive) first, so these must stay byte-for-byte in sync with that migration.
export const LANDING_PACKAGE_CATALOG: Record<string, { nameAr: string; unitPrice: number }> = {
  "plasma-complete": {
    nameAr: "بكج رباعي بلازما [شامبو + بلسم + تريتمنت + سيروم]",
    unitPrice: 30,
  },
  "plasma-duo": {
    nameAr: "بكج ثنائي بلازما [شامبو + بلسم]",
    unitPrice: 20,
  },
};

const MAX_QUANTITY = 10;
const MAX_NAME = 80;
const MAX_ADDRESS = 200;
const MAX_NOTES = 300;
const MAX_CITY = 60;

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

// Same normalization the landing page itself already validates client- and server-side; applied
// again here since this call crosses a network/trust boundary between two separate systems.
export function normalizeJordanianPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let digits = raw.trim().replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (digits.startsWith("+962")) digits = digits.slice(4);
  else if (digits.startsWith("962")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  else if (digits.startsWith("+")) return null;
  if (!/^7[789]\d{7}$/.test(digits)) return null;
  return "0" + digits; // ERP customers.phone convention is local 07XXXXXXXX (see prepareLead).
}

export interface WebhookOrderInput {
  packageId: unknown;
  quantity: unknown;
  fullName: unknown;
  phone: unknown;
  city: unknown; // the governorate label, Arabic or English
  address: unknown;
  notes: unknown;
  language: unknown;
}

export interface ValidatedWebhookOrder {
  packageId: string;
  itemName: string;
  unitPrice: number;
  quantity: number;
  totalAmount: number;
  customerName: string;
  customerPhone: string;
  city: string;
  address: string;
  notes: string;
  language: "ar" | "en";
}

export function validateWebhookOrder(input: WebhookOrderInput): ValidatedWebhookOrder {
  const pkg = typeof input.packageId === "string" ? LANDING_PACKAGE_CATALOG[input.packageId] : undefined;
  if (!pkg) throw new OrderWebhookError("UNKNOWN_PACKAGE");

  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new OrderWebhookError("INVALID_QUANTITY");
  }

  const customerName = cleanText(input.fullName, MAX_NAME);
  if (!customerName) throw new OrderWebhookError("MISSING_NAME");

  const customerPhone = normalizeJordanianPhone(input.phone);
  if (!customerPhone) throw new OrderWebhookError("INVALID_PHONE");

  const city = cleanText(input.city, MAX_CITY);
  if (!city) throw new OrderWebhookError("MISSING_CITY");

  const address = cleanText(input.address, MAX_ADDRESS);
  if (!address) throw new OrderWebhookError("MISSING_ADDRESS");

  const notes = cleanText(input.notes, MAX_NOTES);
  const language = input.language === "en" ? "en" : "ar";

  return {
    packageId: typeof input.packageId === "string" ? input.packageId : "",
    // Always the Arabic catalog name: it is what business_resolve_product matches on and what the
    // Arabic-speaking fulfillment/finance staff see on every receipt, regardless of the customer's
    // chosen storefront language.
    itemName: pkg.nameAr,
    unitPrice: pkg.unitPrice,
    quantity,
    totalAmount: pkg.unitPrice * quantity,
    customerName,
    customerPhone,
    city,
    address,
    notes,
    language,
  };
}
