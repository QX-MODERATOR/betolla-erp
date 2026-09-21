// Delivery department QA — ضياء (driver manager) and the drivers خالد, علي and BX, in a real
// browser, on a phone and on a desktop. One order is followed from the warehouse to the customer's
// door and into the evening cash count. Run with the sandbox up:  npm run qa -- drivers
import assert from 'node:assert/strict';
import {suite, openPage, sweep, api, PHONE, DESKTOP, today} from './lib.mjs';
import {lead, order, setStatus, orderRow, RUN} from './fixtures.mjs';

// Orders ready for the delivery team: placed by reps, sent to the warehouse by the sales manager.
async function readyOrder(rep, repUsername, name) {
  const o = await order(repUsername, await lead(rep, {name}));
  await setStatus('sales.manager', o, 'processing');
  return o;
}
const toDeliver = await readyOrder('حنان', 'hanan.sales', `أسيل الشريف ${RUN}`);
const toPostpone = await readyOrder('رحمة', 'rahma.sales', `نور الهدى القيسي ${RUN}`);
const alisOrder = await readyOrder('رحمة', 'rahma.sales', `بشرى العتوم ${RUN}`);

// A previous run may have left خالد's shift closed for today; a closed shift takes no deliveries.
await api('diya.mgn', '/api/driver', {action: 'reopen_shift', driverName: 'خالد'});

const waitStatus = async (id, check, what, tries = 60) => {
  for (let i = 0; i < tries; i++) { const o = await orderRow(id); if (check(o)) return o; await new Promise(r => setTimeout(r, 250)); }
  const o = await orderRow(id);
  assert.fail(`${id}: expected ${what}, it is ${o.status} (driver ${o.driver ?? 'none'})`);
};

