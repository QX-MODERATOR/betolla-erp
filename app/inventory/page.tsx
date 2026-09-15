"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Package,
  Search,
  AlertTriangle,
  CheckCircle2,
  ArrowDownRight,
  ArrowUpRight,
  History,
  Boxes,
  Undo2
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useLoading } from "@/lib/loading-context";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import type { BusinessProduct, BusinessMovement } from "@/lib/business";

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  purchase_in: "توريد بضاعة جديدة",
  sale_out: "صرف لطلبية مبيعات",
  adjustment: "تسوية جرد",
  damaged: "تالف / عينات",
  return_in: "مرتجع من عميل",
};

export default function InventoryPage() {
  const { startLoading, stopLoading } = useLoading();
  const [products, setProducts] = useState<BusinessProduct[]>([]);
  const [movements, setMovements] = useState<BusinessMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentView, setCurrentView] = useState<"catalog" | "movements">("catalog");
  const [selectedCat, setSelectedCat] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const busy = useRef(false);

  const reload = useCallback(async () => {
    try {
      const data = await loadBusiness<{ catalog: BusinessProduct[]; movements: BusinessMovement[] }>("/api/inventory");
      setProducts(data.catalog);
      setMovements(data.movements);
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "تعذر تحميل بيانات المخزون.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  // Stock Movement Modal
  const [movementModal, setMovementModal] = useState(false);
  const [selectedProductSku, setSelectedProductSku] = useState("");
  const [movementType, setMovementType] = useState("purchase_in");
  const [movementDirection, setMovementDirection] = useState<"+" | "-">("+");
  const [movementQty, setMovementQty] = useState(10);
  const [movementRef, setMovementRef] = useState("");
  const [movementNotes, setMovementNotes] = useState("");

  const lowStockProducts = products.filter(p => p.stock <= p.reorder);

  const categories = Array.from(new Set(products.map(p => p.category))).map(cat => {
    const sample = products.find(p => p.category === cat);
    return { id: cat, name: `${sample?.category_label || cat} (${products.filter(p => p.category === cat).length})` };
  });

  const filtered = products.filter((p) => {
    const matchesCat = selectedCat === "all" || p.category === selectedCat;
    const matchesSearch = p.name_ar.includes(searchTerm) || p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const reversedIds = new Set(movements.filter(m => m.reference === "reversal" && m.reference_id).map(m => m.reference_id));

  const openMovementModal = () => {
    setSelectedProductSku(products[0]?.sku || "");
    setMovementType("purchase_in");
    setMovementDirection("+");
    setMovementQty(10);
    setMovementRef("");
    setMovementNotes("");
    setMovementModal(true);
  };

  const handleRecordMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current || !selectedProductSku) return;
    const product = products.find(p => p.sku === selectedProductSku);
    if (!product) return;
    busy.current = true;
    startLoading({
      ar: "جاري ترحيل حركة المخزون وتحديث المستودع المركزي...",
      en: "Posting inventory movement to central warehouse...",
    });
    try {
      const { movement } = await saveBusiness<{ movement: BusinessMovement; stock: number }>(
        "inventory-movement",
        "/api/inventory",
        { sku: selectedProductSku, type: movementType, quantity: movementQty, direction: movementDirection, reference: movementRef, notes: movementNotes }
      );
      await reload();
      setMovementModal(false);
      setMovementRef("");
      setMovementNotes("");
      alert(`تم تسجيل حركة المخزون بنجاح وتحديث كمية (${product.name_ar}) — الحركة: ${movement.quantity > 0 ? "+" : ""}${movement.quantity} قطعة.`);
    } catch (err) {
      alert("فشل تسجيل حركة المخزون: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      busy.current = false;
      stopLoading();
    }
  };

  const handleReverse = async (movement: BusinessMovement) => {
    if (busy.current) return;
    if (!confirm(`هل تريد عكس حركة (${movement.type === "purchase_in" || movement.type === "return_in" ? "+" : ""}${movement.quantity}) للصنف ${movement.name}؟`)) return;
    busy.current = true;
    startLoading({ ar: "جاري عكس حركة المخزون...", en: "Reversing inventory movement..." });
    try {
      await saveBusiness("inventory-reverse-" + movement.id, "/api/inventory", { movement_id: movement.id }, "PATCH");
      await reload();
      alert("تم عكس الحركة بنجاح وتحديث الرصيد.");
    } catch (err) {
      alert("فشل عكس الحركة: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      busy.current = false;
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
            إدارة مستودع عمان المركزي، حركات التوريد والصرف، وتتبع أرباح {products.length} منتج
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openMovementModal}
            disabled={loading || products.length === 0}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 font-bold text-sm rounded-xl shadow-xs transition"
          >
            <Boxes className="w-4 h-4" />
            <span>تسجيل حركة توريد / صرف مخزون</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button onClick={() => { setLoading(true); void reload(); }} className="px-3 py-1 rounded-lg bg-red-600 text-white font-bold">إعادة المحاولة</button>
        </div>
      )}

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
                {lowStockProducts.slice(0, 4).map(p => p.name_ar).join("، ")}
                {lowStockProducts.length > 4 ? ` وغيرها (${lowStockProducts.length - 4})` : ""} وصلت لأقل من الحد الأدنى للطلب.
              </p>
            </div>
          </div>
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

      {loading ? (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-10 text-center text-sm text-stone-400">
          جاري تحميل بيانات المخزون...
        </div>
      ) : currentView === "catalog" ? (
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
                    const marginPercent = effectivePrice ? Math.round((margin / effectivePrice) * 100) : 0;

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
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="py-8 text-center text-stone-400">لا توجد أصناف مطابقة.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Inventory Movements Audit Trail */
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-stone-100 flex items-center justify-between">
            <h3 className="font-bold text-sm text-stone-900">سجل حركات المخزون والتوريد (Audit Trail)</h3>
            <span className="text-xs text-stone-400">سجل موثق للحركات</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
                <tr>
                  <th className="py-3 px-4">التاريخ والوقت</th>
                  <th className="py-3 px-4">المنتج</th>
                  <th className="py-3 px-4">نوع الحركة</th>
                  <th className="py-3 px-4">الكمية</th>
                  <th className="py-3 px-4">المرجع / الفاتورة</th>
                  <th className="py-3 px-4 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {movements.map((mov) => {
                  const isReversal = mov.reference === "reversal";
                  const alreadyReversed = reversedIds.has(mov.id);
                  return (
                    <tr key={mov.id} className="hover:bg-stone-50/70 transition">
                      <td className="py-3.5 px-4 font-mono text-stone-600">
                        {new Date(mov.created_at).toLocaleString("ar")}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-stone-900">{mov.name}</div>
                        <div className="font-mono text-[10px] text-stone-400">{mov.sku}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          mov.quantity > 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-purple-50 text-purple-700 border border-purple-200"
                        }`}>
                          {mov.quantity > 0 ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          <span>{isReversal ? "عكس حركة" : (MOVEMENT_TYPE_LABELS[mov.type] || mov.type)}</span>
                        </span>
                      </td>
                      <td className={`py-3.5 px-4 font-mono font-bold text-sm ${mov.quantity > 0 ? 'text-emerald-600' : 'text-stone-900'}`}>
                        {mov.quantity > 0 ? `+${mov.quantity}` : mov.quantity} قطعة
                      </td>
                      <td className="py-3.5 px-4 text-stone-600 font-medium">
                        {mov.reference && mov.reference !== "reversal" ? mov.reference : (mov.notes || "—")}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {!isReversal && !alreadyReversed && (
                          <button
                            onClick={() => handleReverse(mov)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-[10px] font-bold"
                            title="عكس هذه الحركة"
                          >
                            <Undo2 className="w-3 h-3" />
                            <span>عكس</span>
                          </button>
                        )}
                        {!isReversal && alreadyReversed && (
                          <span className="text-[10px] text-stone-400">تم العكس</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {movements.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-stone-400">لا توجد حركات مخزون مسجلة بعد.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
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
                className="p-1 rounded-lg bg-stone-100 text-stone-500"
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
                    <option value="return_in">مرتجع من عميل (+)</option>
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
                    onChange={(e) => setMovementQty(parseInt(e.target.value, 10) || 1)}
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 font-mono font-bold text-center"
                  />
                </div>
              </div>

              {movementType === "adjustment" && (
                <div>
                  <label className="font-bold text-stone-700 block mb-1">اتجاه التسوية:</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setMovementDirection("+")}
                      className={`flex-1 py-2 rounded-xl font-bold border ${movementDirection === "+" ? "bg-emerald-500 text-white border-emerald-500" : "bg-stone-50 border-stone-200 text-stone-600"}`}>
                      زيادة (+)
                    </button>
                    <button type="button" onClick={() => setMovementDirection("-")}
                      className={`flex-1 py-2 rounded-xl font-bold border ${movementDirection === "-" ? "bg-rose-500 text-white border-rose-500" : "bg-stone-50 border-stone-200 text-stone-600"}`}>
                      نقصان (-)
                    </button>
                  </div>
                </div>
              )}

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

              <div>
                <label className="font-bold text-stone-700 block mb-1">ملاحظات إضافية:</label>
                <textarea
                  rows={2}
                  value={movementNotes}
                  onChange={(e) => setMovementNotes(e.target.value)}
                  placeholder="سجل أي ملاحظات بخصوص حالة الشحنة أو سبب التسوية..."
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl font-bold text-xs shadow-xs transition"
              >
                تأكيد وتحديث الرصيد بالمستودع
              </button>
              <button
                type="button"
                onClick={() => setMovementModal(false)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium"
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
