"use client";

import React, { useState, useRef, useMemo } from "react";
import { 
  FileSpreadsheet, 
  Upload, 
  Plus, 
  Trash2, 
  Send, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Download, 
  ClipboardPaste, 
  UserCheck, 
  RefreshCw,
  Phone,
  Building2,
  MapPin
} from "lucide-react";
import * as XLSX from "xlsx";
import { useNotifications } from "@/lib/notification-context";
import { useToast } from "@/components/common/toast";
import { useLoading } from "@/lib/loading-context";

export interface ExcelLeadItem {
  id: string;
  name: string;
  phone: string;
  city: string;
  address: string;
  notes: string;
  source: string;
}

interface ExcelLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (leads: ExcelLeadItem[], repName: string) => void;
}

export function ExcelLeadsModal({ isOpen, onClose, onSuccess }: ExcelLeadsModalProps) {
  const { sendNotification } = useNotifications();
  const { showToast } = useToast();
  const { startLoading, stopLoading } = useLoading();

  const [selectedRep, setSelectedRep] = useState("حنان");
  const [notificationTitle, setNotificationTitle] = useState("بيانات جديدة 🔔 New Data");
  const [rows, setRows] = useState<ExcelLeadItem[]>([]);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteContent, setPasteContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute stats dynamically
  const stats = useMemo(() => {
    let validCount = 0;
    let invalidCount = 0;
    const phoneSet = new Set<string>();
    let duplicateCount = 0;

    rows.forEach((r) => {
      const clean = r.phone.replace(/[^\d+]/g, "").trim();
      if (clean.length >= 9) {
        validCount++;
        if (phoneSet.has(clean)) {
          duplicateCount++;
        } else {
          phoneSet.add(clean);
        }
      } else {
        invalidCount++;
      }
    });

    return {
      total: rows.length,
      valid: validCount,
      invalid: invalidCount,
      duplicates: duplicateCount,
    };
  }, [rows]);

  if (!isOpen) return null;

  // Handle uploading any .xlsx / .xls / .csv file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    startLoading({
      ar: "جاري قراءة واستخراج البيانات من ملف الإكسل...",
      en: "Reading and extracting leads from Excel sheet...",
    });

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const wb = XLSX.read(buffer, { type: "array" });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rawJson: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rawJson.length < 2) {
          stopLoading();
          showToast("الملف فارغ أو لا يحتوي على صفوف بيانات.", "warning");
          return;
        }

        // Find header row and column mappings
        let headerRowIndex = 0;
        let colMap = { name: 0, phone: 1, city: 2, address: 3, notes: 4 };

        for (let i = 0; i < Math.min(5, rawJson.length); i++) {
          const row = rawJson[i];
          if (!row) continue;
          const strRow = row.map((c) => String(c || "").trim().toLowerCase());

          const phoneIdx = strRow.findIndex((c) => c.includes("هاتف") || c.includes("رقم") || c.includes("phone") || c.includes("mobile"));
          const nameIdx = strRow.findIndex((c) => c.includes("اسم") || c.includes("زبون") || c.includes("عميل") || c.includes("name") || c.includes("صالون"));
          const cityIdx = strRow.findIndex((c) => c.includes("مدينة") || c.includes("محافظة") || c.includes("city"));
          const addrIdx = strRow.findIndex((c) => c.includes("عنوان") || c.includes("منطقة") || c.includes("address"));
          const notesIdx = strRow.findIndex((c) => c.includes("ملاحظات") || c.includes("طلب") || c.includes("صنف") || c.includes("notes"));

          if (phoneIdx !== -1 || nameIdx !== -1) {
            headerRowIndex = i;
            colMap = {
              name: nameIdx !== -1 ? nameIdx : 0,
              phone: phoneIdx !== -1 ? phoneIdx : 1,
              city: cityIdx !== -1 ? cityIdx : 2,
              address: addrIdx !== -1 ? addrIdx : 3,
              notes: notesIdx !== -1 ? notesIdx : 4,
            };
            break;
          }
        }

        const parsed: ExcelLeadItem[] = [];
        for (let r = headerRowIndex + 1; r < rawJson.length; r++) {
          const row = rawJson[r];
          if (!row || row.length === 0) continue;

          const rawPhone = String(row[colMap.phone] || "").replace(/[^\d+]/g, "").trim();
          const rawName = String(row[colMap.name] || "").trim();

          if (rawPhone.length >= 7 || rawName.length > 0) {
            parsed.push({
              id: `row_${Date.now()}_${r}`,
              name: rawName || "عميل جديد",
              phone: rawPhone,
              city: String(row[colMap.city] || "عمان").trim(),
              address: String(row[colMap.address] || "").trim(),
              notes: String(row[colMap.notes] || "مستورد من ملف إكسل").trim(),
              source: `ملف (${file.name})`,
            });
          }
        }

        stopLoading();
        if (parsed.length === 0) {
          showToast("لم يتم العثور على أرقام هواتف صالحة في الملف.", "warning");
        } else {
          setRows((prev) => [...prev, ...parsed]);
          showToast(`تم استيراد ${parsed.length} سجل من ملف الإكسل بنجاح!`, "success");
        }
      } catch (err: any) {
        stopLoading();
        showToast("فشل استيراد ملف الإكسل: " + err.message, "error");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // Load 50 authentic leads from MD&ZAID.xlsx via API
  const handleLoadSampleFromExcel = async () => {
    startLoading({
      ar: "جاري استخراج 50 رقماً حقيقياً من ملف MD&ZAID.xlsx...",
      en: "Extracting 50 sample leads from MD&ZAID.xlsx...",
    });

    try {
      const res = await fetch("/api/leads/excel-sample?limit=50");
      const data = await res.json();
      stopLoading();

      if (data.success && Array.isArray(data.leads)) {
        setRows(data.leads);
        showToast(`تم تحميل ${data.leads.length} ليد بنجاح من ملف MD&ZAID.xlsx!`, "success", 4000);
      } else {
        showToast("فشل استخراج البيانات: " + (data.error || "خطأ غير معروف"), "error");
      }
    } catch (err: any) {
      stopLoading();
      showToast("خطأ في الاتصال بالسيرفر: " + err.message, "error");
    }
  };

  // Parse pasted clipboard text (e.g. copied directly from Excel / Sheets)
  const handleApplyPastedData = () => {
    if (!pasteContent.trim()) return;

    const lines = pasteContent.trim().split(/\r?\n/);
    const newItems: ExcelLeadItem[] = [];

    lines.forEach((line, idx) => {
      const parts = line.split(/\t|,|;/);
      if (parts.length >= 2) {
        const p1 = parts[0]?.trim() || "";
        const p2 = parts[1]?.trim() || "";
        const p3 = parts[2]?.trim() || "عمان";
        const p4 = parts[3]?.trim() || "";
        const p5 = parts[4]?.trim() || "";

        // Check which is phone vs name
        const isP1Phone = /^\+?\d{8,15}$/.test(p1.replace(/\s+/g, ""));
        const phone = isP1Phone ? p1 : p2;
        const name = isP1Phone ? p2 : p1;

        if (phone || name) {
          newItems.push({
            id: `pasted_${Date.now()}_${idx}`,
            name: name || "عميل محول",
            phone: phone.replace(/[^\d+]/g, ""),
            city: p3 || "عمان",
            address: p4,
            notes: p5 || "لصق مباشر من شيت إكسل",
            source: "لصق إكسل (Clipboard)",
          });
        }
      } else if (parts.length === 1 && parts[0].trim()) {
        // Just a phone number
        newItems.push({
          id: `pasted_${Date.now()}_${idx}`,
          name: "عميل جديد",
          phone: parts[0].replace(/[^\d+]/g, ""),
          city: "عمان",
          address: "",
          notes: "لصق مباشر",
          source: "لصق إكسل (Clipboard)",
        });
      }
    });

    if (newItems.length > 0) {
      setRows((prev) => [...prev, ...newItems]);
      showToast(`تمت إضافة ${newItems.length} ليد من الحافظة بنجاح!`, "success");
      setPasteContent("");
      setPasteModalOpen(false);
    } else {
      showToast("لم يتم التعرف على أي أرقام هواتف صالحة في النص الملصق.", "warning");
    }
  };

  // Add a single empty row
  const handleAddEmptyRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: `manual_${Date.now()}`,
        name: "",
        phone: "",
        city: "عمان",
        address: "",
        notes: "",
        source: "إدخال يدوي",
      },
    ]);
  };

  // Update a single field in a row
  const handleUpdateRow = (id: string, field: keyof ExcelLeadItem, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  // Delete a row
  const handleDeleteRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Clear all
  const handleClearAll = () => {
    if (rows.length === 0) return;
    if (confirm("هل أنت متأكد من تفريغ كافة الصفوف الحالية؟")) {
      setRows([]);
    }
  };

  // Final Dispatch Action
  const handleDispatchLeads = async () => {
    if (rows.length === 0) {
      showToast("يرجى إدخال أو رفع أرقام هواتف أولاً.", "warning");
      return;
    }

    const validRows = rows.filter((r) => r.phone.replace(/[^\d+]/g, "").length >= 7);
    if (validRows.length === 0) {
      showToast("لا توجد أرقام هواتف صالحة للإرسال.", "warning");
      return;
    }

    startLoading({
      ar: `جاري حفظ وتوزيع ${validRows.length} ليد على حساب (${selectedRep}) وإرسال إشعار New Data...`,
      en: `Dispatching ${validRows.length} leads to (${selectedRep}) and triggering New Data notification...`,
    });

    try {
      // 1. Send all leads to database / API
      for (const item of validRows) {
        await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: item.name || "عميل جديد",
            phone: item.phone,
            city: item.city || "عمان",
            address: item.address,
            notes: item.notes || "مستورد من شيت إكسل",
            source: item.source || "excel_import",
            rep_name: selectedRep,
          }),
        }).catch(() => {});
      }

      // 2. Dispatch real-time "New Data" notification
      const phoneList = validRows.map((r) => r.phone);
      const repId = selectedRep === "حنان" ? "hanan" : undefined;
      const notifMsg = `قام المسؤول بإسناد وتوزيع شيت إكسل يحتوي على (${validRows.length}) أرقام هواتف جديدة لحسابك. يرجى البدء بجدول الاتصالات فوراً.`;

      await sendNotification({
        repName: selectedRep,
        repId,
        title: notificationTitle || "بيانات جديدة 🔔 New Data",
        message: notifMsg,
        phones: phoneList,
        link: "/customers",
      });

      stopLoading();
      showToast(
        `🎉 تم بنجاح توزيع ${validRows.length} رقماً لحساب (${selectedRep}) وإطلاق إشعار New Data والتنبيه الصوتي الفوري!`,
        "success",
        6000
      );

      if (onSuccess) {
        onSuccess(validRows, selectedRep);
      }
      onClose();
    } catch (err: any) {
      stopLoading();
      showToast("حدث خطأ أثناء توزيع البيانات: " + err.message, "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 lg:p-6 animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-6xl w-full h-[92vh] flex flex-col shadow-2xl border border-stone-300 overflow-hidden text-stone-900 animate-in zoom-in-95">
        
        {/* Top Header Bar - Obsidian & Gold Luxury Accent */}
        <div className="bg-gradient-to-r from-[#160f02] via-[#241a08] to-[#160f02] text-[#f4e5d0] p-4 sm:p-5 border-b border-[#554625] flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#9e8959] to-[#c28a40] text-[#160f02] flex items-center justify-center font-black shadow-lg shadow-[#9e8959]/20 shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg text-white truncate">
                  شيت إكسل توزيع الليدات والبيانات (Excel Leads Hub)
                </h3>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#35270e] text-[#9e8959] border border-[#554625] text-[10px] font-bold">
                  <Sparkles className="w-3 h-3" />
                  <span>توزيع فوري</span>
                </span>
              </div>
              <p className="text-xs text-[#f4e5d0]/75 truncate mt-0.5">
                استيراد ملفات الإكسل، اللصق المباشر، وتوزيع أرقام الهواتف على موظفي المبيعات مع إشعار New Data الفوري
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-end md:self-auto">
            {/* Target Rep Selector */}
            <div className="flex items-center gap-2 bg-[#241a08] border border-[#554625] px-3 py-1.5 rounded-xl">
              <UserCheck className="w-4 h-4 text-[#9e8959] shrink-0" />
              <span className="text-xs text-[#f4e5d0]/80 font-bold hidden sm:inline">إرسال إلى:</span>
              <select
                value={selectedRep}
                onChange={(e) => setSelectedRep(e.target.value)}
                className="bg-transparent text-amber-300 font-bold text-xs focus:outline-none cursor-pointer"
              >
                <option value="حنان" className="bg-[#160f02] text-[#f4e5d0]">
                  حنان (مبيعات) - @hanan
                </option>
                <option value="صابرين" className="bg-[#160f02] text-[#f4e5d0]">
                  صابرين (مبيعات) - @sabreen
                </option>
                <option value="حمزة" className="bg-[#160f02] text-[#f4e5d0]">
                  حمزة (مبيعات) - @hamza
                </option>
                <option value="auto" className="bg-[#160f02] text-[#f4e5d0]">
                  توزيع آلي بالتساوي (Round Robin)
                </option>
              </select>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-[#241a08] hover:bg-[#35270e] text-[#f4e5d0]/70 hover:text-white border border-[#554625] transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="p-3 sm:p-4 bg-stone-50 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Hidden native file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />

            {/* Upload Excel Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
              title="رفع ملف إكسل من جهازك (.xlsx, .xls, .csv)"
            >
              <Upload className="w-4 h-4" />
              <span>رفع ملف Excel</span>
            </button>

            {/* Load from MD&ZAID.xlsx Button */}
            <button
              type="button"
              onClick={handleLoadSampleFromExcel}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#160f02] via-[#241a08] to-[#160f02] hover:bg-stone-800 text-[#f4e5d0] border border-[#554625] rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
              title="تحميل 50 ليد حقيقي فوراً من ملف MD&ZAID.xlsx"
            >
              <Sparkles className="w-4 h-4 text-[#9e8959]" />
              <span>تحميل 50 ليد للاختبار (MD&ZAID.xlsx)</span>
            </button>

            {/* Paste from Clipboard Button */}
            <button
              type="button"
              onClick={() => setPasteModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              <ClipboardPaste className="w-4 h-4 text-amber-600" />
              <span>لصق من إكسل (Ctrl+V)</span>
            </button>

            {/* Add Empty Row Button */}
            <button
              type="button"
              onClick={handleAddEmptyRow}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة سطر</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {rows.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1 px-3 py-2 text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-medium transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تفريغ الكل</span>
              </button>
            )}
          </div>
        </div>

        {/* Interactive Spreadsheet Data Grid */}
        <div className="flex-1 overflow-auto bg-stone-100/50 p-2 sm:p-4">
          {rows.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-stone-300 rounded-2xl bg-white space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center shadow-xs">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <div className="max-w-md space-y-1.5">
                <h4 className="font-extrabold text-base text-stone-900">
                  شيت البيانات فارغ حالياً
                </h4>
                <p className="text-xs text-stone-500 leading-relaxed">
                  يمكنك رفع ملف إكسل (.xlsx)، أو الضغط على <strong>&quot;تحميل 50 ليد للاختبار&quot;</strong> من ملف الشركة الحقيقي، أو لصق خلايا منسوجة مباشرة من برنامج Excel.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleLoadSampleFromExcel}
                  className="px-4 py-2.5 bg-gradient-to-r from-[#9e8959] to-[#c28a40] text-[#160f02] font-black text-xs rounded-xl shadow-md cursor-pointer hover:opacity-95"
                >
                  ⚡ تحميل 50 ليد وتجربة الإرسال لحنان الآن
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 bg-stone-900 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer hover:bg-stone-800"
                >
                  اختيار ملف إكسل من جهازي
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead className="bg-[#160f02] text-[#f4e5d0] sticky top-0 z-10 text-[11px] font-bold border-b border-[#554625]">
                    <tr>
                      <th className="p-2.5 w-12 text-center text-[#9e8959]">#</th>
                      <th className="p-2.5 min-w-[160px]">اسم العميل / الصالون</th>
                      <th className="p-2.5 min-w-[150px]">رقم الهاتف</th>
                      <th className="p-2.5 min-w-[120px]">المدينة / المحافظة</th>
                      <th className="p-2.5 min-w-[180px]">العنوان التفصيلي</th>
                      <th className="p-2.5 min-w-[200px]">ملاحظات / الطلب السابق</th>
                      <th className="p-2.5 min-w-[100px]">المصدر</th>
                      <th className="p-2.5 w-12 text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {rows.map((row, idx) => {
                      const cleanPhone = row.phone.replace(/[^\d+]/g, "").trim();
                      const isValidPhone = cleanPhone.length >= 7;

                      return (
                        <tr
                          key={row.id}
                          className="hover:bg-amber-50/40 transition-colors group"
                        >
                          {/* Row Number */}
                          <td className="p-2 text-center font-mono font-bold text-stone-400 text-[11px] bg-stone-50/50">
                            {idx + 1}
                          </td>

                          {/* Name Input */}
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={row.name}
                              onChange={(e) => handleUpdateRow(row.id, "name", e.target.value)}
                              placeholder="اسم الزبون..."
                              className="w-full px-2.5 py-1.5 bg-transparent hover:bg-stone-50 focus:bg-white border border-transparent hover:border-stone-200 focus:border-amber-500 rounded-lg text-xs font-bold text-stone-900 focus:outline-none"
                            />
                          </td>

                          {/* Phone Input with validation badge */}
                          <td className="p-1.5">
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                dir="ltr"
                                value={row.phone}
                                onChange={(e) => handleUpdateRow(row.id, "phone", e.target.value)}
                                placeholder="07XXXXXXXX"
                                className={`w-full px-2.5 py-1.5 bg-transparent hover:bg-stone-50 focus:bg-white border ${
                                  isValidPhone ? "border-transparent focus:border-amber-500 text-stone-900" : "border-rose-300 bg-rose-50/40 text-rose-900"
                                } hover:border-stone-200 rounded-lg text-xs font-mono font-bold focus:outline-none`}
                              />
                              {!isValidPhone && (
                                <span className="absolute left-2 text-[10px] text-rose-600 font-bold">
                                  ناقص
                                </span>
                              )}
                            </div>
                          </td>

                          {/* City */}
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={row.city}
                              onChange={(e) => handleUpdateRow(row.id, "city", e.target.value)}
                              placeholder="عمان..."
                              className="w-full px-2.5 py-1.5 bg-transparent hover:bg-stone-50 focus:bg-white border border-transparent hover:border-stone-200 focus:border-amber-500 rounded-lg text-xs text-stone-800 focus:outline-none"
                            />
                          </td>

                          {/* Address */}
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={row.address}
                              onChange={(e) => handleUpdateRow(row.id, "address", e.target.value)}
                              placeholder="المنطقة أو الشارع..."
                              className="w-full px-2.5 py-1.5 bg-transparent hover:bg-stone-50 focus:bg-white border border-transparent hover:border-stone-200 focus:border-amber-500 rounded-lg text-xs text-stone-600 focus:outline-none"
                            />
                          </td>

                          {/* Notes */}
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={row.notes}
                              onChange={(e) => handleUpdateRow(row.id, "notes", e.target.value)}
                              placeholder="ملاحظات العميل أو طلبه السابق..."
                              className="w-full px-2.5 py-1.5 bg-transparent hover:bg-stone-50 focus:bg-white border border-transparent hover:border-stone-200 focus:border-amber-500 rounded-lg text-xs text-stone-600 focus:outline-none"
                            />
                          </td>

                          {/* Source Tag */}
                          <td className="p-2 text-stone-400 font-mono text-[11px] truncate max-w-[120px]">
                            {row.source}
                          </td>

                          {/* Delete Action */}
                          <td className="p-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(row.id)}
                              className="p-1.5 text-stone-300 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                              title="حذف هذا السطر"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Live Bottom Stats Bar & Dispatch Controls */}
        <div className="p-3 sm:p-4 bg-white border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          {/* Exact Stats Requested by User */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-950 px-3 py-1.5 rounded-xl font-bold">
              <Phone className="w-3.5 h-3.5 text-amber-600" />
              <span>إجمالي السجلات:</span>
              <span className="font-mono text-sm text-amber-900 bg-amber-200/80 px-1.5 rounded-md font-black">
                {stats.total} أرقام هواتف
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-900 px-3 py-1.5 rounded-xl font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>صالحة للاتصال:</span>
              <span className="font-mono text-emerald-800 font-black">{stats.valid}</span>
            </div>

            {stats.duplicates > 0 && (
              <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 text-rose-900 px-3 py-1.5 rounded-xl font-bold">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>مكررة:</span>
                <span className="font-mono font-black">{stats.duplicates}</span>
              </div>
            )}

            <div className="hidden md:flex items-center gap-1.5 bg-stone-100 text-stone-700 px-3 py-1.5 rounded-xl text-xs font-semibold">
              <UserCheck className="w-3.5 h-3.5 text-amber-600" />
              <span>المستلم: <strong>{selectedRep}</strong></span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              إلغاء
            </button>

            <button
              type="button"
              onClick={handleDispatchLeads}
              disabled={rows.length === 0}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm shadow-md transition cursor-pointer active:scale-95 ${
                rows.length === 0
                  ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-[#9e8959] via-[#bda66d] to-[#9e8959] text-[#160f02] hover:opacity-95 shadow-[#9e8959]/25"
              }`}
            >
              <Send className="w-4 h-4" />
              <span>إرسال وتوزيع البيانات إلى {selectedRep} فوراً (New Data 🔔)</span>
            </button>
          </div>
        </div>

      </div>

      {/* Paste from Clipboard Dialog */}
      {pasteModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-stone-200 space-y-3 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <ClipboardPaste className="w-4 h-4 text-amber-600" />
                <h4 className="font-bold text-sm text-stone-900">لصق خلايا الإكسل (Paste Cells)</h4>
              </div>
              <button
                type="button"
                onClick={() => setPasteModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-stone-500 leading-relaxed">
              قم بنسخ الخلايا من Excel أو Google Sheets (Ctrl+C)، ثم الصقها هنا (Ctrl+V). يدعم البرنامج قراءة الأسماء وأرقام الهواتف والمدن تلقائياً:
            </p>
            <textarea
              rows={8}
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
              placeholder="مثال:&#10;مجد البلتاجي	0786750409	الزرقاء	شامبو بلازما&#10;ألاء كوكش	0776812355	معان	مورفوزيس"
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono focus:outline-none focus:border-amber-500 leading-relaxed"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPasteModalOpen(false)}
                className="px-3.5 py-2 bg-stone-100 text-stone-700 text-xs font-bold rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleApplyPastedData}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-bold rounded-xl shadow-xs"
              >
                تطبيق وإضافة للشيت
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
