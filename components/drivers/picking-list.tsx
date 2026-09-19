"use client";

// كشف تجهيز الطلبات — the sheet somebody carries to the shelves.
//
// It is deliberately NOT a list of orders. An order says "بكج رباعي بلازما [شامبو + بلسم + تريتمنت
// + سيروم]", which is one thing sold and four things to lift; and the same shampoo appears in a
// dozen orders. Picking from that means reading every order, mentally unpacking every package and
// keeping a running count — which is how a picker ends up walking the room twice and still missing
// a bottle.
//
// So the database expands every package into the products it ships as and sums them across all the
// orders that still need picking (business_picking_list, migration 043). What arrives here is one
// line per product, in category order, with how many to pull and how many the system believes are
// on the shelf. Nothing on this page is computed in the browser: the quantities are the ones
// inventory actually holds, so a picker and the stock report cannot tell different stories.
//
// The second part is for after the walk: every order with its packages already opened, grouped by
// driver, so the pulled bottles can be sorted straight into bags.
//
// Both parts are single continuous tables rather than a block per category or per order. A block
// that must not split jumps whole to the next page when it does not fit, leaving half a page empty
// and the list in pieces; a table breaks between rows and repeats its header on every page. Product
// codes are left off on purpose: the person picking reads names, not SKUs.
import { Printer, X, PackageSearch, AlertTriangle } from "lucide-react";
import { printArea } from "@/lib/print";

export interface PickingLine {
  sku: string;
  product: string;
  category: string;
  needed: number;
  orders: number;
  available: number;
  short: number;
  status: "OK" | "Low";
}

export interface PickingOrder {
  order_number: string;
  status: string;
  driver: string | null;
  customer: string;
  city: string;
  items: { product: string; sku: string | null; quantity: number }[];
}

export interface PickingList {
  generated_at: string;
  total_units: number;
  total_products: number;
  short_products: number;
  order_count: number;
  lines: PickingLine[];
  orders: PickingOrder[];
  /** Order lines that never matched a product: no stock to check, but still to be picked. */
  unlinked: { order_number: string; product: string; quantity: number }[];
}

const UNLINKED = "أصناف غير مربوطة بالمخزون";

/** Consecutive runs of `items` sharing a key, in the order they arrive. */
function runs<T>(items: T[], key: (item: T) => string) {
  const out: { key: string; items: T[] }[] = [];
  for (const item of items) {
    const k = key(item);
    const last = out[out.length - 1];
    if (last && last.key === k) last.items.push(item);
    else out.push({key: k, items: [item]});
  }
  return out;
}

function stamp(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", {timeZone: "Asia/Amman", ...o}).format(d);
  return `${part({day: "2-digit", month: "2-digit", year: "numeric"})} · ${part({hour: "2-digit", minute: "2-digit", hour12: false})}`;
}

const Tick = () => <span className="inline-block w-4 h-4 border-2 border-stone-400 rounded-[4px] align-middle" />;

