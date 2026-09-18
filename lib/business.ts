import {ammanToday} from '@/lib/dates';
export interface BusinessCallLog { date: string; rep: string; outcome: string; notes: string }
export interface BusinessCustomer {
  id:string; legacy_id:number|null; name:string; phone:string; customer_type:string; classification:string;
  lead_source:string; address:string; city:string; rep_name_raw:string; notes:string;
  last_contact_date:string|null; next_call_date:string|null; next_call_at?:string|null; created_at:string; updated_at:string;
  history:BusinessCallLog[];
}
// A bundle (migration 037: the plasma packages) is sold as one line at its own price, but holds no
// stock of its own — `stock` is how many its components can build, and `components` is what it is
// made of. Both fields are absent for an ordinary product.
export interface BusinessBundleComponent { sku:string; name_ar:string; quantity:number }
export interface BusinessProduct {
  id:string; sku:string; name_ar:string; name_en:string; category:string; category_label:string;
  cost_price:number; price:number; sale_price:number|null; stock:number; reserved:number; reorder:number;
  is_bundle?:boolean; components?:BusinessBundleComponent[];
}
export interface BusinessMovement {
  id:string; sku:string; name:string; type:string; quantity:number; reference:string;
  reference_id:string|null; notes:string; created_at:string;
}
export interface BusinessItem { name: string; qty: number; price: number | null; total: number | null }
export interface BusinessPayment { id:string; amount:number; payment_method:string; reference_number:string; notes:string; is_reversal:boolean; reversed_payment_id:string|null; received_at:string }
export interface BusinessOrder {
  id:string; db_id:string; customer_name:string; customer_phone:string; city:string; address:string;
  rep_name:string; source:string; status:string; order_date:string; total_amount:number;
  payment_method:string; installment_notes:string|null; items_summary:string; items:BusinessItem[];
  invoice_number:string|null; invoice_total:number; invoice_subtotal:number; invoice_discount:number;
  issued_date:string; due_date:string; paid_amount:number; collectible:boolean; payments:BusinessPayment[];
  // The order's own history (migration 041), for the shipment timeline. Each is null until the
  // order reaches that step; orders placed before 041 have the stamps but no driver recorded.
  created_at?:string|null; confirmed_at?:string|null; shipped_at?:string|null;
  delivered_at?:string|null; cancelled_at?:string|null; updated_at?:string|null;
  driver?:string|null; dispatched_at?:string|null;
}
// One row of business_order_changes (migration 036): what the owning rep changed, and when.
export interface OrderChange { actor_id:string; changes:Record<string,{from:unknown;to:unknown}>; changed_at:string }
export interface BusinessInvoice {
  id:string; order_id:string; customer_name:string; customer_phone:string; city:string; rep_name:string;
  subtotal:number; discount:number; total_amount:number; paid_amount:number; outstanding_amount:number;
  credit_amount:number; status:string; order_status:string; collectible:boolean; payment_method:string;
  issued_date:string; due_date:string; items:BusinessItem[]; payments:BusinessPayment[];
}
// The one place an order is read as money owed. /api/finance, /api/analytics and the printed order
// statement all come through here, so what a rep hands a customer and what finance chases can never
// disagree — they used to: the statement asked for the full balance on a cancelled order, because
// it did its own arithmetic and never looked at `collectible`.
//
// An order with no invoice row yet (the driver path creates one on delivery) falls back to the
// order's own total rather than reporting zero. /api/finance and /api/analytics filter those out
// before calling this, so the fallback only ever shows up on a statement.
export function toInvoice(o:BusinessOrder):BusinessInvoice {
  const total=o.invoice_total||o.total_amount;
  const remaining=Math.max(0,Math.round((total-o.paid_amount)*1000)/1000);
  return {id:o.invoice_number!,order_id:o.id,customer_name:o.customer_name,customer_phone:o.customer_phone,
    city:o.city,rep_name:o.rep_name,subtotal:o.invoice_subtotal||o.total_amount,discount:o.invoice_discount,total_amount:total,
    paid_amount:o.paid_amount,outstanding_amount:o.collectible?remaining:0,
    credit_amount:['cancelled','returned'].includes(o.status)?o.paid_amount:0,
    status:!o.collectible?'on_hold':remaining===0?'paid':o.paid_amount>0?'partial':'pending',
    order_status:o.status,collectible:o.collectible,payment_method:o.payment_method,
    issued_date:o.issued_date,due_date:o.due_date,items:o.items,payments:o.payments};
}
export function financeSummary(invoices:BusinessInvoice[]) {
  const sum=(fn:(i:BusinessInvoice)=>number)=>invoices.reduce((n,i)=>n+Math.round(fn(i)*1000),0)/1000;
  const total=sum(i=>i.collectible?i.total_amount:0),collected=sum(i=>i.paid_amount);
  return {total_invoiced_jd:total,total_collected_jd:collected,total_receivables_jd:sum(i=>i.outstanding_amount),
    credit_balance_jd:sum(i=>i.credit_amount),collection_rate_percent:total?Math.round(sum(i=>i.collectible?i.paid_amount:0)/total*100):0,
    overdue_count:invoices.filter(i=>i.outstanding_amount>0&&i.due_date&&i.due_date<ammanToday()).length};
}
