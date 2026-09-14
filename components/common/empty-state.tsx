"use client";

import { Package, Search, Inbox, FileX2 } from "lucide-react";

interface EmptyStateProps {
  icon?: "package" | "search" | "inbox" | "empty";
  title?: string;
  subtitle?: string;
  className?: string;
}

const ICONS = {
  package: Package,
  search: Search,
  inbox: Inbox,
  empty: FileX2,
};

export function EmptyState({
  icon = "package",
  title = "لا توجد بيانات حالياً",
  subtitle = "ستظهر البيانات الجديدة هنا تلقائياً",
  className = "",
}: EmptyStateProps) {
  const Icon = ICONS[icon];

  return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 ${className}`}>
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center mb-5 shadow-sm">
        <Icon className="w-9 h-9 text-amber-400" />
      </div>
      <h3 className="text-lg font-bold text-stone-700 mb-1.5">{title}</h3>
      <p className="text-sm text-stone-400 text-center max-w-xs leading-relaxed">{subtitle}</p>
    </div>
  );
}
