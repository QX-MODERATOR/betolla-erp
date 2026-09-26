"use client";

import { useState, useEffect, useCallback, useMemo, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  PhoneCall,
  MessageSquare,
  Calendar as CalendarIcon,
  ShoppingCart,
  CheckCircle2,
  Clock,
  Plus,
  Sparkles,
  ExternalLink,
  X,
  ShieldAlert,
  FileText,
  UserPlus,
  UserMinus,
  Send,
  Copy,
  ChevronDown,
  UserCog,
  History,
  RotateCcw,
  Phone,
  Trophy,
  TrendingUp,
  Users,
} from "lucide-react";
import { DATA_SOURCES, CUSTOMER_SEGMENTS, CUSTOMER_CHANNELS, AD_CHANNELS, isDataSource, isCustomerSegment, isCustomerChannel, type DataSource, type CustomerSegment, type CustomerChannel } from "@/lib/order-meta";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { getCurrentUser, secureFetch } from "@/lib/client-api";
import { useLanguage } from "@/lib/i18n";
import { useLoading } from "@/lib/loading-context";
import { useDateFilter } from "@/lib/date-context";
import { useProfile } from "@/lib/profile-context";
import { loadBusiness, saveBusiness } from "@/lib/business-client";
import { withTopProductsFirst, isTopProduct } from "@/lib/top-products";
import { ASSIGNABLE_REPS, isOwnQueueRole, normalizeRepName } from "@/lib/reps";
import { useToast } from "@/components/common/toast";
import type { BusinessCustomer, BusinessOrder, BusinessProduct } from "@/lib/business";
import type { CustomerSearchHit } from "@/lib/customer-search";
import type { PromoQuote } from "@/lib/order-pricing";
import { useConfirm } from "@/components/common/confirm-dialog";
import { IncompleteOrderBar } from "@/components/sales/incomplete-order-bar";
import { SendContactsModal } from "@/components/sales/send-contacts-modal";
import { useCan } from "@/lib/use-permission";

const JORDAN_CITIES = [
  "عمان", "الزرقاء", "إربد", "العقبة", "السلط", "المفرق", "مادبا", "جرش", "عجلون", "الكرك", "الطفيلة", "معان"
];

// A customer counts as "still a fresh, unworked lead" until a rep either logs a
// call or schedules a follow-up — used to surface never-touched leads in today's queue.
function isUntouchedLead(c: BusinessCustomer): boolean {
  return !c.next_call_date && !c.last_contact_date;
}

