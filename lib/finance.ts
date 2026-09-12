import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Finance data layer. Deliberately avoids deep nested
 * PostgREST embeds across ambiguous foreign keys (orders has FOUR FKs to
 * profiles alone: rep_id/created_by/updated_by/assigned_driver_id) in favor
 * of a few flat, targeted queries joined in application code — slightly
 * more code, but its correctness doesn't depend on guessing PostgREST's
 * auto-generated constraint names for a project this can't be tested
 * against live.
 */
export interface UiInvoiceItem {
  name: string;
  qty: number;
  price: number;
  total: number;
}

export interface UiInvoice {
  id: string; // invoice_number
  order_id: string; // order_number
  customer_name: string;
  customer_phone: string;
  city: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  status: string;
  payment_method: string;
  issued_date: string;
  due_date: string;
  rep_name: string;
  items: UiInvoiceItem[];
}

export async function listInvoices(supabase: SupabaseClient): Promise<UiInvoice[]> {
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, order_id, customer_id, subtotal, discount_amount, total_amount, status, due_date, issued_at")
    .order("issued_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  if (!invoices || invoices.length === 0) return [];

  const orderIds = [...new Set(invoices.map((i) => i.order_id))];
  const customerIds = [...new Set(invoices.map((i) => i.customer_id))];
  const invoiceIds = invoices.map((i) => i.id);

  const [{ data: orders, error: ordersErr }, { data: customers, error: customersErr }, { data: payments, error: paymentsErr }, { data: items, error: itemsErr }] =
    await Promise.all([
      supabase.from("orders").select("id, order_number, payment_method, rep_id").in("id", orderIds),
      supabase.from("customers").select("id, name, phone, city").in("id", customerIds),
      supabase.from("payments").select("invoice_id, amount").in("invoice_id", invoiceIds),
      supabase.from("order_items").select("order_id, product_name_raw, quantity, unit_price, total_price").in("order_id", orderIds),
    ]);
  if (ordersErr) throw ordersErr;
  if (customersErr) throw customersErr;
  if (paymentsErr) throw paymentsErr;
  if (itemsErr) throw itemsErr;

  const repIds = [...new Set((orders || []).map((o) => o.rep_id).filter(Boolean))];
  const { data: reps, error: repsErr } = repIds.length
    ? await supabase.from("profiles").select("id, full_name_ar").in("id", repIds)
    : { data: [], error: null };
  if (repsErr) throw repsErr;

  const orderById = new Map((orders || []).map((o) => [o.id, o]));
  const customerById = new Map((customers || []).map((c) => [c.id, c]));
  const repById = new Map((reps || []).map((r) => [r.id, r]));

  const paidByInvoice = new Map<string, number>();
  for (const p of payments || []) {
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) || 0) + Number(p.amount));
  }

  const itemsByOrder = new Map<string, UiInvoiceItem[]>();
  for (const it of items || []) {
    const list = itemsByOrder.get(it.order_id) || [];
    list.push({
      name: it.product_name_raw,
      qty: it.quantity,
      price: Number(it.unit_price) || 0,
      total: Number(it.total_price) || 0,
    });
    itemsByOrder.set(it.order_id, list);
  }

  return invoices.map((inv): UiInvoice => {
    const order = orderById.get(inv.order_id);
    const customer = customerById.get(inv.customer_id);
    const rep = order?.rep_id ? repById.get(order.rep_id) : undefined;

    return {
      id: inv.invoice_number,
      order_id: order?.order_number || "",
      customer_name: customer?.name || "عميل",
      customer_phone: customer?.phone || "",
      city: customer?.city || "",
      subtotal: Number(inv.subtotal) || 0,
      discount: Number(inv.discount_amount) || 0,
      total_amount: Number(inv.total_amount) || 0,
      paid_amount: paidByInvoice.get(inv.id) || 0,
      status: inv.status,
      payment_method: order?.payment_method || "cash_on_delivery",
      issued_date: inv.issued_at,
      due_date: inv.due_date,
      rep_name: rep?.full_name_ar || "—",
      items: itemsByOrder.get(inv.order_id) || [],
    };
  });
}

export interface RecordPaymentInput {
  invoice_id: string; // invoice_number, as shown in the UI
  amount: number;
  payment_method: string;
  reference_number?: string;
  notes?: string;
}

const VALID_PAYMENT_METHODS = new Set(["cash_on_delivery", "bank_transfer", "cliq", "installment"]);

export async function recordInvoicePayment(supabase: SupabaseClient, input: RecordPaymentInput) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("المبلغ المدفوع غير صالح.");

  const { data: invoice, error: findError } = await supabase
    .from("invoices")
    .select("id")
    .eq("invoice_number", input.invoice_id)
    .maybeSingle();
  if (findError) throw findError;
  if (!invoice) throw new Error("لم يتم العثور على الفاتورة المطلوبة.");

  // The finance UI's payment method options (cliq/cash/bank_transfer/check)
  // don't map 1:1 onto payment_method_enum (cash_on_delivery/bank_transfer/
  // cliq/installment) — normalize rather than reject a legitimate payment
  // just because "cash" and "check" aren't enum members.
  const methodMap: Record<string, string> = { cash: "cash_on_delivery", check: "bank_transfer" };
  const normalizedMethod = methodMap[input.payment_method] || input.payment_method;
  const paymentMethod = VALID_PAYMENT_METHODS.has(normalizedMethod) ? normalizedMethod : "cash_on_delivery";

  const { data, error } = await supabase.rpc("record_payment", {
    p_invoice_id: invoice.id,
    p_amount: amount,
    p_payment_method: paymentMethod,
    p_reference_number: input.reference_number || null,
    p_notes: input.notes || null,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("تعذر تسجيل الدفعة.");
  return { status: row.invoice.status as string, paidAmount: Number(row.paid_amount) };
}
