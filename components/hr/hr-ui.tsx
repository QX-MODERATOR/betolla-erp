"use client";

// Small presentational pieces shared by the HR pages.
import { cn } from "@/lib/utils";
import { EMPLOYEE_STATUS_LABELS, type EmployeeStatus } from "@/lib/hr";

export function StatusBadge({ status }: { status: EmployeeStatus }) {
  const s = EMPLOYEE_STATUS_LABELS[status];
  return <span className={cn("inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap", s.color)}>{s.label}</span>;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-gradient-to-br from-[#9e8959] to-[#c28a40] text-[#160f02] font-black flex items-center justify-center shrink-0", className || "w-10 h-10 text-sm")}>
      {(name || "?").trim().charAt(0)}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "text-stone-900" }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
      <p className="text-xs font-bold text-stone-500">{label}</p>
      <p className={cn("text-2xl font-black mt-1", tone)}>{value}</p>
      {hint && <p className="text-[11px] text-stone-400 mt-0.5">{hint}</p>}
    </div>
  );
}

export function InfoRow({ label, value, ltr }: { label: string; value: React.ReactNode; ltr?: boolean }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-stone-100 last:border-0">
      <dt className="text-xs font-bold text-stone-500 shrink-0">{label}</dt>
      <dd dir={ltr ? "ltr" : undefined} className={cn("text-sm text-stone-900 text-end break-words min-w-0", empty && "text-stone-300")}>
        {empty ? "—" : value}
      </dd>
    </div>
  );
}

export function Panel({ title, icon, children, action }: { title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-stone-200 shadow-2xs">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-stone-100">
        <h3 className="font-black text-sm text-stone-900 flex items-center gap-2">{icon}{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center justify-between gap-3">
      <span>{message}</span>
      <button onClick={onRetry} className="px-3 py-1 rounded-lg bg-red-600 text-white font-bold shrink-0">إعادة المحاولة</button>
    </div>
  );
}
