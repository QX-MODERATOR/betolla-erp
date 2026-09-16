import { createServerClient } from './supabase/server';

/**
 * Removes every "[label: ...]" tag from a notes string, correctly matching
 * the tag's own closing bracket even when its content contains further
 * brackets (a naive [^\]]+ regex stops at the FIRST ']', which is exactly
 * how real order notes ended up with tags nested inside other tags —
 * each edit re-wrapped the previous, un-stripped tag instead of replacing it).
 */
export function stripBracketTag(text: string, label: string): string {
  const marker = `[${label}:`;
  let result = text;
  let start = result.indexOf(marker);
  while (start !== -1) {
    let depth = 0;
    let end = start;
    for (; end < result.length; end++) {
      if (result[end] === '[') depth++;
      else if (result[end] === ']') {
        depth--;
        if (depth === 0) {
          end++;
          break;
        }
      }
    }
    result = result.slice(0, start) + result.slice(end);
    start = result.indexOf(marker);
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

/** Reads a "[label: ...]" tag's content out of a notes string (nested-bracket safe), or null if absent. */
function extractBracketTag(text: string, label: string): string | null {
  const marker = `[${label}:`;
  const start = text.indexOf(marker);
  if (start === -1) return null;
  let depth = 0;
  let end = start;
  for (; end < text.length; end++) {
    if (text[end] === '[') depth++;
    else if (text[end] === ']') {
      depth--;
      if (depth === 0) {
        end++;
        break;
      }
    }
  }
  return text.slice(start + marker.length, end - 1).trim();
}

export interface DriverOrderRecord {
  id: string;
  dbId: string;
  customer_name: string;
  phone: string;
  area: string;
  address: string;
  products: string;
  order_total: number;
  cash_to_collect: number;
  receivables: number;
  payment_method: 'cash' | 'cliq';
  cliq_includes_delivery: boolean;
  delivery_fee: number;
  status: 'pending' | 'delivered' | 'returned' | 'postponed' | 'remaining';
  postpone_date?: string;
  return_reason?: string;
  driver?: string;
  notes?: string;
  order_date?: string;
}

export const DRIVERS_AVAILABLE = ['خالد', 'علي', 'BX Arabia'];

export interface DriverShiftClosure {
  isClosed: boolean;
  closedAt: string;
  notes: string;
  cashCollected: number;
  deliveredCount: number;
  returnedCount: number;
}

/**
 * Parses and normalizes an order row from Supabase into the standardized DriverOrderRecord
 */
export function normalizeOrderRow(row: any): DriverOrderRecord {
  const notesStr = row.notes || '';

  // Extract driver from notes if formatted like [السائق: خالد] or [السائق: BX Arabia]
  let driver = 'خالد';
  const driverMatch = notesStr.match(/\[السائق:\s*([^\]]+)\]/);
  if (driverMatch) {
    driver = driverMatch[1].trim();
  }

  // Extract products from notes if formatted like [المنتجات: ...]
  let products = 'منتجات العناية بالبشرة والشعر من بيتولا';
  const prodMatch = notesStr.match(/\[المنتجات:\s*([^\]]+)\]/);
  if (prodMatch) {
    products = prodMatch[1].trim();
  } else if (notesStr && !notesStr.includes('[السائق:')) {
    products = notesStr;
  }

  // Extract payment method & CliQ delivery details
  let paymentMethod: 'cash' | 'cliq' = row.payment_method === 'cliq' ? 'cliq' : 'cash';
  let cliqIncludesDelivery = false;
  let deliveryFee = Number(row.delivery_fee) || 0;

  if (notesStr.includes('CliQ') || notesStr.includes('كليك')) {
    paymentMethod = 'cliq';
    if (notesStr.includes('شامل') || notesStr.includes('0.000')) {
      cliqIncludesDelivery = true;
    }
  }

  const orderTotal = Number(row.total_amount) || Number(row.subtotal) || 0;

  // Calculate cash to collect
  let cashToCollect = orderTotal;
  if (paymentMethod === 'cliq') {
    cashToCollect = cliqIncludesDelivery ? 0 : (deliveryFee || 2.5);
  }

  // Map database status to driver status
  let status: 'pending' | 'delivered' | 'returned' | 'postponed' | 'remaining' = 'pending';
  if (row.status === 'delivered') {
    status = 'delivered';
  } else if (row.status === 'returned') {
    status = 'returned';
  } else if (notesStr.includes('مؤجل') || row.status === 'cancelled') {
    status = 'postponed';
  } else if (notesStr.includes('متبقي')) {
    status = 'remaining';
  }

  // Extract return reason or postponement date
  let returnReason = '';
  const returnMatch = notesStr.match(/\[سبب الإرجاع:\s*([^\]]+)\]/);
  if (returnMatch) returnReason = returnMatch[1].trim();

  let postponeDate = '';
  const postponeMatch = notesStr.match(/\[تاريخ التأجيل:\s*([^\]]+)\]/);
  if (postponeMatch) postponeDate = postponeMatch[1].trim();

  return {
    id: row.order_number || row.id,
    dbId: row.id,
    customer_name: row.customers?.name || 'عميل بيتولا',
    phone: row.customers?.phone || '0790000000',
    area: row.delivery_city || row.customers?.city || 'عمان',
    address: row.delivery_address || row.customers?.address || 'الموقع مسجل لدى المندوب',
    products,
    order_total: orderTotal,
    cash_to_collect: cashToCollect,
    receivables: 0,
    payment_method: paymentMethod,
    cliq_includes_delivery: cliqIncludesDelivery,
    delivery_fee: deliveryFee,
    status,
    postpone_date: postponeDate,
    return_reason: returnReason,
    driver,
    notes: notesStr,
    order_date: row.order_date || row.created_at?.split('T')[0],
  };
}

