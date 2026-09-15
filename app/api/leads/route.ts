import { businessRpc, prepareLead, readBody, businessFailure } from "@/lib/business-server";
import type { BusinessCustomer } from "@/lib/business";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readBody(req);
    const prepared = prepareLead(body);
    const { customer, is_duplicate } = await businessRpc<{ customer: BusinessCustomer; is_duplicate: boolean }>(
      "business_customer_create",
      { p_data: prepared }
    );

    return Response.json(
      {
        success: true,
        is_duplicate,
        message: is_duplicate
          ? `العميل مسجل مسبقاً في النظام ومسند للمندوب (${customer.rep_name_raw || "غير محدد"}).`
          : `تم تسجيل الليد بنجاح وتحويله آلياً إلى المندوب (${customer.rep_name_raw}) دون الحاجة لطباعة أوراق.`,
        customer,
        // Kept for backward compatibility with any existing n8n workflow mapping `lead`.
        lead: customer,
      },
      { status: is_duplicate ? 200 : 201 }
    );
  } catch (e) {
    return businessFailure(e);
  }
}

export async function GET() {
  return Response.json({
    status: "active",
    endpoint: "/api/leads",
    description: "نقطة استقبال الليدات الآلية لربط التسويق ونظام n8n بـ Betolla ERP (تُخزَّن العملاء في قاعدة البيانات مباشرة)",
    supportedFields: ["name", "phone", "city", "address", "notes", "source", "rep_name"],
  });
}
