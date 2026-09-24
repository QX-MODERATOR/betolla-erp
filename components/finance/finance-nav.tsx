"use client";

// The finance manager's pages. The sidebar lists them under المالية; this strip repeats them at the
// top of every /finance page so moving between them on a phone does not mean opening the drawer.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Receipt, HandCoins, Wallet, TrendingDown, Banknote, PiggyBank, FileChartColumn, ScrollText } from "lucide-react";

export const FINANCE_PAGES = [
  { href: "/finance", title: "لوحة المالية", enTitle: "Finance Dashboard", icon: LayoutDashboard },
  { href: "/finance/receivables", title: "الذمم المدينة", enTitle: "Receivables", icon: HandCoins },
  { href: "/finance/invoices", title: "الفواتير والتحصيل", enTitle: "Invoices", icon: Receipt },
  { href: "/finance/payments", title: "المقبوضات", enTitle: "Payments", icon: Wallet },
  { href: "/finance/expenses", title: "المصاريف", enTitle: "Expenses", icon: TrendingDown },
  { href: "/finance/cash", title: "النقدية", enTitle: "Cash Management", icon: Banknote },
  { href: "/finance/budgets", title: "الموازنات", enTitle: "Budgets", icon: PiggyBank },
  { href: "/finance/reports", title: "التقارير المالية", enTitle: "Financial Reports", icon: FileChartColumn },
  { href: "/finance/audit", title: "سجل التدقيق", enTitle: "Audit Log", icon: ScrollText },
] as const;

export function FinanceNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="صفحات المالية" className="-mx-1 overflow-x-auto no-print">
      <div className="flex gap-1.5 px-1 pb-1 w-max">
        {FINANCE_PAGES.map((p) => {
          const active = pathname === p.href;
          return (
            <Link key={p.href} href={p.href} aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border whitespace-nowrap ${active ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"}`}>
              <p.icon className="w-3.5 h-3.5" />{p.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
