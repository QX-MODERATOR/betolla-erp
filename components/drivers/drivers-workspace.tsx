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
  LayoutGrid,
  Table as TableIcon,
  PackageSearch,
  Phone,
  MessageSquare,
  MapPin,
  Package,
  X,
  Check,
  Edit3,
  ExternalLink,
  DollarSign,
  CreditCard,
  Calendar
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import { useToast } from "@/components/common/toast";
import { useDateFilter } from "@/lib/date-context";
import type { DriverOrderRecord } from "@/lib/driver-ops";
import type { OrderChange } from "@/lib/business";
import { OrderChangeLog } from "@/components/common/order-change-log";
import { PickingListModal, type PickingList } from "@/components/drivers/picking-list";
import { splitOutsideBrackets, splitPackageName } from "@/lib/package-items";

// Types
type OrderType = "بيع" | "حجز" | "هدية" | "استبدال" | "تحصيل";
type OrderStatus = "غير معين" | "تم التعيين" | "مكتمل" | "مرتجع" | "مؤجل" | "متبقي" | "ملغى";

// The status filter's default: orders not yet delivered, returned or postponed.
const REMAINING = "Remaining";
const REMAINING_STATUSES: OrderStatus[] = ["غير معين", "تم التعيين", "متبقي"];
type Driver = "خالد" | "علي" | "BX Arabia" | null;

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
  // The day the driver moved the delivery to. Carried onto the board so ضياء can see WHICH day an
  // order was postponed to — the status alone said only that it had been.
  postponeDate?: string;
  notes: string;
  paymentMethod?: 'cash' | 'cliq';
  cliqIncludesDelivery?: boolean;
  deliveryFee?: number;
  dbStatus: string; // orders.status as last read; sent back so the server can refuse stale edits
  cashToCollect: number;
}

function getExpectedCash(order: DriverOrder): number {
  return order.cashToCollect;
}

function ManagerPaymentBadge({ order }: { order: DriverOrder }) {
  if (order.paymentMethod === 'cliq') {
    if (order.cliqIncludesDelivery) {
      return (
        <span 
          title="مدفوع بالكامل عبر كليك شاملاً رسوم التوصيل (المطلوب كاش: 0 د.أ)"
          className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-200 text-[10px] font-bold inline-flex items-center gap-1 shadow-2xs whitespace-nowrap"
        >
          <CreditCard className="w-3 h-3 text-purple-700 shrink-0" />
          <span>CliQ (شامل التوصيل)</span>
        </span>
      );
    } else {
      return (
        <span 
          title={`مدفوع ثمن البضاعة عبر كليك - المطلوب تحصيل رسوم التوصيل (${formatCurrency(order.deliveryFee ?? 2.5)})`}
          className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-200 text-[10px] font-bold inline-flex items-center gap-1 shadow-2xs whitespace-nowrap"
        >
          <CreditCard className="w-3 h-3 text-blue-700 shrink-0" />
          <span>CliQ (تحصيل توصيل: {formatCurrency(order.deliveryFee ?? 2.5)})</span>
        </span>
      );
    }
  }

  return (
    <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200 text-[10px] font-semibold inline-flex items-center gap-1 whitespace-nowrap">
      <DollarSign className="w-3 h-3 text-emerald-600 shrink-0" />
      <span>كاش عند الاستلام</span>
    </span>
  );
}


const STATUS_COLORS: Record<OrderStatus, string> = {
  "غير معين": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "تم التعيين": "bg-blue-100 text-blue-800 border-blue-200",
  "مكتمل": "bg-green-100 text-green-800 border-green-200",
  "مرتجع": "bg-rose-100 text-rose-800 border-rose-200",
  "مؤجل": "bg-stone-200 text-stone-800 border-stone-300",
  "متبقي": "bg-orange-100 text-orange-800 border-orange-200",
  "ملغى": "bg-slate-200 text-slate-700 border-slate-300",
};

const TYPE_COLORS: Record<OrderType, string> = {
  "بيع": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "حجز": "bg-purple-50 text-purple-700 border-purple-200",
  "هدية": "bg-pink-50 text-pink-700 border-pink-200",
  "استبدال": "bg-amber-50 text-amber-700 border-amber-200",
  "تحصيل": "bg-blue-50 text-blue-700 border-blue-200",
};

const STATE_FOR_STATUS: Record<OrderStatus, string> = {
  "غير معين": "pending", "تم التعيين": "pending", "مكتمل": "delivered", "مرتجع": "returned", "مؤجل": "postponed", "متبقي": "remaining",
  "ملغى": "cancelled",
};

