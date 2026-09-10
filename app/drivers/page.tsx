"use client";

import React, { useState } from "react";
import { 
  ShoppingCart, 
  UserCheck, 
  CheckCircle2, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Filter,
  Search,
  CheckSquare,
  Square,
  Truck,
  GripVertical,
  ArrowUpDown,
  MoveUp,
  MoveDown
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";

// Types
type OrderType = "بيع" | "حجز" | "هدية" | "استبدال" | "تحصيل";
type OrderStatus = "غير معين" | "تم التعيين" | "مكتمل" | "مرتجع" | "مؤجل" | "متبقي";
type Driver = "خالد" | "علي" | null;

interface OrderItem {
  id: string;
  product: string;
  qty: number;
}

interface DriverOrder {
  id: string;
  date: string;
  type: OrderType;
  customerName: string;
  customerPhone: string;
  customerType: string;
  salesRep: string;
  items: OrderItem[];
  area: string;
  amount: number;
  receivables: number;
  driver: Driver;
  status: OrderStatus;
  notes: string;
}

const MOCK_ORDERS: DriverOrder[] = [
  { id: "BET-D-001", date: "10/09/2026", type: "بيع", customerName: "سدين غنايم", customerPhone: "0793937385", customerType: "شخصي", salesRep: "رحمة", items: [{ id: "i1", product: "شامبو بلازما", qty: 2 }, { id: "i2", product: "بلسم بلازما", qty: 1 }], area: "طبربور", amount: 24.000, receivables: 0, driver: "خالد", status: "تم التعيين", notes: "" },
  { id: "BET-D-002", date: "10/09/2026", type: "حجز", customerName: "ربى صبيح", customerPhone: "0799193505", customerType: "شخصي", salesRep: "حنين", items: [{ id: "i3", product: "بكج مورفوسيس ريستركشر", qty: 3 }], area: "عرجان", amount: 95.000, receivables: 0, driver: "علي", status: "مكتمل", notes: "حجز شهر" },
  { id: "BET-D-003", date: "10/09/2026", type: "بيع", customerName: "صالون لمسة حرير", customerPhone: "0788812345", customerType: "صالون", salesRep: "حمزة", items: [{ id: "i4", product: "ماركوجا المطور", qty: 1 }], area: "ناعور", amount: 150.000, receivables: 50.000, driver: "خالد", status: "تم التعيين", notes: "توصيل قبل الساعة 4" },
  { id: "BET-D-004", date: "10/09/2026", type: "هدية", customerName: "مريم العلي", customerPhone: "0791112233", customerType: "شخصي", salesRep: "رشا", items: [{ id: "i5", product: "سيروم بلازما", qty: 1 }], area: "جبل التاج", amount: 0, receivables: 0, driver: null, status: "غير معين", notes: "هدية ترويجية" },
  { id: "BET-D-005", date: "10/09/2026", type: "بيع", customerName: "صالون جمالك", customerPhone: "0792223344", customerType: "صالون", salesRep: "رحمة", items: [{ id: "i6", product: "بروتين SP فضي", qty: 2 }], area: "المدينة الرياضية", amount: 120.000, receivables: 20.000, driver: "علي", status: "تم التعيين", notes: "" },
  { id: "BET-D-006", date: "10/09/2026", type: "استبدال", customerName: "ليلى حسن", customerPhone: "0793334455", customerType: "بيتي", salesRep: "حنين", items: [{ id: "i7", product: "شامبو بلازما", qty: 1 }], area: "وادي صقرة", amount: 0, receivables: 0, driver: "خالد", status: "مرتجع", notes: "العلبة تالفة" },
  { id: "BET-D-007", date: "10/09/2026", type: "بيع", customerName: "سارة محمد", customerPhone: "0794445566", customerType: "شخصي", salesRep: "حمزة", items: [{ id: "i8", product: "بكج مورفوسيس ريستركشر", qty: 1 }], area: "السابع", amount: 35.000, receivables: 0, driver: "علي", status: "مؤجل", notes: "الزبونة خارج المنزل" },
  { id: "BET-D-008", date: "10/09/2026", type: "تحصيل", customerName: "صالون الورد", customerPhone: "0795556677", customerType: "صالون", salesRep: "رشا", items: [], area: "طبربور", amount: 50.000, receivables: 0, driver: "خالد", status: "متبقي", notes: "دفعة من الحساب" },
  { id: "BET-D-009", date: "10/09/2026", type: "بيع", customerName: "عمر عبدالله", customerPhone: "0796667788", customerType: "شخصي", salesRep: "رحمة", items: [{ id: "i9", product: "ماركوجا المطور", qty: 2 }], area: "عرجان", amount: 100.000, receivables: 0, driver: null, status: "غير معين", notes: "" },
  { id: "BET-D-010", date: "10/09/2026", type: "بيع", customerName: "صيدلية الشفاء", customerPhone: "0797778899", customerType: "صيدلية", salesRep: "حمزة", items: [{ id: "i10", product: "بلسم بلازما", qty: 10 }], area: "ناعور", amount: 80.000, receivables: 80.000, driver: "علي", status: "تم التعيين", notes: "ذمم على الحساب" },
  { id: "BET-D-011", date: "10/09/2026", type: "حجز", customerName: "نور الدين", customerPhone: "0798889900", customerType: "شخصي", salesRep: "حنين", items: [{ id: "i11", product: "سيروم بلازما", qty: 1 }], area: "المدينة الرياضية", amount: 15.000, receivables: 0, driver: "خالد", status: "تم التعيين", notes: "" },
  { id: "BET-D-012", date: "10/09/2026", type: "بيع", customerName: "صالون الأناقة", customerPhone: "0799990011", customerType: "صالون", salesRep: "رشا", items: [{ id: "i12", product: "بروتين SP فضي", qty: 3 }, { id: "i13", product: "شامبو بلازما", qty: 3 }], area: "وادي صقرة", amount: 200.000, receivables: 100.000, driver: "علي", status: "مكتمل", notes: "" },
  { id: "BET-D-013", date: "10/09/2026", type: "هدية", customerName: "مؤثرة سوشال", customerPhone: "0780001122", customerType: "شخصي", salesRep: "رحمة", items: [{ id: "i14", product: "بكج مورفوسيس ريستركشر", qty: 1 }], area: "السابع", amount: 0, receivables: 0, driver: null, status: "غير معين", notes: "اعلان انستغرام" },
  { id: "BET-D-014", date: "10/09/2026", type: "بيع", customerName: "عبير محمود", customerPhone: "0781112233", customerType: "بيتي", salesRep: "حمزة", items: [{ id: "i15", product: "ماركوجا المطور", qty: 1 }], area: "جبل التاج", amount: 50.000, receivables: 0, driver: "خالد", status: "متبقي", notes: "" },
  { id: "BET-D-015", date: "10/09/2026", type: "استبدال", customerName: "مركز تجميل", customerPhone: "0782223344", customerType: "صالون", salesRep: "حنين", items: [{ id: "i16", product: "بلسم بلازما", qty: 2 }], area: "طبربور", amount: 0, receivables: 0, driver: "علي", status: "تم التعيين", notes: "تبديل مقاس" },
];

const STATUS_COLORS: Record<OrderStatus, string> = {
  "غير معين": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "تم التعيين": "bg-blue-100 text-blue-800 border-blue-200",
  "مكتمل": "bg-green-100 text-green-800 border-green-200",
  "مرتجع": "bg-red-100 text-red-800 border-red-200",
  "مؤجل": "bg-gray-100 text-gray-800 border-gray-200",
  "متبقي": "bg-orange-100 text-orange-800 border-orange-200",
};

export default function DriverDashboardPage() {
  const [orders, setOrders] = useState<DriverOrder[]>(MOCK_ORDERS);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  // Filters
  const [filterDriver, setFilterDriver] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [filterArea, setFilterArea] = useState<string>("All");

  const toggleOrderSelection = (id: string) => {
    const newSet = new Set(selectedOrders);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedOrders(newSet);
  };

  const toggleAllSelection = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filteredOrders.map(o => o.id)));
    }
  };

  const toggleRowExpansion = (id: string) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedRows(newSet);
  };

  const handleBulkAssign = (driver: Driver) => {
    if (!driver || selectedOrders.size === 0) return;
    setOrders(orders.map(o => {
      if (selectedOrders.has(o.id)) {
        return { ...o, driver, status: "تم التعيين" };
      }
      return o;
    }));
    setSelectedOrders(new Set());
  };

  const handleDriverChange = (id: string, driver: Driver) => {
    setOrders(orders.map(o => o.id === id ? { ...o, driver, status: driver ? "تم التعيين" : "غير معين" } : o));
  };

  // Drag and Drop state & handlers
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
  const [dragOverOrderId, setDragOverOrderId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedOrderId(id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== dragOverOrderId) {
      setDragOverOrderId(id);
    }
  };

  const handleDragEnd = () => {
    setDraggedOrderId(null);
    setDragOverOrderId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedOrderId || draggedOrderId === targetId) {
      handleDragEnd();
      return;
    }

    setOrders((prev) => {
      const fromIndex = prev.findIndex((o) => o.id === draggedOrderId);
      const toIndex = prev.findIndex((o) => o.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return prev;

      const newOrders = [...prev];
      const [movedOrder] = newOrders.splice(fromIndex, 1);
      newOrders.splice(toIndex, 0, movedOrder);
      return newOrders;
    });

    handleDragEnd();
  };

  const moveOrder = (id: string, direction: "up" | "down") => {
    setOrders((prev) => {
      const index = prev.findIndex((o) => o.id === id);
      if (index === -1) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const newOrders = [...prev];
      const temp = newOrders[index];
      newOrders[index] = newOrders[targetIndex];
      newOrders[targetIndex] = temp;
      return newOrders;
    });
  };

  const sortByArea = () => {
    setOrders((prev) => [...prev].sort((a, b) => a.area.localeCompare(b.area, "ar")));
  };

  const areas = Array.from(new Set(orders.map(o => o.area)));

  const filteredOrders = orders.filter(o => {
    if (filterDriver !== "All" && filterDriver === "Unassigned" && o.driver !== null) return false;
    if (filterDriver !== "All" && filterDriver !== "Unassigned" && o.driver !== filterDriver) return false;
    if (filterStatus !== "All" && o.status !== filterStatus) return false;
    if (filterArea !== "All" && o.area !== filterArea) return false;
    return true;
  });

  const totalOrders = orders.length;
  const assignedOrders = orders.filter(o => o.driver !== null).length;
  const deliveredOrders = orders.filter(o => o.status === "مكتمل").length;
  const pendingOrders = orders.filter(o => ["غير معين", "مؤجل", "مرتجع", "متبقي"].includes(o.status)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
          <Truck className="w-6 h-6 text-amber-500" />
          <span>لوحة إدارة السائقين (Driver Manager)</span>
        </h2>
        <p className="text-xs sm:text-sm text-stone-500 mt-1">
          متابعة وتوزيع الطلبات اليومية، إدارة مسارات السائقين، والتحصيلات
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-stone-500 font-medium">إجمالي الطلبات اليوم</p>
            <p className="text-2xl font-bold text-stone-900">{totalOrders}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-stone-500 font-medium">الطلبات المعينة</p>
            <p className="text-2xl font-bold text-stone-900">{assignedOrders}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-stone-500 font-medium">تم التوصيل بنجاح</p>
            <p className="text-2xl font-bold text-stone-900">{deliveredOrders}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-stone-500 font-medium">مرتجع / معلق</p>
            <p className="text-2xl font-bold text-stone-900">{pendingOrders}</p>
          </div>
        </div>
      </div>

      {/* Main Table Section */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        {/* Filters Bar */}
        <div className="p-4 border-b border-stone-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-stone-50">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-stone-200">
              <Filter className="w-4 h-4 text-stone-400" />
              <select className="text-sm bg-transparent outline-none text-stone-700" value={filterDriver} onChange={e => setFilterDriver(e.target.value)}>
                <option value="All">كل السائقين</option>
                <option value="خالد">خالد</option>
                <option value="علي">علي</option>
                <option value="Unassigned">غير معين</option>
              </select>
            </div>
            <select className="text-sm bg-white px-3 py-1.5 rounded-lg border border-stone-200 outline-none text-stone-700" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="All">كل الحالات</option>
              {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="text-sm bg-white px-3 py-1.5 rounded-lg border border-stone-200 outline-none text-stone-700" value={filterArea} onChange={e => setFilterArea(e.target.value)}>
              <option value="All">كل المناطق</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button
              onClick={sortByArea}
              title="ترتيب تلقائي للمسار حسب المنطقة الجغرافية"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-stone-100 text-stone-700 text-xs font-bold rounded-lg border border-stone-200 transition shadow-2xs cursor-pointer"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-amber-500" />
              <span>ترتيب حسب المنطقة</span>
            </button>
          </div>

          {selectedOrders.size > 0 && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-amber-600">{selectedOrders.size} محدد</span>
              <select 
                className="text-xs bg-stone-900 text-white px-3 py-1.5 rounded-lg outline-none font-bold"
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkAssign(e.target.value as Driver);
                    e.target.value = "";
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>تعيين المحدد إلى...</option>
                <option value="خالد">السائق: خالد</option>
                <option value="علي">السائق: علي</option>
              </select>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
              <tr>
                <th className="py-3 px-2 w-14 text-center" title="سحب وإفلات لترتيب مسار التوصيل"># ترتيب</th>
                <th className="py-3 px-3 w-10">
                  <button onClick={toggleAllSelection} className="text-stone-400 hover:text-stone-700">
                    {selectedOrders.size === filteredOrders.length && filteredOrders.length > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="py-3 px-2 w-8"></th>
                <th className="py-3 px-3">رقم الطلب</th>
                <th className="py-3 px-3">النوع</th>
                <th className="py-3 px-3">العميل والهاتف</th>
                <th className="py-3 px-3">المندوب</th>
                <th className="py-3 px-3">المنتجات</th>
                <th className="py-3 px-3">المنطقة</th>
                <th className="py-3 px-3">المبلغ</th>
                <th className="py-3 px-3">كاش (المطلوب)</th>
                <th className="py-3 px-3">السائق</th>
                <th className="py-3 px-3">الحالة</th>
                <th className="py-3 px-3">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredOrders.map((order, index) => {
                const isExpanded = expandedRows.has(order.id);
                const isSelected = selectedOrders.has(order.id);
                const cash = order.amount - order.receivables;
                const totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);
                const isBeingDragged = draggedOrderId === order.id;
                const isDraggedOver = dragOverOrderId === order.id && !isBeingDragged;

                return (
                  <React.Fragment key={order.id}>
                    <tr 
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, order.id)}
                      onDragOver={(e) => handleDragOver(e, order.id)}
                      onDragEnd={handleDragEnd}
                      onDrop={(e) => handleDrop(e, order.id)}
                      className={cn(
                        "transition-all cursor-default",
                        isSelected ? "bg-amber-50" : "hover:bg-stone-50/80",
                        isBeingDragged && "opacity-40 bg-amber-100",
                        isDraggedOver && "border-t-2 border-amber-500 bg-amber-50/60"
                      )}
                    >
                      <td className="py-3 px-2">
                        <div className="flex items-center justify-center gap-1">
                          <span 
                            className="cursor-grab active:cursor-grabbing p-1 text-stone-400 hover:text-amber-600 rounded transition"
                            title="اسحب وأفلت لإعادة ترتيب الطلبية"
                          >
                            <GripVertical className="w-4 h-4" />
                          </span>
                          <span className="text-[10px] font-mono font-bold text-stone-500 w-4 text-center">
                            {index + 1}
                          </span>
                          <div className="flex flex-col -space-y-1">
                            <button
                              type="button"
                              onClick={() => moveOrder(order.id, "up")}
                              disabled={index === 0}
                              title="تحريك لأعلى"
                              className="text-stone-300 hover:text-amber-600 disabled:opacity-20 p-0.5"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveOrder(order.id, "down")}
                              disabled={index === filteredOrders.length - 1}
                              title="تحريك لأسفل"
                              className="text-stone-300 hover:text-amber-600 disabled:opacity-20 p-0.5"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <button onClick={() => toggleOrderSelection(order.id)} className="text-stone-400 hover:text-stone-700">
                          {isSelected ? <CheckSquare className="w-4 h-4 text-amber-500" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="py-3 px-2">
                        {order.items.length > 1 && (
                          <button onClick={() => toggleRowExpansion(order.id)} className="p-1 hover:bg-stone-200 rounded text-stone-500">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-amber-600">{order.id}</td>
                      <td className="py-3 px-3 font-bold text-stone-700">{order.type}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-stone-900">{order.customerName}</div>
                        <a href={`tel:${order.customerPhone}`} className="text-[11px] font-mono text-blue-600 hover:underline block" dir="ltr">{order.customerPhone}</a>
                      </td>
                      <td className="py-3 px-3 text-stone-700">{order.salesRep}</td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-stone-800">
                          {order.items.length === 1 ? (
                            <span>{order.items[0].qty}x {order.items[0].product}</span>
                          ) : (
                            <span>{totalQty} منتجات ({order.items.length} أصناف)</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-semibold text-stone-900">{order.area}</td>
                      <td className="py-3 px-3 font-mono text-stone-500">{formatCurrency(order.amount)}</td>
                      <td className="py-3 px-3 font-mono font-bold text-stone-900">
                        {cash > 0 ? <span className="text-emerald-700">{formatCurrency(cash)}</span> : formatCurrency(cash)}
                        {order.receivables > 0 && <span className="block text-[10px] text-red-500">ذمم: {formatCurrency(order.receivables)}</span>}
                      </td>
                      <td className="py-3 px-3">
                        <select 
                          className="bg-white border border-stone-200 rounded-md px-2 py-1 text-xs outline-none focus:border-amber-500"
                          value={order.driver || ""}
                          onChange={(e) => handleDriverChange(order.id, (e.target.value || null) as Driver)}
                        >
                          <option value="">بدون سائق</option>
                          <option value="خالد">خالد</option>
                          <option value="علي">علي</option>
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border", STATUS_COLORS[order.status])}>
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-stone-500 text-[11px] max-w-[120px] truncate" title={order.notes}>
                        {order.notes || "—"}
                      </td>
                    </tr>
                    
                    {/* Expandable Items Sub-row */}
                    {isExpanded && order.items.length > 1 && (
                      <tr className="bg-stone-50/50">
                        <td colSpan={3}></td>
                        <td colSpan={11} className="p-3">
                          <div className="bg-white border border-stone-200 rounded-lg p-3">
                            <p className="text-xs font-bold text-stone-500 mb-2">تفاصيل المنتجات:</p>
                            <ul className="space-y-1">
                              {order.items.map(item => (
                                <li key={item.id} className="flex gap-4 text-xs">
                                  <span className="font-mono text-stone-500">{item.qty}x</span>
                                  <span className="font-medium text-stone-900">{item.product}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={14} className="py-8 text-center text-stone-500">لا توجد طلبات تطابق الفلتر الحالي</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
