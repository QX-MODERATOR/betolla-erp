"use client";

import FinanceOverviewPanel from "@/components/finance/finance-overview";
import { PageHeader } from "@/components/finance/ui";

// لوحة المالية — the finance manager's home (ROLE_HOME_ROUTES). Detail lives on the pages it links to.
export default function FinancePage() {
  return (
    <div className="space-y-4">
      <PageHeader title="لوحة المالية" sub="المبيعات والمقبوضات والذمم والنقد والمصاريف لفترة تختارها" />
      <FinanceOverviewPanel />
    </div>
  );
}