function toBoardOrder(o: DriverOrderRecord): DriverOrder {
  // Split on newlines, then on '+' only outside brackets: the '+' inside
  // "بكج رباعي بلازما [شامبو + بلسم + تريتمنت + سيروم]" lists what is in one package, and splitting
  // there told the driver to carry four separate things.
  const parts = (o.products || "")
    .split(/\n/)
    .flatMap((line) => splitOutsideBrackets(line))
    .filter(Boolean);
  const items: OrderItem[] = parts.map((part, idx) => {
    const m = part.match(/^(\d+)\s*[×xX*]\s*(.+)$/);
    return { id: `${o.id}-${idx}`, qty: m ? parseInt(m[1], 10) : 1, product: m ? m[2].trim() : part };
  });
  const postponeDate = o.postpone_date || "";
  let status: OrderStatus = o.driver ? "تم التعيين" : "غير معين";
  if (o.status === "delivered") status = "مكتمل";
  else if (o.status === "returned") status = "مرتجع";
  else if (o.status === "postponed") status = "مؤجل";
  else if (o.status === "remaining") status = "متبقي";
  // "cancelled" never reaches here: business_driver_board excludes it entirely (the row just
  // disappears from the board once cancelled), so DriverOrderRecord.status has no such value.

  const notes = o.note || "";
  let type: OrderType = "بيع";
  if (notes.includes("حجز")) type = "حجز";
  else if (notes.includes("هدية") || notes.includes("مجاني")) type = "هدية";
  else if (notes.includes("استبدال") || notes.includes("تبديل")) type = "استبدال";
  else if (notes.includes("تحصيل")) type = "تحصيل";

  return {
    id: o.id,
    date: o.order_date,
    type,
    customerName: o.customer_name,
    customerPhone: o.phone,
    customerType: "",
    salesRep: o.rep_name,
    items,
    area: o.area,
    amount: o.order_total,
    receivables: o.receivables,
    driver: (o.driver as Driver) || null,
    status,
    postponeDate,
    notes,
    paymentMethod: o.payment_method,
    cliqIncludesDelivery: o.cliq_includes_delivery,
    deliveryFee: o.delivery_fee,
    dbStatus: o.dbStatus,
    cashToCollect: o.status === "delivered" ? (o.cash_collected ?? o.cash_to_collect) : o.cash_to_collect,
  };
}

