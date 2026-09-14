"use client";

import { useState, useEffect } from "react";
import { 
  Users, 
  Search, 
  Filter, 
  PhoneCall, 
  MessageSquare, 
  Calendar as CalendarIcon, 
  MapPin, 
  Tag, 
  UserCheck, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Plus, 
  Clock, 
  CheckCircle2, 
  ExternalLink,
  Send,
  FileSpreadsheet
} from "lucide-react";
import { CUSTOMER_TYPE_LABELS, CLASSIFICATION_LABELS, formatDate } from "@/lib/utils";
import { generateGoogleCalendarUrl } from "@/lib/calendar";
import { useLoading } from "@/lib/loading-context";
import { getCurrentUser } from "@/lib/client-api";
import { SendLeadsModal } from "@/components/admin/send-leads-modal";
import { ExcelLeadsModal, ExcelLeadItem } from "@/components/admin/excel-leads-modal";

const SAMPLE_CUSTOMERS = [
  {
    id: "1",
    legacy_id: 1,
    name: "سدين غنايم",
    phone: "0793937385",
    customer_type: "end_user",
    classification: "customer",
    lead_source: "social_media",
    address: "طبربور / شارع الامير حسين عماره 101",
    city: "طبربور",
    rep_name_raw: "صابرين",
    notes: "2 شامبو بلازما + 100مل تريتمنت (سوشال ميديا)",
    last_contact_date: "2026-09-08",
    next_call_date: "2026-09-15",
    history: [
      { date: "2026-09-08", rep: "صابرين", outcome: "تم الرد وتثبيت طلبية", notes: "طلبت 2 شامبو بلازما مع تريتمنت" },
      { date: "2026-08-20", rep: "صابرين", outcome: "طلب موعد آخر", notes: "مهتمة بمنتجات البلازما وطلبت الاتصال بداية الشهر" },
    ]
  },
  {
    id: "2",
    legacy_id: 2,
    name: "ربى صبيح",
    phone: "0799193505",
    customer_type: "sale",
    classification: "customer",
    lead_source: "sales",
    address: "الزرقاء - الجبل الشمالي بالقرب من مركز امن ياجوز",
    city: "الزرقاء",
    rep_name_raw: "صابرين",
    notes: "3 بكجات مورفوزيس 250 + 2 ليف ان + 5 سيشتات (حجز شهر)",
    last_contact_date: "2026-09-10",
    next_call_date: "2026-10-10",
    history: [
      { date: "2026-09-10", rep: "صابرين", outcome: "تم حجز طلبية", notes: "حجز شهر بكجات مورفوزيس" }
    ]
  },
  {
    id: "3",
    legacy_id: 3,
    name: "بيان عادل",
    phone: "0770000088",
    customer_type: "sale",
    classification: "customer",
    lead_source: "sales",
    address: "الطفيلة",
    city: "الطفيلة",
    rep_name_raw: "حمزة",
    notes: "شامبو بلازما مع متابعة شهرية",
    last_contact_date: "2026-06-18",
    next_call_date: "2026-09-18",
    history: [
      { date: "2026-06-18", rep: "حمزة", outcome: "تم الرد", notes: "شراء شامبو بلازما" }
    ]
  },
  {
    id: "4",
    legacy_id: 4,
    name: "صيدلية المقاصد",
    phone: "0770005000",
    customer_type: "pharmacy",
    classification: "pharmacy",
    lead_source: "sales",
    address: "عمان - الدوار السابع",
    city: "عمان",
    rep_name_raw: "حمزة",
    notes: "سألت عن بكج البلازما المتكامل لطلبية شهرية",
    last_contact_date: "2026-02-14",
    next_call_date: "2026-09-12",
    history: [
      { date: "2026-02-14", rep: "حمزة", outcome: "استفسار أسعار", notes: "طلبت قائمة أسعار الصيدليات" }
    ]
  },
  {
    id: "5",
    legacy_id: 5,
    name: "دبي ماجيك",
    phone: "0770010004",
    customer_type: "wholesale",
    classification: "customer",
    lead_source: "sales",
    address: "المفرق",
    city: "المفرق",
    rep_name_raw: "حمزة",
    notes: "طلب أسعار كميات لصالونات الشمال",
    last_contact_date: "2026-02-14",
    next_call_date: null,
    history: []
  }
];

