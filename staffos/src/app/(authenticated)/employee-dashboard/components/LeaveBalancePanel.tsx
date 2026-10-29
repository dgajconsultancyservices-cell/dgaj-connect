'use client';

import { fetchSavedQuotas, quotaForRole, quotaValue } from '@/lib/leaveQuotas';

import React, { useEffect, useState } from 'react';
import { Plus, CalendarDays, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface LeaveBalance {
  leave_type: string;
  total_days: number;
  used_days: number;
}

const leaveTypeColors: Record<string, { bg: string; bar: string; text: string }> = {
  substitute: { bg: 'bg-blue-50 dark:bg-blue-900/20', bar: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400' },
  paid: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
  unpaid: { bg: 'bg-slate-50 dark:bg-slate-700/40', bar: 'bg-slate-400', text: 'text-slate-600 dark:text-slate-400' },
  medical: { bg: 'bg-red-50 dark:bg-red-900/20', bar: 'bg-red-400', text: 'text-red-700 dark:text-red-400' },
  half_day: { bg: 'bg-amber-50 dark:bg-amber-900/20', bar: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-400' },
  // legacy fallbacks
  casual: { bg: 'bg-blue-50 dark:bg-blue-900/20', bar: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400' },
  sick: { bg: 'bg-red-50 dark:bg-red-900/20', bar: 'bg-red-400', text: 'text-red-700 dark:text-red-400' },
};

const leaveTypeLabels: Record<string, string> = {
  substitute: 'Substitute',
  paid: 'Paid',
  unpaid: 'Unpaid',
  medical: 'Medical',
  half_day: 'Half Day',
  casual: 'Casual',
  sick: 'Sick',
};

export default function LeaveBalancePanel() {
  const { t } = useLanguage();
  const { user, pinSession } = useAuth();
  const supabase = createClient();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState(true);
  // Collapsed by default; click the title to open the balances
  const [expanded, setExpanded] = useState(false);

  const getEffectiveUserId = (): string | null => {
    if (user?.id) return user.id;
    if (pinSession?.userId) return pinSession.userId;
    try {
      const stored = localStorage.getItem('dgaj_pin_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed?.userId || null;
      }
    } catch {}
    return null;
  };

  useEffect(() => {
    const uid = getEffectiveUserId();
    if (!uid) {
      setLoading(false);
      return;
    }
    fetchBalances(uid);
  }, [user?.id, pinSession?.userId]);

  const fetchBalances = async (uid: string) => {
    setLoading(true);
    try {
      // Use fiscal year (April start) not calendar year
      const now = new Date();
      const fiscalYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      // Entitlements come from Director Settings (per role), the same source Firm Configuration syncs from
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', uid).maybeSingle();
      const quota = quotaForRole(await fetchSavedQuotas(supabase), profile?.role);

      const { data, error } = await supabase
        .from('leave_balances')
        .select('leave_type, total_days, used_days')
        .eq('user_id', uid)
        .eq('fiscal_year', fiscalYear)
        .order('leave_type');

      if (!error) {
        // Sync total_days from the saved role quota; keep each person's used_days
        const leaveTypes = ['substitute', 'paid', 'medical'];
        await supabase.from('leave_balances').upsert(
          leaveTypes.map((lt) => ({
            user_id: uid,
            leave_type: lt,
            fiscal_year: fiscalYear,
            total_days: quotaValue(quota, lt),
            used_days: (data || []).find((b: any) => b.leave_type === lt)?.used_days ?? 0,
            carry_forward_days: 0,
          })),
          { onConflict: 'user_id,leave_type,fiscal_year', ignoreDuplicates: false },
        );

        const { data: finalData } = await supabase
          .from('leave_balances')
          .select('leave_type, total_days, used_days')
          .eq('user_id', uid)
          .eq('fiscal_year', fiscalYear)
          .order('leave_type');
        setBalances(finalData || []);
      } else {
        console.error('Leave balance fetch error:', error);
      }
    } catch (err) {
      console.error('Leave balance fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-card p-5">
      <div className={`flex items-center justify-between ${expanded ? 'mb-4' : ''}`}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-2 text-left min-w-0"
        >
          <ChevronDown
            size={16}
            className={`text-slate-400 flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-0' : '-rotate-90'}`}
          />
          <div className="min-w-0">
            <h3 className="text-base font-600 text-slate-900 dark:text-slate-100">Leave Balance</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {expanded ? 'Current financial year' : 'Tap to view'}
            </p>
          </div>
        </button>
        <Link href="/leave-management">
          <button className="btn-ghost text-xs py-1.5 px-3 border border-slate-200 dark:border-slate-700 flex-shrink-0">
            <Plus size={13} />
            Apply Leave
          </button>
        </Link>
      </div>

      {!expanded ? null : loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-1.5" />
              <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full" />
            </div>
          ))}
        </div>
      ) : balances.length === 0 ? (
        <div className="py-8 text-center">
          <CalendarDays size={28} className="text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-500 text-slate-500 dark:text-slate-400">No leave balance data</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Leave balances are set up by your director</p>
        </div>
      ) : (
        <div className="space-y-3">
          {balances.map((bal) => {
            const remaining = bal.total_days - bal.used_days;
            const usedPct = bal.total_days > 0 ? (bal.used_days / bal.total_days) * 100 : 0;
            const colors = leaveTypeColors[bal.leave_type] || leaveTypeColors.paid;
            return (
              <div key={bal.leave_type} className={`rounded-lg p-3 ${colors.bg}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-xs font-600 ${colors.text}`}>
                    {leaveTypeLabels[bal.leave_type] || bal.leave_type}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    <span className={`font-700 ${colors.text}`}>{Math.max(0, remaining)}</span>/{bal.total_days} days
                  </span>
                </div>
                <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                    style={{ width: `${Math.min(usedPct, 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{bal.used_days} used</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}