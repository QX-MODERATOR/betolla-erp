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
  Layers
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const CATEGORIES = [
  { id: "all", name: "كافة المنتجات (31)" },
  { id: "morphosis", name: "مورفوزيس الإيطالي (15)" },
  { id: "argan", name: "العناية بالأرجان (6)" },
  { id: "plasma", name: "مجموعة بلازما (6)" },
  { id: "proteins", name: "بروتين ماراكوجا (3)" },
  { id: "lenses", name: "عدسات بيتو (2)" },
  { id: "electrical", name: "أجهزة كهربائية (2)" },
];

const PRODUCTS = [
  // Electrical
  { sku: "EL-GAMMA-01", name_ar: "سشوار جاما توربو ستار 2500 واط", category: "electrical", category_label: "أجهزة تصفيف", price: 45.000, sale_price: null, stock: 35, reorder: 10 },
  { sku: "EL-MAC-02", name_ar: "مملس الشعر الاحترافي ماك تيتانيوم", category: "electrical", category_label: "أجهزة تصفيف", price: 35.000, sale_price: null, stock: 24, reorder: 10 },

  // Lenses
  { sku: "LENS-VENUS-02", name_ar: "عدسات بيتو فينوس اللاصقة (سليكون هيدروجيل)", category: "lenses", category_label: "عدسات بيتو", price: 25.000, sale_price: 22.500, stock: 120, reorder: 30 },
  { sku: "LENS-CARE-01", name_ar: "طقم العناية بعدسات بيتو مع المحلول", category: "lenses", category_label: "عدسات بيتو", price: 25.000, sale_price: 22.500, stock: 85, reorder: 20 },

  // Plasma
  { sku: "PL-SET4-05", name_ar: "بكج بلازما الرباعي المتكامل (شامبو + بلسم + ماسك + سيروم)", category: "plasma", category_label: "بلازما للشعر", price: 37.000, sale_price: 33.300, stock: 45, reorder: 15 },
  { sku: "PL-SET2-06", name_ar: "مجموعة شامبو وبلسم بلازما", category: "plasma", category_label: "بلازما للشعر", price: 25.000, sale_price: 22.500, stock: 68, reorder: 20 },
  { sku: "PL-SHAMP-02", name_ar: "شامبو بلازما للشعر 500 مل", category: "plasma", category_label: "بلازما للشعر", price: 13.000, sale_price: 11.700, stock: 140, reorder: 30 },
  { sku: "PL-COND-04", name_ar: "بلسم بلازما للشعر 500 مل", category: "plasma", category_label: "بلازما للشعر", price: 13.000, sale_price: 11.700, stock: 115, reorder: 30 },
  { sku: "PL-MASK-03", name_ar: "ماسك بلازما لترميم الشعر", category: "plasma", category_label: "بلازما للشعر", price: 14.000, sale_price: 12.600, stock: 90, reorder: 25 },
  { sku: "PL-SERUM-01", name_ar: "سيروم بلازما المغذي", category: "plasma", category_label: "بلازما للشعر", price: 14.000, sale_price: 12.600, stock: 82, reorder: 20 },

  // Morphosis
  { sku: "MOR-REINF-01", name_ar: "أمبولات وشامبو مورفوزيس رينفورسينج للشعر الخفيف", category: "morphosis", category_label: "مورفوزيس إيطاليا", price: 52.000, sale_price: 46.800, stock: 28, reorder: 10 },
  { sku: "MOR-DENS-02", name_ar: "أمبولات وشامبو مورفوزيس دنسيفاينج لتساقط الشعر", category: "morphosis", category_label: "مورفوزيس إيطاليا", price: 52.000, sale_price: 46.800, stock: 32, reorder: 10 },
  { sku: "MOR-REST-SET-1L", name_ar: "مجموعة ترميم مورفوزيس ريستركتشر 1000 مل", category: "morphosis", category_label: "مورفوزيس إيطاليا", price: 50.000, sale_price: 45.000, stock: 19, reorder: 10 },
  { sku: "MOR-REST-SET-250", name_ar: "مجموعة ترميم مورفوزيس ريستركتشر 250 مل", category: "morphosis", category_label: "مورفوزيس إيطاليا", price: 23.000, sale_price: 20.700, stock: 55, reorder: 15 },
  { sku: "MOR-LEAV-125", name_ar: "ليف ان مورفوزيس ريستركتشر 125 مل", category: "morphosis", category_label: "مورفوزيس إيطاليا", price: 20.000, sale_price: 18.000, stock: 60, reorder: 15 },
  { sku: "MOR-REP-SET-1L", name_ar: "مجموعة معالجة مورفوزيس ريبير 1000 مل", category: "morphosis", category_label: "مورفوزيس إيطاليا", price: 50.000, sale_price: 45.000, stock: 22, reorder: 10 },
  { sku: "MOR-OIL-SET-1L", name_ar: "مجموعة زيت مورفوزيس سوبليميس أويل 1000 مل", category: "morphosis", category_label: "مورفوزيس إيطاليا", price: 50.000, sale_price: 45.000, stock: 26, reorder: 10 },
  { sku: "MOR-OIL-SER-05", name_ar: "سيروم زيت مورفوزيس سوبليميس أويل", category: "morphosis", category_label: "مورفوزيس إيطاليا", price: 20.000, sale_price: 18.000, stock: 48, reorder: 12 },

  // Argan
  { sku: "ARG-REP-SET-500", name_ar: "مجموعة أرجان ريبير (شامبو + بلسم)", category: "argan", category_label: "أرجان للشعر", price: 32.000, sale_price: 28.800, stock: 74, reorder: 20 },
  { sku: "ARG-REP-SHMP-500", name_ar: "شامبو أرجان ريبير 500 مل", category: "argan", category_label: "أرجان للشعر", price: 18.000, sale_price: 16.200, stock: 88, reorder: 25 },
  { sku: "ARG-REP-COND-500", name_ar: "بلسم أرجان ريبير 500 مل", category: "argan", category_label: "أرجان للشعر", price: 18.000, sale_price: 16.200, stock: 79, reorder: 25 },
  { sku: "ARG-HYD-SET-500", name_ar: "مجموعة أرجان هايدرو المرطبة (شامبو + بلسم)", category: "argan", category_label: "أرجان للشعر", price: 32.000, sale_price: 28.800, stock: 52, reorder: 15 },
  { sku: "ARG-HYD-SHMP-500", name_ar: "شامبو أرجان هايدرو 500 مل", category: "argan", category_label: "أرجان للشعر", price: 18.000, sale_price: 16.200, stock: 95, reorder: 25 },
  { sku: "ARG-HYD-COND-500", name_ar: "بلسم أرجان هايدرو 500 مل", category: "argan", category_label: "أرجان للشعر", price: 18.000, sale_price: 16.200, stock: 84, reorder: 25 },

  // Proteins
  { sku: "PROT-MARACUJA-100", name_ar: "بروتين ماراكوجا البرازيلي 100 مل", category: "proteins", category_label: "بروتينات احترافية", price: 25.000, sale_price: 22.000, stock: 40, reorder: 10 },
  { sku: "PROT-MARACUJA-250", name_ar: "بروتين ماراكوجا البرازيلي 250 مل", category: "proteins", category_label: "بروتينات احترافية", price: 45.000, sale_price: 40.000, stock: 25, reorder: 8 },
  { sku: "PROT-MARACUJA-1L", name_ar: "بروتين ماراكوجا البرازيلي 1000 مل (لتر)", category: "proteins", category_label: "بروتينات احترافية", price: 120.000, sale_price: 105.000, stock: 14, reorder: 5 },
];

