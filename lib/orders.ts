import type { SupabaseClient } from "@supabase/supabase-js";
import { parseWhatsAppOrderText } from "@/lib/order-parser";

/**
 * Server-side Orders data layer. All reads/writes go through the caller's
 * own Supabase session (RLS-scoped — see supabase/migrations/006_orders_persistence.sql),
 * never a service-role bypass, so a request can never see or touch more
 * than its role is allowed to.
 *
 * This is the flat shape the existing Orders UI (app/orders/page.tsx) was
 * already built around, kept as-is on purpose — Phase 2 replaces the fake
 * backend underneath the screen, not the screen itself.
 */
export interface UiOrder {
  id: string; // order_number — the human-facing identifier used everywhere in the UI
  customer_name: string;
  customer_phone: string;
  city: string;
  address: string;
  items_summary: string;
  total_amount: number;
  source: string;
  status: string;
  order_date: string;
  payment_method: string;
  installment_notes: string | null;
}

export const ORDER_STATUS_ADVANCE_MAP: Record<string, string> = {
  draft: "confirmed",
  confirmed: "processing",
  processing: "shipped",
  shipped: "delivered",
};

type CustomerJoin = { name: string | null; phone: string | null; city: string | null; address: string | null };

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  order_date: string;
  source: string;
  total_amount: number;
  payment_method: string;
  notes: string | null;
  customers: CustomerJoin | CustomerJoin[] | null;
}

function normalizeCustomerJoin(customers: OrderRow["customers"]): CustomerJoin {
  const c = Array.isArray(customers) ? customers[0] : customers;
  return {
    name: c?.name ?? null,
    phone: c?.phone ?? null,
    city: c?.city ?? null,
    address: c?.address ?? null,
  };
}

function mapRowToUiOrder(row: OrderRow): UiOrder {
  const customer = normalizeCustomerJoin(row.customers);
  return {
    id: row.order_number,
    customer_name: customer.name || "عميل",
    customer_phone: customer.phone || "",
    city: customer.city || "",
    address: customer.address || "",
    items_summary: row.notes || "منتجات تجميل",
    total_amount: Number(row.total_amount) || 0,
    source: row.source || "manual",
    status: row.status,
    order_date: row.order_date,
    payment_method: row.payment_method,
    installment_notes: row.payment_method === "installment" ? "دفع آجل / استحقاق شهر" : null,
  };
}

const ORDER_SELECT = "id, order_number, status, order_date, source, total_amount, payment_method, notes, customers(name, phone, city, address)";

export async function listOrders(supabase: SupabaseClient): Promise<UiOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  return ((data as unknown as OrderRow[]) || []).map(mapRowToUiOrder);
}

export interface CreateOrderFromTextInput {
  rawText: string;
}

export interface CreateOrderStructuredInput {
  customer_name?: string;
  customer_phone: string;
  city?: string;
  address?: string;
  items_summary?: string;
  total_amount?: number;
  payment_method?: "cash_on_delivery" | "bank_transfer" | "cliq" | "installment";
  source?: string;
  status?: string;
}

const VALID_INITIAL_STATUSES = new Set(["draft", "confirmed"]);
const VALID_PAYMENT_METHODS = new Set(["cash_on_delivery", "bank_transfer", "cliq", "installment"]);

export async function createOrderFromWhatsAppText(
  supabase: SupabaseClient,
  input: CreateOrderFromTextInput
): Promise<UiOrder> {
  const rawText = input.rawText?.trim();
  if (!rawText) throw new Error("رسالة الواتساب فارغة.");

  const parsed = parseWhatsAppOrderText(rawText);
  if (!parsed.phone) {
    throw new Error("تعذر استخراج رقم هاتف صالح من نص الرسالة.");
  }

  const { data, error } = await supabase.rpc("create_order_with_items", {
    p_customer_phone: parsed.phone,
    p_customer_name: parsed.customerName,
    p_customer_city: parsed.city,
    p_customer_address: parsed.address,
    p_lead_source: "whatsapp",
    p_rep_name_raw: parsed.repName,
    p_source: parsed.source,
    p_status: parsed.isReservation ? "draft" : "confirmed",
    p_total_amount: parsed.totalAmount,
    p_payment_method: parsed.paymentMethod,
    p_delivery_address: parsed.address,
    p_delivery_city: parsed.city,
    p_notes: parsed.itemsSummary,
    p_raw_whatsapp_text: parsed.rawText,
    p_items: parsed.items.map((it) => ({
      product_name_raw: it.productName,
      quantity: it.quantity,
      // The WhatsApp text only reliably yields an order-level total, not a
      // trustworthy per-line price — recording 0 here rather than a
      // fabricated split keeps order_items honest about what we actually
      // know versus what's shown as the order's real total_amount.
      unit_price: 0,
      total_price: 0,
    })),
  });

  if (error) throw error;
  return mapRowToUiOrder({ ...data, customers: { name: parsed.customerName, phone: parsed.phone, city: parsed.city, address: parsed.address } });
}

export async function createStructuredOrder(
  supabase: SupabaseClient,
  input: CreateOrderStructuredInput
): Promise<UiOrder> {
  const phone = input.customer_phone?.trim();
  if (!phone) throw new Error("رقم هاتف العميل مطلوب.");

  const status = input.status && VALID_INITIAL_STATUSES.has(input.status) ? input.status : "confirmed";
  const paymentMethod = input.payment_method && VALID_PAYMENT_METHODS.has(input.payment_method) ? input.payment_method : "cash_on_delivery";
  const totalAmount = Number(input.total_amount) || 0;
  if (totalAmount < 0) throw new Error("المبلغ الإجمالي غير صالح.");

  const { data, error } = await supabase.rpc("create_order_with_items", {
    p_customer_phone: phone,
    p_customer_name: input.customer_name || "عميل مباشر",
    p_customer_city: input.city || "عمان",
    p_customer_address: input.address || "",
    p_lead_source: "sales",
    p_rep_name_raw: null,
    p_source: input.source || "manual",
    p_status: status,
    p_total_amount: totalAmount,
    p_payment_method: paymentMethod,
    p_delivery_address: input.address || "",
    p_delivery_city: input.city || "عمان",
    p_notes: input.items_summary || "منتجات تجميل",
    p_raw_whatsapp_text: null,
    p_items: [],
  });

  if (error) throw error;
  return mapRowToUiOrder({
    ...data,
    customers: { name: input.customer_name || "عميل مباشر", phone, city: input.city || "عمان", address: input.address || "" },
  });
}

export async function advanceOrderStatus(
  supabase: SupabaseClient,
  orderNumber: string,
  targetStatus: string
): Promise<UiOrder> {
  const { data: existing, error: findError } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (findError) throw findError;
  if (!existing) throw new Error("الطلب غير موجود.");

  const { data, error } = await supabase.rpc("update_order_status", {
    p_order_id: (existing as unknown as OrderRow).id,
    p_new_status: targetStatus,
    p_notes: null,
  });

  if (error) throw error;
  return mapRowToUiOrder({ ...data, customers: (existing as unknown as OrderRow).customers });
}
