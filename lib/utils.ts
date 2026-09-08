import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "0.000 د.أ";
  return `${Number(amount).toFixed(3)} د.أ`;
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toISOString().split('T')[0];
  } catch {
    return dateString;
  }
}

export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  end_user: "مستهلك مباشر",
  salon: "صالون / مركز تجميل",
  pharmacy: "صيدلية",
  clinic: "عيادة طبية",
  wholesale: "تجارة جملة",
  sale: "بيع مباشر",
  gift: "هدية / عينات",
  other: "أخرى",
};

export const CLASSIFICATION_LABELS: Record<string, string> = {
  customer: "زبون معتمد",
  cold_lead: "ليد غير نشط (Cold)",
  personal: "استخدام شخصي",
  salon: "صالون",
  home_based: "عمل منزلي",
  pharmacy: "صيدلية",
  no_response: "لا يوجد رد",
  not_interested: "غير مهتم",
  doctor_lead: "تحويل دكتور",
  repeat_caller: "تكرار اتصال",
  social_media: "سوشيال ميديا",
  unclassified: "غير مصنف",
  needs_review: "بحاجة لمراجعة",
  other: "أخرى",
};

export const ORDER_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة (جديد)", color: "bg-amber-50 text-amber-700 border-amber-200" },
  confirmed: { label: "تم التأكيد", color: "bg-blue-50 text-blue-700 border-blue-200" },
  processing: { label: "قيد التجهيز", color: "bg-purple-50 text-purple-700 border-purple-200" },
  shipped: { label: "في الطريق (توصيل)", color: "bg-orange-50 text-orange-700 border-orange-200" },
  delivered: { label: "تم التسليم", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "ملغي", color: "bg-rose-50 text-rose-700 border-rose-200" },
  returned: { label: "مرتجع", color: "bg-gray-100 text-gray-700 border-gray-300" },
};
