import assert from 'node:assert/strict';

// The order-entry picker leads with the six products the sales team sells all day, matched by SKU
// with an Arabic-keyword fallback so a rename (or a package added later) still pins correctly.
const {withTopProductsFirst,topProductRank,isTopProduct}=await import('../lib/top-products.ts');

const catalog=[
  {sku:'EL-MC-V2-01',name_ar:'مكبس شعر MC (صيني نخب أول)'},
  {sku:'PL-COND-500-V2-02',name_ar:'بلسم بلازما 500 مل (محلي / أردني)'},
  {sku:'LENS-MED-V2-01',name_ar:'عدسات بيتو - طبي (كوري)'},
  {sku:'ARG-PKG-HYDRO-REP-500-V2-01',name_ar:'بكج الارغان [شامبو + بلسم] 500 مل - هيدرو/ريبير (الماني)'},
  {sku:'PL-TREAT-500-V2-03',name_ar:'تريتمنت بلازما 500 مل (محلي / أردني)'},
  {sku:'PL-SHMP-500-V2-01',name_ar:'شامبو بلازما 500 مل (محلي / أردني)'},
  {sku:'PL-SERUM-100-V2-04',name_ar:'سيروم بلازما 100 مل (محلي / أردني)'},
];

// Pinned first, in the asked-for order; the rest keep the catalog's own order.
const sorted=withTopProductsFirst(catalog);
assert.deepEqual(sorted.map(p=>p.sku),[
  'PL-SHMP-500-V2-01','PL-COND-500-V2-02','PL-TREAT-500-V2-03','ARG-PKG-HYDRO-REP-500-V2-01',
  'EL-MC-V2-01','LENS-MED-V2-01','PL-SERUM-100-V2-04',
]);

// Sorting is a reordering, never a filter.
assert.equal(sorted.length,catalog.length);

// The two plasma packages pin themselves as soon as they exist, by SKU or by name.
assert.equal(topProductRank({sku:'PL-PKG-QUAD-V2-01',name_ar:'anything'}),0);
assert.equal(topProductRank({sku:'PL-PKG-DUO-V2-01',name_ar:'anything'}),1);
assert.equal(topProductRank({sku:'SOME-OTHER-SKU',name_ar:'بكج رباعي بلازما (شامبو + بلسم + تريتمنت + سيروم)'}),0);
assert.equal(topProductRank({sku:'ANOTHER-SKU',name_ar:'بكج ثنائي بلازما [شامبو + بلسم]'}),1);

// Only the packages match by name. A keyword for the plain products would also catch
// "تريتمنت بلازما 100 مل - هدية (غير مدفوع)" and promote an unpaid giveaway above the product it
// samples, so the four stocked items pin by their exact SKU and nothing else.
assert.equal(isTopProduct({sku:'PL-TREAT-100-GIFT-V2-05',name_ar:'تريتمنت بلازما 100 مل - هدية (غير مدفوع)'}),false);
assert.equal(isTopProduct({sku:'X',name_ar:'تريتمنت بلازما 500 مل'}),false);

// Everything else is untouched, and an empty/odd row never throws.
assert.equal(isTopProduct({sku:'PL-SERUM-100-V2-04',name_ar:'سيروم بلازما 100 مل (محلي / أردني)'}),false);
assert.equal(isTopProduct({}),false);
assert.deepEqual(withTopProductsFirst([]),[]);

console.log('PASS: order-entry picker pins the six best sellers first, matched by SKU or folded Arabic name, without dropping or duplicating any catalog row.');
