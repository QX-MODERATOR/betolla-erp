// Sales department QA — reps (رحمة, حنان) and the sales manager, in a real browser, on a phone and
// on a desktop. Run with the sandbox up:  npm run qa -- sales
import assert from 'node:assert/strict';
import {suite, openPage, sweep, PHONE, DESKTOP, db, today} from './lib.mjs';
import {lead, orderRow, order, RUN} from './fixtures.mjs';

// Hanan's queue gets the kind of lead that broke her phone layout (PR #52): a long salon name, a
// long address, a long note. Rahma gets an ordinary one, which Hanan must never see.
const hananLead = await lead('حنان', {
  name: `صالون لمسات الجمال والعناية المتكاملة - فرع خلدا ${RUN}`, city: 'عمان',
  address: 'عمان - خلدا - شارع وصفي التل - مجمع الحسيني التجاري - الطابق الثالث - مكتب رقم 12 بجانب صيدلية الدواء',
  notes: 'مهتمة ببكج البلازما الكامل وطلبت عرض سعر للكميات قبل نهاية الشهر، الاتصال بعد الساعة الرابعة عصراً'});
const hananCaller = await lead('حنان', {name: `ريم الخطيب ${RUN}`, city: 'الزرقاء', address: 'الزرقاء الجديدة'});
const hananBuyer = await lead('حنان', {name: `دعاء العمري ${RUN}`, city: 'عمان', address: 'عمان - الجبيهة'});
const rahmaLead = await lead('رحمة', {name: `منى السعدي ${RUN}`, city: 'إربد', address: 'إربد - الحي الشرقي'});

