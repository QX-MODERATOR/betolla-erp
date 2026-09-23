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
