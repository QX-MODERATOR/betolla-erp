"use client";

import { Search, Bell, Calendar, PlusCircle, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export function Header() {
  const [searchTerm, setSearchTerm] = useState("");
  const currentDate = new Date().toLocaleDateString('ar-JO', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-stone-200 px-4 sm:px-6 flex items-center justify-between gap-3">
      {/* Search Bar with space for mobile menu toggle */}
      <div className="flex-1 max-w-md pr-12 lg:pr-0">
        <div className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="بحث برقم الهاتف، اسم العميل، أو رقم الطلب..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-stone-800 transition"
          />
        </div>
      </div>

      {/* Date and Quick Actions */}
      <div className="flex items-center gap-3">
        {/* Date Display */}
        <div className="hidden md:flex items-center gap-2 text-xs font-medium text-stone-500 bg-stone-100 px-3 py-1.5 rounded-lg border border-stone-200">
          <Calendar className="w-3.5 h-3.5 text-amber-600" />
          <span>{currentDate}</span>
        </div>

        {/* Quick New Order Button */}
        <button 
          onClick={() => window.location.href = '/orders?new=true'}
          className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-semibold text-xs rounded-xl shadow-xs transition"
        >
          <PlusCircle className="w-4 h-4" />
          <span className="hidden sm:inline">طلب جديد</span>
        </button>

        {/* Sync Status Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">النظام متصل</span>
        </div>
      </div>
    </header>
  );
}
