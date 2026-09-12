"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Package,
  Search,
  AlertTriangle,
  CheckCircle2,
  History,
  Boxes,
  Loader2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useLoading } from "@/lib/loading-context";

interface Product {
  sku: string;
  name_ar: string;
  category: string;
  category_label: string;
  cost_price: number;
  price: number;
  sale_price: number | null;
  stock: number;
  reserved: number;
  reorder: number;
}

interface Movement {
  id: string;
  date: string;
  sku: string;
  name: string;
  type: "in" | "out";
  type_label: string;
  qty: number;
  ref: string;
}

export default function InventoryPage() {
  const { startLoading, stopLoading } = useLoading();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<"catalog" | "movements">("catalog");
  const [selectedCat, setSelectedCat] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Stock Movement Modal
  const [movementModal, setMovementModal] = useState(false);
  const [selectedProductSku, setSelectedProductSku] = useState("");
  const [movementType, setMovementType] = useState("purchase_in");
  const [movementQty, setMovementQty] = useState(10);
  const [movementRef, setMovementRef] = useState("");
  const [isSubmittingMovement, setIsSubmittingMovement] = useState(false);
  const [movementError, setMovementError] = useState<string | null>(null);

  async function loadInventory() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/inventory", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر تحميل بيانات المخزون.");
      setProducts(data.products || []);
      setMovements(data.movements || []);
      setSelectedProductSku((prev) => prev || data.products?.[0]?.sku || "");
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "تعذر تحميل بيانات المخزون.");
    } finally {
      setIsLoading(false);
    }
  }

  // Fetch on mount via .then() continuations only (isLoading already starts
  // `true`) so real data — never a mock array — backs this screen, and a
  // page refresh always reflects what's actually in the database.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/inventory", { cache: "no-store" })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setLoadError(data.error || "تعذر تحميل بيانات المخزون.");
          return;
        }
        setProducts(data.products || []);
        setMovements(data.movements || []);
        setSelectedProductSku(data.products?.[0]?.sku || "");
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "تعذر تحميل بيانات المخزون.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const p of products) {
      const entry = map.get(p.category) || { label: p.category_label, count: 0 };
      entry.count += 1;
      map.set(p.category, entry);
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, name: `${v.label} (${v.count})` }));
  }, [products]);

  const lowStockProducts = products.filter(p => p.stock <= p.reorder);

  const filtered = products.filter((p) => {
    const matchesCat = selectedCat === "all" || p.category === selectedCat;
    const matchesSearch = p.name_ar.includes(searchTerm) || p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleRecordMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingMovement) return; // prevent double submission
    if (!selectedProductSku) {
      setMovementError("الرجاء اختيار صنف.");
      return;
    }
    if (!Number.isFinite(movementQty) || movementQty <= 0) {
      setMovementError("الرجاء إدخال كمية صحيحة أكبر من صفر.");
      return;
    }

    setIsSubmittingMovement(true);
    setMovementError(null);
    startLoading({
      ar: "جاري ترحيل حركة المخزون وتحديث المستودع المركزي...",
      en: "Posting inventory movement to central warehouse...",
    });

    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: selectedProductSku,
          type: movementType,
          quantity: movementQty,
          reference: movementRef,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل تسجيل حركة المخزون.");
      }

      // Refetch from the server — this both confirms the write really
      // persisted and keeps stock/reserved numbers exactly in sync with
      // the database rather than a hand-rolled client-side recompute.
      await loadInventory();
      setMovementModal(false);
      setMovementRef("");
      setMovementQty(10);
    } catch (err: unknown) {
      setMovementError(err instanceof Error ? err.message : "فشل تسجيل حركة المخزون.");
    } finally {
      setIsSubmittingMovement(false);
      stopLoading();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <Package className="w-6 h-6 text-amber-500" />
            <span>كتالوج المنتجات والمستودعات والمخزون</span>
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            إدارة مستودع عمان المركزي، حركات التوريد والصرف، وتتبع أرباح المنتجات
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setMovementError(null); setMovementModal(true); }}
            disabled={products.length === 0}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 font-bold text-sm rounded-xl shadow-xs transition"
          >
            <Boxes className="w-4 h-4" />
            <span>تسجيل حركة توريد / صرف مخزون</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">{loadError}</div>
          <button onClick={loadInventory} className="font-bold underline shrink-0">إعادة المحاولة</button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-stone-400 text-xs bg-white rounded-2xl border border-stone-200">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>جاري تحميل بيانات المخزون من قاعدة البيانات...</span>
        </div>
      ) : (
      <>
      {/* Low Stock Warning Banner */}
      {lowStockProducts.length > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-amber-500/10 border border-amber-300/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-bold shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-amber-950">تنبيه مستودع: أصناف قاربت على النفاد ({lowStockProducts.length} أصناف)</h4>
              <p className="text-xs text-amber-900 mt-0.5">
                {lowStockProducts.slice(0, 4).map(p => p.name_ar).join('، ')}
                {lowStockProducts.length > 4 ? ' ...' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setSelectedCat("all");
              setSearchTerm("");
              setCurrentView("catalog");
            }}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shrink-0 self-start md:self-auto transition"
          >
            عرض الأصناف لطلب كميات جديدة
          </button>
        </div>
      )}

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-xs font-bold text-stone-500">إجمالي الأصناف المعتمدة</p>
          <p className="text-2xl font-black text-stone-900 mt-1">{products.length} منتج</p>
          <p className="text-[11px] text-stone-400 mt-0.5">عبر {categories.length} خطوط تجميلية</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-xs font-bold text-stone-500">القطع الجاهزة بالمستودع</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">
            {products.reduce((acc, p) => acc + p.stock, 0)} قطعة
          </p>
          <p className="text-[11px] text-stone-400 mt-0.5">جاهزة للتسليم المباشر</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-xs font-bold text-stone-500">القطع المحجوزة للطلبيات</p>
          <p className="text-2xl font-black text-amber-600 mt-1">
            {products.reduce((acc, p) => acc + p.reserved, 0)} قطعة
          </p>
          <p className="text-[11px] text-stone-400 mt-0.5">مخصصة لطلبات قيد التوصيل</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-xs font-bold text-stone-500">القيمة الإجمالية للمخزون</p>
          <p className="text-2xl font-black text-stone-900 mt-1">
            {formatCurrency(products.reduce((acc, p) => acc + (p.stock * p.cost_price), 0))}
          </p>
          <p className="text-[11px] text-stone-400 mt-0.5">محسوبة بسعر التكلفة</p>
        </div>
      </div>

      {/* Toggle View: Catalog vs Audit Trail */}
      <div className="flex items-center justify-between border-b border-stone-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentView("catalog")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${
              currentView === "catalog"
                ? "bg-stone-900 text-white shadow-xs"
                : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200"
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>كتالوج المنتجات والأسعار</span>
          </button>
          <button
            onClick={() => setCurrentView("movements")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${
              currentView === "movements"
                ? "bg-stone-900 text-white shadow-xs"
                : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>سجل حركات المخزون والتوريد (Audit Log)</span>
          </button>
        </div>
      </div>

      {currentView === "catalog" ? (
        <>
          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[{ id: "all", name: `كافة المنتجات (${products.length})` }, ...categories].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCat(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition border ${
                  selectedCat === cat.id
                    ? "bg-stone-900 text-amber-400 border-stone-900 shadow-xs"
                    : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="bg-white p-3 rounded-2xl border border-stone-200 shadow-xs">
            <div className="relative">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                placeholder="بحث باسم المنتج أو الرمز (SKU)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 text-stone-800"
              />
            </div>
          </div>

          {/* Products Table with Profit Margin Analysis */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-stone-400 text-xs">لا توجد منتجات مطابقة.</div>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
                  <tr>
                    <th className="py-3 px-4">رمز المنتج</th>
                    <th className="py-3 px-4">اسم المنتج</th>
                    <th className="py-3 px-4">التصنيف</th>
                    <th className="py-3 px-4">سعر التكلفة</th>
                    <th className="py-3 px-4">سعر البيع</th>
                    <th className="py-3 px-4">هامش الربح</th>
                    <th className="py-3 px-4">المتاح بالمستودع</th>
                    <th className="py-3 px-4">المحجوز</th>
                    <th className="py-3 px-4">حالة المخزون</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filtered.map((product) => {
                    const isLow = product.stock <= product.reorder;
                    const effectivePrice = product.sale_price || product.price;
                    const margin = effectivePrice - product.cost_price;
                    const marginPercent = effectivePrice > 0 ? Math.round((margin / effectivePrice) * 100) : 0;

                    return (
                      <tr key={product.sku} className="hover:bg-stone-50/70 transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-stone-500">
                          {product.sku}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-stone-900">
                          {product.name_ar}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-stone-100 text-stone-700">
                            {product.category_label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-stone-500">
                          {formatCurrency(product.cost_price)}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-stone-900 font-mono">
                          {formatCurrency(product.price)}
                          {product.sale_price && (
                            <div className="text-[10px] text-amber-600 font-semibold">عرض: {formatCurrency(product.sale_price)}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-bold font-mono text-emerald-700">
                          +{formatCurrency(margin)} <span className="text-[10px] font-normal text-emerald-600">({marginPercent}%)</span>
                        </td>
                        <td className="py-3.5 px-4 font-bold font-mono text-sm text-stone-900">
                          {product.stock} قطعة
                        </td>
                        <td className="py-3.5 px-4 font-mono text-stone-500">
                          {product.reserved} قطعة
                        </td>
                        <td className="py-3.5 px-4">
                          {isLow ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <AlertTriangle className="w-3 h-3" />
                              <span>قارب على النفاد</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>متوفر</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </>
      ) : (
        /* Inventory Movements Audit Trail */
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-stone-100 flex items-center justify-between">
            <h3 className="font-bold text-sm text-stone-900">سجل حركات المخزون والتوريد (Audit Trail)</h3>
            <span className="text-xs text-stone-400">سجل موثق للحركات</span>
          </div>

          {movements.length === 0 ? (
            <div className="py-16 text-center text-stone-400 text-xs">لا توجد حركات مسجلة بعد.</div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
                <tr>
                  <th className="py-3 px-4">رقم الحركة</th>
                  <th className="py-3 px-4">التاريخ والوقت</th>
                  <th className="py-3 px-4">المنتج</th>
                  <th className="py-3 px-4">نوع الحركة</th>
                  <th className="py-3 px-4">الكمية</th>
                  <th className="py-3 px-4">المرجع / الفاتورة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {movements.map((mov) => (
                  <tr key={mov.id} className="hover:bg-stone-50/70 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-stone-500">
                      {mov.id.slice(0, 8)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-stone-600">
                      {mov.date}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-stone-900">{mov.name}</div>
                      <div className="font-mono text-[10px] text-stone-400">{mov.sku}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        mov.qty > 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-purple-50 text-purple-700 border border-purple-200"
                      }`}>
                        <span>{mov.type_label}</span>
                      </span>
                    </td>
                    <td className={`py-3.5 px-4 font-mono font-bold text-sm ${mov.qty > 0 ? 'text-emerald-600' : 'text-stone-900'}`}>
                      {mov.qty > 0 ? `+${mov.qty}` : mov.qty} قطعة
                    </td>
                    <td className="py-3.5 px-4 text-stone-600 font-medium">
                      {mov.ref}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}
      </>
      )}

      {/* Stock Movement Registration Modal */}
      {movementModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleRecordMovement}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg text-stone-900">تسجيل حركة مخزون جديدة</h3>
                <p className="text-xs text-stone-500 mt-0.5">توريد من الموردين، تسوية جرد، أو تسجيل تالف</p>
              </div>
              <button
                type="button"
                onClick={() => setMovementModal(false)}
                disabled={isSubmittingMovement}
                className="p-1 rounded-lg bg-stone-100 text-stone-500 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">اختر الصنف / المنتج:</label>
                <select
                  value={selectedProductSku}
                  onChange={(e) => setSelectedProductSku(e.target.value)}
                  required
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 font-bold"
                >
                  {products.map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.name_ar} (الرصيد الحالي: {p.stock})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">نوع الحركة:</label>
                  <select
                    value={movementType}
                    onChange={(e) => setMovementType(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 font-semibold"
                  >
                    <option value="purchase_in">توريد جديد (+)</option>
                    <option value="sale_out">صرف يدوي (-)</option>
                    <option value="adjustment">تسوية جرد (+/-)</option>
                    <option value="damaged">تالف / عينات (-)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">الكمية (قطعة):</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={movementQty}
                    onChange={(e) => setMovementQty(parseInt(e.target.value, 10) || 0)}
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 font-mono font-bold text-center"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">رقم الفاتورة / المرجع:</label>
                <input
                  type="text"
                  value={movementRef}
                  onChange={(e) => setMovementRef(e.target.value)}
                  placeholder="مثال: بوليصة شحن مصنع إيطاليا #8841"
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {movementError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{movementError}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={isSubmittingMovement}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center gap-2"
              >
                {isSubmittingMovement && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSubmittingMovement ? "جاري التحديث..." : "تأكيد وتحديث الرصيد بالمستودع"}</span>
              </button>
              <button
                type="button"
                onClick={() => setMovementModal(false)}
                disabled={isSubmittingMovement}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 rounded-xl text-xs font-medium"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
