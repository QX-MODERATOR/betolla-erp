// Test data for one QA run. Every run makes its own customers with fresh phone numbers (077 + a
// run number), so runs never trip over each other's leftovers and nothing has to be deleted — the
// sandbox is disposable anyway. Names and addresses are deliberately long and realistic: the
// hanan.sales phone bug (PR #52) only showed with a real address in the queue.
import assert from 'node:assert/strict';
import {api, db, today} from './lib.mjs';

export const RUN = String(Math.floor(10000 + Math.random() * 89999));
let n = 0;
export const phone = () => `077${RUN}${String(++n).padStart(2, '0')}`;

// A lead in a rep's queue for today, written straight to the database (how a lead from the
// WhatsApp/ads intake arrives), so the test starts where the rep's morning starts.
export async function lead(rep, {name, city = 'عمان', address = '', notes = '', nextCall = today()} = {}) {
  const c = await db();
  const {rows: [row]} = await c.query(
    `INSERT INTO customers(name, phone, city, address, rep_name_raw, notes, next_call_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, phone`,
    [name, phone(), city, address, rep, notes, nextCall]);
  return row;
}

// A product the rep can sell: priced, not a package. One in stock if there is any; since 047 an
// order no longer needs stock, and the 046 catalogue starts the sandbox with every product at 0.
export async function sellable(username = 'rahma.sales') {
  const {status, json} = await api(username, '/api/inventory');
  assert.equal(status, 200, 'inventory did not load');
  const priced = json.catalog.filter(p => Number(p.price ?? p.sale_price) > 0 && !p.is_bundle);
  const p = priced.find(p => p.stock >= 5) ?? priced[0];
  assert.ok(p, 'the sandbox has no priced product to sell');
  return p;
}

// An order placed by a rep through the same route her order form uses.
export async function order(repUsername, customer, {qty = 1, payment = 'cash_on_delivery'} = {}) {
  const p = await sellable(repUsername);
  const price = Number(p.price ?? p.sale_price);
  const r = await api(repUsername, '/api/orders', {
    customer_id: customer.id, customer_name: customer.name, customer_phone: customer.phone,
    city: 'عمان', address: 'عمان - الجبيهة - قرب دوار المنهل', items: [{sku: p.sku, qty}],
    total_amount: price * qty, payment_method: payment, status: 'confirmed', source: 'sales',
    data_source: 'data_center', customer_segment: 'B2C', channel: 'phone_sales'});
  assert.ok(r.status === 200 || r.status === 201, `order for ${customer.name} failed: ${JSON.stringify(r.json)}`);
  return r.json.order;
}

// Moves an order along as the person whose job that step is.
export async function setStatus(username, o, status, extra = {}) {
  const current = (await orderRow(o.id)).status;
  const r = await api(username, '/api/orders', {id: o.id, status, expected_status: current, ...extra}, 'PATCH');
  assert.equal(r.status, 200, `${username} could not move ${o.id} to ${status}: ${JSON.stringify(r.json)}`);
  return r.json.order;
}

// An order as the app itself reports it (status, driver, payments), read as the system admin.
export async function orderRow(id) {
  const {status, json} = await api('admin.zaid', '/api/orders');
  assert.equal(status, 200, 'orders did not load');
  const row = json.orders.find(o => o.id === id || o.db_id === id);
  assert.ok(row, 'no order ' + id);
  return row;
}
