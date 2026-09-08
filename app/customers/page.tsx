"use client";

import { useState } from "react";
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
  ExternalLink
} from "lucide-react";
import { CUSTOMER_TYPE_LABELS, CLASSIFICATION_LABELS, formatDate } from "@/lib/utils";
import { generateGoogleCalendarUrl } from "@/lib/calendar";
import { useLoading } from "@/lib/loading-context";

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
    rep_name_raw: "رحمه",
    notes: "2 شامبو بلازما + 100مل تريتمنت (سوشال ميديا)",
    last_contact_date: "2026-09-08",
    next_call_date: "2026-09-15",
    history: [
      { date: "2026-09-08", rep: "رحمه", outcome: "تم الرد وتثبيت طلبية", notes: "طلبت 2 شامبو بلازما مع تريتمنت" },
      { date: "2026-08-20", rep: "رحمه", outcome: "طلب موعد آخر", notes: "مهتمة بمنتجات البلازما وطلبت الاتصال بداية الشهر" },
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
    rep_name_raw: "رحمه",
    notes: "شامبو بلازما مع متابعة شهرية",
    last_contact_date: "2026-06-18",
    next_call_date: "2026-09-18",
    history: [
      { date: "2026-06-18", rep: "رحمه", outcome: "تم الرد", notes: "شراء شامبو بلازما" }
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
  },
  {
    id: "6",
    legacy_id: 6,
    name: "صالون لمسة حرير",
    phone: "0788812345",
    customer_type: "salon",
    classification: "salon",
    lead_source: "social_media",
    address: "إربد - شارع الجامعة",
    city: "إربد",
    rep_name_raw: "حنان",
    notes: "مهتمة ببروتين ماراكوجا 1 لتر + بكج مورفوزيس ريبير",
    last_contact_date: "2026-09-01",
    next_call_date: "2026-09-10",
    history: [
      { date: "2026-09-01", rep: "حنان", outcome: "تم الرد", notes: "إرسال كاتالوج بروتين ماراكوجا" }
    ]
  },
];

export default function CustomersPage() {
  const { startLoading, stopLoading } = useLoading();
  const [customers, setCustomers] = useState(SAMPLE_CUSTOMERS);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRep, setSelectedRep] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState<typeof SAMPLE_CUSTOMERS[0] | null>(null);
  
  // New Lead Modal
  const [newLeadModal, setNewLeadModal] = useState(false);
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
          rep_name: newLeadRep,
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
          rep_name_raw: data.lead.rep_name,
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
    const matchesSearch = 
      c.name.includes(searchTerm) || 
      c.phone.includes(searchTerm) || 
      (c.city && c.city.includes(searchTerm)) ||
      (c.notes && c.notes.includes(searchTerm));
    
    const matchesRep = selectedRep === "all" || c.rep_name_raw === selectedRep;
    const matchesType = selectedType === "all" || c.customer_type === selectedType;

    return matchesSearch && matchesRep && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Header Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-amber-500" />
            <span>إدارة العملاء والليدات (CRM)</span>
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            قاعدة بيانات عملاء بيتولا كوزمتكس (45,309 سجل مستورد مع سجل الاتصالات والتوزيع الآلي)
          </p>
        </div>

        <button 
          onClick={() => setNewLeadModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-sm rounded-xl shadow-xs transition"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة رقم / ليد جديد (توزيع آلي)</span>
        </button>
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
          <select
            value={selectedRep}
            onChange={(e) => setSelectedRep(e.target.value)}
            className="px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl text-stone-700 focus:outline-none focus:border-amber-500 font-medium"
          >
            <option value="all">جميع المندوبين</option>
            <option value="حمزة">حمزة (12.6K)</option>
            <option value="رحمه">رحمه (5.9K)</option>
            <option value="صابرين">صابرين (2.8K)</option>
            <option value="حنان">حنان (1.9K)</option>
          </select>

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

      {/* Customer Data Table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
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
              {filteredCustomers.map((customer) => (
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
              ))}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="p-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
          <span>عرض {filteredCustomers.length} من إجمالي 45,309 عميل</span>
          <div className="flex items-center gap-2">
            <button className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 disabled:opacity-50">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono">صفحة 1 من 4531</span>
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
                  <select
                    value={newLeadRep}
                    onChange={(e) => setNewLeadRep(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 font-semibold text-amber-900"
                  >
                    <option value="auto">توزيع آلي (مداورة)</option>
                    <option value="حمزة">حمزة</option>
                    <option value="رحمه">رحمه</option>
                    <option value="صابرين">صابرين</option>
                    <option value="حنان">حنان</option>
                  </select>
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
    </div>
  );
}