/**
 * Fetch orders for a driver or all drivers directly from Supabase (Live, No-Cache)
 */
export async function getLiveDriverOrders(driverName?: string): Promise<DriverOrderRecord[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('orders')
    .select('*, customers(id, name, phone, city, address)')
    .order('order_number', { ascending: true });

  if (error || !data || data.length === 0) {
    console.error('Error fetching live orders from Supabase:', error);
    return [];
  }

  const normalized = data.map(normalizeOrderRow);

  if (driverName && driverName !== 'All') {
    return normalized.filter(o => !o.driver || o.driver.toLowerCase().includes(driverName.toLowerCase()) || driverName.toLowerCase().includes(o.driver.toLowerCase()));
  }

  return normalized;
}

export interface InventoryNeededRow {
  id: string;
  product: string;
  needed: number;
  available: number;
  status: 'OK' | 'Low';
}

/**
 * Real warehouse withdrawal summary for today's driver dispatch: sums the
 * actual linked order_items (product_id, populated by business_create_order's
 * inventory auto-linking) for the given orders against real stock on hand.
 * Never parses the free-text "products" summary string — only items that
 * were unambiguously resolved to a real product are counted.
 */
export async function getInventoryNeededForDispatch(dbOrderIds: string[]): Promise<InventoryNeededRow[]> {
  if (!dbOrderIds.length) return [];
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('order_items')
    .select('quantity, product_id, products(sku, name_ar, inventory(quantity_on_hand))')
    .in('order_id', dbOrderIds)
    .not('product_id', 'is', null);

  if (error || !data) {
    console.error('Error fetching inventory-needed for dispatch:', error);
    return [];
  }

  const byProduct: Record<string, { name: string; needed: number; available: number }> = {};
  for (const row of data as any[]) {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    if (!product) continue;
    const inv = Array.isArray(product.inventory) ? product.inventory[0] : product.inventory;
    const key = product.sku;
    if (!byProduct[key]) {
      byProduct[key] = { name: product.name_ar, needed: 0, available: inv?.quantity_on_hand ?? 0 };
    }
    byProduct[key].needed += row.quantity;
  }

  return Object.entries(byProduct).map(([sku, p]) => ({
    id: sku,
    product: p.name,
    needed: p.needed,
    available: p.available,
    status: p.available < p.needed ? 'Low' : 'OK',
  }));
}

/**
 * Update order status, collected cash, notes, and timestamp directly in Supabase
 */