await suite('Sales department', [

  ['every page a rep or the sales manager can open works on a phone and a desktop', async () => {
    await sweep(['rahma.sales', 'hanan.sales', 'sales.manager'], [PHONE, DESKTOP]);
  }],

  ['a long salon name and address in the queue keep the phone layout intact (PR #52)', async () => {
    const page = await openPage('hanan.sales', PHONE);
    try {
      await page.goto('/sales');
      await page.waitForText(hananLead.phone);
      await page.checkHealthy('long lead in queue');
    } finally { await page.close(); }
  }],

  ['a rep sees her own leads and never another rep\'s', async () => {
    const hanan = await openPage('hanan.sales', PHONE);
    const rahma = await openPage('rahma.sales', PHONE);
    try {
      await hanan.goto('/sales'); await hanan.waitForText(hananLead.phone);
      await rahma.goto('/sales'); await rahma.waitForText(rahmaLead.phone);
      assert.ok(!(await hanan.text()).includes(rahmaLead.phone), 'Hanan can see Rahma\'s lead');
      assert.ok(!(await rahma.text()).includes(hananLead.phone), 'Rahma can see Hanan\'s lead');
      // The customer list is scoped the same way, not just the queue.
      await rahma.goto('/customers');
      assert.ok(!(await rahma.text()).includes(hananLead.phone), 'Hanan\'s lead shows on Rahma\'s customer list');
    } finally { await hanan.close(); await rahma.close(); }
  }],

  ['a rep adds a new lead from the form and it lands in her queue', async () => {
    const page = await openPage('rahma.sales', PHONE);
    try {
      await page.goto('/sales');
      await page.click('إضافة رقم جديد للاتصال');
      const newPhone = `078${RUN}99`;
      await page.fill('[data-dialog] input[placeholder="مثال: ليلى الأحمد"]', `هبة الزعبي ${RUN}`);
      await page.fill('[data-dialog] input[placeholder="0791234567"]', newPhone);
      await page.click('إضافة الرقم والبدء بالاتصال');
      // Saving a lead goes straight on to an order for her; close that and look at the queue.
      await page.waitForText('حفظ وتثبيت الطلبية', 20000).catch(() => {});
      await page.click('إلغاء', {exact: true}).catch(() => {});
      await page.waitForText(newPhone);
      const {rows} = await (await db()).query('SELECT rep_name_raw FROM customers WHERE phone = $1', [newPhone]);
      assert.equal(rows[0]?.rep_name_raw, 'رحمة', 'the new lead was not assigned to the rep who added it');
      await page.checkHealthy('after adding a lead');
    } finally { await page.close(); }
  }],

  ['a rep logs a call and schedules the next one; the lead leaves today\'s queue', async () => {
    const page = await openPage('hanan.sales', PHONE);
    try {
      await page.goto('/sales');
      await page.waitForText(hananCaller.phone);
      await page.click('تسجيل الملاحظات', {within: hananCaller.phone});
      await page.fill('[data-dialog] textarea', 'ردت وطلبت الاتصال بعد يومين لتأكيد الكمية');
      await page.fill('[data-dialog] input[type=date]', today(2));
      await page.click('حفظ الملاحظات والموعد');
      await page.waitFor(`() => !document.querySelector('[data-dialog] textarea')`, 'the call dialog to close');
      await page.waitFor(`() => !document.querySelector('main').innerText.includes(${JSON.stringify(hananCaller.phone)})`,
        'the lead to leave today\'s queue');
      const c = await db();
      const {rows: [cust]} = await c.query(`SELECT to_char(next_call_date,'YYYY-MM-DD') d FROM customers WHERE id = $1`, [hananCaller.id]);
      assert.equal(cust.d, today(2), 'next call date not saved');
      const {rows: logs} = await c.query('SELECT notes FROM call_logs WHERE customer_id = $1', [hananCaller.id]);
      assert.ok(logs.some(l => (l.notes || '').includes('لتأكيد الكمية')), 'call notes not saved');
      await page.checkHealthy('after logging a call');
    } finally { await page.close(); }
  }],

  ['a rep creates an order for a lead; it is hers, confirmed, and on her orders page', async () => {
    const page = await openPage('hanan.sales', PHONE);
    let orderId;
    try {
      await page.goto('/sales');
      await page.waitForText(hananBuyer.phone);
      await page.click('إنشاء طلبية', {within: hananBuyer.phone});
      await page.waitForText('حفظ وتثبيت الطلبية');
      // Add one unit of the first product that has stock (its "+" button).
      const added = await page.evaluate(`(() => {
        const plus = [...document.querySelectorAll('[data-dialog] button')].find(b => b.innerText.trim() === '+' && !b.disabled);
        if (!plus) return false; plus.click(); return true; })()`);
      assert.ok(added, 'no product could be added to the order');
      await page.click('حفظ وتثبيت الطلبية في النظام');
      // "Send it on WhatsApp?" — not now.
      await page.waitForText('تم إنشاء الطلبية', 30000).catch(() => {});
      await page.click('لاحقًا');
      const {rows: [o]} = await (await db()).query(
        `SELECT order_number FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.id = $1`, [hananBuyer.id]);
      assert.ok(o, 'no order was saved');
      orderId = o.order_number;
      const saved = await orderRow(orderId);
      assert.equal(saved.status, 'confirmed');
      assert.equal(saved.rep_name, 'حنان', 'the order is not credited to the rep who made it');
      await page.checkHealthy('after creating an order');
      await page.goto('/orders');
      await page.waitForText(orderId);
      await page.checkHealthy('her orders');
    } finally { await page.close(); }
  }],

  ['the sales manager sends a rep\'s order to the warehouse from the orders page', async () => {
    const buyer = await lead('حنان', {name: `سجى النجار ${RUN}`});
    const o = await order('hanan.sales', buyer);
    for (const viewport of [DESKTOP, PHONE]) {
      const page = await openPage('sales.manager', viewport);
      try {
        await page.goto('/orders');
        await page.waitForText(o.id);
        if (viewport === DESKTOP) {
          await page.click('تجهيز', {within: o.id, exact: true});
          for (let i = 0; i < 40 && (await orderRow(o.id)).status !== 'processing'; i++) await new Promise(r => setTimeout(r, 250));
          assert.equal((await orderRow(o.id)).status, 'processing', 'the order did not move to processing');
        }
        await page.checkHealthy();
      } finally { await page.close(); }
    }
  }],

  ['a rep cannot move an order\'s status, and cannot open the delivery pages', async () => {
    const buyer = await lead('رحمة', {name: `لانا حداد ${RUN}`});
    const o = await order('rahma.sales', buyer);
    const page = await openPage('rahma.sales', PHONE);
    try {
      await page.goto('/orders');
      await page.waitForText(o.id);
      const canAdvance = await page.evaluate(`(() => {
        const card = [...document.querySelectorAll('main *')].filter(e => e.innerText?.includes(${JSON.stringify(o.id)}))
          .sort((a, b) => a.innerText.length - b.innerText.length).find(e => e.querySelector('button'));
        return !!card && [...card.querySelectorAll('button')].some(b => b.getBoundingClientRect().width > 0 && b.innerText.trim() === 'تجهيز');
      })()`);
      assert.ok(!canAdvance, 'a rep is offered the "تجهيز" button');
      for (const path of ['/drivers', '/drivers/dispatch', '/driver', '/finance']) {
        await page.goto(path);
        assert.notEqual(await page.path(), path, `a rep can open ${path}`);
      }
    } finally { await page.close(); }
  }],
]);
