"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "ar" | "en";

interface I18nContextType {
  language: Language;
  dir: "rtl" | "ltr";
  toggleLanguage: () => void;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  ar: {
    // Brand & System
    brand_title: "بيتولا كوزمتكس",
    brand_subtitle: "نظام الإدارة المتكامل ERP",
    sales_portal_sub: "بوابة المبيعات والمكالمات",
    system_online: "النظام متصل",
    logout: "تسجيل الخروج",
    logout_short: "خروج",
    admin_title: "المدير العام",
    admin_badge: "admin@betolla",
    sales_rep_badge: "مندوبة معتمدة (Sales)",
    search_placeholder: "بحث برقم الهاتف، اسم العميل، أو رقم الطلب...",
    new_order: "طلب جديد",

    // Navigation
    nav_dashboard: "لوحة التحكم",
    nav_sales: "بوابة المندوبين (Sales App)",
    nav_customers: "العملاء والليدات",
    nav_calls: "متابعة المكالمات",
    nav_orders: "إدارة الطلبات",
    nav_inventory: "المنتجات والمخزون",
    nav_finance: "المالية والفواتير",
    nav_analytics: "تقارير الأداء",
    nav_settings: "الإعدادات",

    // Login Page
    login_title: "بيتولا كوزمتكس",
    login_subtitle: "بوابة إدارة النظام والمبيعات",
    username_label: "اسم المستخدم أو البريد الإلكتروني",
    username_placeholder: "اسم المستخدم أو البريد الإلكتروني",
    password_label: "كلمة المرور",
    password_placeholder: "••••••••••••",
    login_button: "تسجيل الدخول",
    logging_in: "جاري تسجيل الدخول...",
    copyright: "شركة بيتولا لمستحضرات التجميل © 2026 • جميع الحقوق محفوظة",

    // Loading Module
    loading_default: "جاري المعالجة الآمنة وتحديث البيانات...",
    loading_please_wait: "يرجى الانتظار لحظات...",
    loading_securing: "جاري التحقق وتشفير البيانات الآمنة (AES-256)...",
    loading_saving_order: "جاري حفظ وتثبيت الطلبية في النظام وتجهيز الفاتورة...",
    loading_logging_call: "جاري توثيق الملاحظات ومزامنة تقويم Google...",
    loading_adding_lead: "جاري إضافة جهة الاتصال إلى قائمة الاتصال اليومية...",
    loading_payment: "جاري تسجيل سند القبض وتحديث الحساب المالي...",
    loading_inventory: "جاري ترحيل حركة المخزون وتحديث المستودع...",
    loading_exporting: "جاري تجميع البيانات وتصدير الملف...",

    // Sales Representative App
    sales_portal_badge: "بوابة المبيعات المعتمدة (Sales Representative Portal)",
    welcome_rep: "مرحباً",
    monthly_sales: "مبيعاتي هذا الشهر",
    of_target: "من الهدف:",
    target_progress: "نسبة تحقيق الهدف",
    commission_cash: "عمولتي المقدرة (كاش)",
    commission_rate: "% عمولة بيع",
    calls_queue_title: "قائمة أرقام الهواتف والعملاء للاتصال اليوم",
    calls_queue_sub: "الأرقام المسندة إليك للمتابعة، تسجيل الملاحظات، وتثبيت الطلبات",
    add_new_lead_btn: "إضافة رقم جديد للاتصال",
    calls_done_badge: "مكالمة منجزة",
    call_phone_btn: "اتصال هاتفي",
    whatsapp_chat_btn: "محادثة واتساب",
    log_notes_btn: "تسجيل الملاحظات",
    create_order_btn: "إنشاء طلبية",
    last_notes_recorded: "آخر الملاحظات المسجلة:",
    next_call_scheduled: "موعد الاتصال القادم:",
    calls_history_tag: "تم الاتصال",
    times: "مرات",

    // Order Modal
    order_modal_title: "إنشاء وتثبيت طلبية جديدة",
    order_rep_responsible: "المندوبة المسؤولة:",
    order_date: "تاريخ الطلب:",
    order_delivery_section: "بيانات العميل والتوصيل:",
    cust_name_label: "اسم العميل:",
    cust_phone_label: "رقم الهاتف:",
    cust_city_label: "المحافظة / المدينة:",
    cust_address_label: "العنوان التفصيلي:",
    address_placeholder: "الشارع، رقم العمارة، أقرب معلم",
    driver_notes_label: "ملاحظات التوصيل للسائق:",
    driver_notes_placeholder: "مثال: التوصيل بعد الساعة 3 عصراً، الاتصال قبل الوصول",
    select_products_label: "اختيار المنتجات والكميات:",
    betolla_catalog_tag: "كتالوج بيتولا الرسمي",
    payment_method_label: "طريقة الدفع المتفق عليها:",
    pay_cod: "دفع عند الاستلام (كاش)",
    pay_cliq: "تحويل كليك (CliQ)",
    pay_installment: "حجز شهر (أقساط صالونات)",
    total_order_due: "إجمالي الطلبية المستحق:",
    free_delivery_tag: "توصيل مجاني لكافة محافظات المملكة",
    submit_order_btn: "حفظ وتثبيت الطلبية في النظام",
    cancel_btn: "إلغاء",

    // Call Log Modal
    call_log_title: "تسجيل ملاحظات الاتصال والمتابعة",
    call_outcome_label: "نتيجة المكالمة:",
    outcome_answered: "تم الرد بنجاح",
    outcome_no_answer: "لم يتم الرد",
    outcome_whatsapp_sent: "تم إرسال واتساب",
    outcome_order_placed: "تم تثبيت طلبية",
    outcome_callback: "طلب موعد آخر",
    outcome_not_interested: "غير مهتم حالياً",
    call_notes_input_label: "تسجيل تفاصيل وملاحظات المكالمة:",
    call_notes_placeholder: "أدخلي هنا ما تم الاتفاق عليه مع العميل، أي استفسارات أو تفضيلات خاصة...",
    next_call_section: "تاريخ ووقت المكالمة القادمة (جدولة تذكير تقويم):",
    next_date_label: "تاريخ المتابعة:",
    next_time_label: "الوقت المحدد:",
    cal_saved_msg: "تم حفظ الموعد! اضغطي لفتحه في Google Calendar:",
    open_calendar_btn: "فتح في تقويم Google 📅",
    save_call_btn: "حفظ الملاحظات والموعد",
    close_btn: "إغلاق والعودة",

    // Add Lead Modal
    add_lead_title: "إضافة رقم جديد لقائمة الاتصال والمتابعة",
    add_lead_sub: "سيسند هذا الرقم فوراً لقائمة مهامك",
    lead_name_label: "اسم العميل / الصالون:",
    lead_phone_label: "رقم الهاتف:",
    lead_city_label: "المحافظة:",
    lead_address_label: "العنوان:",
    lead_purpose_label: "سبب الاتصال / المنتجات المهتم بها:",
    submit_add_lead: "إضافة الرقم والبدء بالاتصال",

    // Driver Manager Dashboard (Diya)
    nav_drivers: "إدارة السائقين",
    nav_driver: "طلبات التوصيل",
    driver_mgr_title: "لوحة إدارة التوصيل والسائقين",
    driver_mgr_sub: "إدارة الطلبات اليومية، تعيين السائقين، وتسوية الحسابات",
    dispatch_title: "إرسال وتحميل السائقين",
    dispatch_sub: "سحب المخزون وتجهيز بوالص التحميل الصباحية",
    reconcile_title: "تسوية نهاية اليوم",
    reconcile_sub: "مطابقة النقدية والمرتجعات مع السائقين",
    total_orders_today: "إجمالي طلبات اليوم",
    assigned_orders: "طلبات معينة",
    delivered_orders: "تم التسليم",
    returned_orders: "مرتجعات",
    unassigned_orders: "غير معينة",
    assign_driver: "تعيين سائق",
    dispatch_drivers: "إرسال السائقين",
    withdraw_inventory: "سحب من المخزون",
    reconcile_today: "تسوية اليوم",
    driver_khalid: "خالد",
    driver_ali: "علي",
    print_manifest: "طباعة بوليصة",
    driver_load: "حمولة السائق",
    expected_cash: "النقدية المتوقعة",
    collected_cash: "النقدية المحصلة",
    cash_difference: "الفرق",
    matched: "متطابق",
    discrepancy: "فرق",

    // Driver Mobile UI (Khalid & Ali)
    my_deliveries: "طلبات التوصيل",
    all_orders: "الكل",
    remaining: "متبقي",
    completed: "مكتمل",
    returned: "مرتجع",
    postponed: "مؤجل",
    delivered_btn: "تم التسليم",
    remaining_btn: "متبقي",
    returned_btn: "مرتجع",
    postpone_btn: "تأجيل",
    cash_to_collect: "المبلغ المطلوب تحصيله",
    receivables: "ذمم",
    confirm_delivery: "تأكيد التسليم",
    return_reason: "سبب الإرجاع",
    customer_absent: "الزبون غير موجود",
    refused_delivery: "رفض الاستلام",
    wrong_product: "منتج خاطئ",
    other_reason: "أخرى",
    postpone_date: "تاريخ التأجيل",
    total_collected: "إجمالي المحصل",

    // Driver Delivery Status Badges
    status_unassigned: "غير معين",
    status_assigned: "تم التعيين",
    status_picked_up: "تم السحب",
    status_out_for_delivery: "خرج للتوصيل",
    status_delivered: "تم التسليم",
    status_left_with_driver: "متبقي مع السائق",
    status_returned: "مرتجع",
    status_postponed: "مؤجل",

    // Transaction Types
    txn_sale: "بيع",
    txn_reservation: "حجز",
    txn_deferred: "بيع/مؤجل",
    txn_gift: "هدية",
    txn_cheque: "تحصيل شيك",
    txn_exchange: "استبدال",
    txn_samples: "عينات",

    // Switch Language Button
    switch_lang_label: "English",
  },
  en: {
    // Brand & System
    brand_title: "Betolla Cosmetics",
    brand_subtitle: "Integrated ERP System",
    sales_portal_sub: "Sales & Calling Portal",
    system_online: "System Online",
    logout: "Sign Out",
    logout_short: "Logout",
    admin_title: "General Manager",
    admin_badge: "admin@betolla",
    sales_rep_badge: "Certified Sales Rep",
    search_placeholder: "Search by phone, customer name, or order #...",
    new_order: "New Order",

    // Navigation
    nav_dashboard: "Dashboard",
    nav_sales: "Sales Rep Portal",
    nav_customers: "CRM & Customers",
    nav_calls: "Call Schedule",
    nav_orders: "Orders Management",
    nav_inventory: "Products & Stock",
    nav_finance: "Finance & Invoices",
    nav_analytics: "Performance Analytics",
    nav_settings: "Settings",

    // Login Page
    login_title: "Betolla Cosmetics",
    login_subtitle: "Enterprise ERP Portal",
    username_label: "Username or Email",
    username_placeholder: "Enter username or email",
    password_label: "Password",
    password_placeholder: "••••••••••••",
    login_button: "Sign In",
    logging_in: "Signing in...",
    copyright: "Betolla Cosmetics Co. © 2026 • All Rights Reserved",

    // Loading Module
    loading_default: "Processing securely & updating data...",
    loading_please_wait: "Please wait a moment...",
    loading_securing: "Authenticating & encrypting session (AES-256)...",
    loading_saving_order: "Confirming order & preparing invoice in ERP...",
    loading_logging_call: "Logging call notes & syncing Google Calendar...",
    loading_adding_lead: "Adding new lead to daily call queue...",
    loading_payment: "Recording payment voucher & balancing accounts...",
    loading_inventory: "Posting inventory movement to central warehouse...",
    loading_exporting: "Compiling data and generating export file...",

    // Sales Representative App
    sales_portal_badge: "Certified Sales Representative Portal",
    welcome_rep: "Welcome",
    monthly_sales: "My Sales This Month",
    of_target: "Target:",
    target_progress: "Target Progress",
    commission_cash: "Estimated Commission (Cash)",
    commission_rate: "% Sales Commission",
    calls_queue_title: "Today's Calling Queue & Leads",
    calls_queue_sub: "Assigned leads for follow-up, recording notes & order intake",
    add_new_lead_btn: "+ Add New Phone/Lead",
    calls_done_badge: "calls completed",
    call_phone_btn: "Call",
    whatsapp_chat_btn: "WhatsApp",
    log_notes_btn: "Record Notes",
    create_order_btn: "Create Order",
    last_notes_recorded: "Last Recorded Notes:",
    next_call_scheduled: "Next Scheduled Call:",
    calls_history_tag: "Called",
    times: "times",

    // Order Modal
    order_modal_title: "Create & Confirm New Order",
    order_rep_responsible: "Responsible Rep:",
    order_date: "Order Date:",
    order_delivery_section: "Customer & Delivery Details:",
    cust_name_label: "Customer Name:",
    cust_phone_label: "Phone Number:",
    cust_city_label: "City / Governorate:",
    cust_address_label: "Detailed Address:",
    address_placeholder: "Street, building number, nearest landmark",
    driver_notes_label: "Delivery Instructions for Driver:",
    driver_notes_placeholder: "e.g. Deliver after 3 PM, call 15 min prior to arrival",
    select_products_label: "Select Products & Quantities:",
    betolla_catalog_tag: "Official Betolla Catalog",
    payment_method_label: "Agreed Payment Method:",
    pay_cod: "Cash on Delivery (COD)",
    pay_cliq: "CliQ Transfer",
    pay_installment: "Salon Monthly Hold",
    total_order_due: "Total Order Amount:",
    free_delivery_tag: "Free delivery across all Jordan governorates",
    submit_order_btn: "Confirm & Save Order in ERP",
    cancel_btn: "Cancel",

    // Call Log Modal
    call_log_title: "Log Call Notes & Schedule Follow-up",
    call_outcome_label: "Call Outcome:",
    outcome_answered: "Answered Successfully",
    outcome_no_answer: "No Answer",
    outcome_whatsapp_sent: "WhatsApp Message Sent",
    outcome_order_placed: "Order Confirmed",
    outcome_callback: "Callback Requested",
    outcome_not_interested: "Not Interested Currently",
    call_notes_input_label: "Detailed Call Notes & Client Feedback:",
    call_notes_placeholder: "Enter call agreement summary, customer inquiries, or specific preferences...",
    next_call_section: "Next Call Date & Time (Calendar Reminder):",
    next_date_label: "Follow-up Date:",
    next_time_label: "Scheduled Time:",
    cal_saved_msg: "Appointment saved! Click below to open in Google Calendar:",
    open_calendar_btn: "Open in Google Calendar 📅",
    save_call_btn: "Save Notes & Appointment",
    close_btn: "Close & Return",

    // Add Lead Modal
    add_lead_title: "Add New Phone / Lead to Call Queue",
    add_lead_sub: "This lead will be immediately assigned to your daily tasks",
    lead_name_label: "Customer / Salon Name:",
    lead_phone_label: "Phone Number:",
    lead_city_label: "Governorate / City:",
    lead_address_label: "Address:",
    lead_purpose_label: "Call Reason / Interested Products:",
    submit_add_lead: "Add Lead & Start Calling",

    // Driver Manager Dashboard (Diya)
    nav_drivers: "Driver Management",
    nav_driver: "My Deliveries",
    driver_mgr_title: "Driver & Delivery Management",
    driver_mgr_sub: "Manage daily orders, assign drivers, and reconcile settlements",
    dispatch_title: "Morning Dispatch & Load Sheets",
    dispatch_sub: "Withdraw stock and prepare morning driver waybills",
    reconcile_title: "End-of-Day Reconciliation",
    reconcile_sub: "Reconcile cash collections and returns with drivers",
    total_orders_today: "Total Orders Today",
    assigned_orders: "Assigned Orders",
    delivered_orders: "Delivered Orders",
    returned_orders: "Returned Orders",
    unassigned_orders: "Unassigned Orders",
    assign_driver: "Assign Driver",
    dispatch_drivers: "Dispatch Drivers",
    withdraw_inventory: "Withdraw Stock",
    reconcile_today: "Reconcile Today",
    driver_khalid: "Khalid",
    driver_ali: "Ali",
    print_manifest: "Print Manifest",
    driver_load: "Driver's Load",
    expected_cash: "Expected Cash",
    collected_cash: "Collected Cash",
    cash_difference: "Difference",
    matched: "Matched",
    discrepancy: "Discrepancy",

    // Driver Mobile UI (Khalid & Ali)
    my_deliveries: "My Deliveries",
    all_orders: "All",
    remaining: "Remaining",
    completed: "Completed",
    returned: "Returned",
    postponed: "Postponed",
    delivered_btn: "Delivered",
    remaining_btn: "Left Over",
    returned_btn: "Returned",
    postpone_btn: "Postpone",
    cash_to_collect: "Cash to Collect",
    receivables: "Credit / Receivables",
    confirm_delivery: "Confirm Delivery",
    return_reason: "Return Reason",
    customer_absent: "Customer Unavailable",
    refused_delivery: "Refused Delivery",
    wrong_product: "Wrong Product",
    other_reason: "Other Reason",
    postpone_date: "Postponed Date",
    total_collected: "Total Collected",

    // Driver Delivery Status Badges
    status_unassigned: "Unassigned",
    status_assigned: "Assigned",
    status_picked_up: "Picked Up",
    status_out_for_delivery: "Out for Delivery",
    status_delivered: "Delivered",
    status_left_with_driver: "Left with Driver",
    status_returned: "Returned",
    status_postponed: "Postponed",

    // Transaction Types
    txn_sale: "Sale",
    txn_reservation: "Reservation",
    txn_deferred: "Deferred Sale",
    txn_gift: "Gift",
    txn_cheque: "Cheque Collection",
    txn_exchange: "Exchange",
    txn_samples: "Samples",

    // Switch Language Button
    switch_lang_label: "العربية",
  }
};

const I18nContext = createContext<I18nContextType>({
  language: "ar",
  dir: "rtl",
  toggleLanguage: () => {},
  setLanguage: () => {},
  t: (key: string) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ar");

  useEffect(() => {
    // Read saved language from localStorage
    const saved = localStorage.getItem("betolla_lang") as Language | null;
    if (saved === "en" || saved === "ar") {
      setLanguageState(saved);
      applyLanguage(saved);
    } else {
      applyLanguage("ar");
    }
  }, []);

  const applyLanguage = (lang: Language) => {
    const isRtl = lang === "ar";
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", lang);
      document.documentElement.setAttribute("dir", isRtl ? "rtl" : "ltr");
    }
  };

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("betolla_lang", lang);
    applyLanguage(lang);
  };

  const toggleLanguage = () => {
    const nextLang: Language = language === "ar" ? "en" : "ar";
    setLanguage(nextLang);
  };

  const t = (key: string): string => {
    return translations[language]?.[key] || translations["ar"]?.[key] || key;
  };

  return (
    <I18nContext.Provider
      value={{
        language,
        dir: language === "ar" ? "rtl" : "ltr",
        toggleLanguage,
        setLanguage,
        t,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useLanguage() {
  return useContext(I18nContext);
}