export async function updateLiveOrderStatus(params: {
  orderId: string;
  status: 'pending' | 'delivered' | 'returned' | 'postponed' | 'remaining' | 'confirmed' | 'processing' | 'shipped';
  cashCollected?: number;
  returnReason?: string;
  postponeDate?: string;
  notes?: string;
  driver?: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  const supabase = createServerClient();
  const { orderId, status, cashCollected, returnReason, postponeDate, notes, driver } = params;

  let dbStatus = 'processing';
  let paymentStatus = 'pending';
  let deliveredAt: string | null = null;

  if (status === 'delivered') {
    dbStatus = 'delivered';
    paymentStatus = 'paid';
    deliveredAt = new Date().toISOString();
  } else if (status === 'returned') {
    dbStatus = 'returned';
  } else if (status === 'confirmed') {
    dbStatus = 'confirmed';
  } else if (status === 'shipped') {
    dbStatus = 'shipped';
  }

  const isUuid = orderId.includes('-') && orderId.length === 36;
  const matchField = isUuid ? 'id' : 'order_number';

  const { data: currentOrder } = await supabase
    .from('orders')
    .select('id, notes, total_amount')
    .eq(matchField, orderId)
    .single();

  const currentNotes = currentOrder?.notes || '';

  // Driver assignment is persistent context — it must survive an update that
  // doesn't explicitly change it (e.g. a driver confirming delivery without
  // reassigning). Every other tag intentionally only appears when this call
  // actually sets it, matching the pre-existing behavior for those fields.
  const effectiveDriver = driver ?? extractBracketTag(currentNotes, 'السائق');

  let appendNotes = '';
  if (effectiveDriver) appendNotes += ` [السائق: ${effectiveDriver}]`;
  if (returnReason) appendNotes += ` [سبب الإرجاع: ${returnReason}]`;
  if (postponeDate) appendNotes += ` [تاريخ التأجيل: ${postponeDate}]`;
  if (cashCollected !== undefined) appendNotes += ` [المبلغ المستلم: ${cashCollected}]`;
  if (notes) appendNotes += ` [ملاحظة: ${notes}]`;

  let updatedNotes = currentNotes;
  if (appendNotes) {
    // Strip every known tag (nested-bracket safe) before re-appending, so a
    // repeated edit replaces the previous tag instead of wrapping around it.
    for (const label of ['السائق', 'سبب الإرجاع', 'تاريخ التأجيل', 'المبلغ المستلم', 'ملاحظة']) {
      updatedNotes = stripBracketTag(updatedNotes, label);
    }
    updatedNotes = `${updatedNotes} ${appendNotes}`.trim();
  }

  const updatePayload: any = {
    status: dbStatus,
    payment_status: paymentStatus,
    notes: updatedNotes,
    updated_at: new Date().toISOString(),
  };

  if (deliveredAt) {
    updatePayload.delivered_at = deliveredAt;
  }

  const { data, error } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq(matchField, orderId)
    .select('*, customers(*)');

  if (error) {
    console.error('Error updating order status in Supabase:', error);
    return { success: false, error: error.message };
  }

  return { success: true, data: data?.[0] };
}

/**
 * Save driver shift closing details (durable: survives restart, shared across instances)
 */
export async function saveLiveShiftClosure(params: {
  driverName: string;
  dateKey?: string;
  notes?: string;
  cashCollected?: number;
  deliveredCount?: number;
  returnedCount?: number;
}): Promise<{ success: boolean; shift?: DriverShiftClosure; error?: string }> {
  const supabase = createServerClient();
  const shiftDate = params.dateKey || new Date().toISOString().split('T')[0];
  const closedAt = new Date().toISOString();

  const { error } = await supabase
    .from('driver_shift_closures')
    .upsert(
      {
        driver_name: params.driverName,
        shift_date: shiftDate,
        is_closed: true,
        closed_at: closedAt,
        notes: params.notes || '',
        cash_collected: params.cashCollected ?? 0,
        delivered_count: params.deliveredCount ?? 0,
        returned_count: params.returnedCount ?? 0,
      },
      { onConflict: 'driver_name,shift_date' }
    );

  if (error) {
    console.error('Error saving shift closure to Supabase:', error);
    return { success: false, error: error.message };
  }

  return {
    success: true,
    shift: {
      isClosed: true,
      closedAt: new Date(closedAt).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }),
      notes: params.notes || '',
      cashCollected: params.cashCollected ?? 0,
      deliveredCount: params.deliveredCount ?? 0,
      returnedCount: params.returnedCount ?? 0,
    },
  };
}

/**
 * Reopen a previously-closed shift (real DB update, not a client-only toggle)
 */
