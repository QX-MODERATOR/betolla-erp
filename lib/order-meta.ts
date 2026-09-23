// Where an order's customer came from, and what kind of customer it is — both required on every
// order taken on /sales (2026-09-23).
//
// مصدر البيانات: a customer picked from our own CRM list (the numbers management hands out) is
// always "Data Center", and the rep cannot change it — that is how the company sees its data turning
// into sales. Only a customer the rep adds herself ("+ Add New Phone/Lead") may say where she came
// from: social media, our Data Center, or the rep's own personal number.
//
// Stored in orders.business_details (data_source, customer_segment), which is the order payload as
// sent; migration 049 reads them back into the order document.
export const DATA_SOURCES = {
  data_center: "Data Center",
  social_media: "سوشال ميديا",
  personal: "شخصي (من رقم المندوب الخاص)",
} as const;
export type DataSource = keyof typeof DATA_SOURCES;

export const CUSTOMER_SEGMENTS = {
  B2B: "B2B — أعمال (صالون، صيدلية، تاجر)",
  B2C: "B2C — مستهلك مباشر",
} as const;
export type CustomerSegment = keyof typeof CUSTOMER_SEGMENTS;

export const isDataSource = (v: unknown): v is DataSource => typeof v === "string" && v in DATA_SOURCES;
export const isCustomerSegment = (v: unknown): v is CustomerSegment => typeof v === "string" && v in CUSTOMER_SEGMENTS;
export const dataSourceLabel = (v: unknown) => (isDataSource(v) ? DATA_SOURCES[v] : "");
export const segmentLabel = (v: unknown) => (isCustomerSegment(v) ? v : "");

// مصدر العميل — the channel the customer actually came through (2026-09-23, the daily report).
// Required on every /sales order; the two Ads options also name the campaign (mkt_campaigns).
// Separate from مصدر البيانات above: that one says whose data the number was, this one how the
// customer reached us.
export const CUSTOMER_CHANNELS = {
  plasma_ads: "Plasma Ads",
  argan_ads: "Argan Ads",
  organic: "Organic",
  whatsapp: "WhatsApp",
  phone_sales: "Phone Sales",
  old_customer: "Old Customer",
  event: "Event",
  other: "غيره",
} as const;
export type CustomerChannel = keyof typeof CUSTOMER_CHANNELS;
export const AD_CHANNELS: readonly string[] = ["plasma_ads", "argan_ads"];
export const isCustomerChannel = (v: unknown): v is CustomerChannel => typeof v === "string" && v in CUSTOMER_CHANNELS;
export const channelLabel = (v: unknown, other?: string | null) =>
  v === "other" && other ? `غيره: ${other}` : isCustomerChannel(v) ? CUSTOMER_CHANNELS[v] : "";

// Why an order was cancelled from the office (required on /orders; migration 051 stores it).
export const CANCEL_REASONS = {
  price: "السعر",
  not_interested: "غير مهتم",
  no_answer: "لم يرد",
  duplicate: "طلب مكرر",
  delivery_problem: "مشكلة توصيل",
  unavailable: "غير متوفر",
  other: "غيره",
} as const;
export type CancelReason = keyof typeof CANCEL_REASONS;
export const isCancelReason = (v: unknown): v is CancelReason => typeof v === "string" && v in CANCEL_REASONS;

// An operational problem that affected the sale (migration 051: business_order_issue).
export const ORDER_ISSUES = {
  out_of_stock: "Out of Stock",
  delivery_delay: "تأخير توصيل",
  product_unavailable: "منتج غير متوفر",
  price_issue: "مشكلة سعر",
  other: "غيره",
} as const;
export type OrderIssue = keyof typeof ORDER_ISSUES;
export const isOrderIssue = (v: unknown): v is OrderIssue => typeof v === "string" && v in ORDER_ISSUES;
