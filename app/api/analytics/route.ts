import { businessUser, businessRpc, businessFailure } from "@/lib/business-server";
import { toInvoice, financeSummary, type BusinessOrder, type BusinessCustomer } from "@/lib/business";
import { ammanDate, ammanToday, periodStart, type AnalyticsPeriod } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export async function GET(req: Request) {
  try {
    await businessUser(req, "/api/analytics");
    const requested = new URL(req.url).searchParams.get("period");
    const period: AnalyticsPeriod = requested === "week" || requested === "year" || requested === "all" ? requested : "month";
    const today = ammanToday();
    const from = periodStart(period, today);
    const inPeriod = (day: string | null | undefined) => !from || (!!day && day >= from && day <= today);

    const [allCustomers, allOrders] = await Promise.all([
      businessRpc<BusinessCustomer[]>("business_customer_list", {}),
      businessRpc<BusinessOrder[]>("business_list", { p_scope: null }),
    ]);
    // Orders placed in the period; leads added in the period (the lead base stays all-time).
    const orders = allOrders.filter((o) => inPeriod(o.order_date));
    const customers = allCustomers.filter((c) => inPeriod(ammanDate(c.created_at)));

    const invoices = orders.filter((o) => o.invoice_number).map(toInvoice);
    const totals = financeSummary(invoices);

    const orderedPhones = new Set(orders.map((o) => o.customer_phone));
    const conversionRate = customers.length
      ? Math.round((orderedPhones.size / customers.length) * 1000) / 10
      : 0;
    const avgOrderValue = orders.length
      ? Math.round((totals.total_invoiced_jd / orders.length) * 1000) / 1000
      : 0;

    const byRep: Record<string, { orders: number; revenue: number }> = {};
    for (const o of orders) {
      const rep = o.rep_name || "غير معيّن";
      if (!byRep[rep]) byRep[rep] = { orders: 0, revenue: 0 };
      byRep[rep].orders += 1;
      byRep[rep].revenue += o.total_amount;
    }
    const customersByRep: Record<string, number> = {};
    for (const c of allCustomers) {
      const rep = c.rep_name_raw || "غير معيّن";
      customersByRep[rep] = (customersByRep[rep] || 0) + 1;
    }
    const repsLeaderboard = Object.entries(byRep)
      .map(([name, v]) => {
        const clients = customersByRep[name] || 0;
        return {
          name,
          clients,
          orders: v.orders,
          revenue_jd: Math.round(v.revenue * 1000) / 1000,
          conversion_rate: clients ? Math.round((v.orders / clients) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.revenue_jd - a.revenue_jd)
      .map((rep, idx) => ({ ...rep, rank: idx + 1 }));

    const totalLeads = customers.length;
    // Leads added in the period that were contacted in the period.
    const contacted = customers.filter((c) => inPeriod(c.last_contact_date) || (c.history || []).some((h) => inPeriod(h.date))).length;
    const delivered = orders.filter((o) => o.status === "delivered").length;
    const pct = (n: number) => (totalLeads ? Math.round((n / totalLeads) * 1000) / 10 : 0);
    const funnel = [
      { stage: from ? "ليدات جديدة في هذه الفترة" : "ليدات وعملاء في قاعدة البيانات", count: totalLeads, percent: 100 },
      { stage: "تم التواصل معهم فعلياً", count: contacted, percent: pct(contacted) },
      { stage: "طلبيات مؤكدة وحجوزات", count: orders.length, percent: pct(orders.length) },
      { stage: "تم التسليم بنجاح", count: delivered, percent: pct(delivered) },
    ];

    const byProduct: Record<string, number> = {};
    for (const o of orders) {
      for (const item of o.items) {
        if (item.total == null) continue;
        byProduct[item.name] = (byProduct[item.name] || 0) + item.total;
      }
    }
    const totalProductRevenue = Object.values(byProduct).reduce((s, n) => s + n, 0) || 1;
    const topProducts = Object.entries(byProduct)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, revenue]) => ({
        name,
        revenue_jd: Math.round(revenue * 1000) / 1000,
        percentage: Math.round((revenue / totalProductRevenue) * 1000) / 10,
      }));

    const byCity: Record<string, number> = {};
    for (const o of orders) {
      const city = o.city || "غير محدد";
      byCity[city] = (byCity[city] || 0) + 1;
    }
    const totalCityOrders = orders.length || 1;
    const geoDistribution = Object.entries(byCity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([region, count]) => ({ region, count, percentage: Math.round((count / totalCityOrders) * 1000) / 10 }));

    return Response.json(
      {
        period: { key: period, from, to: today },
        overview: {
          total_customers: allCustomers.length,
          new_customers: customers.length,
          total_orders: orders.length,
          revenue_collected_jd: totals.total_collected_jd,
          revenue_invoiced_jd: totals.total_invoiced_jd,
          average_order_value_jd: avgOrderValue,
          lead_conversion_rate_percent: conversionRate,
        },
        funnel,
        reps_leaderboard: repsLeaderboard,
        top_products: topProducts,
        geo_distribution: geoDistribution,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (e) {
    return businessFailure(e);
  }
}