function SalesAppContent() {
  const dialogs = useConfirm();
  const searchParams = useSearchParams();
  const isRestrictedNotice = searchParams.get("restricted") === "true";
  const { language, dir, t } = useLanguage();
  const { startLoading, stopLoading } = useLoading();
  const { showToast } = useToast();
  const isArabic = language === "ar";

  const { selectedDate, todayDate, isToday, resetToToday, formattedDateLabel } = useDateFilter();
  const { openProfileModal, allProfiles } = useProfile();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeRep, setActiveRep] = useState<string>("");
  const [isRepDropdownOpen, setIsRepDropdownOpen] = useState(false);
  const repDropdownRef = useRef<HTMLDivElement>(null);

  const [customers, setCustomers] = useState<BusinessCustomer[]>([]);
  const [orders, setOrders] = useState<BusinessOrder[]>([]);
  const [products, setProducts] = useState<BusinessProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [repNamesFromData, setRepNamesFromData] = useState<string[]>([]);
  const appliedRepLinkRef = useRef<string | null>(null);

  // Customers are loaded for the rep on screen only (a sales rep: her own; a manager: the rep
  // chosen in the switcher), not the whole 45k-customer list.
  const reload = useCallback(async () => {
    const isRep = isOwnQueueRole(getCurrentUser()?.role);
    if (!isRep && !activeRep) return;
    const customersUrl = isRep ? "/api/customers" : `/api/customers?rep=${encodeURIComponent(activeRep)}`;
    try {
      const [c, o, p] = await Promise.all([
        loadBusiness<{ customers: BusinessCustomer[] }>(customersUrl).then((d) => d.customers),
        loadBusiness<{ orders: BusinessOrder[] }>("/api/orders").then((d) => d.orders),
        loadBusiness<{ catalog: BusinessProduct[] }>("/api/inventory").then((d) => d.catalog),
      ]);
      setCustomers(c);
      setOrders(o);
      setProducts(p);
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "تعذر تحميل بيانات المبيعات.");
    } finally {
      setLoading(false);
    }
  }, [activeRep]);

  useEffect(() => { void reload(); }, [reload]);

  // Managers: every rep name that has leads, for the switcher (from the dashboard counts).
  useEffect(() => {
    if (isOwnQueueRole(getCurrentUser()?.role)) return;
    loadBusiness<{ rep_counts: { name: string; count: number }[] }>("/api/dashboard")
      .then((d) => setRepNamesFromData(d.rep_counts.map((r) => r.name).filter(Boolean)))
      .catch(() => {});
  }, []);

  // Close rep dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (repDropdownRef.current && !repDropdownRef.current.contains(e.target as Node)) {
        setIsRepDropdownOpen(false);
      }
    }
    if (isRepDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isRepDropdownOpen]);

  // Rep roster: the real reps first, in roster order, then any other rep name still present in the
  // data, so nobody who has been assigned real leads is ever missing from the switcher. Sorting the
  // union alphabetically used to open the page on a legacy sheet code ("23AR") instead of a rep.
  const repRoster = useMemo(() => {
    const extras = repNamesFromData.filter((n) => !ASSIGNABLE_REPS.includes(n)).sort((a, b) => a.localeCompare(b, "ar"));
    return [...ASSIGNABLE_REPS, ...new Set(extras)];
  }, [repNamesFromData]);
  const canSendContacts = useCan("customers.assign_batch");
  const [sendContactsOpen, setSendContactsOpen] = useState(false);
  // Admin only: take a contact off the rep's list. The customer and her call history stay; she just
  // belongs to no rep and has no scheduled call until someone sends her again.
  const canRemoveContact = useCan("customers.unassign");
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);
    if (isOwnQueueRole(user?.role)) {
      const ownName = normalizeRepName(allProfiles[user.id]?.name || user.name);
      if (ownName) setActiveRep(ownName);
    } else {
      // A deep link from the search box names the lead's rep (applied once); otherwise keep the
      // current choice. A manager whose own account also has a personal rep queue (e.g. رشا)
      // defaults there instead of the roster's first name, but can still switch to any rep.
      const linkKey = searchParams.get("openOrderFor");
      const linkedRep = linkKey && appliedRepLinkRef.current !== linkKey ? searchParams.get("rep") : null;
      if (linkKey) appliedRepLinkRef.current = linkKey;
      const ownRepId = user?.repId && ASSIGNABLE_REPS.includes(user.repId) ? user.repId : null;
      setActiveRep((prev) => linkedRep || prev || ownRepId || ASSIGNABLE_REPS[0] || "");
    }
  }, [allProfiles, searchParams]);

  // A marketing specialist works her own queue exactly like a sales rep (lib/reps.ts).
  const isSalesRep = isOwnQueueRole(currentUser?.role);

  // Active rep's own profile (for avatar/phone/city display + real contract fields: target/commission).
  const activeRepProfile = useMemo(
    () => Object.values(allProfiles).find((p) => normalizeRepName(p.name) === activeRep),
    [allProfiles, activeRep]
  );
  const repDisplayName = normalizeRepName(activeRepProfile?.name) || activeRep;
  const repPhone = activeRepProfile?.phone || "";
  const repCity = activeRepProfile?.city || "";
  const repAvatar = activeRepProfile?.avatar || activeRep.charAt(0) || "م";

  // ---- Real, DB-derived metrics for the active rep ----
  const repCustomers = useMemo(() => customers.filter((c) => c.rep_name_raw === activeRep), [customers, activeRep]);
  const repOrders = useMemo(() => orders.filter((o) => o.rep_name === activeRep), [orders, activeRep]);

  const thisMonthKey = todayDate.slice(0, 7);
  const repOrdersThisMonth = useMemo(
    () => repOrders.filter((o) => o.order_date?.slice(0, 7) === thisMonthKey),
    [repOrders, thisMonthKey]
  );
  const monthlySales = useMemo(
    () => Math.round(repOrdersThisMonth.reduce((s, o) => s + o.total_amount, 0) * 1000) / 1000,
    [repOrdersThisMonth]
  );
  const aov = repOrdersThisMonth.length ? Math.round((monthlySales / repOrdersThisMonth.length) * 1000) / 1000 : 0;

  const target_jd = activeRepProfile?.monthlyTarget || 0;
  const commission_rate = activeRepProfile?.commissionRate || 0;
  const targetProgress = target_jd > 0 ? Math.min(Math.round((monthlySales / target_jd) * 100), 100) : 0;
  const estimatedCommission = monthlySales * (commission_rate / 100);

  const assignedLeadsCount = repCustomers.length;
  const orderedPhonesForRep = useMemo(() => new Set(repOrders.map((o) => o.customer_phone)), [repOrders]);
  const conversionRate = assignedLeadsCount
    ? Math.round((orderedPhonesForRep.size / assignedLeadsCount) * 1000) / 10
    : 0;
  const followUpsPending = useMemo(() => repCustomers.filter((c) => !!c.next_call_date).length, [repCustomers]);

  // Ranking among all reps present in real data, by this month's real sales.
  const ranking = useMemo(() => {
    const byRep: Record<string, number> = {};
    for (const o of orders) {
      if (o.order_date?.slice(0, 7) !== thisMonthKey) continue;
      byRep[o.rep_name || "—"] = (byRep[o.rep_name || "—"] || 0) + o.total_amount;
    }
    const sorted = Object.entries(byRep).sort((a, b) => b[1] - a[1]);
    const idx = sorted.findIndex(([name]) => name === activeRep);
    return { rank: idx === -1 ? null : idx + 1, total: sorted.length };
  }, [orders, thisMonthKey, activeRep]);

  // Today's calling queue: customers scheduled for the selected date, plus (only
  // when viewing today) brand-new leads nobody has contacted yet.
  const repQueue = useMemo(() => {
    return repCustomers
      .filter((c) => c.next_call_date === selectedDate || (isToday && isUntouchedLead(c)))
      .sort((a, b) => (a.next_call_date || "9999").localeCompare(b.next_call_date || "9999"));
  }, [repCustomers, selectedDate, isToday]);

  // Active customer for modals
  const [activeCustomer, setActiveCustomer] = useState<BusinessCustomer | null>(null);
  // مصدر البيانات and B2B/B2C (lib/order-meta.ts). A customer from our CRM list is always Data
  // Center; only one the rep just added through "+ Add New Phone/Lead" may say otherwise.
  const [orderFromNewLead, setOrderFromNewLead] = useState(false);
  const [orderDataSource, setOrderDataSource] = useState<DataSource | "">("");
  const [orderSegment, setOrderSegment] = useState<CustomerSegment | "">("");
  // مصدر العميل (the channel) and, for Ads, the campaign — for the daily report. Old Customer is
  // suggested when this customer has ordered before (asked of the server: a rep sees only her own orders).
  const [orderChannel, setOrderChannel] = useState<CustomerChannel | "">("");
  const [orderChannelOther, setOrderChannelOther] = useState("");
  const [orderCampaignId, setOrderCampaignId] = useState("");
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; code: string; channel: string }[]>([]);

  // Modals
  const [callLogModal, setCallLogModal] = useState(false);
  const [orderModal, setOrderModal] = useState(false);
  const [orderModalClosing, setOrderModalClosing] = useState(false);
  const orderCloseTimer = useRef<number | undefined>(undefined);
  // The customer of an order the rep closed before saving; its cart and fields stay as they were.
  const [orderDraftCustomer, setOrderDraftCustomer] = useState<BusinessCustomer | null>(null);
  const [newLeadModal, setNewLeadModal] = useState(false);
  const [savingCall, setSavingCall] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  // Call form state
  const [outcome, setOutcome] = useState("answered");
  const [notes, setNotes] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("11:30");

  // Order form state
  const [orderCustomerName, setOrderCustomerName] = useState("");
  const [orderCustomerPhone, setOrderCustomerPhone] = useState("");
  const [orderCity, setOrderCity] = useState("عمان");
  const [orderAddress, setOrderAddress] = useState("");
  const [orderDeliveryNotes, setOrderDeliveryNotes] = useState("");
  const [orderCart, setOrderCart] = useState<Record<string, number>>({});
  const [orderPaymentMethod, setOrderPaymentMethod] = useState("cash_on_delivery");

  // New Lead form state
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadCity, setLeadCity] = useState("عمان");
  const [leadAddress, setLeadAddress] = useState("");
  const [leadPurpose, setLeadPurpose] = useState("");

  // What order entry offers: the whole catalogue, in stock or not (migration 047 — the rep answers
  // for the quantity, and a line beyond the stock only warns), with the six best sellers pinned to
  // the top so a rep is not scrolling the whole catalog for the things she sells all day.
  const sellableProducts = useMemo(() => withTopProductsFirst(products), [products]);

  // A promo code the rep typed in. The quote comes from the server (business_promo_quote) so the
  // rep sees the real prices before sending, and the same rules are re-applied when the order is
  // created — the page never decides what anything costs.
  const [promoCode, setPromoCode] = useState("");
  const [promoQuote, setPromoQuote] = useState<PromoQuote | null>(null);
  const [promoError, setPromoError] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const promoPrices = promoQuote?.ok
    ? new Map<string, number>((promoQuote.items ?? []).map((i) => [i.sku, Number(i.price)]))
    : null;
  const clearPromo = () => { setPromoQuote(null); setPromoError(""); };

  const unitPrice = (sku: string) => {
    const item = products.find((p) => p.sku === sku);
    const listed = item ? (item.sale_price ?? item.price) : 0;
    return promoPrices?.get(sku) ?? listed;
  };

  // Cart Total Calculation (catalog prices, or the promo's prices once a code is applied)
  const cartTotal = Object.entries(orderCart).reduce(
    (acc, [sku, qty]) => acc + unitPrice(sku) * qty, 0);
  const orderItemCount = Object.values(orderCart).reduce((acc, qty) => acc + qty, 0);
  const cartTotalBeforePromo = Object.entries(orderCart).reduce((acc, [sku, qty]) => {
    const item = products.find((p) => p.sku === sku);
    return acc + (item ? (item.sale_price ?? item.price) * qty : 0);
  }, 0);
  // The total the rep agreed with the customer, typed over the computed one (migration 048). Empty
  // means "the lines' total". She answers for it; once placed, only admin and رشا change it.
  const [manualTotal, setManualTotal] = useState("");
  const manualValue = manualTotal.trim() === "" ? null : Number(manualTotal);
  const totalOverridden = manualValue !== null && Number.isFinite(manualValue) && Math.abs(manualValue - cartTotal) > 0.0005;
  const orderTotal = totalOverridden ? Math.round(manualValue! * 1000) / 1000 : cartTotal;

  const applyPromo = async () => {
    const code = promoCode.trim();
    if (!code || promoBusy) return;
    const items = Object.entries(orderCart).map(([sku, qty]) => ({ sku, qty }));
    if (!items.length) { setPromoError("أضف أصناف الطلب قبل تطبيق الكود."); return; }
    setPromoBusy(true);
    setPromoError("");
    try {
      const res = await secureFetch("/api/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          customer_id: activeCustomer && activeCustomer.phone === orderCustomerPhone ? activeCustomer.id : null,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setPromoQuote(null); setPromoError(data.error || "تعذر تطبيق الكود."); return; }
      if (!data.quote.ok) { setPromoQuote(null); setPromoError(data.message || "تعذر تطبيق الكود."); return; }
      setPromoQuote(data.quote);
    } catch {
      setPromoQuote(null);
      setPromoError("تعذر الاتصال بالخادم لتطبيق الكود.");
    } finally {
      setPromoBusy(false);
    }
  };

  const handleUpdateCart = (sku: string, delta: number) => {
    clearPromo(); // the quote was for the old basket; it has to be asked for again
    setManualTotal(""); // a typed total was for the old basket too
    setOrderCart((prev) => {
      const current = prev[sku] || 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[sku];
        return copy;
      }
      return { ...prev, [sku]: next };
    });
  };

  // Open Call Log Modal
  const handleOpenCallLog = (cust: BusinessCustomer) => {
    setActiveCustomer(cust);
    setOutcome("answered");
    setNotes("");
    setNextDate(cust.next_call_date || "");
    setNextTime("12:00");
    setCallLogModal(true);
  };

  // Save Call Outcome — real persistence via business_call_log_create.
  const handleSaveCallOutcome = async () => {
    if (!activeCustomer || savingCall) return;
    setSavingCall(true);
    startLoading({
      ar: "جاري توثيق الملاحظات في قاعدة البيانات...",
      en: "Logging call notes to the database...",
    });

    try {
      const data = await saveBusiness<{ customer: BusinessCustomer }>(
        `call-log:${activeCustomer.id}`,
        "/api/calls",
        { customer_id: activeCustomer.id, outcome, notes,
          next_call_date: nextDate || undefined, next_call_time: nextDate && nextTime ? nextTime : undefined }
      );
      setCustomers((prev) => prev.map((c) => (c.id === data.customer.id ? data.customer : c)));

      setCallLogModal(false);
      showToast(nextDate
        ? `تم حفظ المكالمة وجدولة الاتصال القادم ${nextDate}${nextTime ? " الساعة " + nextTime : ""}. سيصلك تذكير على التطبيق والهاتف قبل الموعد بـ 10 دقائق.`
        : "تم حفظ المكالمة.", "success", 6000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذر حفظ ملاحظات المكالمة.", "error", 6000);
    } finally {
      setSavingCall(false);
      stopLoading();
    }
  };

  const showOrderModal = () => {
    window.clearTimeout(orderCloseTimer.current);
    setOrderModalClosing(false);
    setOrderModal(true);
  };

  // Open Order Modal. An unsaved order for the same customer is picked up where it was left;
  // one for somebody else is only thrown away once the rep agrees.
  const handleOpenOrderModal = async (cust: BusinessCustomer, fromNewLead = false) => {
    if (orderDraftCustomer) {
      if (orderDraftCustomer.id === cust.id) { continueOrderDraft(); return; }
      if (!await dialogs.confirm({
        title: t("draft_order_title"),
        message: t("draft_order_replace").replace("{name}", orderDraftCustomer.name),
        confirmLabel: t("draft_order_replace_btn"),
        danger: true,
      })) return;
      setOrderDraftCustomer(null);
      setPromoCode("");
      clearPromo();
    }
    setActiveCustomer(cust);
    setOrderFromNewLead(fromNewLead);
    setOrderDataSource(fromNewLead ? "" : "data_center");
    setOrderSegment("");
    setOrderChannel("");
    setOrderChannelOther("");
    setOrderCampaignId("");
    void loadBusiness<{ campaigns: typeof campaigns; previous_orders: number }>(
      `/api/orders?order_meta=1&customer=${encodeURIComponent(cust.id)}`)
      .then((meta) => {
        setCampaigns(meta.campaigns);
        if (meta.previous_orders > 0) setOrderChannel((current) => current || "old_customer");
      })
      .catch(() => {});
    setOrderCustomerName(cust.name);
    setOrderCustomerPhone(cust.phone);
    setOrderCity(cust.city || "عمان");
    setOrderAddress(cust.address || "");
    setOrderDeliveryNotes("");
    setOrderCart({});
    showOrderModal();
  };

  // The order builder turns away like a book page before it unmounts (see .page-turn-panel).
  // Closing with something in it keeps the order as an incomplete one at the bottom of the screen.
  const closeOrderModal = () => {
    const unsaved = orderItemCount > 0 || orderDeliveryNotes.trim() !== "" || promoCode.trim() !== "";
    setOrderDraftCustomer(unsaved ? activeCustomer : null);
    window.clearTimeout(orderCloseTimer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setOrderModal(false); return; }
    setOrderModalClosing(true);
    orderCloseTimer.current = window.setTimeout(() => { setOrderModal(false); setOrderModalClosing(false); }, 380);
  };

  const continueOrderDraft = () => {
    if (orderDraftCustomer) setActiveCustomer(orderDraftCustomer);
    setOrderDraftCustomer(null);
    showOrderModal();
  };

  const discardOrderDraft = async () => {
    if (!await dialogs.confirm({
      title: t("draft_order_title"),
      message: t("draft_order_discard_confirm"),
      confirmLabel: t("draft_order_close"),
      danger: true,
    })) return;
    setOrderDraftCustomer(null);
    setOrderCart({});
    setOrderDeliveryNotes("");
    setPromoCode("");
    clearPromo();
  };

  // Deep-link from the global search (Ctrl+K): "Create Order" on a lead there
  // navigates here with ?openOrderFor=<phone>, so open that customer's order
  // modal automatically once her data has loaded. Guarded by a ref so closing
  // the modal doesn't reopen it on the next render.
  const openOrderForHandledRef = useRef<string | null>(null);
  useEffect(() => {
    const phone = searchParams.get("openOrderFor");
    if (!phone || loading || openOrderForHandledRef.current === phone) return;
    const digits = phone.replace(/[^0-9]/g, "");
    const match = customers.find((c) => c.phone.replace(/[^0-9]/g, "") === digits);
    openOrderForHandledRef.current = phone;
    if (match) {
      void handleOpenOrderModal(match);
      return;
    }
    // Not on the loaded rep's list — since 052 most customers are on nobody's list, and a repeat
    // customer found through her order has no lead card at all. Load her directly: by the id the
    // search passed, else by an exact phone match. The API keeps a sales rep to her own customers.
    const cid = searchParams.get("cid");
    void (async () => {
      try {
        let id = cid && /^[0-9a-f-]{36}$/i.test(cid) ? cid : null;
        if (!id) {
          const hits = await loadBusiness<{ customers: CustomerSearchHit[] }>(`/api/customers/search?q=${encodeURIComponent(digits)}`);
          id = hits.customers.find((c) => c.phone.replace(/[^0-9]/g, "") === digits)?.id ?? null;
        }
        if (!id) {
          showToast(isArabic ? "لم يتم العثور على العميل لإنشاء الطلب." : "Customer not found.", "warning");
          return;
        }
        const { customer } = await loadBusiness<{ customer: BusinessCustomer }>(`/api/customers?id=${encodeURIComponent(id)}`);
        void handleOpenOrderModal(customer);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "تعذر فتح العميل.", "error", 6000);
      }
    })();
    // handleOpenOrderModal is a fresh closure every render; the ref already limits this to once per link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, customers, loading]);

  // Submit Order — real persistence via business_create_order (auto-links to inventory).
  const handleSubmitFastOrder = async () => {
    if (!Object.keys(orderCart).length) {
      showToast("يرجى اختيار منتج واحد على الأقل لإنشاء الطلبية.", "warning");
      return;
    }
    // Zero is a real total for a salon's free samples, but only because a code says so.
    if (manualValue !== null && (!Number.isFinite(manualValue) || manualValue <= 0)) {
      showToast("إجمالي الطلبية يجب أن يكون مبلغاً موجباً.", "warning");
      return;
    }
    if (orderTotal <= 0 && !promoQuote?.ok) {
      showToast("إجمالي الطلبية صفر؛ طبّق كود العينات المجانية أو اختر أصنافاً مدفوعة.", "warning");
      return;
    }
    if (!orderCustomerName.trim() || !orderCustomerPhone.trim()) {
      showToast("يرجى التأكد من اسم العميل ورقم هاتفه.", "warning");
      return;
    }
    const dataSource: DataSource | "" = orderFromNewLead ? orderDataSource : "data_center";
    if (!isDataSource(dataSource) || !isCustomerSegment(orderSegment)) {
      showToast("يرجى اختيار مصدر البيانات ونوع العميل (B2B / B2C).", "warning");
      return;
    }
    if (!isCustomerChannel(orderChannel)) {
      showToast("يرجى اختيار مصدر العميل.", "warning");
      return;
    }
    if (orderChannel === "other" && !orderChannelOther.trim()) {
      showToast("اكتب مصدر العميل عند اختيار «غيره».", "warning");
      return;
    }
    if (AD_CHANNELS.includes(orderChannel) && !orderCampaignId) {
      showToast("اختر الحملة الإعلانية التي جاء منها العميل.", "warning");
      return;
    }
    if (savingOrder) return;
    setSavingOrder(true);

    startLoading({
      ar: "جاري حفظ وتثبيت الطلبية في قاعدة البيانات...",
      en: "Saving order to the database...",
    });

    try {
      // Shown in the WhatsApp message; the server prices the order from the catalog by sku.
      const items = Object.entries(orderCart).map(([sku, qty]) => {
        const p = products.find((pr) => pr.sku === sku)!;
        return { sku, name: p.name_ar, qty, price: unitPrice(sku) };
      });

      const result = await saveBusiness<{ order: BusinessOrder }>(
        "order-create-quick",
        "/api/orders",
        {
          customer_id: activeCustomer && activeCustomer.phone === orderCustomerPhone ? activeCustomer.id : undefined,
          customer_name: orderCustomerName,
          customer_phone: orderCustomerPhone,
          city: orderCity,
          address: orderAddress,
          items: items.map(({ sku, qty }) => ({ sku, qty })),
          total_amount: orderTotal,
          ...(totalOverridden ? { total_override: true } : {}),
          promo_code: promoQuote?.ok ? promoQuote.code : undefined,
          // A manager entering an order for the rep on screen: the order belongs to that rep.
          rep_name: isSalesRep ? undefined : activeRep,
          payment_method: orderPaymentMethod,
          status: "confirmed",
          installment_notes: orderDeliveryNotes || undefined,
          source: "sales",
          data_source: dataSource,
          customer_segment: orderSegment,
          channel: orderChannel,
          ...(orderChannel === "other" ? { channel_other: orderChannelOther.trim() } : {}),
          ...(AD_CHANNELS.includes(orderChannel) ? { campaign_id: orderCampaignId } : {}),
        }
      );

      const order = result.order;
      await reload();
      setOrderModal(false);
      setOrderCart({});
      setManualTotal("");
      setOrderSegment("");
      setOrderChannel("");
      setOrderChannelOther("");
      setOrderCampaignId("");
      setOrderFromNewLead(false);
      setPromoCode("");
      clearPromo();

      const selectedItemsText = items.map((i) => `- ${i.name} (${i.qty} قطعة) = ${formatCurrency(i.price * i.qty)}`).join("\n");
      const repContact = repPhone ? ` (${repPhone})` : "";
      const whatsappMessage = `أهلاً بك عميلنا العزيز ${orderCustomerName} 🌸
تم تثبيت طلبك بنجاح من بيتولا كوزمتكس برقم (${order.id}):

📦 المنتجات:
${selectedItemsText}

💰 المجموع: ${formatCurrency(orderTotal)}
📍 العنوان: ${orderCity} - ${orderAddress}
طريقة الدفع: ${orderPaymentMethod === "cash_on_delivery" ? "دفع عند الاستلام" : orderPaymentMethod === "cliq" ? "كليك" : "حجز شهر / أقساط"}

المندوبة المسؤولة: ${repDisplayName}${repContact}
شكراً لثقتكم بشركة بيتولا لمستحضرات التجميل!`;

      const whatsappUrl = `https://wa.me/${orderCustomerPhone.replace(/^0/, "962")}?text=${encodeURIComponent(whatsappMessage)}`;

      if (await dialogs.confirm({
        title: "تم إنشاء الطلبية 🎉",
        message: `رقم الطلب ${order.id} بمبلغ ${formatCurrency(orderTotal)}.\n\nإرسال تفاصيل الفاتورة وتأكيد الطلب للعميل عبر واتساب؟`,
        confirmLabel: "إرسال عبر واتساب",
        cancelLabel: "لاحقًا",
      })) {
        window.open(whatsappUrl, "_blank");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذر حفظ الطلبية.", "error", 6000);
    } finally {
      setSavingOrder(false);
      stopLoading();
    }
  };

  const handleRemoveContact = async (cust: BusinessCustomer) => {
    if (removingId) return;
    const ok = await dialogs.confirm({
      title: isArabic ? "إزالة الرقم من قائمة المندوب" : "Remove from rep's list",
      message: isArabic
        ? `إزالة ${cust.name || cust.phone} (${cust.phone}) من قائمة ${activeRep}؟\nيبقى العميل وسجل مكالماته في النظام، ويمكن إرساله لمندوب مرة أخرى.`
        : `Remove ${cust.name || cust.phone} (${cust.phone}) from ${activeRep}'s list? The customer and call history are kept.`,
      confirmLabel: isArabic ? "إزالة" : "Remove",
      cancelLabel: isArabic ? "إلغاء" : "Cancel",
      danger: true,
    });
    if (!ok) return;
    setRemovingId(cust.id);
    try {
      const res = await secureFetch("/api/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cust.id, rep_name: "", next_call_date: "" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "تعذر إزالة الرقم.");
      setCustomers((prev) => prev.filter((c) => c.id !== cust.id));
      showToast(isArabic ? `تمت إزالة ${cust.name || cust.phone} من قائمة ${activeRep}` : "Removed from the rep's list", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذر إزالة الرقم.", "error", 6000);
    } finally {
      setRemovingId(null);
    }
  };

  // Add New Lead — real persistence via /api/leads (business_customer_create).
  const handleAddNewLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName.trim() || !leadPhone.trim()) {
      showToast("يرجى إدخال اسم العميل ورقم الهاتف.", "warning");
      return;
    }
    if (savingLead) return;
    setSavingLead(true);

    startLoading({
      ar: "جاري إضافة جهة الاتصال إلى قاعدة البيانات...",
      en: "Adding new lead to the database...",
    });

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: leadName.trim(),
          phone: leadPhone.trim(),
          city: leadCity,
          address: leadAddress.trim(),
          notes: leadPurpose.trim(),
          source: "sales",
          rep_name: activeRep,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "فشل إضافة الليد.");

      await reload();
      setNewLeadModal(false);
      setLeadName("");
      setLeadPhone("");
      setLeadAddress("");
      setLeadPurpose("");
      showToast(isArabic ? `تمت إضافة العميل (${leadName}) بنجاح` : `Lead (${leadName}) added successfully`, "success");
      // Straight into order creation for her — no need to go find her again to sell.
      handleOpenOrderModal(data.customer as BusinessCustomer, true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذر إضافة الليد.", "error", 6000);
    } finally {
      setSavingLead(false);
      stopLoading();
    }
  };

  if (loadError && !loading) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center space-y-3">
        <p className="text-sm text-red-700">{loadError}</p>
        <button onClick={() => { setLoading(true); void reload(); }} className="px-4 py-2 rounded-xl bg-amber-500 text-stone-950 font-bold text-xs">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12 max-w-4xl mx-auto">

      {/* RBAC Security Restriction Notice Banner */}
      {isRestrictedNotice && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-amber-300 text-sm">تنبيه الصلاحيات (Role-Based Access Control)</p>
            <p className="text-stone-300 mt-1 leading-relaxed">
              حسابك مسجل بصلاحية <strong>مندوبة مبيعات (Sales Rep)</strong>. تم حصر صلاحياتك في مساحة عمل إدارة المبيعات والمكالمات والطلبات، وتم تقييد الوصول للأقسام المالية والتقارير التنفيذية.
            </p>
          </div>
        </div>
      )}

      {/* Past Date Calling Archive Notification Banner */}
      {!isToday && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/15 border-2 border-amber-500/40 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 shadow-sm">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-bold shrink-0 shadow-xs">
              <History className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-black text-sm text-amber-950">
                  {isArabic ? "أرشيف اتصالات يوم سابق" : "Past Date Calling Archive"}
                </p>
                <span className="text-xs font-mono font-bold bg-amber-200 text-amber-950 px-2 py-0.5 rounded-md shrink-0">
                  {selectedDate}
                </span>
              </div>
              <p className="text-xs text-amber-900/90 mt-0.5 leading-relaxed">
                {isArabic
                  ? `أنتِ تتصفحين الآن قائمة اتصالات وسجلات العملاء لتاريخ (${formattedDateLabel}). يمكنكِ مراجعة الأرقام وتحديث الملاحظات.`
                  : `You are viewing call logs and customer numbers for (${formattedDateLabel}). You can review notes and record updates.`}
              </p>
            </div>
          </div>
          <button
            onClick={resetToToday}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isArabic ? "العودة لاتصالات اليوم" : "Return to Today"}</span>
          </button>
        </div>
      )}

      {/* Top Identity & Real Performance Card. Not overflow-hidden: the rep list opens over it. */}
      <div className="relative bg-gradient-to-r from-[#160f02] via-[#241a08] to-[#160f02] rounded-3xl p-4 sm:p-6 text-[#f4e5d0] border border-[#554625]/80 shadow-2xl space-y-4">
        <div className="absolute top-0 left-6 right-6 h-1 bg-gradient-to-r from-transparent via-[#9e8959] to-transparent" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-[#9e8959] to-[#c28a40] text-[#160f02] font-black text-xl flex items-center justify-center shadow-lg shadow-[#9e8959]/20 border border-[#bda66d]/40 shrink-0">
              {repAvatar}
            </div>
            <div className="min-w-0 flex-1">
              <div className="inline-flex max-w-full items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#35270e] text-[#9e8959] border border-[#554625] text-[10px] font-bold">
                <Sparkles className="w-3 h-3 text-[#9e8959] shrink-0" />
                <span className="truncate">{t("sales_portal_badge")}</span>
              </div>
              {/* A manager is looking at a rep's board, not being greeted as her. */}
              <h2 className="text-lg sm:text-xl font-bold text-white mt-0.5 truncate">
                {isSalesRep
                  ? `${t("welcome_rep")}, ${repDisplayName || "..."}! 👋`
                  : `${isArabic ? "لوحة المندوب:" : "Rep board:"} ${repDisplayName || "..."}`}
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[#f4e5d0]/70 font-mono">
                {repPhone && (
                  <span className="flex items-center gap-1" dir="ltr">
                    <Phone className="w-3 h-3 text-[#9e8959]" />
                    <span>{repPhone}</span>
                  </span>
                )}
                {ranking.rank && (
                  <span className="flex items-center gap-1 text-[#bda66d]">
                    <Trophy className="w-3 h-3" />
                    <span>{isArabic ? `الترتيب #${ranking.rank} من ${ranking.total}` : `Rank #${ranking.rank} of ${ranking.total}`}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:flex md:flex-wrap md:items-center md:justify-end gap-2 md:shrink-0">
            {isSalesRep ? (
              <span className="col-span-2 md:col-span-1 px-3 py-2 bg-[#35270e] border border-[#554625] text-[#9e8959] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#9e8959]" />
                <span>{isArabic ? "حساب مندوبة المبيعات" : "Sales Rep Account"}</span>
              </span>
            ) : (
              <div className="relative col-span-2 md:col-span-1" ref={repDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsRepDropdownOpen((prev) => !prev)}
                  className="w-full md:w-auto md:min-w-40 px-3 py-2 bg-[#241a08] border border-[#554625] text-[#f4e5d0] hover:text-[#9e8959] hover:border-[#9e8959]/60 rounded-xl text-xs font-bold flex items-center justify-between gap-2 focus:outline-none focus:border-[#9e8959] cursor-pointer transition shadow-xs select-none"
                  aria-haspopup="listbox"
                  aria-expanded={isRepDropdownOpen}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Users className="w-3.5 h-3.5 text-[#9e8959] shrink-0" />
                    <span className="text-[#f4e5d0]/70 shrink-0">{isArabic ? "المندوب:" : "Rep:"}</span>
                    <span className="truncate">{activeRep || "..."}</span>
                  </span>
                  <ChevronDown className={cn("w-3.5 h-3.5 text-[#9e8959] transition-transform duration-200 shrink-0", isRepDropdownOpen && "rotate-180")} />
                </button>

                {isRepDropdownOpen && (
                  <div
                    role="listbox"
                    className={cn(
                      "absolute top-full mt-1.5 z-50 inset-x-0 md:inset-x-auto md:w-72 max-h-[60dvh] overflow-y-auto overscroll-contain bg-[#160f02] border border-[#554625] rounded-2xl shadow-2xl shadow-black/80 p-1.5 grid grid-cols-2 gap-1 animate-fadeIn",
                      dir === "rtl" ? "md:right-0" : "md:left-0"
                    )}
                  >
                    {repRoster.map((r) => {
                      const isSelected = activeRep === r;
                      const isRoster = ASSIGNABLE_REPS.includes(r);
                      return (
                        <button
                          key={r}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            setActiveRep(r);
                            setIsRepDropdownOpen(false);
                          }}
                          className={cn(
                            "min-w-0 px-2.5 py-2 rounded-xl text-xs font-bold text-start flex items-center justify-between gap-2 transition-colors cursor-pointer",
                            isSelected ? "bg-[#35270e] text-[#9e8959]" : "text-[#f4e5d0] hover:bg-[#241a08] hover:text-[#9e8959]",
                            !isRoster && "opacity-60"
                          )}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-md bg-[#241a08] border border-[#554625] text-[#9e8959] text-[10px] flex items-center justify-center font-black shrink-0">
                              {r.charAt(0)}
                            </span>
                            <span className="truncate">{r}</span>
                          </span>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-[#9e8959] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {canSendContacts && (
              <button
                type="button"
                onClick={() => setSendContactsOpen(true)}
                className="px-3 py-2 bg-gradient-to-r from-[#9e8959] to-[#c28a40] hover:from-[#bda66d] hover:to-[#c28a40] text-[#160f02] rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer active:scale-95 min-w-0"
              >
                <Send className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{isArabic ? "إرسال أرقام للمندوب" : "Send contacts"}</span>
              </button>
            )}

            <button
              onClick={() => openProfileModal()}
              className={cn(
                "px-3 py-2 bg-[#241a08] hover:bg-[#35270e] text-[#f4e5d0] hover:text-[#9e8959] border border-[#554625] hover:border-[#9e8959]/60 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer active:scale-95 min-w-0",
                !canSendContacts && "col-span-2 md:col-span-1"
              )}
              title={isArabic ? "تعديل بياناتي ورقم هاتفي" : "Edit my profile & phone"} aria-label={isArabic ? "تعديل بياناتي ورقم هاتفي" : "Edit my profile & phone"}
            >
              <UserCog className="w-3.5 h-3.5 text-[#9e8959] shrink-0" />
              <span className="truncate">{isArabic ? "تعديل بياناتي ورقمي" : "Edit Profile"}</span>
            </button>
          </div>
        </div>

        {/* Real Performance Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 pt-3 border-t border-[#3d3016]">
          <div className="bg-[#241a08]/90 p-3 rounded-2xl border border-[#554625]/80 shadow-inner min-w-0">
            <p className="text-[10px] text-[#f4e5d0]/70 font-medium truncate">{t("monthly_sales")}</p>
            <p className="text-base sm:text-lg font-black truncate text-[#bda66d] mt-0.5 font-mono">
              {loading ? "..." : formatCurrency(monthlySales)}
            </p>
            <p className="text-[10px] text-[#f4e5d0]/60 mt-0.5">
              {target_jd > 0 ? `${t("of_target")} ${formatCurrency(target_jd)} (${targetProgress}%)` : `${repOrdersThisMonth.length} طلب هذا الشهر`}
            </p>
          </div>

          <div className="bg-[#241a08]/90 p-3 rounded-2xl border border-[#554625]/80 shadow-inner min-w-0">
            <p className="text-[10px] text-[#f4e5d0]/70 font-medium truncate">{isArabic ? "متوسط قيمة الطلب" : "Avg Order Value"}</p>
            <p className="text-base sm:text-lg font-black truncate text-emerald-400 mt-0.5 font-mono">
              {loading ? "..." : formatCurrency(aov)}
            </p>
            <p className="text-[10px] text-[#f4e5d0]/60 mt-0.5">{isArabic ? "نسبة التحويل" : "Conversion"} {conversionRate}%</p>
          </div>

          <div className="bg-[#241a08]/90 p-3 rounded-2xl border border-[#554625]/80 shadow-inner min-w-0">
            <p className="text-[10px] text-[#f4e5d0]/70 font-medium truncate">{isArabic ? "العملاء والليدات المسندة" : "Assigned Leads"}</p>
            <p className="text-base sm:text-lg font-black truncate text-white mt-0.5 font-mono">
              {loading ? "..." : assignedLeadsCount}
            </p>
            <p className="text-[10px] text-[#9e8959] font-bold mt-0.5">{isArabic ? "متابعات مجدولة:" : "Follow-ups:"} {followUpsPending}</p>
          </div>

          <div className="bg-[#241a08]/90 p-3 rounded-2xl border border-[#554625]/80 shadow-inner min-w-0">
            <p className="text-[10px] text-[#f4e5d0]/70 font-medium truncate">{t("commission_cash")}</p>
            <p className="text-base sm:text-lg font-black truncate text-white mt-0.5 font-mono">
              {loading ? "..." : formatCurrency(estimatedCommission)}
            </p>
            <p className="text-[10px] text-[#9e8959] font-bold mt-0.5">{commission_rate}{t("commission_rate")}</p>
          </div>
        </div>
      </div>

      {/* Main Calling Queue Section */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-amber-500 shrink-0" />
                <span>{t("calls_queue_title")} ({repQueue.length})</span>
              </h3>
              <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md shrink-0">
                {formattedDateLabel}
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              {t("calls_queue_sub")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setNewLeadModal(true)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{t("add_new_lead_btn")}</span>
            </button>
          </div>
        </div>

        {/* Customer Call Cards or Empty State */}
        {loading ? (
          <div className="py-12 text-center text-xs text-stone-400">جاري تحميل بيانات المبيعات...</div>
        ) : repQueue.length === 0 ? (
          <div className="py-12 px-4 text-center border-2 border-dashed border-stone-200 rounded-2xl space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <CalendarIcon className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-stone-800 text-sm">
                {isArabic ? "لا توجد أرقام مسجلة لهذا اليوم" : "No calling records for this date"}
              </h4>
              <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                {isArabic
                  ? `لم يتم تسجيل مكالمات بتاريخ (${formattedDateLabel}). يمكنك إضافة عميل جديد أو اختيار يوم آخر من التقويم بالأعلى.`
                  : `No calls scheduled for (${formattedDateLabel}). You can add a new lead or select another day from the calendar.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {canSendContacts && (
                <button
                  onClick={() => setSendContactsOpen(true)}
                  className="px-3.5 py-1.5 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isArabic ? `إرسال أرقام إلى ${activeRep}` : `Send contacts to ${activeRep}`}</span>
                </button>
              )}
              <button
                onClick={() => setNewLeadModal(true)}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t("add_new_lead_btn")}</span>
              </button>
              {!isToday && (
                <button
                  onClick={resetToToday}
                  className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isArabic ? "العودة لاتصالات اليوم" : "Back to Today"}</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {repQueue.map((cust) => (
            <div
              key={cust.id}
              className="p-4 rounded-2xl border border-stone-200 hover:border-amber-400/80 bg-stone-50/60 hover:bg-amber-50/20 transition-all space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-stone-900 break-words min-w-0">{cust.name}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-stone-200 font-semibold text-stone-700">
                      {cust.city}
                    </span>
                    {cust.history.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium font-mono">
                        {t("calls_history_tag")} {cust.history.length} {t("times")}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-amber-900 bg-amber-100/70 px-2 py-0.5 rounded-md font-bold" dir="ltr">
                      {cust.phone}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(cust.phone);
                      }}
                      title="Copy phone" aria-label="Copy phone"
                      className="text-stone-400 hover:text-stone-700 transition cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-xs text-stone-600 break-words">📌 {cust.notes || (isArabic ? "ليد جديد بحاجة إلى تواصل" : "New lead awaiting contact")}</p>
                  {cust.address && <p className="text-[11px] text-stone-400 truncate max-w-full sm:max-w-sm">📍 {cust.address}</p>}

                  {cust.history[0] && (
                    <div className="p-2 rounded-xl bg-amber-50/80 border border-amber-200/80 text-[11px] text-amber-900 mt-2 break-words">
                      <span className="font-bold">{t("last_notes_recorded")} </span>
                      <span>{cust.history[0].notes || cust.history[0].outcome}</span>
                    </div>
                  )}

                  {cust.next_call_date && (
                    <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                      <CalendarIcon className="w-3 h-3 text-blue-600" />
                      <span>{t("next_call_scheduled")} {formatDate(cust.next_call_date)}</span>
                    </div>
                  )}
                </div>

                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                    <Clock className="w-3 h-3" />
                    <span>{cust.next_call_date ? formatDate(cust.next_call_date) : (isArabic ? "اليوم" : "Today")}</span>
                  </span>
                  {canRemoveContact && (
                    <button
                      type="button"
                      onClick={() => handleRemoveContact(cust)}
                      disabled={removingId === cust.id}
                      title={isArabic ? `إزالة من قائمة ${activeRep}` : `Remove from ${activeRep}`}
                      aria-label={isArabic ? `إزالة ${cust.name || cust.phone} من قائمة ${activeRep}` : `Remove ${cust.name || cust.phone}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 hover:border-red-300 text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                      <span>{isArabic ? "إزالة" : "Remove"}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 1-Tap Action Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-stone-200/60">
                <a
                  href={`tel:${cust.phone}`}
                  className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>{t("call_phone_btn")}</span>
                </a>

                <a
                  href={`https://wa.me/${cust.phone.replace(/^0/, '962')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{t("whatsapp_chat_btn")}</span>
                </a>

                <button
                  onClick={() => handleOpenCallLog(cust)}
                  className="py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t("log_notes_btn")}</span>
                </button>

                <button
                  onClick={() => handleOpenOrderModal(cust)}
                  className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition cursor-pointer"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>{t("create_order_btn")}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

      {canSendContacts && sendContactsOpen && (
        <SendContactsModal
          onClose={() => setSendContactsOpen(false)}
          defaultRep={activeRep}
          today={todayDate}
          onSent={(rep) => {
            // Show the rep who just received them; her queue is loaded fresh for that rep.
            if (rep === activeRep) void reload(); else setActiveRep(rep);
          }}
        />
      )}

      {/* Full Options Order Builder Modal */}
      {orderModal && (
        <div data-dialog="" className={`page-turn-stage page-turn-backdrop animate-backdropFadeIn fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 ${orderModalClosing ? "is-closing" : ""}`}>
          <div className={`page-turn-panel bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[92dvh] overflow-y-auto ${orderModalClosing ? "is-closing" : ""}`}>
            <div className="flex items-start justify-between pb-2 border-b border-stone-200">
              <div>
                <h3 className="font-bold text-base text-stone-900 flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4 text-amber-500" />
                  <span>{t("order_modal_title")}</span>
                </h3>
                <p className="text-xs text-stone-500">
                  {t("order_rep_responsible")} {repDisplayName} • {t("order_date")} {new Date().toLocaleDateString(isArabic ? "ar-JO" : "en-US")}
                </p>
              </div>
              <button
                onClick={closeOrderModal}
                className="p-1.5 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Customer Details Form */}
            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
              <span className="text-xs font-bold text-stone-800 block">{t("order_delivery_section")}</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] text-stone-500 mb-1">{t("cust_name_label")}</label>
                  <input
                    type="text"
                    value={orderCustomerName}
                    onChange={(e) => setOrderCustomerName(e.target.value)}
                    className="w-full p-2 bg-white border border-stone-300 rounded-xl font-medium focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500 mb-1">{t("cust_phone_label")}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={orderCustomerPhone}
                    onChange={(e) => setOrderCustomerPhone(e.target.value)}
                    className="w-full p-2 bg-white border border-stone-300 rounded-xl font-mono font-medium focus:border-amber-500 focus:outline-none text-right"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500 mb-1">{t("cust_city_label")}</label>
                  <select
                    value={orderCity}
                    onChange={(e) => setOrderCity(e.target.value)}
                    className="w-full p-2 bg-white border border-stone-300 rounded-xl font-medium focus:border-amber-500 focus:outline-none"
                  >
                    {JORDAN_CITIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500 mb-1">{t("cust_address_label")}</label>
                  <input
                    type="text"
                    value={orderAddress}
                    onChange={(e) => setOrderAddress(e.target.value)}
                    placeholder={t("address_placeholder")}
                    className="w-full p-2 bg-white border border-stone-300 rounded-xl font-medium focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="order-data-source" className="block text-[11px] text-stone-500 mb-1">
                    مصدر البيانات <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="order-data-source"
                    required
                    value={orderFromNewLead ? orderDataSource : "data_center"}
                    disabled={!orderFromNewLead}
                    onChange={(e) => setOrderDataSource(e.target.value as DataSource | "")}
                    className={`w-full p-2 border rounded-xl font-medium focus:border-amber-500 focus:outline-none ${
                      orderFromNewLead ? "bg-white border-stone-300" : "bg-stone-100 border-stone-200 text-stone-600 cursor-not-allowed"
                    } ${orderFromNewLead && !orderDataSource ? "border-red-300" : ""}`}
                  >
                    {orderFromNewLead ? (
                      <>
                        <option value="">— اختر المصدر —</option>
                        {Object.entries(DATA_SOURCES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                      </>
                    ) : (
                      <option value="data_center">{DATA_SOURCES.data_center}</option>
                    )}
                  </select>
                  {!orderFromNewLead && (
                    <p className="text-[10px] text-stone-400 mt-0.5">عميل من بيانات الشركة — المصدر ثابت</p>
                  )}
                </div>
                <div>
                  <label htmlFor="order-segment" className="block text-[11px] text-stone-500 mb-1">
                    نوع العميل <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="order-segment"
                    required
                    value={orderSegment}
                    onChange={(e) => setOrderSegment(e.target.value as CustomerSegment | "")}
                    className={`w-full p-2 bg-white border rounded-xl font-medium focus:border-amber-500 focus:outline-none ${
                      orderSegment ? "border-stone-300" : "border-red-300"
                    }`}
                  >
                    <option value="">— B2B أو B2C —</option>
                    {Object.entries(CUSTOMER_SEGMENTS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="order-channel" className="block text-[11px] text-stone-500 mb-1">
                    مصدر العميل <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="order-channel"
                    required
                    value={orderChannel}
                    onChange={(e) => { setOrderChannel(e.target.value as CustomerChannel | ""); setOrderCampaignId(""); }}
                    className={`w-full p-2 bg-white border rounded-xl font-medium focus:border-amber-500 focus:outline-none ${
                      orderChannel ? "border-stone-300" : "border-red-300"
                    }`}
                  >
                    <option value="">— كيف وصل العميل؟ —</option>
                    {Object.entries(CUSTOMER_CHANNELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </div>
                {AD_CHANNELS.includes(orderChannel) && (
                  <div>
                    <label htmlFor="order-campaign" className="block text-[11px] text-stone-500 mb-1">
                      الحملة الإعلانية <span className="text-red-600">*</span>
                    </label>
                    <select
                      id="order-campaign"
                      required
                      value={orderCampaignId}
                      onChange={(e) => setOrderCampaignId(e.target.value)}
                      className={`w-full p-2 bg-white border rounded-xl font-medium focus:border-amber-500 focus:outline-none ${
                        orderCampaignId ? "border-stone-300" : "border-red-300"
                      }`}
                    >
                      <option value="">{campaigns.length ? "— اختر الحملة —" : "لا توجد حملات مسجلة — اطلب من التسويق إضافتها"}</option>
                      {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                    </select>
                  </div>
                )}
                {orderChannel === "other" && (
                  <div>
                    <label htmlFor="order-channel-other" className="block text-[11px] text-stone-500 mb-1">
                      ما هو المصدر؟ <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="order-channel-other"
                      type="text"
                      maxLength={120}
                      value={orderChannelOther}
                      onChange={(e) => setOrderChannelOther(e.target.value)}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl font-medium focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[11px] text-stone-500 mb-1">{t("driver_notes_label")}</label>
                <input
                  type="text"
                  value={orderDeliveryNotes}
                  onChange={(e) => setOrderDeliveryNotes(e.target.value)}
                  placeholder={t("driver_notes_placeholder")}
                  className="w-full p-2 text-xs bg-white border border-stone-300 rounded-xl focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Catalog Items Selector — real inventory, best sellers first */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800">{t("select_products_label")}</span>
                <span className="text-[11px] text-stone-400">{t("betolla_catalog_tag")}</span>
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {sellableProducts.map((product) => {
                  const qty = orderCart[product.sku] || 0;
                  const price = product.sale_price ?? product.price;

                  return (
                    <div
                      key={product.sku}
                      className={`p-2.5 rounded-xl border transition flex items-center justify-between text-xs ${
                        qty > 0 ? "bg-amber-50/80 border-amber-400" : "bg-stone-50 border-stone-200"
                      }`}
                    >
                      <div>
                        <p className="font-bold text-stone-900 flex items-center gap-1.5">
                          <span>{product.name_ar}</span>
                          {isTopProduct(product) && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-bold shrink-0">
                              {isArabic ? "الأكثر طلباً" : "Top"}
                            </span>
                          )}
                        </p>
                        <p className="font-mono text-[11px] text-amber-700 font-semibold">
                          {formatCurrency(price)} • {isArabic ? "متوفر" : "In stock"}:{" "}
                          <span className={product.stock <= 0 ? "text-red-600" : undefined}>{product.stock}</span>
                        </p>
                        {qty > Math.max(product.stock, 0) && (
                          <p className="text-[10px] text-red-600 font-bold mt-0.5">
                            {isArabic
                              ? `الكمية أكثر من المتوفر بالمخزون (${Math.max(product.stock, 0)}) — على مسؤولية المندوب`
                              : `More than in stock (${Math.max(product.stock, 0)}) — rep's responsibility`}
                          </p>
                        )}
                        {/* A package is picked as bottles, so say which ones — and its availability
                            is however many those bottles can build. */}
                        {product.is_bundle && product.components?.length ? (
                          <p className="text-[10px] text-stone-500 mt-0.5">
                            {isArabic ? "يتكوّن من: " : "Contains: "}
                            {product.components.map((c) => `${c.quantity}× ${c.name_ar}`).join(" + ")}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        {qty > 0 && (
                          <button
                            type="button"
                            onClick={() => handleUpdateCart(product.sku, -1)}
                            className="w-7 h-7 rounded-lg bg-stone-200 hover:bg-stone-300 font-bold flex items-center justify-center text-sm cursor-pointer"
                          >
                            -
                          </button>
                        )}
                        {qty > 0 && (
                          <span className="font-mono font-bold text-sm min-w-5 text-center">{qty}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleUpdateCart(product.sku, 1)}
                          className="w-7 h-7 rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold flex items-center justify-center text-sm shadow-2xs cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!loading && sellableProducts.length === 0 && (
                  <p className="text-xs text-stone-400 text-center py-4">لا توجد منتجات في الكتالوج حالياً.</p>
                )}
              </div>
            </div>

            {/* Payment Mode Selection */}
            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 space-y-2 text-xs">
              <span className="font-bold text-stone-700 block">{t("payment_method_label")}</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "cash_on_delivery", label: t("pay_cod") },
                  { id: "cliq", label: t("pay_cliq") },
                  { id: "installment", label: t("pay_installment") },
                ].map((pm) => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setOrderPaymentMethod(pm.id)}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                      orderPaymentMethod === pm.id
                        ? "bg-stone-900 text-white border-stone-900 shadow-xs"
                        : "bg-white text-stone-700 border-stone-200 hover:bg-stone-100"
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Promo code — the server quotes it, so the price on screen is the price charged */}
            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 space-y-2">
              <span className="text-xs font-bold text-stone-700 block">كود الخصم / العينات المجانية:</span>
              <div className="flex gap-2">
                <input
                  value={promoCode}
                  onChange={(e) => { setPromoCode(e.target.value); clearPromo(); }}
                  placeholder="مثال: VIP أو Salons"
                  dir="ltr"
                  className="flex-1 min-w-0 p-2 text-xs font-mono bg-white border border-stone-300 rounded-xl focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={applyPromo}
                  disabled={promoBusy || !promoCode.trim()}
                  className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                >
                  {promoBusy ? "..." : "تطبيق"}
                </button>
                {promoQuote?.ok && (
                  <button
                    type="button"
                    onClick={() => { setPromoCode(""); clearPromo(); }}
                    className="px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold cursor-pointer"
                  >
                    إزالة
                  </button>
                )}
              </div>
              {promoError && (
                <p role="alert" className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1.5">
                  {promoError}
                </p>
              )}
              {promoQuote?.ok && (
                <div className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-1.5 space-y-0.5">
                  <p className="font-bold">
                    {promoQuote.label} ({promoQuote.code})
                    {Number(promoQuote.saved) > 0 && ` — وفّرت ${formatCurrency(Number(promoQuote.saved))}`}
                  </p>
                  {promoQuote.items?.filter((i) => i.free || i.discounted).map((i) => (
                    <p key={i.sku}>
                      {products.find((p) => p.sku === i.sku)?.name_ar || i.sku}: {i.qty} ×{" "}
                      {i.free ? "مجاناً" : formatCurrency(Number(i.price))}
                    </p>
                  ))}
                  {/* A sample code is accepted on any order, so it can land on a basket with no
                      sample bottle in it. Say so — a green banner and an unchanged total otherwise
                      reads as a discount that silently failed. */}
                  {!promoQuote.items?.some((i) => i.free || i.discounted) && (
                    <p>لا توجد عينات مجانية في هذا الطلب — المجموع بدون تغيير.</p>
                  )}
                </div>
              )}
            </div>

            {/* Total JD Banner */}
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-900 font-semibold">{t("total_order_due")}</p>
                {promoQuote?.ok && cartTotalBeforePromo > cartTotal && (
                  <p className="text-[11px] text-amber-900/70 line-through font-mono">
                    {formatCurrency(cartTotalBeforePromo)}
                  </p>
                )}
                {totalOverridden && (
                  <p className="text-[10px] text-red-700 font-bold mt-0.5">
                    {isArabic
                      ? `حسب الأسعار: ${formatCurrency(cartTotal)} — مبلغ معدّل على مسؤولية المندوب`
                      : `By price list: ${formatCurrency(cartTotal)} — edited total, rep's responsibility`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.001"
                  aria-label={t("total_order_due")}
                  value={manualTotal}
                  placeholder={cartTotal.toFixed(3)}
                  onChange={(e) => setManualTotal(e.target.value)}
                  className={`w-28 text-left text-xl font-black font-mono bg-white/70 border rounded-xl px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500/30 placeholder:text-amber-950 ${
                    totalOverridden ? "border-red-400 text-red-700" : "border-amber-300 text-amber-950"
                  }`}
                />
                <span className="text-xs font-bold text-amber-900">{isArabic ? "د.أ" : "JD"}</span>
              </div>
            </div>

            {/* Submit & WhatsApp Actions */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={handleSubmitFastOrder}
                disabled={savingOrder}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{savingOrder ? "جاري الحفظ..." : t("submit_order_btn")}</span>
              </button>
              <button
                type="button"
                onClick={closeOrderModal}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium cursor-pointer"
              >
                {t("cancel_btn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call Outcome, Notes, & Next Call Date Modal */}
      {callLogModal && activeCustomer && (
        <div data-dialog="" className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-stone-900">{t("call_log_title")}</h3>
                <p className="text-xs text-stone-500">{activeCustomer.name} ({activeCustomer.phone})</p>
              </div>
              <button
                onClick={() => setCallLogModal(false)}
                className="p-1.5 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Outcome Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 block">{t("call_outcome_label")}</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { id: "answered", label: t("outcome_answered") },
                  { id: "no_answer", label: t("outcome_no_answer") },
                  { id: "whatsapp_sent", label: t("outcome_whatsapp_sent") },
                  { id: "order_placed", label: t("outcome_order_placed") },
                  { id: "callback_requested", label: t("outcome_callback") },
                  { id: "not_interested", label: t("outcome_not_interested") },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOutcome(item.id)}
                    className={`p-2 rounded-xl text-right font-medium border transition cursor-pointer ${
                      outcome === item.id
                        ? "bg-amber-50 border-amber-500 text-amber-900 font-bold"
                        : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-700 block">{t("call_notes_input_label")}</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("call_notes_placeholder")}
                className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 focus:bg-white transition"
              />
            </div>

            {/* Next call (an in-app reminder is scheduled automatically) */}
            <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200 space-y-2">
              <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-amber-600" />
                <span>{t("next_call_section")}</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-stone-500 mb-0.5">{t("next_date_label")}</label>
                  <input
                    type="date"
                    value={nextDate}
                    onChange={(e) => setNextDate(e.target.value)}
                    className="w-full p-2 text-xs bg-white border border-amber-300 rounded-xl font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-stone-500 mb-0.5">{t("next_time_label")}</label>
                  <input
                    type="time"
                    value={nextTime}
                    onChange={(e) => setNextTime(e.target.value)}
                    className="w-full p-2 text-xs bg-white border border-amber-300 rounded-xl font-mono focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <p className="text-[11px] text-amber-900/80">سيصلك تذكير على التطبيق والهاتف قبل الموعد بـ 10 دقائق.</p>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveCallOutcome}
                disabled={savingCall}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
              >
                {savingCall ? "جاري الحفظ..." : t("save_call_btn")}
              </button>
              <button
                type="button"
                onClick={() => setCallLogModal(false)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium cursor-pointer"
              >
                {t("cancel_btn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Lead Modal */}
      {newLeadModal && (
        <div data-dialog="" className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <form onSubmit={handleAddNewLead} className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-amber-500" />
                  <span>{t("add_lead_title")}</span>
                </h3>
                <p className="text-xs text-stone-500">{t("add_lead_sub")}</p>
              </div>
              <button
                type="button"
                onClick={() => setNewLeadModal(false)}
                className="p-1.5 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">{t("lead_name_label")}</label>
                <input
                  type="text"
                  required
                  placeholder={isArabic ? "مثال: ليلى الأحمد" : "e.g. Layla Al-Ahmad"}
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">{t("lead_phone_label")}</label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  placeholder="0791234567"
                  value={leadPhone}
                  onChange={(e) => setLeadPhone(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-mono focus:border-amber-500 focus:bg-white focus:outline-none text-right"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">{t("lead_city_label")}</label>
                  <select
                    value={leadCity}
                    onChange={(e) => setLeadCity(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:border-amber-500 focus:outline-none"
                  >
                    {JORDAN_CITIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">{t("lead_address_label")}</label>
                  <input
                    type="text"
                    placeholder={isArabic ? "المنطقة أو الحي" : "Area or Street"}
                    value={leadAddress}
                    onChange={(e) => setLeadAddress(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">{t("lead_purpose_label")}</label>
                <input
                  type="text"
                  placeholder={isArabic ? "مثال: استفسار عن بكج البلازما" : "e.g. Inquiry about Plasma set"}
                  value={leadPurpose}
                  onChange={(e) => setLeadPurpose(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={savingLead}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
              >
                {savingLead ? "جاري الحفظ..." : t("submit_add_lead")}
              </button>
              <button
                type="button"
                onClick={() => setNewLeadModal(false)}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium cursor-pointer"
              >
                {t("cancel_btn")}
              </button>
            </div>
          </form>
        </div>
      )}

      {orderDraftCustomer && !orderModal && (
        <>
          <div className="h-20" aria-hidden />
          <IncompleteOrderBar
            customerName={orderDraftCustomer.name}
            itemCount={orderItemCount}
            total={formatCurrency(orderTotal)}
            onContinue={continueOrderDraft}
            onDiscard={discardOrderDraft}
          />
        </>
      )}
    </div>
  );
}

export default function SalesAppPage() {
  return (
    <Suspense fallback={
      <div className="min-h-96 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SalesAppContent />
    </Suspense>
  );
}