await suite('Delivery department', [

  ['every page ضياء or a driver can open works on a phone and a desktop', async () => {
    await sweep(['diya.mgn', 'khalid.driver', 'bx'], [PHONE, DESKTOP]);
  }],

  ['ضياء\'s "إدارة الطلبات" tab works on a phone and a desktop', async () => {
    for (const viewport of [PHONE, DESKTOP]) {
      const page = await openPage('diya.mgn', viewport);
      try {
        await page.goto('/drivers');
        await page.click('إدارة الطلبات');
        await page.waitForText(toDeliver.id);
        await page.checkHealthy('orders tab');
      } finally { await page.close(); }
    }
  }],

  ['ضياء assigns drivers from the delivery board', async () => {
    const page = await openPage('diya.mgn', DESKTOP);
    try {
      await page.goto('/drivers');
      for (const [o, driver] of [[toDeliver, 'خالد'], [toPostpone, 'خالد'], [alisOrder, 'علي']]) {
        await page.waitFor(`() => !!document.querySelector('select[aria-label="سائق الطلب ${o.id}"]')`, `${o.id} on the board`);
        // The board re-renders after each save; a choice made mid-save can be dropped, and a
        // person would simply pick again. Up to three tries, then it is a real failure.
        for (let attempt = 0; ; attempt++) {
          await page.fill(`select[aria-label="سائق الطلب ${o.id}"]`, driver);
          try { await waitStatus(o.id, x => x.driver === driver, `driver ${driver}`, 20); break; }
          catch (e) { if (attempt === 2) throw e; }
        }
      }
      await page.checkHealthy('after assigning');
    } finally { await page.close(); }
  }],

  ['ضياء confirms the stock is picked and sends the drivers out', async () => {
    const page = await openPage('diya.mgn', PHONE);
    try {
      await page.goto('/drivers/dispatch');
      await page.waitForText(toDeliver.id);
      await page.click('تأكيد تجهيز البضاعة');
      // Only asked when some item is short; the stock was reserved when each order was confirmed.
      if (await page.evaluate(`!!document.querySelector('[data-dialog]')`)) await page.click('متابعة');
      await page.click('طلب مع السائقين');
      await page.waitForText('انطلق السائقون', 30000);
      for (const o of [toDeliver, toPostpone, alisOrder]) await waitStatus(o.id, x => x.status === 'shipped', 'shipped');
      await page.checkHealthy('after dispatch');
    } finally { await page.close(); }
  }],

  ['a driver sees his own orders and nobody else\'s', async () => {
    const khalid = await openPage('khalid.driver', PHONE);
    const ali = await openPage('ali.driver', PHONE);
    try {
      await khalid.goto('/driver'); await khalid.waitForText(`أسيل الشريف ${RUN}`);
      await ali.goto('/driver'); await ali.waitForText(`بشرى العتوم ${RUN}`);
      assert.ok(!(await khalid.text()).includes(`بشرى العتوم ${RUN}`), 'خالد can see علي\'s order');
      assert.ok(!(await ali.text()).includes(`أسيل الشريف ${RUN}`), 'علي can see خالد\'s order');
      await khalid.checkHealthy(); await ali.checkHealthy();
    } finally { await khalid.close(); await ali.close(); }
  }],

  ['خالد delivers an order and records the cash he took', async () => {
    const page = await openPage('khalid.driver', PHONE);
    const total = Number((await orderRow(toDeliver.id)).total_amount);
    try {
      await page.goto('/driver');
      // His list opens an order on a tap on the card.
      await page.tap(`أسيل الشريف ${RUN}`);
      await page.click('تم التسليم');
      await page.fill('[data-dialog] input[aria-label="المبلغ المستلم كاش"]', String(total));
      await page.click('تأكيد وحفظ');
      const o = await waitStatus(toDeliver.id, x => x.status === 'delivered', 'delivered');
      assert.equal(Number(o.paid_amount), total, 'the cash he entered was not recorded as paid');
      await page.checkHealthy('after delivering');
    } finally { await page.close(); }
  }],

  ['خالد postpones an order the customer cannot take today', async () => {
    const page = await openPage('khalid.driver', PHONE);
    try {
      await page.goto('/driver');
      await page.tap(`نور الهدى القيسي ${RUN}`);
      await page.click('تأجيل');
      await page.fill('[data-dialog] input[type=date]', today(1));
      await page.click('تأكيد وحفظ');
      // A postponed order stays "shipped" (the goods are still with him); the driver's board
      // carries the postponement and its new date.
      let mine;
      for (let i = 0; i < 40; i++) {
        mine = (await api('khalid.driver', '/api/driver')).json.orders.find(x => x.id === toPostpone.id);
        if (mine?.status === 'postponed') break;
        await new Promise(r => setTimeout(r, 250));
      }
      assert.equal(mine?.status, 'postponed', 'the order was not postponed');
      assert.equal(mine.postpone_date, today(1), 'the new delivery date was not saved');
      await page.checkHealthy('after postponing');
    } finally { await page.close(); }
  }],

  ['خالد closes his shift with the cash he counted, and ضياء can reopen it', async () => {
    const before = await api('khalid.driver', '/api/driver');
    assert.equal(before.json.shiftClosure.closed, false, 'the shift was already closed');
    const page = await openPage('khalid.driver', PHONE);
    try {
      await page.goto('/driver/shift');
      await page.click('إغلاق الوردية وتسليم العهدة');
      await page.fill('#counted-cash', '20');
      await page.click('تأكيد واعتماد الإغلاق');
      await page.waitForText('تم إغلاق الوردية', 30000);
      const after = (await api('khalid.driver', '/api/driver')).json.shiftClosure;
      assert.equal(after.closed, true, 'the shift did not close');
      assert.equal(Number(after.countedCash), 20, 'the counted cash was not saved');
      await page.checkHealthy('after closing the shift');
    } finally { await page.close(); }

    const manager = await openPage('diya.mgn', DESKTOP);
    try {
      await manager.goto('/driver/shift');
      await manager.fill('select[aria-label="اختر السائق"]', 'خالد');
      await manager.click('إعادة فتح الوردية');
      if (await manager.evaluate(`!!document.querySelector('[data-dialog]')`)) await manager.click('إعادة فتح', {within: 'الوردية'}).catch(() => {});
      for (let i = 0; i < 40 && (await api('diya.mgn', '/api/driver?driver=' + encodeURIComponent('خالد'))).json.shiftClosure.closed; i++)
        await new Promise(r => setTimeout(r, 250));
      assert.equal((await api('diya.mgn', '/api/driver?driver=' + encodeURIComponent('خالد'))).json.shiftClosure.closed, false, 'ضياء could not reopen the shift');
      await manager.checkHealthy('after reopening');
    } finally { await manager.close(); }
  }],

  ['a driver cannot open the sales, orders or dispatch pages, or act on another driver\'s order', async () => {
    const page = await openPage('khalid.driver', PHONE);
    try {
      for (const path of ['/sales', '/orders', '/drivers', '/drivers/dispatch', '/customers']) {
        await page.goto(path);
        assert.notEqual(await page.path(), path, `a driver can open ${path}`);
      }
    } finally { await page.close(); }
    const r = await api('khalid.driver', '/api/driver', {action: 'update_status', orderId: alisOrder.id, expectedStatus: 'shipped',
      status: 'delivered', cashCollected: 1});
    assert.notEqual(r.status, 200, 'خالد marked علي\'s order delivered');
    assert.equal((await orderRow(alisOrder.id)).status, 'shipped');
  }],
]);
