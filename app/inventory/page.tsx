"use client";

import { useState } from "react";
import { 
  Package, 
  Search, 
  Filter, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowUpDown,
  Tag,
  Plus,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  History,
  FileText,
  DollarSign,
  Boxes,
  Truck
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const INITIAL_PRODUCTS = [
  // Electrical
  { sku: "EL-GAMMA-01", name_ar: "سشوار جاما توربو ستار 2500 واط", category: "electrical", category_label: "أجهزة تصفيف", cost_price: 25.000, price: 45.000, sale_price: null, stock: 35, reserved: 2, reorder: 10 },
  { sku: "EL-MAC-02", name_ar: "مملس الشعر الاحترافي ماك تيتانيوم", category: "electrical", category_label: "أجهزة تصفيف", cost_price: 18.000, price: 35.000, sale_price: null, stock: 24, reserved: 1, reorder: 10 },

  // Lenses
  { sku: "LENS-VENUS-02", name_ar: "عدسات بيتو فينوس اللاصقة (سليكون هيدروجيل)", category: "lenses", category_label: "عدسات بيتو", cost_price: 11.000, price: 25.000, sale_price: 22.500, stock: 120, reserved: 15, reorder: 30 },
  { sku: "LENS-CARE-01", name_ar: "طقم العناية بعدسات بيتو مع المحلول", category: "lenses", category_label: "عدسات بيتو", cost_price: 10.000, price: 25.000, sale_price: 22.500, stock: 85, reserved: 8, reorder: 20 },

  // Plasma
  { sku: "PL-SET4-05", name_ar: "بكج بلازما الرباعي المتكامل (شامبو + بلسم + ماسك + سيروم)", category: "plasma", category_label: "بلازما للشعر", cost_price: 17.000, price: 37.000, sale_price: 33.300, stock: 45, reserved: 6, reorder: 15 },
  { sku: "PL-SET2-06", name_ar: "مجموعة شامبو وبلسم بلازما", category: "plasma", category_label: "بلازما للشعر", cost_price: 11.000, price: 25.000, sale_price: 22.500, stock: 68, reserved: 4, reorder: 20 },
  { sku: "PL-SHAMP-02", name_ar: "شامبو بلازما للشعر 500 مل", category: "plasma", category_label: "بلازما للشعر", cost_price: 5.500, price: 13.000, sale_price: 11.700, stock: 140, reserved: 12, reorder: 30 },
  { sku: "PL-COND-04", name_ar: "بلسم بلازما للشعر 500 مل", category: "plasma", category_label: "بلازما للشعر", cost_price: 5.500, price: 13.000, sale_price: 11.700, stock: 115, reserved: 8, reorder: 30 },
  { sku: "PL-MASK-03", name_ar: "ماسك بلازما لترميم الشعر", category: "plasma", category_label: "بلازما للشعر", cost_price: 6.000, price: 14.000, sale_price: 12.600, stock: 90, reserved: 5, reorder: 25 },
  { sku: "PL-SERUM-01", name_ar: "سيروم بلازما المغذي", category: "plasma", category_label: "بلازما للشعر", cost_price: 6.000, price: 14.000, sale_price: 12.600, stock: 82, reserved: 4, reorder: 20 },

  // Morphosis (Framesi Italy)
  { sku: "MOR-REINF-01", name_ar: "أمبولات وشامبو مورفوزيس رينفورسينج للشعر الخفيف", category: "morphosis", category_label: "مورفوزيس إيطاليا", cost_price: 26.000, price: 52.000, sale_price: 46.800, stock: 8, reserved: 3, reorder: 10 },
  { sku: "MOR-DENS-02", name_ar: "أمبولات وشامبو مورفوزيس دنسيفاينج لتساقط الشعر", category: "morphosis", category_label: "مورفوزيس إيطاليا", cost_price: 26.000, price: 52.000, sale_price: 46.800, stock: 9, reserved: 2, reorder: 10 },
  { sku: "MOR-REST-SET-1L", name_ar: "مجموعة ترميم مورفوزيس ريستركتشر 1000 مل", category: "morphosis", category_label: "مورفوزيس إيطاليا", cost_price: 22.000, price: 50.000, sale_price: 45.000, stock: 7, reserved: 4, reorder: 10 },
  { sku: "MOR-REST-SET-250", name_ar: "مجموعة ترميم مورفوزيس ريستركتشر 250 مل", category: "morphosis", category_label: "مورفوزيس إيطاليا", cost_price: 11.000, price: 23.000, sale_price: 20.700, stock: 55, reserved: 7, reorder: 15 },
  { sku: "MOR-LEAV-125", name_ar: "ليف ان مورفوزيس ريستركتشر 125 مل", category: "morphosis", category_label: "مورفوزيس إيطاليا", cost_price: 9.000, price: 20.000, sale_price: 18.000, stock: 60, reserved: 6, reorder: 15 },
  { sku: "MOR-REP-SET-1L", name_ar: "مجموعة معالجة مورفوزيس ريبير 1000 مل", category: "morphosis", category_label: "مورفوزيس إيطاليا", cost_price: 22.000, price: 50.000, sale_price: 45.000, stock: 6, reserved: 3, reorder: 10 },
  { sku: "MOR-OIL-SET-1L", name_ar: "مجموعة زيت مورفوزيس سوبليميس أويل 1000 مل", category: "morphosis", category_label: "مورفوزيس إيطاليا", cost_price: 22.000, price: 50.000, sale_price: 45.000, stock: 26, reserved: 2, reorder: 10 },
  { sku: "MOR-OIL-SER-05", name_ar: "سيروم زيت مورفوزيس سوبليميس أويل", category: "morphosis", category_label: "مورفوزيس إيطاليا", cost_price: 9.000, price: 20.000, sale_price: 18.000, stock: 48, reserved: 5, reorder: 12 },

  // Argan
  { sku: "ARG-REP-SET-500", name_ar: "مجموعة أرجان ريبير (شامبو + بلسم)", category: "argan", category_label: "أرجان للشعر", cost_price: 15.000, price: 32.000, sale_price: 28.800, stock: 74, reserved: 6, reorder: 20 },
  { sku: "ARG-REP-SHMP-500", name_ar: "شامبو أرجان ريبير 500 مل", category: "argan", category_label: "أرجان للشعر", cost_price: 8.000, price: 18.000, sale_price: 16.200, stock: 88, reserved: 8, reorder: 25 },
  { sku: "ARG-REP-COND-500", name_ar: "بلسم أرجان ريبير 500 مل", category: "argan", category_label: "أرجان للشعر", cost_price: 8.000, price: 18.000, sale_price: 16.200, stock: 79, reserved: 7, reorder: 25 },
  { sku: "ARG-HYD-SET-500", name_ar: "مجموعة أرجان هايدرو المرطبة (شامبو + بلسم)", category: "argan", category_label: "أرجان للشعر", cost_price: 15.000, price: 32.000, sale_price: 28.800, stock: 52, reserved: 4, reorder: 15 },
  { sku: "ARG-HYD-SHMP-500", name_ar: "شامبو أرجان هايدرو 500 مل", category: "argan", category_label: "أرجان للشعر", cost_price: 8.000, price: 18.000, sale_price: 16.200, stock: 95, reserved: 9, reorder: 25 },
  { sku: "ARG-HYD-COND-500", name_ar: "بلسم أرجان هايدرو 500 مل", category: "argan", category_label: "أرجان للشعر", cost_price: 8.000, price: 18.000, sale_price: 16.200, stock: 84, reserved: 7, reorder: 25 },

  // Proteins
  { sku: "PROT-MARACUJA-100", name_ar: "بروتين ماراكوجا البرازيلي 100 مل", category: "proteins", category_label: "بروتينات احترافية", cost_price: 12.000, price: 25.000, sale_price: 22.000, stock: 40, reserved: 5, reorder: 10 },
  { sku: "PROT-MARACUJA-250", name_ar: "بروتين ماراكوجا البرازيلي 250 مل", category: "proteins", category_label: "بروتينات احترافية", cost_price: 22.000, price: 45.000, sale_price: 40.000, stock: 25, reserved: 3, reorder: 8 },
  { sku: "PROT-MARACUJA-1L", name_ar: "بروتين ماراكوجا البرازيلي 1000 مل (لتر)", category: "proteins", category_label: "بروتينات احترافية", cost_price: 60.000, price: 120.000, sale_price: 105.000, stock: 4, reserved: 2, reorder: 5 },
];

const INITIAL_MOVEMENTS = [
  { id: "MOV-101", date: "2026-09-08 09:30", sku: "PL-SHAMP-02", name: "شامبو بلازما للشعر 500 مل", type: "in", type_label: "توريد من المورد", qty: 50, ref: "فاتورة توريد إيطاليا #8841" },
  { id: "MOV-102", date: "2026-09-07 14:15", sku: "MOR-REST-SET-1L", name: "مجموعة ترميم مورفوزيس لتر", type: "out", type_label: "صرف لطلبية مبيعات", qty: -3, ref: "طلب #BET-2026-002" },
  { id: "MOV-103", date: "2026-09-06 11:00", sku: "PROT-MARACUJA-1L", name: "بروتين ماراكوجا 1 لتر", type: "adjust", type_label: "تسوية جرد دوري", qty: -1, ref: "عينة فحص صالونات" },
];

export default function InventoryPage() {
  const [products, setProducts] = useState(INITIAL_PRODUCTS);
  const [movements, setMovements] = useState(INITIAL_MOVEMENTS);
  const [currentView, setCurrentView] = useState<"catalog" | "movements">("catalog");
  const [selectedCat, setSelectedCat] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Stock Movement Modal
  const [movementModal, setMovementModal] = useState(false);
  const [selectedProductSku, setSelectedProductSku] = useState(products[0]?.sku || "");
  const [movementType, setMovementType] = useState("purchase_in");
  const [movementQty, setMovementQty] = useState(10);
  const [movementRef, setMovementRef] = useState("");
  const [movementNotes, setMovementNotes] = useState("");

  const lowStockProducts = products.filter(p => p.stock <= p.reorder);

  const filtered = products.filter((p) => {
    const matchesCat = selectedCat === "all" || p.category === selectedCat;
    const matchesSearch = p.name_ar.includes(searchTerm) || p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleRecordMovement = (e: React.FormEvent) => {
    e.preventDefault();
    const product = products.find(p => p.sku === selectedProductSku);
    if (!product) return;

    const isNegative = movementType === "sale_out" || movementType === "damaged";
    const delta = isNegative ? -Math.abs(movementQty) : Math.abs(movementQty);

    // Update Product Stock
    setProducts(products.map(p => {
      if (p.sku === selectedProductSku) {
        return {
          ...p,
          stock: Math.max(0, p.stock + delta)
        };
      }
      return p;
    }));

    // Add to movements log
    const typeNames: Record<string, string> = {
      purchase_in: "توريد بضاعة جديدة",
      sale_out: "صرف لطلبية مبيعات",
      adjustment: "تسوية جرد",
      damaged: "تالف / عينات",
    };

    const newMov = {
      id: `MOV-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().replace('T', ' ').slice(0, 16),
      sku: product.sku,
      name: product.name_ar,
      type: delta > 0 ? "in" : "out",
      type_label: typeNames[movementType] || movementType,
      qty: delta,
      ref: movementRef || "إدخال يدوي من لوحة التحكم"
    };

    setMovements([newMov, ...movements]);
    setMovementModal(false);
    setMovementRef("");
    setMovementNotes("");
    alert(`تم تسجيل حركة المخزون بنجاح وتحديث كمية (${product.name_ar}) إلى رصيد جديد.`);
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
            إدارة مستودع عمان المركزي، حركات التوريد والصرف، وتتبع أرباح الـ 31 منتج
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setMovementModal(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-sm rounded-xl shadow-xs transition"
          >
            <Boxes className="w-4 h-4" />
            <span>تسجيل حركة توريد / صرف مخزون</span>
          </button>
        </div>
      </div>

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
                وصلت كميات (مورفوزيس رينفورسينج، ريستركتشر لتر، ريبير لتر، بروتين لتر) لأقل من الحد الأدنى للطلب.
              </p>
            </div>
          </div>
          <button 
            onClick={() => {
              setSelectedCat("morphosis");
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
          <p className="text-2xl font-black text-stone-900 mt-1">31 منتج</p>
          <p className="text-[11px] text-stone-400 mt-0.5">عبر 6 خطوط تجميلية</p>
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
            {[
              { id: "all", name: "كافة المنتجات (31)" },
              { id: "morphosis", name: "مورفوزيس الإيطالي (15)" },
              { id: "argan", name: "العناية بالأرجان (6)" },
              { id: "plasma", name: "مجموعة بلازما (6)" },
              { id: "proteins", name: "بروتين ماراكوجا (3)" },
              { id: "lenses", name: "عدسات بيتو (2)" },
              { id: "electrical", name: "أجهزة كهربائية (2)" },
            ].map((cat) => (
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
                    const marginPercent = Math.round((margin / effectivePrice) * 100);

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
                      {mov.id}
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
                        {mov.qty > 0 ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
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