export default function InventoryPage() {
  const [selectedCat, setSelectedCat] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = PRODUCTS.filter((p) => {
    const matchesCat = selectedCat === "all" || p.category === selectedCat;
    const matchesSearch = p.name_ar.includes(searchTerm) || p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <Package className="w-6 h-6 text-amber-500" />
            <span>كتالوج المنتجات وإدارة المخزون</span>
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            جميع المنتجات المعتمدة من موقع بيتولا (31 منتج) مع تتبع مستويات الكميات المتاحة والتنبيهات
          </p>
        </div>

        <button 
          onClick={() => alert("نموذج إضافة منتج جديد")}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-sm rounded-xl shadow-xs transition"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة منتج جديد</span>
        </button>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCat(cat.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition border ${
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
      <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-xs">
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

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
              <tr>
                <th className="py-3 px-4">رمز المنتج (SKU)</th>
                <th className="py-3 px-4">اسم المنتج</th>
                <th className="py-3 px-4">التصنيف</th>
                <th className="py-3 px-4">السعر الرسمي</th>
                <th className="py-3 px-4">سعر العرض</th>
                <th className="py-3 px-4">الكمية بالمستودع</th>
                <th className="py-3 px-4">حالة التوفر</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map((product) => {
                const isLow = product.stock <= product.reorder;

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
                    <td className="py-3.5 px-4 font-bold text-stone-900 font-mono">
                      {formatCurrency(product.price)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-amber-600 font-mono">
                      {product.sale_price ? formatCurrency(product.sale_price) : "—"}
                    </td>
                    <td className="py-3.5 px-4 font-bold font-mono text-sm">
                      {product.stock} قطعة
                    </td>
                    <td className="py-3.5 px-4">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <AlertTriangle className="w-3 h-3" />
                          <span>قارب على النفاد</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>متوفر بكمية جيدة</span>
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
    </div>
  );
}
