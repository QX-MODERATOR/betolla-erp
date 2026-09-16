"use client";

import { useState } from "react";
import { CalendarCheck, Plus, Info, Users } from "lucide-react";
import { useMyHr } from "@/components/hr/use-my-hr";
import { LoadError, Panel } from "@/components/hr/hr-ui";
import { LeaveRequestModal, LeaveDecisionModal, LeaveRequestRow, type LeaveAction } from "@/components/hr/leave-components";
import type { HrLeaveRequest } from "@/lib/hr";

export default function MyLeavePage() {
  const { data, loading, error, reload, setLoading } = useMyHr();
  const [showNew, setShowNew] = useState(false);
  const [decision, setDecision] = useState<{ request: HrLeaveRequest; action: LeaveAction } | null>(null);

  const header = (
    <div>
      <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
        <CalendarCheck className="w-6 h-6 text-amber-500" /> إجازاتي
      </h2>
      <p className="text-xs sm:text-sm text-stone-500 mt-1">أرصدة الإجازات، طلباتك، وموافقات فريقك</p>
    </div>
  );

  if (loading && !data) return <div className="space-y-6">{header}<div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-400">جاري التحميل...</div></div>;
  if (!data?.employee) {
    return (
      <div className="space-y-6">
        {header}
        {error ? <LoadError message={error} onRetry={() => { setLoading(true); void reload(); }} /> : (
          <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
            <Info className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <p className="font-bold text-stone-800">لم يتم ربط حسابك بملف وظيفي بعد</p>
            <p className="text-sm text-stone-500 mt-1">تواصل مع قسم الموارد البشرية لتفعيل طلبات الإجازة.</p>
          </div>
        )}
      </div>
    );
  }

  const { today } = data;
  const typeName = (id: string) => data.types.find((t) => t.id === id)?.name_ar || "";
  const myActions = (r: HrLeaveRequest): LeaveAction[] =>
    r.status === "pending" || (r.status === "approved" && r.start_date > today) ? ["cancel"] : [];
  const upcoming = data.requests.filter((r) => r.status === "approved" && r.end_date >= today);
  const canRequest = data.employee.status !== "terminated";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {header}
        {canRequest && (
          <button onClick={() => setShowNew(true)} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-sm rounded-xl">
            <Plus className="w-4 h-4" /> طلب إجازة
          </button>
        )}
      </div>
      {error && <LoadError message={error} onRetry={() => void reload()} />}

      {data.teamRequests.length > 0 && (
        <Panel title={`طلبات فريقي بانتظار موافقتي (${data.teamRequests.length})`} icon={<Users className="w-4 h-4 text-amber-500" />}>
          <div className="-m-4 divide-y divide-stone-100">
            {data.teamRequests.map((r) => (
              <LeaveRequestRow key={r.id} r={r} showEmployee actions={["approve", "reject"]} onAction={(action) => setDecision({ request: r, action })} />
            ))}
          </div>
        </Panel>
      )}

      <div>
        <h3 className="text-sm font-black text-stone-700 mb-2">أرصدة سنة {data.balanceYear}</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {data.balances.map((b) => {
            const total = b.entitled + b.adjustments;
            const pct = total > 0 ? Math.min(100, ((b.used + b.pending) / total) * 100) : 0;
            return (
              <div key={b.leave_type_id} className="bg-white p-4 rounded-2xl border border-stone-200">
                <p className="text-xs font-bold text-stone-500">{typeName(b.leave_type_id)}</p>
                <p className="text-2xl font-black text-stone-900 mt-1">{b.available} <span className="text-xs font-bold text-stone-400">/ {total} يوم</span></p>
                <div className="h-1.5 rounded-full bg-stone-100 mt-2 overflow-hidden">
                  <div className="h-full bg-gradient-to-l from-[#9e8959] to-[#c28a40]" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[11px] text-stone-400 mt-1">مستخدم {b.used}{b.pending ? ` · معلّق ${b.pending}` : ""}</p>
              </div>
            );
          })}
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 text-sm text-violet-900">
          <b>إجازاتك القادمة:</b>{" "}
          {upcoming.map((r) => `${r.type_name} (${r.start_date === r.end_date ? r.start_date : `${r.start_date} ← ${r.end_date}`})`).join("، ")}
        </div>
      )}

      <Panel title="طلباتي">
        {!data.requests.length ? <p className="text-sm text-stone-400">لا توجد طلبات إجازة بعد.</p> : (
          <div className="-m-4 divide-y divide-stone-100">
            {data.requests.map((r) => (
              <LeaveRequestRow key={r.id} r={r} actions={myActions(r)} onAction={(action) => setDecision({ request: r, action })} />
            ))}
          </div>
        )}
      </Panel>

      {showNew && (
        <LeaveRequestModal mode="self" types={data.types} balances={data.balances} holidays={data.holidays}
          settings={data.settings} today={today}
          onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); void reload(); }} />
      )}
      {decision && (
        <LeaveDecisionModal request={decision.request} action={decision.action} endpoint="/api/hr/me/leave"
          onClose={() => setDecision(null)} onDone={() => { setDecision(null); void reload(); }} />
      )}
    </div>
  );
}
