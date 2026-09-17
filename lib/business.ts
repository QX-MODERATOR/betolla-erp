import {ammanToday} from '@/lib/dates';
export interface BusinessCallLog { date: string; rep: string; outcome: string; notes: string }
export interface BusinessCustomer {
  id:string; legacy_id:number|null; name:string; phone:string; customer_type:string; classification:string;
  lead_source:string; address:string; city:string; rep_name_raw:string; notes:string;
  last_contact_date:string|null; next_call_date:string|null; next_call_at?:string|null; created_at:string; updated_at:string;
  history:BusinessCallLog[];
}
export interface BusinessProduct {
  id:string; sku:string; name_ar:string; name_en:string; category:string; category_label:string;
  cost_price:number; price:number; sale_price:number|null; stock:number; reserved:number; reorder:number;
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
}
export interface BusinessInvoice {
  id:string; order_id:string; customer_name:string; customer_phone:string; city:string; rep_name:string;
  subtotal:number; discount:number; total_amount:number; paid_amount:number; outstanding_amount:number;
  credit_amount:number; status:string; order_status:string; collectible:boolean; payment_method:string;
  issued_date:string; due_date:string; items:BusinessItem[]; payments:BusinessPayment[];
}
export function toInvoice(o:BusinessOrder):BusinessInvoice {
  const remaining=Math.max(0,Math.round((o.invoice_total-o.paid_amount)*1000)/1000);
  return {id:o.invoice_number!,order_id:o.id,customer_name:o.customer_name,customer_phone:o.customer_phone,
    city:o.city,rep_name:o.rep_name,subtotal:o.invoice_subtotal,discount:o.invoice_discount,total_amount:o.invoice_total,
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
