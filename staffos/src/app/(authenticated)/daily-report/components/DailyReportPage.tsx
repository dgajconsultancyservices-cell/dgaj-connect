'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Save, Plus, Trash2, Loader2, BarChart3, Fuel } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FuelRow {
  id: string;
  name: string;
  price: string;       // snapshot saved with the day; '' = use the rate for that date
  daySales: string;    // litres sold
  purchase: string;
  totalStock: string;
  costPrice: string;   // purchase cost per litre (₹/L), used for Capital
}
interface Tank { id: string; name: string; fuel: string; dip: string; ltr: string }
interface Expense {
  id: string;
  purpose: string;
  paidTo: string;
  amount: string;      // amount paid
  toPay: string;       // amount still to be paid
  mode: 'cash' | 'online';
  note: string;        // e.g. bank details
  enteredBy: string;
}

interface ReportData {
  fuels: FuelRow[];
  tanks: Tank[];
  sales: { cash: string; upi: string };  // upi is used by hospital reports only
  openingCash: string;    // cash in hand at the start of the day
  cashInHand: string;     // legacy field from older saved days (not used for new entries)
  portalBalance: string;  // portal balance for the day (fuel reports)
  expenses: Expense[];
}

type ReportType = 'fuel' | 'hospital';
interface RateRow { fuel_key: string; rate: number; cost_price: number | null; effective_from: string; created_by: string | null }
type Period = 'week' | 'month' | 'quarter' | 'year' | 'custom';
interface HistoryRow { firm_id: string; report_date: string; data: ReportData }
interface FirmOption { id: string; name: string; code: string | null; reportType: ReportType }
interface DayRow { firm_id: string; updated_by: string | null; updated_at: string | null; data: ReportData }
interface Bucket { key: string; label: string; start: string; end: string }

const ALL = '__all__'; // director-only view across every selected firm

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_FUELS = ['MS', 'HSD', 'POWER', 'TURBO', 'E20', 'XP95'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'Week (7 days)' },
  { id: 'month', label: 'Month (weeks)' },
  { id: 'quarter', label: 'Quarter (months)' },
  { id: 'year', label: 'Year (months)' },
  { id: 'custom', label: 'Custom (from – to)' },
];
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#64748b'];
const RATE_ROLES = ['director', 'manager', 'executive'];

const uid = () => Math.random().toString(36).slice(2, 10);
const num = (v: string | number | null | undefined) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};
const fmtMoney = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtNum = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtTime = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
  : '';

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function emptyReport(): ReportData {
  return {
    fuels: DEFAULT_FUELS.map((name) => ({ id: name.toLowerCase(), name, price: '', daySales: '', purchase: '', totalStock: '', costPrice: '' })),
    tanks: [
      { id: uid(), name: 'Tank 1', fuel: 'ms', dip: '', ltr: '' },
      { id: uid(), name: 'Tank 2', fuel: 'hsd', dip: '', ltr: '' },
      { id: uid(), name: 'Tank 3', fuel: 'power', dip: '', ltr: '' },
      { id: uid(), name: 'Tank 4', fuel: 'xp95', dip: '', ltr: '' },
    ],
    sales: { cash: '', upi: '' },
    openingCash: '',
    cashInHand: '',
    portalBalance: '',
    expenses: [],
  };
}

// Merge a saved row with defaults so older/partial rows still render
// (old rows may still contain nozzle or card/online fields; they are ignored)
function normalize(raw: any): ReportData {
  const base = emptyReport();
  if (!raw) return base;
  return {
    fuels: raw.fuels?.length ? raw.fuels.map((f: any) => ({ price: '', costPrice: '', ...f })) : base.fuels,
    tanks: raw.tanks ?? base.tanks,
    sales: { cash: raw.sales?.cash ?? '', upi: raw.sales?.upi ?? '' },
    openingCash: raw.openingCash ?? '',
    cashInHand: raw.cashInHand ?? '',
    portalBalance: raw.portalBalance ?? '',
    expenses: (raw.expenses ?? []).map((e: any) => ({
      id: e.id ?? uid(),
      purpose: e.purpose ?? e.particulars ?? '',
      paidTo: e.paidTo ?? '',
      amount: e.amount ?? '',
      toPay: e.toPay ?? '',
      mode: e.mode === 'online' ? 'online' : 'cash',
      note: e.note ?? '',
      enteredBy: e.enteredBy ?? '',
    })),
  };
}

function summarize(d: ReportData) {
  // Closing cash = opening cash + cash sale
  const closingCash = num(d.openingCash) + num(d.sales.cash);
  const fuelRows = d.fuels.map((f) => {
    const litres = num(f.daySales);
    return { name: f.name || '—', litres, revenue: litres * num(f.price) };
  });
  const expPaid = d.expenses.reduce((s, e) => s + num(e.amount), 0);
  return {
    fuelRows,
    revenue: fuelRows.reduce((s, r) => s + r.revenue, 0),
    litres: fuelRows.reduce((s, r) => s + r.litres, 0),
    cashSale: num(d.sales.cash),
    upiSale: num(d.sales.upi),
    hospitalTotal: num(d.sales.cash) + num(d.sales.upi),
    openingCash: num(d.openingCash),
    cashInHand: closingCash,
    portalBalance: num(d.portalBalance),
    // Capital = cash in hand + portal balance + (total stock × cost price) for each fuel
    capital: closingCash + num(d.portalBalance)
      + d.fuels.reduce((s, f) => s + num(f.totalStock) * num(f.costPrice), 0),
    paid: expPaid,
    cashPaid: d.expenses.filter((e) => e.mode === 'cash').reduce((s, e) => s + num(e.amount), 0),
    onlinePaid: d.expenses.filter((e) => e.mode === 'online').reduce((s, e) => s + num(e.amount), 0),
    toPay: d.expenses.reduce((s, e) => s + num(e.toPay), 0),
    balance: d.expenses.reduce((s, e) => s + Math.max(num(e.toPay) - num(e.amount), 0), 0),
  };
}

// The fixed buckets shown on the chart for the period that contains `anchor`.
// Empty buckets are kept so the x-axis always shows the full period.
function windowFor(anchor: Date, period: Period): Bucket[] {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();

  if (period === 'week') {
    const monday = addDays(anchor, -((anchor.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i);
      const dayName = d.toLocaleDateString('en-IN', { weekday: 'short' });
      return { key: ymd(d), label: `${dayName} ${d.getDate()} ${MONTHS[d.getMonth()]}`, start: ymd(d), end: ymd(d) };
    });
  }

  if (period === 'month') {
    const last = new Date(y, m + 1, 0).getDate();
    const out: Bucket[] = [];
    for (let w = 0, d1 = 1; d1 <= last; w++, d1 += 7) {
      const d2 = Math.min(d1 + 6, last);
      out.push({
        key: `w${w + 1}`,
        label: `Week ${w + 1} (${d1}–${d2} ${MONTHS[m]})`,
        start: ymd(new Date(y, m, d1)),
        end: ymd(new Date(y, m, d2)),
      });
    }
    return out;
  }

  if (period === 'quarter') {
    const q0 = Math.floor(m / 3) * 3;
    return [0, 1, 2].map((i) => {
      const mm = q0 + i;
      return {
        key: `${y}-${String(mm + 1).padStart(2, '0')}`,
        label: `${MONTHS[mm]} ${y}`,
        start: ymd(new Date(y, mm, 1)),
        end: ymd(new Date(y, mm + 1, 0)),
      };
    });
  }

  // year: twelve months
  return MONTHS.map((name, mm) => ({
    key: `${y}-${String(mm + 1).padStart(2, '0')}`,
    label: `${name} ${y}`,
    start: ymd(new Date(y, mm, 1)),
    end: ymd(new Date(y, mm + 1, 0)),
  }));
}