export async function reopenLiveShift(driverName: string, dateKey?: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();
  const shiftDate = dateKey || new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('driver_shift_closures')
    .update({ is_closed: false })
    .eq('driver_name', driverName)
    .eq('shift_date', shiftDate);

  if (error) {
    console.error('Error reopening shift in Supabase:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Get shift closing status (real DB read)
 */
export async function getLiveShiftClosure(driverName: string, dateKey?: string): Promise<DriverShiftClosure | null> {
  const supabase = createServerClient();
  const shiftDate = dateKey || new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('driver_shift_closures')
    .select('*')
    .eq('driver_name', driverName)
    .eq('shift_date', shiftDate)
    .maybeSingle();

  if (error || !data || !data.is_closed) return null;

  return {
    isClosed: true,
    closedAt: new Date(data.closed_at).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }),
    notes: data.notes || '',
    cashCollected: Number(data.cash_collected) || 0,
    deliveredCount: data.delivered_count || 0,
    returnedCount: data.returned_count || 0,
  };
}

/**
 * Create a new order in Supabase
 */
export async function createLiveOrder(orderPayload: {
  customer_name: string;
  customer_phone: string;
  city?: string;
  address?: string;
  items_summary?: string;
  total_amount?: number;
  source?: string;
  payment_method?: string;
  installment_notes?: string;
  status?: string;
  rep_name?: string;
  raw_whatsapp_text?: string;
}) {
  const supabase = createServerClient();

  let customerId: string | null = null;
  const cleanPhone = String(orderPayload.customer_phone || '').replace(/[^\d+]/g, '');

  if (cleanPhone) {
    const { data: existingCust } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', cleanPhone)
      .limit(1);

    if (existingCust && existingCust.length > 0) {
      customerId = existingCust[0].id;
    } else {
      const { data: newCust } = await supabase
        .from('customers')
        .insert({
          name: orderPayload.customer_name || 'عميل واتساب',
          phone: cleanPhone,
          city: orderPayload.city || 'عمان',
          address: orderPayload.address || '',
          rep_name_raw: orderPayload.rep_name || 'مبيعات',
          lead_source: 'whatsapp',
        })
        .select('id')
        .single();

      customerId = newCust?.id || null;
    }
  }

  const { count } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true });

  const nextNumber = 100 + (count || 0) + 1;
  const orderNumber = `BET-2026-${nextNumber}`;

  const { data, error } = await supabase
    .from('orders')
    .insert({
      order_number: orderNumber,
      customer_id: customerId,
      source: orderPayload.source || 'whatsapp',
      status: (orderPayload.status as any) || 'confirmed',
      subtotal: orderPayload.total_amount || 0,
      total_amount: orderPayload.total_amount || 0,
      payment_method: (orderPayload.payment_method as any) || 'cash_on_delivery',
      payment_status: 'pending',
      delivery_city: orderPayload.city || 'عمان',
      delivery_address: orderPayload.address || '',
      notes: `[المنتجات: ${orderPayload.items_summary || ''}] [المندوب: ${orderPayload.rep_name || ''}]`,
      raw_whatsapp_text: orderPayload.raw_whatsapp_text || null,
      order_date: new Date().toISOString().split('T')[0],
    })
    .select('*, customers(*)')
    .single();

  if (error) {
    console.error('Error inserting live order into Supabase:', error);
    throw error;
  }

  return data;
}

/**
 * Assign orders to driver in Supabase
 */
export async function assignLiveOrdersToDriver(orderIds: string[], driverName: string) {
  const supabase = createServerClient();

  for (const id of orderIds) {
    const isUuid = id.includes('-') && id.length === 36;
    const matchField = isUuid ? 'id' : 'order_number';

    const { data: order } = await supabase
      .from('orders')
      .select('notes')
      .eq(matchField, id)
      .single();

    let notes = order?.notes || '';
    notes = notes.replace(/\[السائق:\s*[^\]]+\]/g, '').trim();
    notes = `${notes} [السائق: ${driverName}]`.trim();

    await supabase
      .from('orders')
      .update({
        notes,
        status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq(matchField, id);
  }

  return { success: true, count: orderIds.length };
}

/**
 * Dispatch drivers and mark orders as out with driver
 */
export async function dispatchLiveDrivers(drivers: string[]) {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('orders')
    .update({
      status: 'shipped',
      shipped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'processing')
    .select('id');

  return { success: true, count: data?.length || 0 };
}
