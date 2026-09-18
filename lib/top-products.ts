// The handful of products that carry most of the orders. They lead the picker in order-entry so a
// rep is not scrolling a 36-row catalog for the six things she sells all day. Kept as data, in the
// order the sales team asked for: بكج رباعي، بكج ثنائي، شامبو بلازما، بلسم بلازما، تريتمنت، بكج ارغان.
//
// Matched by SKU, which is exact: a name keyword is not, and over-matching here is worse than
// under-matching. "تريتمنت بلازما" also matches "تريتمنت بلازما 100 مل - هدية (غير مدفوع)", which
// would promote an unpaid giveaway above the product it is a sample of. So keywords are carried
// only by the two plasma packages, which have no SKU in the catalog yet and need to pin themselves
// the moment the warehouse creates them — under whatever SKU it picks.
const TOP_PRODUCTS: { sku: string; keywords?: string[] }[] = [
  { sku: "PL-PKG-QUAD-V2-01", keywords: ["بكج رباعي", "رباعي بلازما"] },
  { sku: "PL-PKG-DUO-V2-01", keywords: ["بكج ثنائي", "ثنائي بلازما"] },
  { sku: "PL-SHMP-500-V2-01" },
  { sku: "PL-COND-500-V2-02" },
  { sku: "PL-TREAT-500-V2-03" },
  { sku: "ARG-PKG-HYDRO-REP-500-V2-01" },
];

// Arabic is written with and without the hamza and with either yeh, and the catalog is not
// consistent about it, so compare on a folded form.
const fold = (text: string | undefined) =>
  (text || "")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[آأإ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();

/** Position in the pinned list, or Infinity for everything else. */
export function topProductRank(product: { sku?: string; name_ar?: string }): number {
  const sku = (product.sku || "").toUpperCase();
  const name = fold(product.name_ar);
  for (let i = 0; i < TOP_PRODUCTS.length; i++) {
    const entry = TOP_PRODUCTS[i];
    if (sku === entry.sku) return i;
    if (name && entry.keywords?.some((k) => name.includes(fold(k)))) return i;
  }
  return Infinity;
}

export const isTopProduct = (product: { sku?: string; name_ar?: string }): boolean =>
  topProductRank(product) !== Infinity;

/** The pinned products first, in their configured order; everything else keeps the catalog's order. */
export function withTopProductsFirst<T extends { sku?: string; name_ar?: string }>(products: T[]): T[] {
  return products
    .map((product, index) => ({ product, index, rank: topProductRank(product) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.product);
}