export function PickingListDocument({ list, scope }: { list: PickingList; scope?: string }) {
  // Lines arrive in shelf order; unmatched lines go last as their own section of the same table.
  const sections: { title: string; unlinked: boolean; lines: PickingLine[] }[] = runs(list.lines, (l) => l.category || "أخرى")
    .map((r) => ({title: r.key, unlinked: false, lines: r.items}));
  if (list.unlinked.length) sections.push({
    title: UNLINKED, unlinked: true,
    lines: runs([...list.unlinked].sort((a, b) => a.product.localeCompare(b.product, "ar")), (u) => u.product).map((r) => ({
      sku: "", product: r.key, category: UNLINKED, needed: r.items.reduce((n, u) => n + u.quantity, 0),
      orders: new Set(r.items.map((u) => u.order_number)).size, available: 0, short: 0, status: "OK" as const,
    })),
  });
  let serial = 0;

  return (
    <div className="picking-sheet bg-white text-stone-900 text-[13px]" dir="rtl">
      {/* Letterhead */}
      <div className="flex items-center justify-between gap-4 border-b-2 border-[#160f02] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-xl bg-[#160f02] flex items-center justify-center p-2 shrink-0">
            <img src="/brand/betolla-logo-clean.png" alt="" className="w-full h-full object-contain brightness-0 invert" />
          </div>
          <div>
            <p className="font-black text-[15px] leading-tight">شركة بيتولا لمستحضرات التجميل</p>
            <p className="text-[11px] text-stone-500">Betolla Cosmetics — عمّان، الأردن</p>
          </div>
        </div>
        <div className="text-end shrink-0">
          <p className="font-black text-lg leading-tight">كشف تجهيز الطلبات</p>
          <p className="text-[11px] text-stone-500" dir="ltr">{stamp(list.generated_at)}</p>
          {scope && <p className="text-[11px]"><span className="text-stone-500">السائقون: </span><b>{scope}</b></p>}
        </div>
      </div>

      {/* One strip of totals, small enough to leave the page to the list */}
      <div className="flex items-stretch gap-2 py-3 break-inside-avoid">
        {([
          ["إجمالي القطع", list.total_units + list.unlinked.reduce((n, u) => n + u.quantity, 0), "bg-[#160f02] text-white border-[#160f02]"],
          ["عدد الأصناف", sections.reduce((n, s) => n + s.lines.length, 0), ""],
          ["عدد الطلبات", list.order_count, ""],
          ["أصناف ناقصة", list.short_products, list.short_products ? "bg-rose-50 text-rose-900 border-rose-300" : ""],
        ] as const).map(([label, value, cls]) => (
          <div key={label} className={`flex-1 flex items-center justify-between gap-2 rounded-lg border border-stone-300 px-3 py-1.5 ${cls}`}>
            <span className="text-[11px] font-bold opacity-80">{label}</span>
            <span className="font-mono font-black text-lg leading-none">{value}</span>
          </div>
        ))}
      </div>

      {list.short_products > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-300 px-3 py-1.5 mb-3 text-[11px] text-rose-900 font-bold break-inside-avoid">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{list.short_products} صنف غير متوفر بالكمية المطلوبة — الأسطر المظللة بالأحمر.</span>
        </div>
      )}

      {/* Part 1 — what to pull off the shelf */}
      {sections.length ? (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#160f02] text-white text-[11px]">
              <th className="px-2 py-2 w-9 text-center font-bold">✓</th>
              <th className="px-2 py-2 w-8 text-center font-bold">#</th>
              <th className="px-3 py-2 text-start font-bold">الصنف</th>
              <th className="px-2 py-2 w-16 text-center font-bold">الطلبات</th>
              <th className="px-2 py-2 w-20 text-center font-bold bg-[#9e8959]">المطلوب</th>
              <th className="px-2 py-2 w-16 text-center font-bold">المخزون</th>
              <th className="px-2 py-2 w-16 text-center font-bold">النقص</th>
            </tr>
          </thead>
          {sections.map((section) => (
            <tbody key={section.title}>
              <tr className="picking-group">
                <td colSpan={7} className={`px-3 pt-3 pb-1.5 text-xs font-black border-b-2 ${
                  section.unlinked ? "text-amber-900 border-amber-400" : "text-[#160f02] border-[#9e8959]"}`}>
                  {section.title}
                  <span className="font-normal text-stone-500"> · {section.lines.length} صنف</span>
                  {section.unlinked && <span className="font-normal text-amber-800"> — تُجهّز يدوياً، لا رصيد لها في النظام</span>}
                </td>
              </tr>
              {section.lines.map((line) => {
                const n = ++serial;
                const low = line.status === "Low";
                return (
                  <tr key={line.sku || line.product}
                    className={`border-b border-stone-200 ${low ? "bg-rose-50" : n % 2 ? "" : "bg-stone-50"}`}>
                    <td className="px-2 py-2 text-center"><Tick /></td>
                    <td className="px-1 py-2 text-center font-mono text-[10px] text-stone-400">{n}</td>
                    <td className="px-3 py-2 font-bold leading-snug">{line.product}</td>
                    <td className="px-2 py-2 text-center font-mono text-stone-500">{line.orders}</td>
                    <td className="px-2 py-2 text-center font-mono font-black text-[17px] bg-[#9e8959]/10">{line.needed}</td>
                    <td className="px-2 py-2 text-center font-mono text-stone-600">{section.unlinked ? "—" : line.available}</td>
                    <td className={`px-2 py-2 text-center font-mono font-black ${line.short > 0 ? "text-rose-700" : "text-stone-300"}`}>
                      {line.short > 0 ? line.short : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      ) : (
        <p className="py-8 text-center text-xs text-stone-400">لا توجد أصناف بحاجة للتجهيز حالياً.</p>
      )}

      <div className="grid grid-cols-2 gap-8 pt-8 break-inside-avoid">
        {["توقيع من قام بالتجهيز", "توقيع أمين المستودع"].map((label) => (
          <div key={label}>
            <div className="border-b border-dashed border-stone-400 h-8" />
            <p className="text-[11px] text-stone-500 pt-1">{label}</p>
          </div>
        ))}
      </div>

      {list.orders.length > 0 && <SortingSection orders={list.orders} />}
    </div>
  );
}

// Part 2 — after the walk: each order and what goes in its bag, one run per driver. Starts on a
// fresh page so the picking sheet above can be torn off and carried on its own.
function SortingSection({ orders }: { orders: PickingOrder[] }) {
  const piles = runs(orders, (o) => o.driver || "بدون سائق");
  return (
    <div className="picking-sorting mt-10 pt-4 border-t-2 border-[#160f02]">
      <p className="font-black text-lg leading-tight">توزيع الأصناف على الطلبات</p>
      <p className="text-[11px] text-stone-500 pb-3">كل طلب وما يوضع في كيسه، بعد فك البكجات — مرتبة حسب السائق</p>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#160f02] text-white text-[11px]">
            <th className="px-2 py-2 w-9 text-center font-bold">✓</th>
            <th className="px-3 py-2 w-36 text-start font-bold">الطلب</th>
            <th className="px-3 py-2 text-start font-bold">الأصناف</th>
            <th className="px-2 py-2 w-16 text-center font-bold">القطع</th>
          </tr>
        </thead>
        {piles.map((pile) => (
          <tbody key={pile.key}>
            <tr className="picking-group">
              <td colSpan={4} className="px-3 pt-3 pb-1.5 text-xs font-black text-[#160f02] border-b-2 border-[#9e8959]">
                {pile.key}
                <span className="font-normal text-stone-500"> · {pile.items.length} طلب · {
                  pile.items.reduce((n, o) => n + o.items.reduce((m, i) => m + i.quantity, 0), 0)} قطعة</span>
              </td>
            </tr>
            {pile.items.map((order, i) => (
              <tr key={order.order_number} className={`border-b border-stone-200 align-top ${i % 2 ? "bg-stone-50" : ""}`}>
                <td className="px-2 py-2 text-center"><Tick /></td>
                <td className="px-3 py-2">
                  <p className="font-mono font-black text-[12px] break-all" dir="ltr">{order.order_number}</p>
                  <p className="text-[11px] font-bold leading-snug">{order.customer || "—"}</p>
                  {order.city && <p className="text-[10px] text-stone-500">{order.city}</p>}
                </td>
                <td className="px-3 py-2">
                  <ul className="space-y-0.5">
                    {order.items.map((item, k) => (
                      <li key={`${item.sku ?? item.product}-${k}`} className="flex items-baseline gap-2 text-[12px]">
                        <span className="font-mono font-black text-[13px] w-7 shrink-0 text-center rounded bg-[#9e8959]/15">{item.quantity}</span>
                        <span className="flex-1 leading-snug">{item.product}</span>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="px-2 py-2 text-center font-mono font-black text-[15px]">
                  {order.items.reduce((n, item) => n + item.quantity, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

export function PickingListModal({
  list, scope, onClose,
}: { list: PickingList; scope?: string; onClose: () => void }) {
  return (
    // `print-flow`: in print this overlay and everything around it lose their fixed position,
    // scrolling and frames (globals.css), so the sheet runs onto as many pages as it needs.
    <div className="print-flow fixed inset-0 bg-stone-900/50 backdrop-blur-xs z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-3xl my-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200 no-print">
          <h3 className="text-sm font-black text-stone-900 flex items-center gap-2">
            <PackageSearch className="w-4 h-4 text-[#9e8959]" />
            <span>كشف تجهيز الطلبات</span>
          </h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={printArea}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold cursor-pointer">
              <Printer className="w-4 h-4" />
              <span>طباعة / حفظ PDF</span>
            </button>
            <button type="button" onClick={onClose} aria-label="إغلاق"
              className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 grid place-items-center cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="print-area p-5">
          <PickingListDocument list={list} scope={scope} />
        </div>
      </div>
    </div>
  );
}