export default function CustomersPage() {
  const { startLoading, stopLoading } = useLoading();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [customers, setCustomers] = useState(SAMPLE_CUSTOMERS);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRep, setSelectedRep] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState<typeof SAMPLE_CUSTOMERS[0] | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);
  }, []);

  const isSalesRep = currentUser?.role === "sales_rep";
  const repName = currentUser?.name?.replace(/\s*\(مبيعات\)/, "")?.trim() || currentUser?.username || "حنان";
  
  // New Lead Modal
  const [newLeadModal, setNewLeadModal] = useState(false);
  const [sendLeadsModalOpen, setSendLeadsModalOpen] = useState(false);
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadPhone, setNewLeadPhone] = useState("");
  const [newLeadCity, setNewLeadCity] = useState("عمان");
  const [newLeadAddress, setNewLeadAddress] = useState("");
  const [newLeadNotes, setNewLeadNotes] = useState("");
  const [newLeadSource, setNewLeadSource] = useState("social_media");
  const [newLeadRep, setNewLeadRep] = useState("auto");

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadPhone) return;

    const repToAssign = isSalesRep ? repName : newLeadRep;

    startLoading({
      ar: "جاري حفظ وتوثيق بيانات العميل في قاعدة البيانات...",
      en: "Registering customer lead in CRM database...",
    });

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLeadName || "عميل جديد",
          phone: newLeadPhone,
          city: newLeadCity,
          address: newLeadAddress,
          notes: newLeadNotes,
          source: newLeadSource,
          rep_name: repToAssign,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const createdCustomer = {
          id: String(customers.length + 1),
          legacy_id: 45310 + customers.length,
          name: data.lead.name,
          phone: data.lead.phone,
          customer_type: "end_user",
          classification: "customer",
          lead_source: data.lead.lead_source,
          address: data.lead.address,
          city: data.lead.city,
          rep_name_raw: data.lead.rep_name || repToAssign,
          notes: data.lead.notes,
          last_contact_date: new Date().toISOString().split('T')[0],
          next_call_date: null,
          history: [],
        };
        setCustomers([createdCustomer, ...customers]);
        setNewLeadModal(false);
        setNewLeadName("");
        setNewLeadPhone("");
        setNewLeadAddress("");
        setNewLeadNotes("");
        alert(data.message);
      }
    } catch (err) {
      alert("فشل إنشاء الليد: " + String(err));
    } finally {
      stopLoading();
    }
  };

  const filteredCustomers = customers.filter((c) => {
    // If sales rep, only show customers belonging to this rep!
    if (isSalesRep) {
      const isAssignedToMe = 
        c.rep_name_raw === repName || 
        c.rep_name_raw === currentUser?.username || 
        c.rep_name_raw === "حنان";
      if (!isAssignedToMe) return false;
    } else if (selectedRep !== "all") {
      if (c.rep_name_raw !== selectedRep) return false;
    }

    const matchesSearch = 
      c.name.includes(searchTerm) || 
      c.phone.includes(searchTerm) || 
      (c.city && c.city.includes(searchTerm)) ||
      (c.notes && c.notes.includes(searchTerm));
    
    const matchesType = selectedType === "all" || c.customer_type === selectedType;

    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Header Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-amber-500" />
            <span>{isSalesRep ? "سجل عملائي والليدات (CRM)" : "إدارة العملاء والليدات (CRM)"}</span>
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            {isSalesRep
              ? `سجل العملاء والليدات الخاص بحسابك (${filteredCustomers.length} عميل مسجل)`
              : "قاعدة بيانات عملاء بيتولا كوزمتكس (45,309 سجل مستورد مع سجل الاتصالات والتوزيع الآلي)"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!isSalesRep && (
            <>
              <button
                type="button"
                onClick={() => setExcelModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-800 via-teal-800 to-emerald-900 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition cursor-pointer border border-emerald-600/40"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
                <span>شيت إكسل وتوزيع الليدات 📊</span>
              </button>

              <button
                type="button"
                onClick={() => setSendLeadsModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#160f02] via-[#241a08] to-[#160f02] hover:bg-stone-800 text-[#f4e5d0] border border-[#554625] font-bold text-xs sm:text-sm rounded-xl shadow-md transition cursor-pointer"
              >
                <Send className="w-4 h-4 text-[#9e8959]" />
                <span>إرسال أرقام للموظفين (New Data 🔔)</span>
              </button>
            </>
          )}

          <button 
            type="button"
            onClick={() => {
              if (isSalesRep) setNewLeadRep(repName);
              setNewLeadModal(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs sm:text-sm rounded-xl shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isSalesRep ? "إضافة ليد / عميل جديد" : "إضافة رقم / ليد جديد"}</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="بحث بالاسم، رقم الهاتف، أو المدينة..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-stone-800"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {isSalesRep ? (
            <div className="px-3 py-2 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-900 rounded-xl font-bold flex items-center gap-1.5 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
              <span>عملاء حسابي فقط ({repName})</span>
            </div>
          ) : (
            <select
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl text-stone-700 focus:outline-none focus:border-amber-500 font-medium"
            >
              <option value="all">جميع المندوبين</option>
              <option value="حمزة">حمزة (12.6K)</option>
              <option value="صابرين">صابرين (2.8K)</option>
              <option value="حنان">حنان (0)</option>
            </select>
          )}

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl text-stone-700 focus:outline-none focus:border-amber-500 font-medium"
          >
            <option value="all">كافة أنواع العملاء</option>
            <option value="end_user">مستهلك مباشر</option>
            <option value="salon">صالون</option>
            <option value="pharmacy">صيدلية</option>
            <option value="wholesale">جملة</option>
            <option value="sale">بيع / حجز</option>
          </select>
        </div>
      </div>

      {/* Customer Data Section: Responsive Cards for Mobile + Rich Table for Desktop */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        {/* Mobile View (Cards) */}
        <div className="block md:hidden divide-y divide-stone-100">
          {filteredCustomers.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
                <Users className="w-6 h-6" />
              </div>
              <p className="font-bold text-sm text-stone-900">
                {isSalesRep ? "لا يوجد عملاء مخصصين لحسابك حتى الآن" : "لا توجد نتائج مطابقة للبحث"}
              </p>
              <p className="text-xs text-stone-500 max-w-xs mx-auto leading-relaxed">
                {isSalesRep 
                  ? "حسابك جديد ونظيف بدون بيانات تجريبية. سيظهر عملاؤك هنا فور إضافتك لليد جديد أو عند توزيع الليدات من الإدارة."
                  : "يرجى تغيير كلمات البحث أو فلتر المندوبين."}
              </p>
              {isSalesRep && (
                <button
                  type="button"
                  onClick={() => {
                    setNewLeadRep(repName);
                    setNewLeadModal(true);
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-stone-950 text-xs font-bold rounded-xl shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة ليد جديد</span>
                </button>
              )}
            </div>
          ) : (
            filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                onClick={() => setSelectedCustomer(customer)}
                className="p-3.5 space-y-2 hover:bg-amber-50/40 transition active:bg-amber-100/40 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm text-stone-900 truncate">{customer.name}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-xs font-bold text-amber-900" dir="ltr">{customer.phone}</span>
                      <span className="text-[10px] px-2 py-0.2 rounded-md bg-stone-100 text-stone-600 font-medium">{customer.city || "عمان"}</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                    {customer.rep_name_raw}
                  </span>
                </div>

                {customer.notes && (
                  <p className="text-[11px] text-stone-600 line-clamp-2 bg-stone-50 p-2 rounded-xl border border-stone-100">
                    📌 {customer.notes}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-100" onClick={(e) => e.stopPropagation()}>
                  <span className="text-[10px] text-stone-400 font-mono">#{customer.legacy_id}</span>
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${customer.phone}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs transition"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>اتصال</span>
                    </a>
                    <a
                      href={`https://wa.me/${customer.phone.replace(/^0/, '962')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs shadow-2xs transition"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>واتساب</span>
                    </a>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop View (Rich Table with Horizontal Scroll Safe Min-Width) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-right text-xs min-w-[760px]">
            <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
              <tr>
                <th className="py-3 px-4"># الرقم</th>
                <th className="py-3 px-4">اسم العميل</th>
                <th className="py-3 px-4">رقم الهاتف</th>
                <th className="py-3 px-4">النوع والتصنيف</th>
                <th className="py-3 px-4">المندوب</th>
                <th className="py-3 px-4">المدينة / العنوان</th>
                <th className="py-3 px-4">الموعد القادم</th>
                <th className="py-3 px-4 text-center">إجراءات سريعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2.5 max-w-md mx-auto">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center">
                        <Users className="w-6 h-6" />
                      </div>
                      <p className="font-bold text-sm text-stone-900">
                        {isSalesRep 
                          ? "لا يوجد عملاء أو ليدات مخصصة لحسابك حتى الآن"
                          : "لم يتم العثور على أي عملاء يطابقون معايير البحث"}
                      </p>
                      <p className="text-xs text-stone-500 leading-relaxed">
                        {isSalesRep 
                          ? "حسابك جديد ونظيف بدون بيانات تجريبية. سيظهر عملاؤك هنا فور إضافتك لليد جديد أو عند قيام النظام بتوزيع الليدات آلياً."
                          : "يرجى تجربة كلمات بحث أخرى أو تغيير معايير التصفية."}
                      </p>
                      {isSalesRep && (
                        <button
                          onClick={() => {
                            setNewLeadRep(repName);
                            setNewLeadModal(true);
                          }}
                          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة أول عميل / ليد الآن</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr 
                    key={customer.id} 
                    className="hover:bg-amber-50/40 transition cursor-pointer"
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    <td className="py-3.5 px-4 font-mono text-stone-400">
                      {customer.legacy_id}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-stone-900">
                      {customer.name}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-stone-700" dir="ltr">
                      {customer.phone}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                        {CUSTOMER_TYPE_LABELS[customer.customer_type] || customer.customer_type}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-semibold border border-amber-200/60">
                        {customer.rep_name_raw}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-stone-600 max-w-xs truncate">
                      {customer.address || customer.city || "—"}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs">
                      {customer.next_call_date ? (
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-200">
                          {formatDate(customer.next_call_date)}
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <a
                          href={`tel:${customer.phone}`}
                          className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                          title="اتصال هاتف"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                        </a>
                        <a
                          href={`https://wa.me/${customer.phone.replace(/^0/, '962')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                          title="محادثة واتساب"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="p-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
          <span>{isSalesRep ? `عرض ${filteredCustomers.length} عميل خاص بحسابك` : `عرض ${filteredCustomers.length} من إجمالي 45,309 عميل`}</span>
          <div className="flex items-center gap-2">
            <button className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 disabled:opacity-50">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono">{filteredCustomers.length === 0 ? "صفحة 0 من 0" : "صفحة 1 من 4531"}</span>
            <button className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Customer Detail Drawer with History */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-5 animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-stone-900">{selectedCustomer.name}</h3>
                <p className="text-sm font-mono text-stone-500" dir="ltr">{selectedCustomer.phone}</p>
              </div>
              <button 
                onClick={() => setSelectedCustomer(null)}
                className="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-500"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs bg-stone-50 p-4 rounded-2xl border border-stone-200">
              <div className="flex justify-between">
                <span className="text-stone-500">المندوب المسؤول:</span>
                <span className="font-bold text-stone-800">{selectedCustomer.rep_name_raw}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">نوع العميل:</span>
                <span className="font-semibold text-stone-800">{CUSTOMER_TYPE_LABELS[selectedCustomer.customer_type]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">العنوان:</span>
                <span className="font-medium text-stone-800">{selectedCustomer.address}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">تاريخ التواصل القادم:</span>
                <span className="font-mono font-bold text-amber-600">{formatDate(selectedCustomer.next_call_date)}</span>
              </div>
            </div>

            {/* Google Calendar Link Button */}
            {selectedCustomer.next_call_date && (
              <a
                href={generateGoogleCalendarUrl({
                  customerName: selectedCustomer.name,
                  customerPhone: selectedCustomer.phone,
                  startDate: selectedCustomer.next_call_date,
                  notes: selectedCustomer.notes,
                  address: selectedCustomer.address,
                  repName: selectedCustomer.rep_name_raw,
                })}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition"
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>إضافة موعد المتابعة إلى تقويم Google 📅</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {/* Call Logs Timeline */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>سجل الاتصالات والملاحظات السابقة:</span>
              </h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {selectedCustomer.history && selectedCustomer.history.length > 0 ? (
                  selectedCustomer.history.map((h: any, idx: number) => (
                    <div key={idx} className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1">
                      <div className="flex justify-between text-stone-500 text-[10px]">
                        <span>{h.date} • بواسطة: {h.rep}</span>
                        <span className="font-bold text-amber-700">{h.outcome}</span>
                      </div>
                      <p className="text-stone-700">{h.notes}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-stone-400 italic">لا توجد مكالمات سابقة مسجلة لهذا العميل حتى الآن.</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <a
                href={`tel:${selectedCustomer.phone}`}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition"
              >
                <PhoneCall className="w-4 h-4" />
                <span>اتصال فوري</span>
              </a>
              <a
                href={`https://wa.me/${selectedCustomer.phone.replace(/^0/, '962')}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition"
              >
                <MessageSquare className="w-4 h-4" />
                <span>محادثة واتساب</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Add New Lead Modal */}
      {newLeadModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form 
            onSubmit={handleCreateLead}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg text-stone-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <span>إضافة رقم / ليد جديد (تلقائي)</span>
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  يتم توجيه الرقم آلياً للمندوب النشط دون الحاجة لطباعة أوراق
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setNewLeadModal(false)}
                className="p-1 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">اسم العميل (اختياري):</label>
                <input
                  type="text"
                  value={newLeadName}
                  onChange={(e) => setNewLeadName(e.target.value)}
                  placeholder="مثال: دانا خليل"
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">رقم الهاتف (مطلوب):</label>
                <input
                  type="text"
                  required
                  value={newLeadPhone}
                  onChange={(e) => setNewLeadPhone(e.target.value)}
                  placeholder="07xxxxxxxx"
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">المدينة:</label>
                  <select
                    value={newLeadCity}
                    onChange={(e) => setNewLeadCity(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500"
                  >
                    <option value="عمان">عمان</option>
                    <option value="الزرقاء">الزرقاء</option>
                    <option value="إربد">إربد</option>
                    <option value="طبربور">طبربور</option>
                    <option value="العقبة">العقبة</option>
                    <option value="مادبا">مادبا</option>
                    <option value="السلط">السلط</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">توجيه المندوب:</label>
                  {isSalesRep ? (
                    <div className="w-full p-2.5 bg-amber-50 border border-amber-200 rounded-xl font-bold text-amber-900 text-xs flex items-center justify-between">
                      <span>حسابي الشخصي</span>
                      <span className="text-amber-700 font-mono">@{currentUser?.username || "hanan"}</span>
                    </div>
                  ) : (
                    <select
                      value={newLeadRep}
                      onChange={(e) => setNewLeadRep(e.target.value)}
                      className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 font-semibold text-amber-900"
                    >
                      <option value="auto">توزيع آلي (مداورة)</option>
                      <option value="حمزة">حمزة</option>
                      <option value="صابرين">صابرين</option>
                      <option value="حنان">حنان</option>
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">العنوان التفصيلي:</label>
                <input
                  type="text"
                  value={newLeadAddress}
                  onChange={(e) => setNewLeadAddress(e.target.value)}
                  placeholder="المنطقة، الشارع، أو اسم الصالون"
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">ملاحظات الطلب أو الاستفسار:</label>
                <textarea
                  rows={2}
                  value={newLeadNotes}
                  onChange={(e) => setNewLeadNotes(e.target.value)}
                  placeholder="سجل المنتجات التي سأل عنها العميل..."
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl font-bold text-xs shadow-xs transition"
              >
                حفظ وإسناد للمندوب فوراً
              </button>
              <button
                type="button"
                onClick={() => setNewLeadModal(false)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admin Send Leads / Phone Numbers Modal (New Data Notification) */}
      <SendLeadsModal
        isOpen={sendLeadsModalOpen}
        onClose={() => setSendLeadsModalOpen(false)}
        onSuccess={(createdLeads) => {
          if (createdLeads && createdLeads.length > 0) {
            const newCusts = createdLeads.map((item, idx) => ({
              id: `lead_${Date.now()}_${idx}`,
              legacy_id: 45310 + customers.length + idx,
              name: item.name,
              phone: item.phone,
              customer_type: "end_user",
              classification: "customer",
              lead_source: item.source || "admin_dispatch",
              address: item.address || item.city,
              city: item.city || "عمان",
              rep_name_raw: item.repName || "حنان",
              notes: item.notes || "أرقام جديدة محولة من قبل المسؤول",
              last_contact_date: new Date().toISOString().split("T")[0],
              next_call_date: null,
              history: [],
            }));
            setCustomers((prev) => [...newCusts, ...prev]);
          }
        }}
      />

      {/* Admin Excel Leads Hub Big Modal */}
      <ExcelLeadsModal
        isOpen={excelModalOpen}
        onClose={() => setExcelModalOpen(false)}
        onSuccess={(insertedLeads, targetRep) => {
          const newCustomers = insertedLeads.map((item, idx) => ({
            id: `excel_${Date.now()}_${idx}`,
            legacy_id: 45310 + customers.length + idx,
            name: item.name,
            phone: item.phone,
            customer_type: "end_user",
            classification: "customer",
            lead_source: item.source || "excel_import",
            address: item.address || item.city,
            city: item.city || "عمان",
            rep_name_raw: targetRep,
            notes: item.notes,
            last_contact_date: new Date().toISOString().split("T")[0],
            next_call_date: null,
            history: [],
          }));
          setCustomers((prev) => [...newCustomers, ...prev]);
        }}
      />
    </div>
  );
}