// Buckets for a custom from–to range: one per day up to 93 days, then one per month
function customBuckets(from: string, to: string): Bucket[] {
  const start = parseYmd(from);
  let end = parseYmd(to);
  if (end < start) end = start;
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (days <= 92) {
    return Array.from({ length: days + 1 }, (_, i) => {
      const d = addDays(start, i);
      return { key: ymd(d), label: `${d.getDate()} ${MONTHS[d.getMonth()]}`, start: ymd(d), end: ymd(d) };
    });
  }
  const out: Bucket[] = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const mStart = cur < start ? start : cur;
    const mEnd = monthEnd > end ? end : monthEnd;
    out.push({
      key: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`,
      start: ymd(mStart),
      end: ymd(mEnd),
    });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return out;
}

// Which bucket a saved day falls into for the chosen period
function keyFor(dateStr: string, period: Period, customMonthly = false): string {
  const d = parseYmd(dateStr);
  if (period === 'custom') {
    return customMonthly ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : dateStr;
  }
  if (period === 'week') return dateStr;
  if (period === 'month') return `w${Math.floor((d.getDate() - 1) / 7) + 1}`;
  if (period === 'quarter') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-60';
const thCls = 'text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 px-2 py-2 bg-slate-50 dark:bg-slate-700/50';
const tdCls = 'px-2 py-1.5 align-middle';
const cardCls = 'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DailyReportPage() {
  const { pinSession, effectiveUserId } = useAuth();
  const supabase = createClient();

  const role = pinSession?.role || '';
  const isDirector = role === 'director';
  const canSetRates = RATE_ROLES.includes(role);

  const [date, setDate] = useState(() => ymd(new Date()));
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [firmsLoaded, setFirmsLoaded] = useState(false);
  const [firmId, setFirmId] = useState<string>('');
  const [data, setData] = useState<ReportData>(emptyReport);
  const [meta, setMeta] = useState<{ by: string | null; at: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updaterName, setUpdaterName] = useState('');
  const [defaultPerson, setDefaultPerson] = useState('');
  const [dayRows, setDayRows] = useState<DayRow[]>([]);
  // Tank capacity (litres) per tank name, saved once per firm
  const [tankCaps, setTankCaps] = useState<Record<string, string>>({});

  const [rates, setRates] = useState<RateRow[]>([]);
  const [ratesKey, setRatesKey] = useState(0);
  const [editingRates, setEditingRates] = useState(false);
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});
  const [costDraft, setCostDraft] = useState<Record<string, string>>({});
  const [rateDate, setRateDate] = useState(() => ymd(new Date()));

  const [period, setPeriod] = useState<Period>('week');
  // Separate date for the charts (independent of the entry date)
  const [chartDate, setChartDate] = useState(() => ymd(new Date()));
  const [customFrom, setCustomFrom] = useState(() => { const n = new Date(); return ymd(new Date(n.getFullYear(), n.getMonth(), 1)); });
  const [customTo, setCustomTo] = useState(() => ymd(new Date()));
  const [history, setHistory] = useState<HistoryRow[]>([]);
  // Rates for the trend: a day saved without a price uses the rate in force on that day
  const [historyRates, setHistoryRates] = useState<{ firm_id: string; fuel_key: string; rate: number; effective_from: string }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const isAll = firmId === ALL;
  const firmIds = useMemo(() => firms.map((f) => f.id), [firms]);
  const firmName = isAll ? 'All firms' : (firms.find((f) => f.id === firmId)?.name || '');
  // Hospital firms get a sales-only report (cash / UPI / expenses / cash in hand)
  const isHospitalSingle = !isAll && (firms.find((f) => f.id === firmId)?.reportType === 'hospital');

  // Rate in force for a fuel on the selected date (latest rate on or before that date)
  const rateFor = useCallback((fuelKey: string, onDate: string): number | null => {
    const r = rates.find((x) => x.fuel_key === fuelKey && x.effective_from <= onDate);
    return r ? Number(r.rate) : null;
  }, [rates]);
  const costFor = useCallback((fuelKey: string, onDate: string): number | null => {
    const r = rates.find((x) => x.fuel_key === fuelKey && x.effective_from <= onDate && x.cost_price != null);
    return r ? Number(r.cost_price) : null;
  }, [rates]);

  // Price used for the day: the saved snapshot, otherwise the rate for that date
  const liveData: ReportData = useMemo(() => ({
    ...data,
    fuels: data.fuels.map((f) => ({
      ...f,
      price: f.price !== '' ? f.price : String(rateFor(f.id, date) ?? ''),
    })),
  }), [data, rateFor, date]);

  const stockValue = useMemo(
    () => liveData.fuels.reduce((s, f) => s + num(f.totalStock) * (costFor(f.id, date) ?? 0), 0),
    [liveData, costFor, date],
  );
  const totals = useMemo(() => {
    const s = summarize(liveData);
    return { ...s, capital: s.cashInHand + s.portalBalance + stockValue };
  }, [liveData, stockValue]);


  // Firms this user may see: directors → every firm in the daily report;
  // employees → only the firms they are assigned to as editor.
  useEffect(() => {
    if (!effectiveUserId) return;
    (async () => {
      const { data: selectedRows } = await supabase.from('daily_report_firms').select('firm_id, report_type');
      const typeMap = new Map<string, ReportType>(
        (selectedRows || []).map((r: { firm_id: string; report_type: string | null }) => [
          r.firm_id,
          r.report_type === 'hospital' ? 'hospital' : 'fuel',
        ]),
      );
      const selected = Array.from(typeMap.keys());
      let allowed = selected;
      if (!isDirector) {
        const { data: assignedRows } = await supabase
          .from('daily_report_editors').select('firm_id').eq('user_id', effectiveUserId);
        const mine = new Set((assignedRows || []).map((r: { firm_id: string }) => r.firm_id));
        allowed = selected.filter((id) => mine.has(id));
      }
      if (allowed.length === 0) {
        setFirms([]);
        setFirmId('');
        setFirmsLoaded(true);
        return;
      }
      const { data: list } = await supabase.from('firms').select('id, name, code').in('id', allowed).order('name');
      const options: FirmOption[] = ((list as Omit<FirmOption, 'reportType'>[]) || []).map((f) => ({
        ...f,
        reportType: typeMap.get(f.id) ?? 'fuel',
      }));
      setFirms(options);
      setFirmId((cur) => cur || (isDirector && options.length > 1 ? ALL : options[0]?.id || ''));
      setFirmsLoaded(true);
    })();
  }, [effectiveUserId, isDirector]);

  // Name of the person logged in (shown as "updated by")
  useEffect(() => {
    if (!effectiveUserId) return;
    supabase.from('user_profiles').select('full_name').eq('id', effectiveUserId).maybeSingle()
      .then(({ data: p }) => setUpdaterName(p?.full_name || 'Unknown'));
  }, [effectiveUserId]);

  // Default person for new expenses = the firm's assigned editor
  // (the logged-in user if they are one of the editors, otherwise the first editor)
  useEffect(() => {
    if (!firmId || isAll) return;
    (async () => {
      const { data: eds } = await supabase.from('daily_report_editors')
        .select('user_id').eq('firm_id', firmId).order('assigned_at', { ascending: true });
      const ids = (eds || []).map((e: { user_id: string }) => e.user_id);
      if (ids.length === 0) { setDefaultPerson(updaterName); return; }
      const { data: ps } = await supabase.from('user_profiles').select('id, full_name').in('id', ids);
      const names = (ps || []).map((p: { id: string; full_name: string | null }) => p.full_name || 'Unknown');
      const mine = ids.includes(effectiveUserId || '') ? updaterName : '';
      setDefaultPerson(mine || names[0] || updaterName);
    })();
  }, [firmId, isAll, updaterName]);

  // Rates for the selected firm (newest first)
  useEffect(() => {
    if (!firmId || isAll) { setRates([]); return; }
    supabase.from('fuel_rates')
      .select('fuel_key, rate, cost_price, effective_from, created_by')
      .eq('firm_id', firmId)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data: rows, error }) => {
        if (error) toast.error('Could not load fuel rates');
        setRates((rows as RateRow[]) || []);
      });
  }, [firmId, isAll, ratesKey]);

  // Tank capacities for this firm (saved once per firm, keyed by tank name)
  useEffect(() => {
    if (!firmId || isAll) { setTankCaps({}); return; }
    supabase.from('daily_report_tank_capacity')
      .select('tank_name, capacity_litres')
      .eq('firm_id', firmId)
      .then(({ data: rows, error }) => {
        if (error) { toast.error('Could not load tank capacities'); return; }
        const m: Record<string, string> = {};
        (rows || []).forEach((r: { tank_name: string; capacity_litres: number }) => { m[r.tank_name] = String(r.capacity_litres); });
        setTankCaps(m);
      });
  }, [firmId, isAll]);

  // Load one firm's report for the selected day
  useEffect(() => {
    if (!firmId || isAll) return;
    setLoading(true);
    supabase.from('daily_station_reports')
      .select('data, updated_by, updated_at')
      .eq('firm_id', firmId)
      .eq('report_date', date)
      .maybeSingle()
      .then(({ data: row, error }) => {
        if (error) toast.error('Could not load report');
        setData(normalize(row?.data));
        setMeta(row ? { by: row.updated_by, at: row.updated_at } : null);
        setLoading(false);
      });
  }, [date, firmId]);

  // All-firms view: every selected firm's report for the day
  useEffect(() => {
    if (!isAll || firmIds.length === 0) return;
    setLoading(true);
    supabase.from('daily_station_reports')
      .select('firm_id, data, updated_by, updated_at')
      .in('firm_id', firmIds)
      .eq('report_date', date)
      .then(({ data: rows, error }) => {
        if (error) toast.error('Could not load reports');
        setDayRows((rows as DayRow[]) || []);
        setLoading(false);
      });
  }, [date, firmId, firmIds.join(',')]);

  // Chart buckets for the period that contains the selected date
  const windowBuckets = useMemo(
    () => (period === 'custom' ? customBuckets(customFrom, customTo) : windowFor(parseYmd(chartDate), period)),
    [chartDate, period, customFrom, customTo],
  );
  // Show every x-axis label while there are few buckets; thin them out for long custom ranges
  const xInterval: number | 'preserveStartEnd' = windowBuckets.length > 35 ? 'preserveStartEnd' : 0;
  const customMonthly = period === 'custom'
    && Math.round((parseYmd(customTo).getTime() - parseYmd(customFrom).getTime()) / 86400000) > 92;

  // Saved reports inside that window, for this firm or all firms together
  const loadHistory = useCallback(async () => {
    if (!firmId || firmIds.length === 0) return;
    setHistoryLoading(true);
    const from = windowBuckets[0].start;
    const to = windowBuckets[windowBuckets.length - 1].end;
    let q = supabase.from('daily_station_reports')
      .select('firm_id, report_date, data')
      .gte('report_date', from)
      .lte('report_date', to);
    q = isAll ? q.in('firm_id', firmIds) : q.eq('firm_id', firmId);
    const { data: rows, error } = await q.order('report_date', { ascending: true });
    if (error) toast.error('Could not load trend');
    setHistory((rows as HistoryRow[]) || []);

    const { data: rateRows, error: rateErr } = await supabase
      .from('fuel_rates')
      .select('firm_id, fuel_key, rate, effective_from')
      .in('firm_id', isAll ? firmIds : [firmId])
      .lte('effective_from', to)
      .order('effective_from', { ascending: false });
    if (rateErr) toast.error('Could not load fuel rates for the trend');
    setHistoryRates((rateRows as { firm_id: string; fuel_key: string; rate: number; effective_from: string }[]) || []);
    setHistoryLoading(false);
  }, [windowBuckets, firmId, firmIds.join(',')]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Chart rows: one per bucket, empty buckets included as zero
  const { trendRows, fuelNames, tankNames } = useMemo(() => {
    const names: string[] = [];
    const tankNames: string[] = [];
    type Agg = { cashSale: number; upi: number; paid: number; openByDate: Map<string, number>; cashByDate: Map<string, number>; tankByDate: Map<string, Record<string, number>>; rev: Record<string, number>; lit: Record<string, number> };
    const aggs = new Map<string, Agg>();
    windowBuckets.forEach((b) => aggs.set(b.key, { cashSale: 0, upi: 0, paid: 0, cashByDate: new Map(), openByDate: new Map(), tankByDate: new Map(), rev: {}, lit: {} }));

    history.forEach((row) => {
      const key = keyFor(row.report_date, period, customMonthly);
      const a = aggs.get(key);
      if (!a) return;
      // Fill missing fuel prices with the rate in force on that day (newest rate first in historyRates)
      const nd = normalize(row.data);
      nd.fuels = nd.fuels.map((f) => {
        if (f.price !== '') return f;
        const r = historyRates.find((x) => x.firm_id === row.firm_id && x.fuel_key === f.id && x.effective_from <= row.report_date);
        return { ...f, price: r ? String(r.rate) : '' };
      });
      const s = summarize(nd);
      const dayTanks: Record<string, number> = {};
      nd.tanks.forEach((t) => {
        const n = t.name || '—';
        if (!tankNames.includes(n)) tankNames.push(n);
        dayTanks[n] = num(t.ltr);
      });
      a.tankByDate.set(row.report_date, dayTanks);
      a.cashSale += s.cashSale;
      a.upi += s.upiSale;
      a.paid += s.paid;
      a.cashByDate.set(row.report_date, (a.cashByDate.get(row.report_date) || 0) + s.cashInHand);
      a.openByDate.set(row.report_date, (a.openByDate.get(row.report_date) || 0) + s.openingCash);
      s.fuelRows.forEach((r) => {
        if (!names.includes(r.name)) names.push(r.name);
        a.rev[r.name] = (a.rev[r.name] || 0) + r.revenue;
        a.lit[r.name] = (a.lit[r.name] || 0) + r.litres;
      });
    });

    const rows = windowBuckets.map((b) => {
      const a = aggs.get(b.key)!;
      const latest = Array.from(a.cashByDate.keys()).sort().pop();
      const revenue = Object.values(a.rev).reduce((s, v) => s + v, 0);
      const out: Record<string, number | string> = {
        label: b.label,
        revenue,
        cashSale: a.cashSale,
        upiSale: a.upi,
        // closing cash = cash in hand on the latest saved day in the bucket (summed across firms in all-firms view)
        cashInHand: latest ? a.cashByDate.get(latest) || 0 : 0,
        // opening cash = opening on the earliest saved day in the bucket
        openingCash: (() => { const first = Array.from(a.openByDate.keys()).sort()[0]; return first ? a.openByDate.get(first) || 0 : 0; })(),
        expensesPaid: a.paid,
      };
      // Tank stock: latest saved day in the bucket
      const latestTankDay = Array.from(a.tankByDate.keys()).sort().pop();
      const tankVals = latestTankDay ? a.tankByDate.get(latestTankDay) || {} : {};
      tankNames.forEach((n, i) => { out[`tank${i}`] = tankVals[n] || 0; });
      out.litTotal = Object.values(a.lit).reduce((s, v) => s + v, 0);
      out.hospitalTotal = a.cashSale + a.upi;
      names.forEach((n, i) => {
        out[`rev${i}`] = a.rev[n] || 0;
        out[`lit${i}`] = a.lit[n] || 0;
      });
      return out;
    });
    return { trendRows: rows, fuelNames: names, tankNames };
  }, [history, historyRates, windowBuckets, period, customMonthly]);

  // ----- Save (single firm only) -----
  const save = async () => {
    if (!firmId || isAll) { toast.error('Choose a single firm to save its report'); return; }
    setSaving(true);
    const { error } = await supabase
      .from('daily_station_reports')
      .upsert(
        { firm_id: firmId, report_date: date, data: liveData, updated_by: updaterName || null },
        { onConflict: 'firm_id,report_date' },
      );
    setSaving(false);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    // Save tank capacities for this firm (only tanks with a name and a capacity)
    const capRows = data.tanks
      .filter((t) => t.name.trim() && (tankCaps[t.name] ?? '').trim() !== '')
      .map((t) => ({ firm_id: firmId, tank_name: t.name.trim(), capacity_litres: num(tankCaps[t.name]), updated_by: updaterName || null }));
    if (capRows.length > 0) {
      const { error: capErr } = await supabase
        .from('daily_report_tank_capacity')
        .upsert(capRows, { onConflict: 'firm_id,tank_name' });
      if (capErr) toast.error(`Tank capacity not saved: ${capErr.message}`);
    }
    setMeta({ by: updaterName || null, at: new Date().toISOString() });
    toast.success('Daily report saved');
    loadHistory();
  };

  // ----- Rates -----
  // Open the rate table for editing: every fuel shows its rate in force on the start date
  const startEditRates = () => {
    const draft: Record<string, string> = {};
    const cdraft: Record<string, string> = {};
    data.fuels.forEach((f) => {
      const r = rateFor(f.id, rateDate);
      draft[f.id] = r === null ? '' : String(r);
      const c = costFor(f.id, rateDate);
      cdraft[f.id] = c === null ? '' : String(c);
    });
    setRateDraft(draft);
    setCostDraft(cdraft);
    setEditingRates(true);
  };

  const saveRates = async () => {
    if (!firmId || isAll) { toast.error('Choose a single firm to change rates'); return; }
    const changes: { firm_id: string; fuel_key: string; rate: number; cost_price: number | null; effective_from: string; created_by: string | null }[] = [];
    for (const f of data.fuels) {
      const rawR = (rateDraft[f.id] ?? '').trim();
      const rawC = (costDraft[f.id] ?? '').trim();
      const newRate = rawR === '' ? null : Number(rawR);
      const newCost = rawC === '' ? null : Number(rawC);
      if (newRate !== null && (!Number.isFinite(newRate) || newRate < 0)) { toast.error(`Enter a valid rate for ${f.name}`); return; }
      if (newCost !== null && (!Number.isFinite(newCost) || newCost < 0)) { toast.error(`Enter a valid cost price for ${f.name}`); return; }
      const curRate = rateFor(f.id, rateDate);
      const curCost = costFor(f.id, rateDate);
      if (curRate === null && newRate === null) {
        if (newCost !== null) { toast.error(`Set a sale rate for ${f.name} before its cost price`); return; }
        continue;
      }
      const rateChanged = newRate !== null && (curRate === null || Math.abs(curRate - newRate) >= 0.005);
      const costChanged = newCost !== null && (curCost === null || Math.abs(curCost - newCost) >= 0.005);
      if (!rateChanged && !costChanged) continue;
      changes.push({
        firm_id: firmId,
        fuel_key: f.id,
        rate: newRate ?? (curRate as number),
        cost_price: newCost ?? curCost,
        effective_from: rateDate,
        created_by: updaterName || null,
      });
    }
    if (changes.length === 0) { toast.info('No rate changes to save'); setEditingRates(false); return; }
    const { error } = await supabase.from('fuel_rates').insert(changes);
    if (error) { toast.error(`Could not save rates: ${error.message}`); return; }
    toast.success(`${changes.length} rate${changes.length > 1 ? 's' : ''} saved`);
    setEditingRates(false);
    setRatesKey((k) => k + 1);
  };

  // ----- Updaters -----
  const setFuel = (id: string, patch: Partial<FuelRow>) =>
    setData((d) => ({ ...d, fuels: d.fuels.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  const setTank = (id: string, patch: Partial<Tank>) =>
    setData((d) => ({ ...d, tanks: d.tanks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const setExpense = (id: string, patch: Partial<Expense>) =>
    setData((d) => ({ ...d, expenses: d.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  // Empty capacity = tank capacity - ltr stock
  const tankEmpty = (t: Tank) => num(tankCaps[t.name]) - num(t.ltr);

  const fuelOptions = liveData.fuels.map((f) => <option key={f.id} value={f.id}>{f.name || '—'}</option>);

  // ----- Empty / loading states -----
  if (!firmsLoaded) {
    return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-blue-500" /></div>;
  }

  if (firms.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className={cardCls + ' p-8 text-center'}>
          <Fuel size={32} className="mx-auto text-slate-300 mb-3" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">No firm assigned</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isDirector
              ? 'No firms are in the daily report yet. Add firms under Director Settings → Daily Report.'
              : 'You have not been assigned to any firm\'s daily report. Ask a director to assign you under Director Settings.'}
          </p>
        </div>
      </div>
    );
  }

  // Series for the combined trend chart, by report type
  const fuelBlue = { key: 'revenue', name: 'Fuel revenue', color: '#3b82f6' };
  const combinedSeries = isHospitalSingle
    ? [
      { key: 'cashSale', name: 'Cash sales', color: '#10b981' },
      { key: 'upiSale', name: 'UPI sales', color: '#06b6d4' },
      { key: 'expensesPaid', name: 'Expenses paid', color: '#f59e0b' },
      { key: 'cashInHand', name: 'Cash in hand', color: '#8b5cf6' },
    ]
    : isAll
      ? [
        fuelBlue,
        { key: 'cashSale', name: 'Cash sale', color: '#10b981' },
        { key: 'upiSale', name: 'UPI sale', color: '#06b6d4' },
        { key: 'cashInHand', name: 'Cash in hand', color: '#8b5cf6' },
        { key: 'expensesPaid', name: 'Expenses paid', color: '#f59e0b' },
      ]
      : [
        fuelBlue,
        { key: 'cashSale', name: 'Cash sale', color: '#10b981' },
        { key: 'cashInHand', name: 'Cash in hand', color: '#8b5cf6' },
        { key: 'expensesPaid', name: 'Expenses paid', color: '#f59e0b' },
      ];

  const tiles = isHospitalSingle
    ? [
      { label: 'Total Sales Today', value: fmtMoney(totals.hospitalTotal), sub: 'Cash + UPI' },
      { label: 'Cash Sales', value: fmtMoney(totals.cashSale), sub: 'Cash' },
      { label: 'UPI Sales', value: fmtMoney(totals.upiSale), sub: 'UPI' },
      { label: 'Opening Cash', value: fmtMoney(totals.openingCash), sub: 'Start of day' },
      { label: 'Closing Cash', value: fmtMoney(totals.cashInHand), sub: 'Opening + cash sale' },
      { label: 'Expenses Paid', value: fmtMoney(totals.paid), sub: `Cash ${fmtMoney(totals.cashPaid)} · Online ${fmtMoney(totals.onlinePaid)}` },
    ]
    : [
      { label: 'Capital', value: fmtMoney(totals.capital), sub: 'Cash + portal + stock at cost' },
      { label: 'Revenue Today', value: fmtMoney(totals.revenue), sub: `${fmtNum(totals.litres)} L sold` },
      { label: 'Cash Sale Today', value: fmtMoney(totals.cashSale), sub: 'Cash only' },
      { label: 'Opening Cash', value: fmtMoney(totals.openingCash), sub: 'Start of day' },
      { label: 'Closing Cash', value: fmtMoney(totals.cashInHand), sub: 'Opening + cash sale' },
      { label: 'Expenses Paid', value: fmtMoney(totals.paid), sub: `Cash ${fmtMoney(totals.cashPaid)} · Online ${fmtMoney(totals.onlinePaid)}` },
      { label: 'Balance to Pay', value: fmtMoney(totals.balance), sub: `Total to pay ${fmtMoney(totals.toPay)}` },
    ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Daily Report{firmName ? <span className="text-blue-600 dark:text-blue-400"> · {firmName}</span> : null}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isAll
              ? 'Every firm in the daily report, for the selected day and trend (view only; pick a firm to edit)'
              : 'Litres, revenue, cash and expenses for the day'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Firm</label>
            <select value={firmId} onChange={(e) => setFirmId(e.target.value)} className={inputCls + ' w-56'}>
              {isDirector && firms.length > 1 && <option value={ALL}>All firms (view)</option>}
              {firms.map((f) => <option key={f.id} value={f.id}>{f.name}{f.code ? ` (${f.code})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
              className={inputCls + ' w-44'} />
          </div>
          {!isAll && (
            <button onClick={save} disabled={saving || loading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? 'Saving…' : 'Save Report'}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-500" /></div>
      ) : isAll ? (
        // ---------- All firms (director view) ----------
        <div className={cardCls}>
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Firms on {date}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr>{['Firm', 'Revenue / total sales', 'Litres', 'Cash sale', 'UPI sale', 'Cash in hand', 'Expenses paid', 'Balance to pay', 'Last updated'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {firms.map((f) => {
                  const row = dayRows.find((r) => r.firm_id === f.id);
                  if (!row) {
                    return (
                      <tr key={f.id}>
                        <td className={tdCls + ' font-semibold'}>{f.name}</td>
                        <td colSpan={8} className={tdCls + ' text-slate-400 italic'}>No report saved for this day</td>
                      </tr>
                    );
                  }
                  const s = summarize(normalize(row.data));
                  return (
                    <tr key={f.id}>
                      <td className={tdCls + ' font-semibold'}>{f.name}</td>
                      <td className={tdCls + ' text-right tabular-nums'}>{fmtMoney(f.reportType === 'hospital' ? s.hospitalTotal : s.revenue)}</td>
                      <td className={tdCls + ' text-right tabular-nums'}>{f.reportType === 'hospital' ? '—' : fmtNum(s.litres)}</td>
                      <td className={tdCls + ' text-right tabular-nums'}>{fmtMoney(s.cashSale)}</td>
                      <td className={tdCls + ' text-right tabular-nums'}>{f.reportType === 'hospital' ? fmtMoney(s.upiSale) : '—'}</td>
                      <td className={tdCls + ' text-right tabular-nums'}>{fmtMoney(s.cashInHand)}</td>
                      <td className={tdCls + ' text-right tabular-nums'}>{fmtMoney(s.paid)}</td>
                      <td className={tdCls + ' text-right tabular-nums'}>{fmtMoney(s.balance)}</td>
                      <td className={tdCls + ' text-xs text-slate-500'}>{row.updated_by || '—'}{row.updated_at ? ` · ${fmtTime(row.updated_at)}` : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // ---------- Single firm: entry ----------
        <>
          {meta?.at && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Last updated by <span className="font-semibold">{meta.by || 'Unknown'}</span> on {fmtTime(meta.at)}
            </p>
          )}

          <div className={`grid grid-cols-2 gap-4 ${isHospitalSingle ? 'md:grid-cols-3 xl:grid-cols-6' : 'md:grid-cols-4 xl:grid-cols-7'}`}>
            {tiles.map((t) => (
              <div key={t.label} className={cardCls + ' p-4'}>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t.label}</p>
                <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-1">{t.value}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{t.sub}</p>
              </div>
            ))}
          </div>

          {!isHospitalSingle && (<>
            {/* Fuel: litres sold and revenue (rate comes from the rate table for the date) */}
            <div className={cardCls}>
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Fuel Sales &amp; Stock</h2>
                  <p className="text-[11px] text-slate-500">Rate is set by the manager and applied from its start date. Revenue = litres sold × rate.</p>
                </div>
                <button onClick={() => setData((d) => ({ ...d, fuels: [...d.fuels, { id: uid(), name: 'NEW FUEL', price: '', daySales: '', purchase: '', totalStock: '', costPrice: '' }] }))}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"><Plus size={13} /> Add fuel</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[960px]">
                  <thead>
                    <tr>
                      {['Fuel', 'Rate (₹/L)', 'Litres sold', 'Revenue', 'Purchase (L)', 'Total stock (L)', 'Day +/- (L)'].map((h) => (
                        <th key={h} className={thCls}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {liveData.fuels.map((f) => {
                      const rate = num(f.price);
                      return (
                        <tr key={f.id}>
                          <td className={tdCls}><input className={inputCls + ' font-semibold'} value={f.name} onChange={(e) => setFuel(f.id, { name: e.target.value })} /></td>
                          <td className={tdCls + ' text-right tabular-nums ' + (rate === 0 ? 'text-red-600' : '')}>
                            {rate === 0 ? 'No rate set' : fmtNum(rate)}
                          </td>
                          {/* <td className={tdCls}><input type="number" step="0.01" className={inputCls} value={f.costPrice} onChange={(e) => setFuel(f.id, { costPrice: e.target.value })} /></td> */}
                          <td className={tdCls}><input type="number" step="0.01" className={inputCls} value={f.daySales} onChange={(e) => setFuel(f.id, { daySales: e.target.value })} /></td>
                          <td className={tdCls + ' text-right tabular-nums font-semibold'}>{fmtMoney(num(f.daySales) * rate)}</td>
                          <td className={tdCls}><input type="number" step="0.01" className={inputCls} value={f.purchase} onChange={(e) => setFuel(f.id, { purchase: e.target.value })} /></td>
                          <td className={tdCls}><input type="number" step="0.01" className={inputCls} value={f.totalStock} onChange={(e) => setFuel(f.id, { totalStock: e.target.value })} /></td>
                          <td className={tdCls + ' text-right tabular-nums ' + (num(f.purchase) - num(f.daySales) < 0 ? 'text-red-600' : 'text-emerald-600')}>
                            {fmtNum(num(f.purchase) - num(f.daySales))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 dark:bg-slate-700/50 font-semibold">
                      <td className={tdCls}>Total</td>

                      <td className={tdCls} />
                      <td className={tdCls + ' tabular-nums'}>{fmtNum(totals.litres)}</td>
                      <td className={tdCls + ' text-right tabular-nums'}>{fmtMoney(totals.revenue)}</td>
                      <td className={tdCls + ' tabular-nums'}>{fmtNum(liveData.fuels.reduce((s, f) => s + num(f.purchase), 0))}</td>
                      <td className={tdCls + ' tabular-nums'}>{fmtNum(liveData.fuels.reduce((s, f) => s + num(f.totalStock), 0))}</td>
                      <td className={tdCls} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Portal balance (own section) */}
            <div className={cardCls + ' p-4 space-y-3'}>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Portal Balance</h2>
              <div className="grid grid-cols-2 items-center gap-3">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Portal balance for the day (₹)</label>
                <input type="number" step="0.01" className={inputCls} value={data.portalBalance}
                  onChange={(e) => setData((d) => ({ ...d, portalBalance: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Cash sale and cash in hand (amounts only) */}
              <div className={cardCls + ' p-4 space-y-3'}>
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cash</h2>
                <div className="grid grid-cols-2 items-center gap-3">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">1. Opening cash in hand (₹)</label>
                  <input type="number" step="0.01" className={inputCls} value={data.openingCash}
                    onChange={(e) => setData((d) => ({ ...d, openingCash: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 items-center gap-3">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">2. Cash sale for the day (₹)</label>
                  <input type="number" step="0.01" className={inputCls} value={data.sales.cash}
                    onChange={(e) => setData((d) => ({ ...d, sales: { ...d.sales, cash: e.target.value } }))} />
                </div>
                <div className="grid grid-cols-2 items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <label className="text-xs font-semibold text-slate-800 dark:text-slate-100">3. Closing cash in hand (1 + 2) (₹)</label>
                  <div className={inputCls + ' font-bold tabular-nums bg-slate-50 dark:bg-slate-700/50'}>{fmtNum(totals.cashInHand)}</div>
                </div>
              </div>

              
              {/* Rates: sale rate and cost price, both dated */}
              <div className={cardCls + ' p-4 space-y-3'}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Fuel Rates</h2>
                  {canSetRates && !editingRates && (
                    <button onClick={startEditRates} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">Edit rates</button>
                  )}
                </div>
                {!canSetRates && <p className="text-xs text-slate-500">Only managers can change rates. Current rates are shown below.</p>}
                {canSetRates && editingRates && (
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Applies from</label>
                      <input type="date" className={inputCls + ' w-44'} value={rateDate} onChange={(e) => setRateDate(e.target.value)} />
                    </div>
                    <p className="text-[11px] text-slate-500">Only values you change are saved. Past days keep their rate and cost.</p>
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {(editingRates
                        ? ['Fuel', 'Sale rate (₹/L)', 'Cost price (₹/L)', 'In force: rate / cost (' + rateDate + ')']
                        : ['Fuel', 'Sale rate (₹/L)', 'Cost price (₹/L)', 'Changed on']
                      ).map((h) => <th key={h} className={thCls}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {data.fuels.map((f) => {
                      if (editingRates) {
                        const inRate = rateFor(f.id, rateDate);
                        const inCost = costFor(f.id, rateDate);
                        return (
                          <tr key={f.id}>
                            <td className={tdCls + ' font-semibold'}>{f.name}</td>
                            <td className={tdCls}>
                              <input type="number" step="0.01" min="0" className={inputCls} value={rateDraft[f.id] ?? ''}
                                onChange={(e) => setRateDraft((d) => ({ ...d, [f.id]: e.target.value }))} />
                            </td>
                            <td className={tdCls}>
                              <input type="number" step="0.01" min="0" className={inputCls} value={costDraft[f.id] ?? ''}
                                onChange={(e) => setCostDraft((d) => ({ ...d, [f.id]: e.target.value }))} />
                            </td>
                            <td className={tdCls + ' tabular-nums text-xs text-slate-500'}>
                              {inRate === null ? 'Rate not set' : fmtNum(inRate)} / {inCost === null ? 'cost not set' : fmtNum(inCost)}
                            </td>
                          </tr>
                        );
                      }
                      const current = rateFor(f.id, date);
                      const cost = costFor(f.id, date);
                      const row = rates.find((r) => r.fuel_key === f.id && r.effective_from <= date);
                      return (
                        <tr key={f.id}>
                          <td className={tdCls + ' font-semibold'}>{f.name}</td>
                          <td className={tdCls + ' tabular-nums'}>{current === null ? <span className="text-red-600">Not set</span> : fmtNum(current)}</td>
                          <td className={tdCls + ' tabular-nums'}>{cost === null ? <span className="text-slate-400">Not set</span> : fmtNum(cost)}</td>
                          <td className={tdCls + ' text-xs text-slate-500'}>{row ? row.effective_from : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {canSetRates && editingRates && (
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setEditingRates(false)} className="text-xs font-semibold border border-slate-300 text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-lg">Cancel</button>
                    <button onClick={saveRates} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg">Save rates</button>
                  </div>
                )}
              </div>
            </div>

            {/* Tanks */}
            <div className={cardCls}>
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Tank Stock</h2>
                  <p className="text-[11px] text-slate-500">Rename a tank (e.g. "Tank 1 MS") and pick its fuel.</p>
                </div>
                <button onClick={() => setData((d) => ({ ...d, tanks: [...d.tanks, { id: uid(), name: `Tank ${d.tanks.length + 1}`, fuel: d.fuels[0]?.id || 'ms', dip: '', ltr: '' }] }))}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"><Plus size={13} /> Add tank</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr>{['Tank', 'Fuel', 'Dip reading (ft)', 'Ltr stock', 'Tank capacity (L)', 'Empty capacity (L)', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {data.tanks.map((t) => (
                      <tr key={t.id}>
                        <td className={tdCls}><input className={inputCls} value={t.name} onChange={(e) => setTank(t.id, { name: e.target.value })} /></td>
                        <td className={tdCls}>
                          <select className={inputCls} value={t.fuel} onChange={(e) => setTank(t.id, { fuel: e.target.value })}>{fuelOptions}</select>
                        </td>
                        <td className={tdCls}><input type="number" step="0.01" className={inputCls} value={t.dip} onChange={(e) => setTank(t.id, { dip: e.target.value })} /></td>
                        <td className={tdCls}><input type="number" step="0.01" className={inputCls} value={t.ltr} onChange={(e) => setTank(t.id, { ltr: e.target.value })} /></td>
                        <td className={tdCls}>
                          <input type="number" step="0.01" min="0" className={inputCls} value={tankCaps[t.name] ?? ''} disabled={!t.name.trim() || isAll}
                            onChange={(e) => setTankCaps((c) => ({ ...c, [t.name]: e.target.value }))} />
                        </td>
                        <td className={tdCls + ' text-right tabular-nums font-semibold ' + (tankCaps[t.name] ? (tankEmpty(t) < 0 ? 'text-red-600' : 'text-emerald-600') : 'text-slate-400')}>
                          {tankCaps[t.name] ? fmtNum(tankEmpty(t)) : '—'}
                        </td>
                        <td className={tdCls}>
                          <button onClick={() => setData((d) => ({ ...d, tanks: d.tanks.filter((x) => x.id !== t.id) }))} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </>)}

          {/* Hospital: day sales split into cash and UPI, with cash in hand */}
          {isHospitalSingle && (
            <div className={cardCls + ' p-4 space-y-3'}>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Sales &amp; Cash</h2>
              <div className="grid grid-cols-2 items-center gap-3">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Cash sales for the day (₹)</label>
                <input type="number" step="0.01" className={inputCls} value={data.sales.cash}
                  onChange={(e) => setData((d) => ({ ...d, sales: { ...d.sales, cash: e.target.value } }))} />
              </div>
              <div className="grid grid-cols-2 items-center gap-3">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">UPI sales for the day (₹)</label>
                <input type="number" step="0.01" className={inputCls} value={data.sales.upi}
                  onChange={(e) => setData((d) => ({ ...d, sales: { ...d.sales, upi: e.target.value } }))} />
              </div>
              <div className="grid grid-cols-2 items-center gap-3">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Total sales (₹)</label>
                <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{fmtMoney(totals.hospitalTotal)}</p>
              </div>
              <div className="grid grid-cols-2 items-center gap-3">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Opening cash in hand (₹)</label>
                <input type="number" step="0.01" className={inputCls} value={data.openingCash}
                  onChange={(e) => setData((d) => ({ ...d, openingCash: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-100">Closing cash in hand (opening + cash sales) (₹)</label>
                <div className={inputCls + ' font-bold tabular-nums bg-slate-50 dark:bg-slate-700/50'}>{fmtNum(totals.cashInHand)}</div>
              </div>
            </div>
          )}

          {/* Expenses: same records as the Expense Centre (see note at the bottom) */}
          <div className={cardCls}>
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Expenses</h2>
                <p className="text-[11px] text-slate-500">New lines are added under {defaultPerson || 'the assigned editor'}. Enter the amount paid, the amount still to pay, and a note (for example, bank details).</p>
              </div>
              <button onClick={() => setData((d) => ({ ...d, expenses: [...d.expenses, { id: uid(), purpose: '', paidTo: '', amount: '', toPay: '', mode: 'cash', note: '', enteredBy: defaultPerson }] }))}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"><Plus size={13} /> Add expense</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1000px]">
                <thead>
                  <tr>{['Purpose', 'Paid to', 'Amount paid', 'Amount to pay', 'Balance', 'Paid by', 'Note', 'Entered by', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {data.expenses.map((e) => (
                    <tr key={e.id}>
                      <td className={tdCls}><input className={inputCls} value={e.purpose} onChange={(ev) => setExpense(e.id, { purpose: ev.target.value })} /></td>
                      <td className={tdCls}><input className={inputCls} value={e.paidTo} onChange={(ev) => setExpense(e.id, { paidTo: ev.target.value })} /></td>
                      <td className={tdCls}><input type="number" step="0.01" className={inputCls} value={e.amount} onChange={(ev) => setExpense(e.id, { amount: ev.target.value })} /></td>
                      <td className={tdCls}><input type="number" step="0.01" className={inputCls} value={e.toPay} onChange={(ev) => setExpense(e.id, { toPay: ev.target.value })} /></td>
                      <td className={tdCls + ' text-right tabular-nums ' + (Math.max(num(e.toPay) - num(e.amount), 0) > 0 ? 'text-red-600' : 'text-emerald-600')}>
                        {fmtMoney(Math.max(num(e.toPay) - num(e.amount), 0))}
                      </td>
                      <td className={tdCls}>
                        <select className={inputCls} value={e.mode} onChange={(ev) => setExpense(e.id, { mode: ev.target.value as 'cash' | 'online' })}>
                          <option value="cash">Cash</option>
                          <option value="online">Online</option>
                        </select>
                      </td>
                      <td className={tdCls}><input className={inputCls} value={e.note} onChange={(ev) => setExpense(e.id, { note: ev.target.value })} /></td>
                      <td className={tdCls}><input className={inputCls} value={e.enteredBy} onChange={(ev) => setExpense(e.id, { enteredBy: ev.target.value })} /></td>
                      <td className={tdCls}>
                        <button onClick={() => setData((d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== e.id) }))} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                  {data.expenses.length === 0 && (
                    <tr><td colSpan={9} className={tdCls + ' text-center text-slate-400 italic'}>No expenses for this day</td></tr>
                  )}
                </tbody>
                {data.expenses.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 dark:bg-slate-700/50 font-semibold">
                      <td className={tdCls} colSpan={2}>Total</td>
                      <td className={tdCls + ' text-right tabular-nums'}>{fmtMoney(totals.paid)}</td>
                      <td className={tdCls + ' text-right tabular-nums'}>{fmtMoney(totals.toPay)}</td>
                      <td className={tdCls + ' text-right tabular-nums'}>{fmtMoney(totals.balance)}</td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* Charts: buckets for the period containing the selected date */}
      <div className={cardCls + ' p-5'}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-indigo-500" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Trend{isAll ? ' · all firms' : ''} · {PERIODS.find((p) => p.id === period)?.label}
              </h2>
              <p className="text-xs text-slate-500">
                {windowBuckets[0] && windowBuckets[windowBuckets.length - 1]
                  ? `${windowBuckets[0].start} to ${windowBuckets[windowBuckets.length - 1].end}`
                  : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {period === 'custom' ? (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">From</label>
                  <input type="date" value={customFrom} onChange={(e) => e.target.value && setCustomFrom(e.target.value)}
                    className={inputCls + ' w-44'} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">To</label>
                  <input type="date" value={customTo} onChange={(e) => e.target.value && setCustomTo(e.target.value)}
                    className={inputCls + ' w-44'} />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Chart date</label>
                <input type="date" value={chartDate} onChange={(e) => e.target.value && setChartDate(e.target.value)}
                  className={inputCls + ' w-44'} />
              </div>
            )}
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
              {PERIODS.map((p) => (
                <button key={p.id} onClick={() => setPeriod(p.id)}
                  className={'px-3 py-1.5 text-xs font-semibold ' + (period === p.id ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700')}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {historyLoading ? (
          <div className="flex justify-center h-64 items-center"><Loader2 className="animate-spin text-indigo-500" /></div>
        ) : (
          <div className="space-y-6">
            {isAll ? (<>
              <div>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Revenue, cash and expenses</p>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={trendRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={0} barCategoryGap="15%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={xInterval} angle={-45} textAnchor="end" height={64} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${Number(v) >= 1000 ? (Number(v) / 1000).toFixed(0) + 'k' : v}`} />
                    <Tooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {combinedSeries.map((s) => (
                      <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={24} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {!isHospitalSingle && (
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Revenue by fuel (₹)</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={trendRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={0} barCategoryGap="15%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={xInterval} angle={-45} textAnchor="end" height={64} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${Number(v) >= 1000 ? (Number(v) / 1000).toFixed(0) + 'k' : v}`} />
                        <Tooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {fuelNames.map((n, i) => (
                          <Bar key={`rev${i}`} dataKey={`rev${i}`} name={n} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={20} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Litres sold by fuel (L)</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={trendRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={0} barCategoryGap="15%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={xInterval} angle={-45} textAnchor="end" height={64} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: number) => `${fmtNum(v)} L`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {fuelNames.map((n, i) => (
                          <Bar key={`lit${i}`} dataKey={`lit${i}`} name={n} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={20} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </>) : (<>
              {isHospitalSingle ? (<>
                <div>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Cash sales and UPI sales (bars), total sales (line)</p>
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={trendRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={0} barCategoryGap="15%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={xInterval} angle={-45} textAnchor="end" height={64} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${Number(v) >= 1000 ? (Number(v) / 1000).toFixed(0) + 'k' : v}`} />
                      <Tooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="cashSale" name="Cash sales" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={40} />
                      <Bar dataKey="upiSale" name="UPI sales" fill="#06b6d4" radius={[3, 3, 0, 0]} maxBarSize={40} />
                      <Line type="monotone" dataKey="hospitalTotal" name="Total sales" stroke="#1e293b" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Expenses paid (line)</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={trendRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={xInterval} angle={-45} textAnchor="end" height={64} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${Number(v) >= 1000 ? (Number(v) / 1000).toFixed(0) + 'k' : v}`} />
                      <Tooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="expensesPaid" name="Expenses paid" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>) : (<>
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Opening cash and cash sale (bars), closing cash (line)</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <ComposedChart data={trendRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={0} barCategoryGap="15%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={xInterval} angle={-45} textAnchor="end" height={64} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${Number(v) >= 1000 ? (Number(v) / 1000).toFixed(0) + 'k' : v}`} />
                        <Tooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="openingCash" name="Opening cash" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={40} />
                        <Bar dataKey="cashSale" name="Cash sale" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={40} />
                        <Line type="monotone" dataKey="cashInHand" name="Closing cash" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Expenses paid (line)</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={trendRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={xInterval} angle={-45} textAnchor="end" height={64} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${Number(v) >= 1000 ? (Number(v) / 1000).toFixed(0) + 'k' : v}`} />
                        <Tooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="expensesPaid" name="Expenses paid" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Litres sold by fuel (bars), total litres (line)</p>
                    <ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={trendRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={0} barCategoryGap="15%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={xInterval} angle={-45} textAnchor="end" height={64} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: number) => `${fmtNum(v)} L`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {fuelNames.map((n, i) => (
                          <Bar key={`lit${i}`} dataKey={`lit${i}`} name={n} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={24} />
                        ))}
                        <Line type="monotone" dataKey="litTotal" name="Total litres" stroke="#1e293b" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Revenue by fuel (bars), total revenue (line)</p>
                    <ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={trendRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={0} barCategoryGap="15%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={xInterval} angle={-45} textAnchor="end" height={64} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${Number(v) >= 1000 ? (Number(v) / 1000).toFixed(0) + 'k' : v}`} />
                        <Tooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {fuelNames.map((n, i) => (
                          <Bar key={`rev${i}`} dataKey={`rev${i}`} name={n} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={24} />
                        ))}
                        <Line type="monotone" dataKey="revenue" name="Total revenue" stroke="#1e293b" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Tank stock (litres, latest saved day in each period)</p>
                  {tankNames.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-10 text-center">No tank readings saved in this period yet</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={trendRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={0} barCategoryGap="15%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={xInterval} angle={-45} textAnchor="end" height={64} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: number) => `${fmtNum(v)} L`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {tankNames.map((n, i) => (
                          <Bar key={`tank${i}`} dataKey={`tank${i}`} name={n} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={24} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </>)}
            </>)}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Fuel and tank names can be changed at any time. Rates are set by managers and apply from the date chosen; past days keep the rate they were saved with.
      </p>
    </div>
  );
}