export function DriversWorkspace({ hideHeading = false }: { hideHeading?: boolean } = {}) {
  const { showToast } = useToast();
  const { selectedDate, todayDate, isToday, isFutureDate, formattedDateLabel, resetToToday } = useDateFilter();
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [canManage, setCanManage] = useState(false);
  // Which drivers this account runs, as the server scoped them: BX Arabia belongs to صابرين and
  // everyone else to ضياء, so the pickers must offer the same roster the board was filtered by
  // rather than a hardcoded three.
  const [myDrivers, setMyDrivers] = useState<string[]>([]);
  // The picking list is asked for on demand: it expands every package and sums across orders, and
  // nobody needs that until they are about to walk to the shelves.
  const [pickingList, setPickingList] = useState<PickingList | null>(null);
  const [pickingBusy, setPickingBusy] = useState(false);
  const openPickingList = async () => {
    if (pickingBusy) return;
    setPickingBusy(true);
    try {
      const data = await loadBusiness<{ picking: PickingList }>("/api/drivers?view=picking");
      setPickingList(data.picking);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذر تحضير كشف التجهيز.", "error", 4000);
    } finally {
      setPickingBusy(false);
    }
  };
  const [saving, setSaving] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  
  // Filters
  const [filterDriver, setFilterDriver] = useState<string>("All");
  // Opens on the orders still to deliver, like the driver's own "متبقي" tab; "كل الحالات" shows the whole day.
  const [filterStatus, setFilterStatus] = useState<string>(REMAINING);
  const [filterArea, setFilterArea] = useState<string>("All");

  // Done / Success Feedback Modal
  const [doneModalInfo, setDoneModalInfo] = useState<{
    isOpen: boolean;
    title: string;
    subtitle: string;
    orderId?: string;
    driverName?: string;
    badgeText?: string;
    badgeColor?: string;
  }>({
    isOpen: false,
    title: "",
    subtitle: "",
  });

  // Manager Order Details Modal state
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<DriverOrder | null>(null);
  const [editDriver, setEditDriver] = useState<Driver>(null);
  const [editStatus, setEditStatus] = useState<OrderStatus>("غير معين");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editPaymentMethod, setEditPaymentMethod] = useState<'cash' | 'cliq'>('cash');
  const [editCliqIncludesDelivery, setEditCliqIncludesDelivery] = useState<boolean>(true);
  const [editDeliveryFee, setEditDeliveryFee] = useState<number>(2.5);
  const [orderHistory, setOrderHistory] = useState<OrderChange[]>([]);

  // The header calendar decides which day this board shows: today is everything still open, any
  // other day is the orders booked for it (a customer who ordered on the 17th for the 26th).
  const loadDriversData = React.useCallback(async (day: string) => {
    try {
      const data = await loadBusiness<{ orders: DriverOrderRecord[]; canManage: boolean; drivers?: string[] }>(
        "/api/drivers?date=" + encodeURIComponent(day),
      );
      setOrders(data.orders.map(toBoardOrder));
      setCanManage(Boolean(data.canManage));
      setMyDrivers(Array.isArray(data.drivers) ? data.drivers : []);
      setLoadError("");
    } catch (err) {
      // Never fall back to sample data: an empty board with a clear error is the truth.
      setLoadError(err instanceof Error ? err.message : "تعذر تحميل طلبات التوصيل.");
    } finally {
      setLoading(false);
    }
  }, []);
  const reloadBoard = React.useCallback(() => loadDriversData(selectedDate), [loadDriversData, selectedDate]);

  React.useEffect(() => {
    void reloadBoard();
  }, [reloadBoard]);

  const openOrderDetails = (order: DriverOrder) => {
    setSelectedOrderForDetails(order);
    setEditDriver(order.driver);
    setEditStatus(order.status);
    setEditNotes(order.notes);
    setEditPaymentMethod(order.paymentMethod || 'cash');
    setEditCliqIncludesDelivery(order.cliqIncludesDelivery ?? true);
    setEditDeliveryFee(order.deliveryFee ?? 2.5);
    setOrderHistory([]);
    // The sales rep who owns this order may have edited it since — show exactly what changed.
    loadBusiness<{ changes: OrderChange[] }>("/api/orders?changes=" + encodeURIComponent(order.id))
      .then((d) => setOrderHistory(d.changes))
      .catch(() => {});
  };

  const handleSaveOrderDetails = async () => {
    if (!selectedOrderForDetails || saving) return;
    const target = selectedOrderForDetails;
    const driver = editStatus === "غير معين" ? null : editDriver;
    const payload = {
      action: "update_order",
      orderId: target.id,
      expectedStatus: target.dbStatus,
      driver,
      state: STATE_FOR_STATUS[editStatus],
      note: editNotes,
      paymentMethod: editPaymentMethod,
      cliqIncludesDelivery: editPaymentMethod === "cliq" ? editCliqIncludesDelivery : undefined,
      deliveryFee: editPaymentMethod === "cliq" && !editCliqIncludesDelivery ? editDeliveryFee : undefined,
    };
    setSaving(true);
    try {
      const { order } = await saveBusiness<{ order: DriverOrderRecord }>(`driver-order:${target.id}`, "/api/drivers", payload);
      const saved = toBoardOrder(order);
      setOrders((prev) => prev.map((o) => (o.id === saved.id ? saved : o)));
      setSelectedOrderForDetails(null);
      setDoneModalInfo({
        isOpen: true,
        title: "تم حفظ التغييرات ✅",
        subtitle: `تم حفظ الطلب في قاعدة البيانات. السائق: ${saved.driver || "غير معين"}.`,
        orderId: saved.id,
        driverName: saved.driver || undefined,
        badgeText: saved.status,
        badgeColor: STATUS_COLORS[saved.status],
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "تعذر حفظ الطلب.", "error", 6000);
      await reloadBoard();
    } finally {
      setSaving(false);
    }
  };

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

  // Assign (or unassign with null) and show the result only after the server confirms it.
  const assignOrders = async (targets: DriverOrder[], driver: Driver) => {
    if (!targets.length || saving) return;
    setSaving(true);
    const ids = targets.map((o) => o.id).sort();
    try {
      const data = await saveBusiness<{ results: { id: string; order: DriverOrderRecord }[] }>(
        `driver-assign:${ids.join(",")}`,
        "/api/drivers",
        { action: "assign_orders", driver, orders: targets.map((o) => ({ id: o.id, status: o.dbStatus })) },
      );
      const updated = new Map(data.results.map((r) => [r.id, toBoardOrder(r.order)]));
      setOrders((prev) => prev.map((o) => updated.get(o.id) || o));
      setSelectedOrders(new Set());
      setDoneModalInfo({
        isOpen: true,
        title: driver ? "تم تعيين السائق 🚚" : "تم إلغاء التعيين",
        subtitle: driver
          ? `تم تعيين ${ids.length} طلب للسائق (${driver}) في قاعدة البيانات.`
          : `أصبح ${ids.length} طلب بدون سائق.`,
        orderId: ids.length === 1 ? ids[0] : undefined,
        driverName: driver || undefined,
        badgeText: driver ? "تم التعيين" : "غير معين",
        badgeColor: driver ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-yellow-100 text-yellow-800 border-yellow-300",
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "تعذر حفظ التعيين.", "error", 6000);
      await reloadBoard();
    } finally {
      setSaving(false);
    }
  };

  const handleBulkAssign = (driver: Driver) => {
    if (!driver) return;
    assignOrders(orders.filter((o) => selectedOrders.has(o.id)), driver);
  };

  const handleDriverChange = (id: string, driver: Driver) => {
    const target = orders.find((o) => o.id === id);
    if (target && target.driver !== driver) assignOrders([target], driver);
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
    if (filterStatus === REMAINING ? !REMAINING_STATUSES.includes(o.status) : filterStatus !== "All" && o.status !== filterStatus) return false;
    if (filterArea !== "All" && o.area !== filterArea) return false;
    return true;
  });

  const totalOrders = orders.length;
  const assignedOrders = orders.filter(o => o.driver !== null).length;
  const deliveredOrders = orders.filter(o => o.status === "مكتمل").length;
  const pendingOrders = orders.filter(o => ["غير معين", "مؤجل", "مرتجع", "متبقي"].includes(o.status)).length;

  return (
    <div className="space-y-6">
      {/* Header. Hidden when the page around it already says what this board is — /bx names itself
          BX Arabia, and a second "لوحة إدارة السائقين" underneath only repeats it. */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          {!hideHeading && (<>
            <h2 className="text-xl sm:text-2xl font-bold text-stone-900 flex items-center gap-2.5">
              <Truck className="w-6 h-6 text-amber-500 shrink-0" />
              {/* bdi keeps the English aside from reordering the Arabic around it. */}
              <span>لوحة إدارة السائقين <bdi className="hidden sm:inline">(Driver Manager)</bdi></span>
            </h2>
            <p className="text-xs sm:text-sm text-stone-500 mt-1">
              متابعة وتوزيع الطلبات اليومية، إدارة مسارات السائقين كشبكة تفاعلية بالسحب والإفلات
            </p>
          </>)}
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
        {/* What has to come off the shelf for every order still to be picked, packages expanded. */}
        <button
          type="button"
          onClick={openPickingList}
          disabled={pickingBusy}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#160f02] hover:bg-[#241a08] disabled:opacity-50 text-white text-xs font-bold cursor-pointer shadow-2xs transition"
        >
          <PackageSearch className="w-4 h-4 text-[#9e8959]" />
          <span>{pickingBusy ? "جاري التحضير..." : "كشف تجهيز الطلبات"}</span>
        </button>

        {/* View Switcher: Grid Network vs Table */}
        <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              viewMode === 'grid' 
                ? "bg-white text-stone-900 shadow-xs" 
                : "text-stone-500 hover:text-stone-800"
            )}
            title="عرض كشبكة طلبات تفاعلية" aria-label="عرض كشبكة طلبات تفاعلية"
          >
            <LayoutGrid className="w-4 h-4 text-amber-500" />
            <span>شبكة الطلبات</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              viewMode === 'table' 
                ? "bg-white text-stone-900 shadow-xs" 
                : "text-stone-500 hover:text-stone-800"
            )}
            title="عرض كجدول بيانات" aria-label="عرض كجدول بيانات"
          >
            <TableIcon className="w-4 h-4 text-amber-500" />
            <span>جدول البيانات</span>
          </button>
        </div>
        </div>
      </div>

      {pickingList && (
        <PickingListModal
          list={pickingList}
          scope={myDrivers.length ? myDrivers.join(" · ") : undefined}
          onClose={() => setPickingList(null)}
        />
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-stone-500 font-medium">طلبات اليوم (المفتوحة والمنتهية)</p>
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

      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl px-4 py-3 text-sm font-bold">
          <span>{loadError}</span>
          <button type="button" onClick={() => { setLoading(true); void reloadBoard(); }} className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-xs cursor-pointer">إعادة المحاولة</button>
        </div>
      )}
      {!loading && !loadError && !canManage && (
        <div className="bg-stone-50 border border-stone-200 text-stone-600 rounded-2xl px-4 py-2.5 text-xs font-bold">
          عرض فقط — التعيين والتعديل متاحان لمدير السائقين والإدارة.
        </div>
      )}
      {!isToday && (
        <div className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-xs font-bold border",
          isFutureDate ? "bg-sky-50 border-sky-200 text-sky-900" : "bg-amber-50 border-amber-200 text-amber-900",
        )}>
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            {isFutureDate
              ? `طلبات مجدولة ليوم ${formattedDateLabel} — لم تخرج بعد.`
              : `أرشيف يوم ${formattedDateLabel}.`}
          </span>
          <button type="button" onClick={resetToToday}
            className="px-3 py-1 rounded-lg bg-white border border-current/20 text-[11px] cursor-pointer">
            العودة ليوم {todayDate}
          </button>
        </div>
      )}

      {/* Main Section (Filter Toolbar + Grid Network or Table) */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        {/* Filters Bar */}
        <div className="p-4 border-b border-stone-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-stone-50">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-stone-200">
              <Filter className="w-4 h-4 text-stone-400" />
              <select className="text-sm bg-transparent outline-none text-stone-700" value={filterDriver} onChange={e => setFilterDriver(e.target.value)}>
                <option value="All">كل السائقين</option>
                {myDrivers.map(d => <option key={d} value={d}>{d}</option>)}
                <option value="Unassigned">غير معين</option>
              </select>
            </div>
            <select className="text-sm bg-white px-3 py-1.5 rounded-lg border border-stone-200 outline-none text-stone-700" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value={REMAINING}>المتبقية (لم تُسلّم بعد)</option>
              <option value="All">كل الحالات</option>
              {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="text-sm bg-white px-3 py-1.5 rounded-lg border border-stone-200 outline-none text-stone-700" value={filterArea} onChange={e => setFilterArea(e.target.value)}>
              <option value="All">كل المناطق</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button
              onClick={sortByArea}
              title="ترتيب تلقائي للمسار حسب المنطقة الجغرافية" aria-label="ترتيب تلقائي للمسار حسب المنطقة الجغرافية"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-stone-100 text-stone-700 text-xs font-bold rounded-lg border border-stone-200 transition shadow-2xs cursor-pointer"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-amber-500" />
              <span>ترتيب حسب المنطقة</span>
            </button>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            {canManage && selectedOrders.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-600">{selectedOrders.size} محدد</span>
                <select 
                  className="text-xs bg-stone-900 text-white px-3 py-1.5 rounded-lg outline-none font-bold"
                  disabled={saving}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBulkAssign(e.target.value as Driver);
                      e.target.value = "";
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>تعيين المحدد إلى...</option>
                  {myDrivers.map(d => <option key={d} value={d}>{`السائق: ${d}`}</option>)}
                </select>
              </div>
            )}
            <span className="text-xs text-stone-400 font-medium">
              {filteredOrders.length} طلب
            </span>
          </div>
        </div>

        {/* ---------------- GRID NETWORK VIEW (Default) ---------------- */}
        {/* ---------------- GRID NETWORK VIEW (Default) ---------------- */}
        {viewMode === 'grid' ? (
          <div className="p-2 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
              {filteredOrders.map((order, index) => {
                const isBeingDragged = draggedOrderId === order.id;
                const isDraggedOver = dragOverOrderId === order.id && !isBeingDragged;
                const isSelected = selectedOrders.has(order.id);

                return (
                  <div
                    key={order.id}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, order.id)}
                    onDragOver={(e) => handleDragOver(e, order.id)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, order.id)}
                    className={cn(
                      "bg-white rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border transition-all flex flex-col justify-between select-none relative group",
                      isSelected ? "bg-amber-50/50 border-amber-300" : "border-stone-200",
                      isBeingDragged && "opacity-40 scale-[0.98] bg-amber-50 ring-2 ring-amber-400",
                      isDraggedOver && "border-amber-500 ring-2 ring-amber-400 bg-amber-50/70",
                      !isBeingDragged && !isDraggedOver && "hover:border-amber-300 hover:shadow-md"
                    )}
                  >
                    <div>
                      {/* Card Header: Reorder handle & sequence + selection + type badge */}
                      <div className="flex items-center justify-between pb-1.5 sm:pb-2 mb-1.5 sm:mb-2 border-b border-stone-100">
                        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                          <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleOrderSelection(order.id); }}
                            className="text-stone-400 hover:text-stone-700 shrink-0"
                          >
                            {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-amber-500" /> : <Square className="w-3.5 h-3.5" />}
                          </button>
                          <span 
                            className="cursor-grab active:cursor-grabbing p-0.5 sm:p-1 bg-stone-100 hover:bg-amber-100 text-stone-500 rounded transition shrink-0"
                            title="اسحب لإعادة ترتيب مسار السائق"
                          >
                            <GripVertical className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          </span>
                          <span className="text-[9px] sm:text-[10px] font-mono font-bold bg-stone-900 text-amber-400 px-1 sm:px-1.5 py-0.5 rounded shrink-0">
                            #{index + 1}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <span className={cn("px-1 sm:px-1.5 py-0.2 rounded text-[9px] sm:text-[10px] font-bold border", TYPE_COLORS[order.type])}>
                            {order.type}
                          </span>
                          <span className="font-mono text-[10px] sm:text-xs font-bold text-amber-600 mr-0.5">{order.id}</span>
                        </div>
                      </div>

                      {/* Card Main Info (Clickable for Modal) */}
                      <div 
                        onClick={() => openOrderDetails(order)}
                        className="cursor-pointer space-y-1.5 sm:space-y-2"
                      >
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                          <div className="min-w-0">
                            <h3 className="font-bold text-xs sm:text-sm text-stone-900 group-hover:text-amber-600 transition-colors truncate">
                              {order.customerName}
                            </h3>
                            <span className="text-[9px] sm:text-[10px] text-stone-400 bg-stone-100 px-1 py-0.2 rounded font-medium">
                              {order.customerType}
                            </span>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0 self-start sm:self-auto">
                            <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold border", STATUS_COLORS[order.status])}>
                              {order.status}
                              {/* A postponed order is useless without the day it moved to. */}
                              {order.status === "مؤجل" && order.postponeDate && (
                                <span className="ms-1 font-mono font-normal opacity-80">→ {order.postponeDate}</span>
                              )}
                            </span>
                            <ManagerPaymentBadge order={order} />
                          </div>
                        </div>

                        <div className="flex items-center gap-1 text-[11px] sm:text-xs text-stone-600 truncate">
                          <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                          <span className="font-semibold text-stone-800 truncate">{order.area}</span>
                        </div>

                        <div className="bg-stone-50 p-1.5 sm:p-2 rounded-lg border border-stone-100 text-[11px] sm:text-xs text-stone-600">
                          <p className="line-clamp-2">
                            <Package className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-stone-400 inline ml-1 shrink-0" />
                            {(order.items || []).map(i => `${i.qty}x ${i.product}`).join(" + ") || "منتجات العناية بالبشرة"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Controls: Financials & Driver Assignment */}
                    <div className="pt-1.5 sm:pt-2 mt-1.5 sm:mt-2 border-t border-stone-100 space-y-1.5 sm:space-y-2">
                      <div className="flex justify-between items-center text-[11px] sm:text-xs">
                        <span className="text-stone-500 font-medium">
                          {order.paymentMethod === 'cliq' && !order.cliqIncludesDelivery
                            ? "تحصيل توصيل:"
                            : "كاش مطلوب:"}
                        </span>
                        <div className="text-left font-mono">
                          {order.paymentMethod === 'cliq' && order.cliqIncludesDelivery ? (
                            <span className="font-bold text-xs sm:text-sm text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                              0.000 د.أ (مدفوع)
                            </span>
                          ) : order.paymentMethod === 'cliq' && !order.cliqIncludesDelivery ? (
                            <span className="font-bold text-xs sm:text-sm text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                              {formatCurrency(getExpectedCash(order))}
                            </span>
                          ) : (
                            <span className="font-bold text-xs sm:text-sm text-emerald-700">
                              {formatCurrency(getExpectedCash(order))}
                            </span>
                          )}
                          {order.receivables > 0 && (
                            <span className="block text-[9px] sm:text-[10px] text-rose-500 font-medium">ذمم: {formatCurrency(order.receivables)}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-1.5 sm:gap-2 pt-1">
                        <div className="flex-1 min-w-0">
                          <select 
                            className="w-full bg-stone-50 hover:bg-white border border-stone-200 rounded-md sm:rounded-lg px-1.5 sm:px-2 py-1 text-[10px] sm:text-xs font-bold outline-none focus:border-amber-500 transition cursor-pointer truncate"
                            value={order.driver || ""}
                            disabled={!canManage || saving || !["غير معين", "تم التعيين", "مؤجل", "متبقي"].includes(order.status)}
                            aria-label={`سائق الطلب ${order.id}`}
                            onChange={(e) => handleDriverChange(order.id, (e.target.value || null) as Driver)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="">بدون سائق</option>
                            {myDrivers.map(d => <option key={d} value={d}>{`سائق: ${d}`}</option>)}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => openOrderDetails(order)}
                          className="px-2 sm:px-2.5 py-1 bg-stone-900 hover:bg-stone-800 text-amber-400 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold transition cursor-pointer shrink-0"
                          title="عرض التفاصيل وتعديل الطلب" aria-label="عرض التفاصيل وتعديل الطلب"
                        >
                          تفاصيل
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ---------------- TABLE VIEW (Classic Tabular) ---------------- */
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
                <tr>
                  <th className="py-3 px-2 w-14 text-center"># ترتيب</th>
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
                  <th className="py-3 px-3">طريقة الدفع (كليك/كاش)</th>
                  <th className="py-3 px-3">كاش مطلوب من السائق</th>
                  <th className="py-3 px-3">السائق</th>
                  <th className="py-3 px-3">الحالة</th>
                  <th className="py-3 px-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredOrders.map((order, index) => {
                  const isExpanded = expandedRows.has(order.id);
                  const isSelected = selectedOrders.has(order.id);
                  const items = order.items || [];
                  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
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
                                title="تحريك لأعلى" aria-label="تحريك لأعلى"
                                className="text-stone-300 hover:text-amber-600 disabled:opacity-20 p-0.5"
                              >
                                <ChevronUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveOrder(order.id, "down")}
                                disabled={index === filteredOrders.length - 1}
                                title="تحريك لأسفل" aria-label="تحريك لأسفل"
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
                          {items.length > 1 && (
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
                            {items.length === 1 ? (
                              <span>{items[0].qty}x {items[0].product}</span>
                            ) : items.length > 1 ? (
                              <span>{totalQty} منتجات ({items.length} أصناف)</span>
                            ) : (
                              <span>منتجات العناية بالبشرة</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-stone-900">{order.area}</td>
                        <td className="py-3 px-3 font-mono text-stone-500">{formatCurrency(order.amount)}</td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <ManagerPaymentBadge order={order} />
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-stone-900">
                          {order.paymentMethod === 'cliq' && order.cliqIncludesDelivery ? (
                            <span className="text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                              0.000 د.أ (مدفوع)
                            </span>
                          ) : order.paymentMethod === 'cliq' && !order.cliqIncludesDelivery ? (
                            <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                              {formatCurrency(getExpectedCash(order))} (توصيل)
                            </span>
                          ) : (
                            <span className="text-emerald-700">{formatCurrency(getExpectedCash(order))}</span>
                          )}
                          {order.receivables > 0 && <span className="block text-[10px] text-red-500">ذمم: {formatCurrency(order.receivables)}</span>}
                        </td>
                        <td className="py-3 px-3">
                          <select 
                            className="bg-white border border-stone-200 rounded-md px-2 py-1 text-xs outline-none focus:border-amber-500"
                            value={order.driver || ""}
                            disabled={!canManage || saving || !["غير معين", "تم التعيين", "مؤجل", "متبقي"].includes(order.status)}
                            aria-label={`سائق الطلب ${order.id}`}
                            onChange={(e) => handleDriverChange(order.id, (e.target.value || null) as Driver)}
                          >
                            <option value="">بدون سائق</option>
                            {myDrivers.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </td>
                        <td className="py-3 px-3">
                          <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border", STATUS_COLORS[order.status])}>
                            {order.status}
                            {order.status === "مؤجل" && order.postponeDate && (
                              <span className="ms-1 font-mono font-normal opacity-80">→ {order.postponeDate}</span>
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => openOrderDetails(order)}
                            className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-bold transition"
                          >
                            عرض
                          </button>
                        </td>
                      </tr>
                      
                      {/* Expandable Items Sub-row */}
                      {isExpanded && (order.items || []).length > 1 && (
                        <tr className="bg-stone-50/50">
                          <td colSpan={3}></td>
                          <td colSpan={11} className="p-3">
                            <div className="bg-white border border-stone-200 rounded-lg p-3">
                              <p className="text-xs font-bold text-stone-500 mb-2">تفاصيل المنتجات:</p>
                              <ul className="space-y-1">
                                {(order.items || []).map(item => (
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
              </tbody>
            </table>
          </div>
        )}

        {loading && <div className="py-12 text-center text-stone-500">جاري تحميل الطلبات...</div>}
        {!loading && !loadError && filteredOrders.length === 0 && (
          <div className="py-12 text-center text-stone-500">
            {orders.length
              ? "لا توجد طلبات تطابق الفلتر الحالي"
              : isToday
              ? "لا توجد طلبات توصيل مفتوحة اليوم"
              : `لا توجد طلبات مسجّلة ليوم ${formattedDateLabel}`}
          </div>
        )}
      </div>

      {/* ---------------- MANAGER ORDER DETAILS & EDIT MODAL ---------------- */}
      {selectedOrderForDetails && (
        <div data-dialog="" 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in"
          onClick={() => setSelectedOrderForDetails(null)}
        >
          <div 
            className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-stone-200 max-h-[90dvh] overflow-y-auto hide-scrollbar no-scrollbar [&::-webkit-scrollbar]:hidden space-y-5 animate-in zoom-in-95 text-right"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-stone-100">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 bg-stone-900 text-amber-400 rounded-lg text-xs font-mono font-bold">
                    {selectedOrderForDetails.id}
                  </span>
                  <span className={cn("px-2 py-0.5 rounded text-xs font-bold border", TYPE_COLORS[selectedOrderForDetails.type])}>
                    {selectedOrderForDetails.type}
                  </span>
                </div>
                <h2 className="font-black text-xl text-stone-900">{selectedOrderForDetails.customerName}</h2>
                <p className="text-xs text-stone-400 mt-0.5">مندوب المبيعات: {selectedOrderForDetails.salesRep} • التاريخ: {selectedOrderForDetails.date}</p>
              </div>
              <button aria-label="إغلاق" 
                onClick={() => setSelectedOrderForDetails(null)}
                className="w-9 h-9 rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Contact Buttons */}
            <div className="grid grid-cols-2 gap-2.5">
              <a 
                href={`tel:${selectedOrderForDetails.customerPhone}`} 
                className="flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 h-11 rounded-xl text-xs font-bold border border-emerald-200 transition"
              >
                <Phone className="w-4 h-4 text-emerald-600" />
                <span>اتصال: {selectedOrderForDetails.customerPhone}</span>
              </a>
              <a 
                href={`https://wa.me/${selectedOrderForDetails.customerPhone.replace(/^0/, '962')}`} 
                target="_blank" 
                rel="noreferrer" 
                className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white h-11 rounded-xl text-xs font-bold shadow-xs transition"
              >
                <MessageSquare className="w-4 h-4" />
                <span>واتساب</span>
              </a>
            </div>

            {/* Location & Type */}
            <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-100 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-500" />
                <span className="font-bold text-stone-900">{selectedOrderForDetails.area}</span>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-stone-200 text-stone-700 font-bold">
                نوع العميل: {selectedOrderForDetails.customerType}
              </span>
            </div>

            {/* Items Breakdown */}
            <div>
              <h4 className="text-xs font-bold text-stone-500 mb-2 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-stone-400" />
                <span>الأصناف المطلوبة:</span>
              </h4>
              <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100 space-y-1.5">
                {(selectedOrderForDetails.items || []).length === 0 ? (
                  <p className="text-xs text-stone-500">لا توجد أصناف مسجلة (طلب تحصيل مالي)</p>
                ) : (
                  (selectedOrderForDetails.items || []).map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs pb-1 border-b border-stone-200/60 last:border-0 last:pb-0">
                      <span className="font-semibold text-stone-800">{item.product}</span>
                      <span className="font-bold font-mono text-stone-600 bg-stone-200/70 px-2 py-0.5 rounded">{item.qty}x</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Edit history — visible whenever the owning sales rep changed something after creation */}
            <OrderChangeLog entries={orderHistory} heading="تم تعديل هذا الطلب بعد إنشائه" />

            {/* Financials Overview */}
            <div className={cn(
              "p-3.5 rounded-2xl border grid grid-cols-2 gap-2 text-xs",
              editPaymentMethod === 'cliq'
                ? (editCliqIncludesDelivery ? "bg-purple-50/70 border-purple-200" : "bg-blue-50/70 border-blue-200")
                : "bg-amber-50/60 border-amber-200/70"
            )}>
              <div>
                <span className="text-stone-500 block">إجمالي قيمة الفاتورة:</span>
                <span className="font-bold font-mono text-stone-900 text-sm">{formatCurrency(selectedOrderForDetails.amount)}</span>
              </div>
              <div>
                <span className="text-stone-500 block">
                  {editPaymentMethod === 'cliq' && !editCliqIncludesDelivery
                    ? "كاش مطلوب (أجرة توصيل فقط):"
                    : "المطلوب كاش من السائق:"}
                </span>
                <span className={cn(
                  "font-black font-mono text-base",
                  editPaymentMethod === 'cliq'
                    ? (editCliqIncludesDelivery ? "text-purple-700" : "text-blue-700")
                    : "text-emerald-600"
                )}>
                  {editPaymentMethod === 'cliq'
                    ? (editCliqIncludesDelivery ? "0.000 د.أ (مدفوع)" : `${formatCurrency(editDeliveryFee)}`)
                    : formatCurrency(selectedOrderForDetails.cashToCollect)}
                </span>
              </div>
              {selectedOrderForDetails.receivables > 0 && (
                <div className="col-span-2 pt-1 border-t border-amber-200/60 text-orange-700">
                  <span>ذمم سابقة على الحساب: </span>
                  <span className="font-bold font-mono">{formatCurrency(selectedOrderForDetails.receivables)}</span>
                </div>
              )}
            </div>

            {/* Editable Controls for Manager */}
            <div className="space-y-3 pt-2 border-t border-stone-100">
              {/* Payment Method & CliQ Manager Selector */}
              <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-purple-600" />
                    <span>طريقة الدفع (كليك / كاش):</span>
                  </label>
                  <span className="text-[10px] text-stone-400">تحديث آلية التحصيل</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditPaymentMethod('cash')}
                    className={cn(
                      "py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer",
                      editPaymentMethod === 'cash'
                        ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                        : "bg-white text-stone-700 border-stone-200 hover:bg-stone-100"
                    )}
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>دفع عند الاستلام (كاش)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditPaymentMethod('cliq')}
                    className={cn(
                      "py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer",
                      editPaymentMethod === 'cliq'
                        ? "bg-purple-600 text-white border-purple-700 shadow-xs"
                        : "bg-white text-stone-700 border-stone-200 hover:bg-stone-100"
                    )}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>تحويل كليك (CliQ)</span>
                  </button>
                </div>

                {/* CliQ Delivery Options (شامل التوصيل او لا) */}
                {editPaymentMethod === 'cliq' && (
                  <div className="bg-purple-50/90 p-3 rounded-xl border border-purple-200 space-y-2 animate-slideUp">
                    <label className="text-xs font-bold text-purple-950 block">
                      هل حوالة كليك شاملة رسوم التوصيل؟
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditCliqIncludesDelivery(true)}
                        className={cn(
                          "py-1.5 px-2 rounded-lg text-xs font-bold border transition cursor-pointer",
                          editCliqIncludesDelivery
                            ? "bg-purple-700 text-white border-purple-800"
                            : "bg-white text-purple-900 border-purple-200"
                        )}
                      >
                        ✓ نعم، شامل التوصيل (0 د.أ مطلوب)
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditCliqIncludesDelivery(false)}
                        className={cn(
                          "py-1.5 px-2 rounded-lg text-xs font-bold border transition cursor-pointer",
                          !editCliqIncludesDelivery
                            ? "bg-blue-600 text-white border-blue-700"
                            : "bg-white text-blue-900 border-blue-200"
                        )}
                      >
                        ✗ غير شامل (تحصيل التوصيل كاش)
                      </button>
                    </div>

                    {!editCliqIncludesDelivery && (
                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-purple-200/60">
                        <label className="text-xs font-bold text-stone-700">قيمة رسوم التوصيل المطلوبة كاش:</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={editDeliveryFee}
                            onChange={(e) => setEditDeliveryFee(parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 bg-white border border-stone-300 rounded-lg text-xs font-mono font-bold text-center outline-none focus:border-blue-500"
                          />
                          <span className="text-xs font-bold text-stone-500">د.أ</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">تعيين السائق</label>
                  <select 
                    value={editDriver || ""} 
                    onChange={(e) => setEditDriver((e.target.value || null) as Driver)}
                    className="w-full bg-white border-2 border-stone-200 rounded-xl p-2 text-xs font-bold outline-none focus:border-amber-500"
                  >
                    <option value="">بدون سائق</option>
                    {myDrivers.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">حالة الطلب</label>
                  <select 
                    value={editStatus} 
                    onChange={(e) => setEditStatus(e.target.value as OrderStatus)}
                    className="w-full bg-white border-2 border-stone-200 rounded-xl p-2 text-xs font-bold outline-none focus:border-amber-500"
                  >
                    {(selectedOrderForDetails.dbStatus === "confirmed"
                      ? ["غير معين", "تم التعيين", "ملغى"]
                      : selectedOrderForDetails.dbStatus === "processing"
                        ? ["غير معين", "تم التعيين", "مكتمل", "مرتجع", "مؤجل", "متبقي", "ملغى"]
                        : selectedOrderForDetails.dbStatus === "shipped"
                          ? ["تم التعيين", "مكتمل", "مرتجع", "مؤجل", "متبقي"]
                          : [selectedOrderForDetails.status]
                    ).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              {editStatus === "مكتمل" && selectedOrderForDetails.status !== "مكتمل" && (
                <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  سيُسجَّل تحصيل نقدي بقيمة {formatCurrency(selectedOrderForDetails.cashToCollect)} في المالية. لمبلغ مختلف استخدم صفحة التسوية.
                </p>
              )}
              {editStatus === "ملغى" && selectedOrderForDetails.status !== "ملغى" && (
                <p className="text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  سيتم إلغاء الطلب وإرجاع أي كمية محجوزة إلى المخزون تلقائياً. لا يمكن التراجع عن هذا الإجراء.
                </p>
              )}

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">ملاحظات التوصيل</label>
                <textarea 
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="أضف ملاحظات للمندوب أو السائق..."
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2 text-xs outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveOrderDetails}
                disabled={!canManage || saving || ["مكتمل", "مرتجع"].includes(selectedOrderForDetails.status)}
                className="flex-1 py-3 disabled:opacity-50 disabled:cursor-not-allowed bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl font-bold text-xs shadow-md shadow-amber-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{saving ? "جاري الحفظ..." : "حفظ التعديلات"}</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedOrderForDetails(null)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- DONE / SUCCESS MODAL ---------------- */}
      {doneModalInfo.isOpen && (
        <div data-dialog="" 
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setDoneModalInfo(prev => ({ ...prev, isOpen: false }))}
        >
          <div 
            className="bg-white w-full max-w-sm rounded-3xl p-6 sm:p-7 shadow-2xl border border-emerald-100 text-center space-y-4 animate-in zoom-in-95"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner ring-8 ring-emerald-50">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-xl font-black text-stone-900">{doneModalInfo.title}</h3>
              <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">{doneModalInfo.subtitle}</p>
            </div>

            {(doneModalInfo.orderId || doneModalInfo.driverName) && (
              <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-100 space-y-2 text-right">
                {doneModalInfo.orderId && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-stone-400">رقم الطلب:</span>
                    <span className="font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      {doneModalInfo.orderId}
                    </span>
                  </div>
                )}
                {doneModalInfo.driverName && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-stone-400">السائق المعتمد:</span>
                    <span className="font-bold text-stone-900 bg-stone-200/70 px-2 py-0.5 rounded">
                      {doneModalInfo.driverName}
                    </span>
                  </div>
                )}
                {doneModalInfo.badgeText && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-stone-400">الحالة:</span>
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", doneModalInfo.badgeColor || "bg-stone-100 text-stone-700")}>
                      {doneModalInfo.badgeText}
                    </span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setDoneModalInfo(prev => ({ ...prev, isOpen: false }))}
              className="w-full py-3.5 rounded-2xl bg-stone-900 hover:bg-stone-800 text-amber-400 font-black text-sm shadow-lg transition active:scale-95 cursor-pointer"
            >
              تم ومتابعة العمل
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
