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
import { Printer, X, PackageSearch, AlertTriangle } from "lucide-react";
import { printArea } from "@/lib/print";
import { formatDate } from "@/lib/utils";

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

export function PickingListDocument({ list, scope }: { list: PickingList; scope?: string }) {
  // Grouped for the walk: one heading per shelf area, lines already in the right order.
  const groups: { category: string; lines: PickingLine[] }[] = [];
  for (const line of list.lines) {
    const name = line.category || "أخرى";
    const last = groups[groups.length - 1];
    if (last && last.category === name) last.lines.push(line);
    else groups.push({category: name, lines: [line]});
  }

  return (
    <div className="bg-white text-stone-900 text-sm" dir="rtl">
      {/* Letterhead */}
      <div className="flex items-start justify-between gap-4 border-b-2 border-[#160f02] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-12 h-12 rounded-xl bg-[#160f02] flex items-center justify-center p-2 shrink-0">
            <img src="/brand/betolla-logo-clean.png" alt="" className="w-full h-full object-contain brightness-0 invert" />
          </div>
          <div>
            <p className="font-black text-base leading-tight">شركة بيتولا لمستحضرات التجميل</p>
            <p className="text-[11px] text-stone-500">Betolla Cosmetics — عمّان، الأردن</p>
          </div>
        </div>
        <div className="text-end shrink-0">
          <p className="font-black text-base leading-tight">كشف تجهيز الطلبات</p>
          <p className="text-[11px] text-stone-500">Inventory Picking List</p>
          {scope && <p className="mt-1 text-[11px]"><span className="text-stone-500">النطاق: </span><b>{scope}</b></p>}
        </div>
      </div>

      {/* What this sheet covers */}
      <div className="grid grid-cols-2 sm:grid-cols-5 print:grid-cols-5 gap-2 py-3 break-inside-avoid">
        {[
          ["إجمالي القطع", list.total_units, "bg-[#160f02] border-[#160f02] text-white"],
          ["عدد الأصناف", list.total_products, "bg-stone-50 border-stone-300 text-stone-900"],
          ["عدد الطلبات", list.order_count, "bg-stone-50 border-stone-300 text-stone-900"],
          ["أصناف ناقصة", list.short_products, list.short_products > 0
            ? "bg-rose-50 border-rose-300 text-rose-900" : "bg-emerald-50 border-emerald-300 text-emerald-900"],
          ["تاريخ الكشف", formatDate(list.generated_at?.slice(0, 10)), "bg-stone-50 border-stone-300 text-stone-900"],
        ].map(([label, value, cls]) => (
          <div key={String(label)} className={`rounded-xl border px-3 py-2 ${cls}`}>
            <p className="text-[10px] font-bold opacity-80">{String(label)}</p>
            <p className="font-mono font-black text-lg leading-tight">{String(value)}</p>
          </div>
        ))}
      </div>

      {list.short_products > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-300 px-3 py-2 text-[11px] text-rose-900 font-bold break-inside-avoid">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{list.short_products} صنف غير متوفر بالكمية المطلوبة — راجع العمود الأخير قبل التجهيز.</span>
        </div>
      )}

      {/* The list itself, one section per shelf area */}
      {groups.length ? groups.map((group) => (
        <div key={group.category} className="pt-3 break-inside-avoid">
          <p className="text-xs font-black bg-stone-100 border-s-4 border-[#9e8959] px-3 py-1.5">{group.category}</p>
          <table className="w-full text-xs border border-stone-200 border-t-0">
            <thead>
              <tr className="bg-[#160f02] text-white text-[11px]">
                <th className="px-2 py-2 text-center w-8">✓</th>
                <th className="px-3 py-2 text-start">الصنف</th>
                <th className="px-3 py-2 text-start w-36">الرمز</th>
                <th className="px-2 py-2 text-center w-20">المطلوب</th>
                <th className="px-2 py-2 text-center w-20">بالمخزون</th>
                <th className="px-2 py-2 text-center w-20">النقص</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {group.lines.map((line) => (
                <tr key={line.sku} className={`break-inside-avoid ${line.status === "Low" ? "bg-rose-50/70" : ""}`}>
                  {/* A box to tick as each product is pulled: this sheet is used standing up. */}
                  <td className="px-2 py-2 text-center">
                    <span className="inline-block w-3.5 h-3.5 border-2 border-stone-400 rounded-[3px]" />
                  </td>
                  <td className="px-3 py-2 font-semibold">
                    {line.product}
                    <span className="block text-[10px] font-normal text-stone-500">في {line.orders} طلب</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-stone-500" dir="ltr">{line.sku}</td>
                  <td className="px-2 py-2 text-center font-mono font-black text-base">{line.needed}</td>
                  <td className="px-2 py-2 text-center font-mono">{line.available}</td>
                  <td className="px-2 py-2 text-center font-mono font-bold text-rose-700">
                    {line.short > 0 ? line.short : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )) : (
        <p className="py-8 text-center text-xs text-stone-400">لا توجد أصناف بحاجة للتجهيز حالياً.</p>
      )}

      {list.unlinked.length > 0 && (
        <div className="pt-3 break-inside-avoid">
          <p className="text-xs font-black bg-amber-50 border-s-4 border-amber-500 px-3 py-1.5 text-amber-900">
            أصناف غير مربوطة بالمخزون — تُجهّز يدوياً ولا يظهر رصيدها
          </p>
          <table className="w-full text-xs border border-amber-200 border-t-0">
            <tbody className="divide-y divide-amber-100">
              {list.unlinked.map((u, i) => (
                <tr key={`${u.order_number}-${i}`}>
                  <td className="px-2 py-2 text-center w-8">
                    <span className="inline-block w-3.5 h-3.5 border-2 border-stone-400 rounded-[3px]" />
                  </td>
                  <td className="px-3 py-2 font-semibold">{u.product}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-stone-500 w-36" dir="ltr">{u.order_number}</td>
                  <td className="px-2 py-2 text-center font-mono font-black text-base w-20">{u.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 pt-8 break-inside-avoid">
        {["توقيع من قام بالتجهيز", "توقيع أمين المستودع"].map((label) => (
          <div key={label}>
            <div className="border-b border-dashed border-stone-400 h-10" />
            <p className="text-[11px] text-stone-500 pt-1">{label}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-stone-400 pt-4 text-center">
        الكميات معروضة بعد فك البكجات إلى أصنافها — بيتولا كوزمتكس
      </p>

      {list.orders.length > 0 && <SortingSection orders={list.orders} />}
    </div>
  );
}

// After the walk: one card per order, packages already opened, one pile per driver. Starts on a
// fresh page so the picking sheet above can be torn off and carried on its own.
function SortingSection({ orders }: { orders: PickingOrder[] }) {
  const piles: { driver: string; orders: PickingOrder[] }[] = [];
  for (const order of orders) {
    const driver = order.driver || "بدون سائق";
    const last = piles[piles.length - 1];
    if (last && last.driver === driver) last.orders.push(order);
    else piles.push({driver, orders: [order]});
  }

  return (
    <div className="mt-8 pt-4 border-t-2 border-[#160f02] print:break-before-page print:mt-0 print:border-t-0">
      <p className="font-black text-base leading-tight">توزيع الأصناف على الطلبات</p>
      <p className="text-[11px] text-stone-500 pb-2">كل طلب بأصنافه بعد فك البكجات — للفرز في الأكياس حسب السائق</p>
      {piles.map((pile) => (
        <div key={pile.driver} className="pt-3">
          <p className="text-xs font-black bg-stone-100 border-s-4 border-[#9e8959] px-3 py-1.5 break-after-avoid">
            {pile.driver} <span className="font-normal text-stone-500">· {pile.orders.length} طلب</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-2 pt-2">
            {pile.orders.map((order) => (
              <div key={order.order_number} className="rounded-xl border border-stone-200 px-3 py-2 break-inside-avoid">
                <div className="flex items-baseline justify-between gap-2 border-b border-stone-100 pb-1">
                  <span className="font-mono font-black text-xs" dir="ltr">{order.order_number}</span>
                  <span className="text-[10px] text-stone-500 truncate">
                    {[order.customer, order.city].filter(Boolean).join(" — ")}
                  </span>
                </div>
                <ul className="pt-1 space-y-0.5">
                  {order.items.map((item, i) => (
                    <li key={`${item.sku ?? item.product}-${i}`} className="flex items-center gap-2 text-[11px]">
                      <span className="inline-block w-3 h-3 border-2 border-stone-400 rounded-[3px] shrink-0" />
                      <span className="flex-1">{item.product}</span>
                      <span className="font-mono font-black">×{item.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PickingListModal({
  list, scope, onClose,
}: { list: PickingList; scope?: string; onClose: () => void }) {
  return (
    // In print the overlay has to become ordinary flow: a fixed, scrolling box is one page tall, and
    // this sheet usually runs to several.
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs z-50 flex items-start justify-center p-4 overflow-y-auto
      print:static print:block print:p-0 print:overflow-visible print:bg-transparent print:backdrop-blur-none"
      onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-3xl my-6 shadow-xl print:static print:my-0 print:max-w-none print:rounded-none print:shadow-none"
        onClick={(e) => e.stopPropagation()}>
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
