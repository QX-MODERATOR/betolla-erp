import { createServerClient } from './supabase/server';

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

// In-memory fallback / cache-sync for rapid multi-driver shifts & persistent fallback
let inMemoryShiftStorage: Record<string, { isClosed: boolean; closedAt: string; notes: string; summary: any }> = {};

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
}): Promise<{ success: boolean; data?: any; error?: string }> {
  const supabase = createServerClient();
  const { orderId, status, cashCollected, returnReason, postponeDate, notes } = params;

  let appendNotes = '';
  if (returnReason) appendNotes += ` [سبب الإرجاع: ${returnReason}]`;
  if (postponeDate) appendNotes += ` [تاريخ التأجيل: ${postponeDate}]`;
  if (cashCollected !== undefined) appendNotes += ` [المبلغ المستلم: ${cashCollected}]`;
  if (notes) appendNotes += ` [ملاحظة: ${notes}]`;

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

  let updatedNotes = currentOrder?.notes || '';
  if (appendNotes) {
    updatedNotes = updatedNotes
      .replace(/\[سبب الإرجاع:[^\]]+\]/g, '')
      .replace(/\[تاريخ التأجيل:[^\]]+\]/g, '')
      .replace(/\[المبلغ المستلم:[^\]]+\]/g, '')
      .trim();
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
 * Save driver shift closing details
 */
export async function saveLiveShiftClosure(params: {
  driverName: string;
  dateKey?: string;
  notes?: string;
  summary?: any;
}) {
  const dateKey = params.dateKey || new Date().toISOString().split('T')[0];
  const shiftRecord = {
    isClosed: true,
    closedAt: new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }),
    notes: params.notes || '',
    summary: params.summary || {},
  };

  inMemoryShiftStorage[`${params.driverName}_${dateKey}`] = shiftRecord;
  return { success: true, shift: shiftRecord };
}

/**
 * Get shift closing status
 */
export function getLiveShiftClosure(driverName: string, dateKey?: string) {
  const dateStr = dateKey || new Date().toISOString().split('T')[0];
  const key = `${driverName}_${dateStr}`;
  return inMemoryShiftStorage[key] || null;
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
