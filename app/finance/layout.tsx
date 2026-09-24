import { FinanceNav } from "@/components/finance/finance-nav";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <FinanceNav />
      {children}
    </div>
  );
}
