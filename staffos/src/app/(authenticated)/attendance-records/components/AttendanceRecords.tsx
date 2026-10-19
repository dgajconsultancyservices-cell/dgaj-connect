'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, CheckCircle2, XCircle, ChevronLeft, Loader2, Calendar, Pencil, ChevronDown, ChevronUp, Filter, RefreshCw, Plus, X, Download, User, Users, BarChart2, List, CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { toast, Toaster } from 'sonner';
import {
  AttendanceStatus, LeaveMap, HolidayMap, pad2, toDateStr, dayHours, resolveDayStatus,
  buildHolidayMap, buildLeaveMap, computePeriodStats, loadWeeklyOffByUser, weeklyOffOf,
} from '@/lib/attendanceCalendar';

type CorrectionStatus = 'pending' | 'approved' | 'rejected';

interface AttendanceRecord {
  id: string;
  user_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: AttendanceStatus;
  total_hours: number;
  overtime_hours: number;
  notes: string;
  is_auto_checkout?: boolean;
  user_profiles?: { full_name: string; department: string };
}

interface AttendanceCorrection {
  id: string;
  attendance_record_id: string | null;
  user_id: string;
  work_date: string;
  requested_clock_in: string | null;
  requested_clock_out: string | null;
  requested_status: 'present' | 'half_day' | null;
  reason: string;
  status: CorrectionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string;
  created_at: string;
  user_profiles?: { full_name: string; department: string };
}

interface CorrectionForm {
  attendance_record_id: string;
  work_date: string;
  requested_clock_in: string;
  requested_clock_out: string;
  requested_status: 'present' | 'half_day' | '';
  reason: string;
}

interface UserMonthlyHours {
  user_id: string;
  full_name: string;
  department: string;
  total_hours: number;
  overtime_hours: number;
  present_days: number;   // worked days (present, late, half day, WFH) on working days
  working_days: number;   // company calendar working days for the month
  absent_days: number;
  late_days: number;
  avg_hours_per_day: number;
}

const statusConfig: Record<AttendanceStatus, { label: string; color: string; dot: string }> = {
  present:       { label: 'Present',       color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  absent:        { label: 'Absent',        color: 'text-red-700 bg-red-50 border-red-200',             dot: 'bg-red-500' },
  late:          { label: 'Late',          color: 'text-amber-700 bg-amber-50 border-amber-200',       dot: 'bg-amber-500' },
  half_day:      { label: 'Half Day',      color: 'text-blue-700 bg-blue-50 border-blue-200',          dot: 'bg-blue-500' },
  work_from_home:{ label: 'WFH',           color: 'text-sky-700 bg-sky-50 border-sky-200',             dot: 'bg-sky-500' },
  holiday:       { label: 'Holiday',       color: 'text-purple-700 bg-purple-50 border-purple-200',    dot: 'bg-purple-500' },
  weekend:       { label: 'Weekend',       color: 'text-slate-500 bg-slate-50 border-slate-200',       dot: 'bg-slate-400' },
  paid_leave:    { label: 'Paid Leave',    color: 'text-teal-700 bg-teal-50 border-teal-200',          dot: 'bg-teal-500' },
  unpaid_leave:  { label: 'Unpaid Leave',  color: 'text-orange-700 bg-orange-50 border-orange-200',    dot: 'bg-orange-500' },
};

const correctionStatusConfig: Record<CorrectionStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending:  { label: 'Pending',  color: 'text-amber-600 bg-amber-50 border-amber-200',     icon: Clock        },
  approved: { label: 'Approved', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'text-red-600 bg-red-50 border-red-200',           icon: XCircle      },
};

function formatTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}


// ---------------------------------------------------------------------------
// Holiday / leave aware status resolution
//
// The attendance_records table can hold an auto-generated 'absent' row for a
// day that is really a company holiday or an approved leave day (for example
// when the holiday was added after the row was generated). Whatever is stored,
// we never SHOW such a day as absent:
//   worked day (present/late/half_day/wfh) ........ always wins
//   absent row, no clock-in, on a company holiday .. Holiday
//   absent row, no clock-in, on approved leave ..... Paid / Unpaid Leave
//   no row at all ................................... Holiday > Leave > Weekend
// ---------------------------------------------------------------------------
export default function AttendanceRecords() {
  const { user, effectiveUserId, pinSession } = useAuth();
  const supabase = createClient();

  const [profile, setProfile] = useState<any>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [corrections, setCorrections] = useState<AttendanceCorrection[]>([]);
  const [userMonthlyHours, setUserMonthlyHours] = useState<UserMonthlyHours[]>([]);
  const [holidayMap, setHolidayMap] = useState<HolidayMap>({});                       // 'YYYY-MM-DD' -> holiday name
  const [leaveMap, setLeaveMap] = useState<LeaveMap>({});                             // 'userId|YYYY-MM-DD' -> leave
  const [weeklyOffByUser, setWeeklyOffByUser] = useState<Record<string, number[]>>({}); // userId -> weekly off days (from their firm)
  const [historyView, setHistoryView] = useState<'list' | 'calendar'>('calendar');
  // List scope: 'mine' (default for everyone) or 'team' (managers/directors/executives only)
  const [historyScope, setHistoryScope] = useState<'mine' | 'team'>('mine');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'history' | 'corrections' | 'team-corrections' | 'monthly-hours'>('history');
  const [monthFilter, setMonthFilter] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionForm, setCorrectionForm] = useState<CorrectionForm>({
    attendance_record_id: '',
    work_date: '',
    requested_clock_in: '',
    requested_clock_out: '',
    requested_status: '',
    reason: '',
  });
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [expandedCorrection, setExpandedCorrection] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(null);
  const [showOvertimeModal, setShowOvertimeModal] = useState(false);
  const [overtimeForm, setOvertimeForm] = useState({ work_date: '', overtime_hours: '', notes: '' });
  const [submittingOvertime, setSubmittingOvertime] = useState(false);

  const isManager = profile?.role === 'manager' || profile?.role === 'director' || profile?.role === 'executive'
    || pinSession?.role === 'manager' || pinSession?.role === 'director' || pinSession?.role === 'executive';

  const fetchProfile = useCallback(async () => {
    const uid = effectiveUserId;
    if (!uid) return;
    const { data } = await supabase.from('user_profiles').select('*').eq('id', uid).single();
    setProfile(data);
  }, [effectiveUserId]);

  const fetchRecords = useCallback(async () => {
    const uid = effectiveUserId;
    if (!uid) return;
    setLoading(true);
    try {
      // Lazy backfill: fills in absent/paid_leave/unpaid_leave for any past
      // working day with no attendance row yet. Cheap and safe to call on
      // every page load (see mark_absent_for_date's own guards) — this is
      // what actually makes "auto-absent" happen without needing a
      // guaranteed midnight cron on every Supabase plan.
      supabase.rpc('mark_absent_bulk', { p_days_back: 31 }).then(() => {});

      const [year, month] = monthFilter.split('-');
      const startDate = `${year}-${month}-01`;
      const endDate = toDateStr(new Date(parseInt(year), parseInt(month), 0));

      // Determine manager status from both profile and pinSession to avoid stale closure
      const managerFromPin = pinSession?.role === 'manager' || pinSession?.role === 'director' || pinSession?.role === 'executive';
      const managerFromProfile = profile?.role === 'manager' || profile?.role === 'director' || profile?.role === 'executive';
      const canSeeAll = managerFromPin || managerFromProfile;

      let query = supabase
        .from('attendance_records')
        .select('*, user_profiles!attendance_records_user_id_fkey(full_name, department)')
        .gte('work_date', startDate)
        .lte('work_date', endDate)
        .order('work_date', { ascending: false });

      // Employees always see only their own records. Managers/directors see only
      // their own unless they switch the List scope to "Team Records".
      if (!canSeeAll || historyScope === 'mine') {
        query = query.eq('user_id', uid);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRecords(data || []);

      // Company holidays for the month (apply to everyone)
      const { data: hols } = await supabase
        .from('company_holidays')
        .select('name, holiday_date')
        .gte('holiday_date', startDate)
        .lte('holiday_date', endDate);
      setHolidayMap(buildHolidayMap(hols || []));

      // Leave overlapping the month: approved leave replaces auto-absent,
      // pending leave is kept so the calendar can hint at it.
      let leaveQuery = supabase
        .from('leave_requests')
        .select('user_id, leave_type, start_date, end_date, status')
        .in('status', ['approved', 'pending'])
        .lte('start_date', endDate)
        .gte('end_date', startDate);
      if (!canSeeAll) leaveQuery = leaveQuery.eq('user_id', uid);
      const { data: leaves } = await leaveQuery;
      setLeaveMap(buildLeaveMap((leaves || []) as any[], startDate, endDate));
    } catch (err: any) {
      toast.error('Failed to load attendance records: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, monthFilter, profile, pinSession, historyScope]);

  const fetchCorrections = useCallback(async () => {
    const uid = effectiveUserId;
    if (!uid) return;
    try {
      if (activeTab === 'team-corrections' && isManager) {
        const { data, error } = await supabase
          .from('attendance_corrections')
          .select('*, user_profiles!attendance_corrections_user_id_fkey(full_name, department)')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setCorrections(data || []);
      } else {
        const { data, error } = await supabase
          .from('attendance_corrections')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setCorrections(data || []);
      }
    } catch (err: any) {
      toast.error('Failed to load correction requests');
    }
  }, [effectiveUserId, activeTab, isManager]);

  const fetchUserMonthlyHours = useCallback(async () => {
    if (!isManager) return;
    try {
      const [year, month] = monthFilter.split('-');
      const startDate = `${year}-${month}-01`;
      const endDate = toDateStr(new Date(parseInt(year), parseInt(month), 0));

      const { data, error } = await supabase
        .from('attendance_records')
        .select('user_id, work_date, clock_in, total_hours, overtime_hours, status, user_profiles!attendance_records_user_id_fkey(full_name, department)')
        .gte('work_date', startDate)
        .lte('work_date', endDate);

      if (error) throw error;

      // Aggregate per user. Working days come from the company calendar, and
      // present / absent / late are counted on those working days only, the same
      // way the employee's own cards and Payroll count them.
      const rowsByUser: Record<string, any[]> = {};
      const profileByUser: Record<string, any> = {};
      (data || []).forEach((r: any) => {
        (rowsByUser[r.user_id] ||= []).push(r);
        profileByUser[r.user_id] ||= r.user_profiles;
      });

      // Company holidays and leave for the month, for everyone in the team view
      const [{ data: hols }, { data: leaves }] = await Promise.all([
        supabase.from('company_holidays').select('name, holiday_date').gte('holiday_date', startDate).lte('holiday_date', endDate),
        supabase.from('leave_requests').select('user_id, leave_type, start_date, end_date, status')
          .in('status', ['approved', 'pending']).lte('start_date', endDate).gte('end_date', startDate),
      ]);
      const hMap = buildHolidayMap(hols || []);
      const lMap = buildLeaveMap((leaves || []) as any[], startDate, endDate);
      const woMap = await loadWeeklyOffByUser(supabase, Object.keys(rowsByUser));

      const rows: UserMonthlyHours[] = Object.keys(rowsByUser).map((uid) => {
        const recs = rowsByUser[uid];
        const stats = computePeriodStats({ userId: uid, startDate, endDate, records: recs, holidayMap: hMap, leaveMap: lMap, weeklyOff: weeklyOffOf(woMap, uid) });
        return {
          user_id: uid,
          full_name: profileByUser[uid]?.full_name || 'Unknown',
          department: profileByUser[uid]?.department || '—',
          total_hours: recs.reduce((s, r) => s + dayHours(r), 0),          // working hours incl. overtime
          overtime_hours: recs.reduce((s, r) => s + (Number(r.overtime_hours) || 0), 0),
          present_days: stats.workedDays,
          working_days: stats.workingDays,
          absent_days: stats.absentDays,
          late_days: stats.lateDays,
          avg_hours_per_day: stats.avgHoursPerWorkedDay,
        };
      });

      setUserMonthlyHours(rows.sort((a, b) => b.total_hours - a.total_hours));
    } catch (err: any) {
      toast.error('Failed to load monthly hours data');
    }
  }, [isManager, monthFilter]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);
  useEffect(() => { fetchRecords(); }, [fetchRecords]);
  // Weekly off days for the signed-in employee and everyone shown in the records
  useEffect(() => {
    const ids = Array.from(new Set([effectiveUserId || '', ...records.map((r) => r.user_id)].filter(Boolean)));
    if (ids.length === 0) return;
    loadWeeklyOffByUser(supabase, ids).then((m) => setWeeklyOffByUser((prev) => ({ ...prev, ...m })));
  }, [records, effectiveUserId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab !== 'history') fetchCorrections(); }, [fetchCorrections, activeTab]);
  useEffect(() => { if (activeTab === 'monthly-hours') fetchUserMonthlyHours(); }, [fetchUserMonthlyHours, activeTab]);

  const openCorrectionModal = (record?: AttendanceRecord) => {
    setCorrectionForm({
      attendance_record_id: record?.id || '',
      work_date: record?.work_date || '',
      requested_clock_in: record?.clock_in ? new Date(record.clock_in).toISOString().slice(0, 16) : '',
      requested_clock_out: record?.clock_out ? new Date(record.clock_out).toISOString().slice(0, 16) : '',
      requested_status: '',
      reason: '',
    });
    setShowCorrectionModal(true);
  };

  const submitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = effectiveUserId;
    if (!uid) return;
    if (!correctionForm.work_date) { toast.error('Please select the date'); return; }
    if (!correctionForm.reason.trim()) { toast.error('Please provide a reason'); return; }
    if (!correctionForm.requested_status && !correctionForm.requested_clock_in && !correctionForm.requested_clock_out) {
      toast.error('Choose Full Day or Half Day, or provide a corrected clock-in/out time');
      return;
    }

    setSubmittingCorrection(true);
    try {
      const payload: any = {
        user_id: uid,
        attendance_record_id: correctionForm.attendance_record_id || null,
        work_date: correctionForm.work_date,
        requested_clock_in: correctionForm.requested_clock_in ? new Date(correctionForm.requested_clock_in).toISOString() : null,
        requested_clock_out: correctionForm.requested_clock_out ? new Date(correctionForm.requested_clock_out).toISOString() : null,
        requested_status: correctionForm.requested_status || null,
        reason: correctionForm.reason.trim(),
        status: 'pending',
      };

      const { error } = await supabase.from('attendance_corrections').insert(payload);
      if (error) throw error;
      toast.success('Correction request submitted successfully');
      setShowCorrectionModal(false);
      setCorrectionForm({ attendance_record_id: '', work_date: '', requested_clock_in: '', requested_clock_out: '', requested_status: '', reason: '' });
      fetchCorrections();
      setActiveTab('corrections');
    } catch (err: any) {
      toast.error('Failed to submit: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmittingCorrection(false);
    }
  };

  // Approver can pick Present/Half Day themselves before approving — defaults
  // to whatever the employee requested, but the manager/director isn't stuck
  // with it.
  const [approvalStatusChoice, setApprovalStatusChoice] = useState<Record<string, 'present' | 'half_day' | ''>>({});

  const handleApproveCorrection = async (correctionId: string, correction: AttendanceCorrection) => {
    const uid = effectiveUserId;
    if (!uid) return;
    const finalStatus = approvalStatusChoice[correctionId] ?? correction.requested_status ?? '';
    try {
      const { error: corrError } = await supabase
        .from('attendance_corrections')
        .update({ status: 'approved', reviewed_by: uid, reviewed_at: new Date().toISOString() })
        .eq('id', correctionId);
      if (corrError) throw corrError;

      const updates: any = { updated_at: new Date().toISOString() };
      if (correction.requested_clock_in) updates.clock_in = correction.requested_clock_in;
      if (correction.requested_clock_out) updates.clock_out = correction.requested_clock_out;
      if (correction.requested_clock_in && correction.requested_clock_out) {
        const diffMs = new Date(correction.requested_clock_out).getTime() - new Date(correction.requested_clock_in).getTime();
        updates.total_hours = Math.max(0, Math.round((diffMs / 3600000) * 100) / 100);
      }
      // The whole point of the status choice: actually flip the attendance
      // record to Present/Half Day, not just adjust times. Previously this
      // never happened at all — approving did nothing to the day's status.
      if (finalStatus) updates.status = finalStatus;

      if (correction.attendance_record_id) {
        await supabase.from('attendance_records').update(updates).eq('id', correction.attendance_record_id);
      } else {
        // No existing row for this date (shouldn't normally happen since
        // auto-absent always creates one, but handle it defensively) —
        // create it so the approval still takes effect.
        await supabase.from('attendance_records').upsert(
          { user_id: correction.user_id, work_date: correction.work_date, status: finalStatus || 'present', is_manual_entry: true, ...updates },
          { onConflict: 'user_id,work_date' }
        );
      }

      toast.success('Correction approved and applied');
      fetchCorrections();
      fetchRecords();
    } catch (err: any) {
      toast.error('Failed to approve: ' + (err.message || 'Unknown error'));
    }
  };

  const handleRejectCorrection = async () => {
    const uid = effectiveUserId;
    if (!rejectModal || !uid) return;
    if (!rejectModal.reason.trim()) { toast.error('Please provide a rejection reason'); return; }
    try {
      const { error } = await supabase
        .from('attendance_corrections')
        .update({
          status: 'rejected',
          reviewed_by: uid,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectModal.reason.trim(),
        })
        .eq('id', rejectModal.id);
      if (error) throw error;
      toast.success('Correction rejected');
      setRejectModal(null);
      fetchCorrections();
    } catch (err: any) {
      toast.error('Failed to reject: ' + (err.message || 'Unknown error'));
    }
  };

  // Records as they should be DISPLAYED / COUNTED: an auto-generated absent on a
  // holiday or approved-leave day becomes Holiday / Leave.
  const effectiveRecords = useMemo(
    () => records.map((r) => {
      const st = resolveDayStatus(r.user_id, String(r.work_date).slice(0, 10), r, holidayMap, leaveMap, weeklyOffOf(weeklyOffByUser, r.user_id));
      return st && st !== r.status ? { ...r, status: st } : r;
    }),
    [records, holidayMap, leaveMap, weeklyOffByUser],
  );

  // The signed-in employee's own days, keyed by date, for the calendar view
  const ownRecordsByDate = useMemo(() => {
    const m: Record<string, AttendanceRecord> = {};
    const uid = effectiveUserId;
    effectiveRecords.forEach((r) => { if (r.user_id === uid) m[String(r.work_date).slice(0, 10)] = r; });
    return m;
  }, [effectiveRecords, effectiveUserId]);
  const [filterYearForStats, filterMonthForStats] = monthFilter.split('-').map(Number);

  // Summary stats
  // The cards always describe the signed-in person's own month. In Team Records
  // mode `effectiveRecords` holds everyone's rows, so using it here mixed the team
  // into one person's totals.
  const ownRecords = useMemo(
    () => effectiveRecords.filter((r) => r.user_id === effectiveUserId),
    [effectiveRecords, effectiveUserId],
  );
  const presentDays = ownRecords.filter(r => r.status === 'present' || r.status === 'work_from_home').length;
  const paidLeaveDays = ownRecords.filter(r => r.status === 'paid_leave').length;
  const unpaidLeaveDays = ownRecords.filter(r => r.status === 'unpaid_leave').length;
  // Past working days with no attendance row at all are absent too (employee view only —
  // for managers the list mixes many people, so we can't know who is missing)
  const missingAbsentDays = isManager ? 0 : Array.from({ length: new Date(filterYearForStats, filterMonthForStats, 0).getDate() }).filter((_, i) => {
    const ds = `${filterYearForStats}-${pad2(filterMonthForStats)}-${pad2(i + 1)}`;
    return !ownRecordsByDate[ds] && resolveDayStatus(effectiveUserId || '', ds, undefined, holidayMap, leaveMap, weeklyOffOf(weeklyOffByUser, effectiveUserId || '')) === 'absent';
  }).length;
  const absentDays = ownRecords.filter(r => r.status === 'absent').length + missingAbsentDays;
  const lateDays = ownRecords.filter(r => r.status === 'late').length;
  const halfDays = ownRecords.filter(r => r.status === 'half_day').length;
  const totalHours = ownRecords.reduce((sum, r) => sum + dayHours(r), 0); // regular + overtime
  const totalOvertime = ownRecords.reduce((sum, r) => sum + (r.overtime_hours || 0), 0);
  const autoCheckouts = ownRecords.filter(r => (r as any).is_auto_checkout).length;

  const [filterYear, filterMonth] = monthFilter.split('-').map(Number);
  const daysInMonth = new Date(filterYear, filterMonth, 0).getDate();
  const monthStart = `${filterYear}-${pad2(filterMonth)}-01`;
  const monthEnd = toDateStr(new Date(filterYear, filterMonth, 0));
  // Working days come from the company calendar: weekends and company holidays
  // (including weekly-off rows) are excluded.
  const periodStats = computePeriodStats({
    userId: effectiveUserId || '',
    startDate: monthStart,
    endDate: monthEnd,
    records: ownRecords,
    holidayMap,
    leaveMap,
    weeklyOff: weeklyOffOf(weeklyOffByUser, effectiveUserId || ''),
  });
  const workingDaysInMonth = periodStats.workingDays;

  const avgDailyHours = periodStats.avgHoursPerWorkedDay;
  const attendancePct = workingDaysInMonth > 0 ? Math.round(((presentDays + paidLeaveDays) / workingDaysInMonth) * 100) : 0;

  const submitOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = effectiveUserId;
    if (!uid) return;
    if (!overtimeForm.work_date) { toast.error('Please select a date'); return; }
    if (!overtimeForm.overtime_hours || parseFloat(overtimeForm.overtime_hours) <= 0) { toast.error('Please enter valid overtime hours'); return; }
    setSubmittingOvertime(true);
    try {
      const { data: existing } = await supabase
        .from('attendance_records')
        .select('id, overtime_hours')
        .eq('user_id', uid)
        .eq('work_date', overtimeForm.work_date)
        .maybeSingle();

      const newOT = parseFloat(overtimeForm.overtime_hours);

      if (existing) {
        // Overtime only adds hours — it never changes the day's status
        const updates: any = {
          overtime_hours: (existing.overtime_hours || 0) + newOT,
          updated_at: new Date().toISOString(),
        };
        if (overtimeForm.notes) updates.notes = overtimeForm.notes;
        const { error } = await supabase.from('attendance_records').update(updates).eq('id', existing.id);
        if (error) throw error;
      } else {
        // No row yet: store the day's TRUE status instead of forcing 'present'
        // (holiday / weekend / approved leave / otherwise absent until a clock-in exists).
        const d = overtimeForm.work_date;
        const [y, m, dd] = d.split('-').map(Number);
        const dow = new Date(y, m - 1, dd).getDay();
        const { data: hol } = await supabase.from('company_holidays').select('id').eq('holiday_date', d).maybeSingle();
        const { data: lv } = await supabase
          .from('leave_requests')
          .select('leave_type')
          .eq('user_id', uid)
          .eq('status', 'approved')
          .lte('start_date', d)
          .gte('end_date', d)
          .limit(1)
          .maybeSingle();
        let status: AttendanceStatus = 'absent';
        if (hol) status = 'holiday';
        else if (weeklyOffOf(weeklyOffByUser, uid).includes(dow)) status = 'weekend';
        else if (lv) status = /unpaid|lop|loss/i.test(String(lv.leave_type || '')) ? 'unpaid_leave' : 'paid_leave';

        // Today/future working day with no clock-in: nothing to attach overtime to yet
        if (status === 'absent' && d >= toDateStr(new Date())) {
          toast.error('No attendance yet for this working day. Log overtime after you clock in, or pick a past date.');
          return;
        }

        const { error } = await supabase
          .from('attendance_records')
          .insert({
            user_id: uid,
            work_date: d,
            status,
            overtime_hours: newOT,
            total_hours: 0,
            notes: overtimeForm.notes || '',
          });
        if (error) throw error;
      }

      toast.success(`Overtime of ${newOT}h logged for ${overtimeForm.work_date}`);
      setShowOvertimeModal(false);
      setOvertimeForm({ work_date: '', overtime_hours: '', notes: '' });
      fetchRecords();
    } catch (err: any) {
      toast.error('Failed to log overtime: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmittingOvertime(false);
    }
  };

  const exportMonthlyHours = () => {
    if (userMonthlyHours.length === 0) { toast.error('No data to export'); return; }
    const headers = ['Employee', 'Department', 'Total Hours (incl. OT)', 'Overtime Hours', 'Present Days', 'Absent Days', 'Late Days'];
    const rows = userMonthlyHours.map(u => [
      u.full_name,
      u.department,
      u.total_hours.toFixed(2),
      u.overtime_hours.toFixed(2),
      String(u.present_days),
      String(u.absent_days),
      String(u.late_days),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monthly_hours_${monthFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Monthly hours exported');
  };

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <Toaster richColors position="top-right" />

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/employee-dashboard" className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
          <ChevronLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-700 text-slate-900">Attendance Records</h1>
          <p className="text-xs text-slate-500 mt-0.5">Daily clock-in/out history &amp; corrections</p>
        </div>
        <button
          onClick={() => setShowOvertimeModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-600 transition-colors"
          title="Log Overtime"
        >
          <Plus size={14} />
          Log Overtime
        </button>
        <button
          onClick={() => {
            if (effectiveRecords.length === 0) { toast.error('No records to export'); return; }
            const rows = effectiveRecords.map(r => ({
              Employee: r.user_profiles?.full_name || r.user_id,
              Department: r.user_profiles?.department || '',
              Date: r.work_date,
              Status: r.status,
              'Clock In': r.clock_in ? new Date(r.clock_in).toLocaleTimeString('en-IN') : '',
              'Clock Out': r.clock_out ? new Date(r.clock_out).toLocaleTimeString('en-IN') : '',
              'Regular Hours': r.total_hours || 0,
              'Working Hours (incl. OT)': dayHours(r),
              'Overtime Hours': r.overtime_hours || 0,
              Notes: r.notes || '',
            }));
            const headers = Object.keys(rows[0]);
            const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${String((r as any)[h] ?? '')}"`).join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `attendance_${monthFilter}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success(`Exported ${rows.length} records`);
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-600 transition-colors"
          title="Download Monthly Report"
        >
          <Download size={14} />
          Download
        </button>
        <button
          onClick={() => { fetchRecords(); fetchCorrections(); if (activeTab === 'monthly-hours') fetchUserMonthlyHours(); }}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-5">
        {[
          { label: 'Present', value: paidLeaveDays > 0 ? `${presentDays} + ${paidLeaveDays}` : presentDays, sublabel: paidLeaveDays > 0 ? '(paid leave)' : undefined, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
          { label: 'Absent', value: absentDays, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
          { label: 'Unpaid Leave', value: unpaidLeaveDays, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
          { label: 'Late', value: lateDays, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
          { label: 'Half Days', value: halfDays, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
          { label: 'Total Hours', sublabel: '(incl. OT)', value: `${totalHours.toFixed(1)}h`, color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' },
          { label: 'Avg/Day', value: `${avgDailyHours.toFixed(1)}h`, color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
          { label: 'Overtime', value: `${totalOvertime.toFixed(1)}h`, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
        ].map((kpi) => (
          <div key={kpi.label} className={`rounded-xl border p-3 ${kpi.bg}`}>
            <p className={`text-xl font-700 tabular-nums ${kpi.color}`}>{kpi.value}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{kpi.label} {kpi.sublabel && <span className="text-slate-400">{kpi.sublabel}</span>}</p>
          </div>
        ))}
      </div>

      {/* Attendance percentage + auto-checkout info */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-4 py-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
            <span className="text-xs font-700 text-emerald-700">{attendancePct}%</span>
          </div>
          <div>
            <p className="text-xs font-600 text-slate-700">Attendance Rate</p>
            <p className="text-[11px] text-slate-400">{presentDays} of {workingDaysInMonth} working days</p>
          </div>
        </div>
        {autoCheckouts > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 rounded-xl border border-amber-200 px-4 py-2.5">
            <Clock size={16} className="text-amber-600" />
            <div>
              <p className="text-xs font-600 text-amber-700">{autoCheckouts} Auto Check-Out{autoCheckouts !== 1 ? 's' : ''}</p>
              <p className="text-[11px] text-amber-600">System closed attendance automatically</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
        {[
          { id: 'history', label: 'History', icon: Calendar },
          { id: 'corrections', label: 'My Corrections', icon: Pencil },
          ...(isManager ? [
            { id: 'team-corrections', label: 'Team Corrections', icon: Users },
            { id: 'monthly-hours', label: 'Monthly Hours', icon: BarChart2 },
          ] : []),
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-500 transition-all ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Who the History list shows: managers and directors switch between their own and the team's records here */}
      {isManager && activeTab === 'history' && (
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-xl p-1 w-fit">
          {(['mine', 'team'] as const).map((scope) => (
            <button
              key={scope}
              onClick={() => setHistoryScope(scope)}
              className={`px-4 py-2 rounded-lg text-sm font-500 transition-all ${historyScope === scope ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {scope === 'mine' ? 'My Records' : 'Team Records'}
            </button>
          ))}
        </div>
      )}
      </div>

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card">
          <div className="flex items-center gap-3 p-4 border-b border-slate-100">
            <Filter size={15} className="text-slate-400" />
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
              {([
                { id: 'calendar', label: 'Calendar', icon: CalendarDays },
                { id: 'list', label: 'List', icon: List },
              ] as const).map((v) => (
                <button
                  key={v.id}
                  onClick={() => setHistoryView(v.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-500 transition-all ${historyView === v.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <v.icon size={12} />{v.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => openCorrectionModal()}
              className="ml-auto btn-ghost border border-slate-200 text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <Plus size={13} />
              Request Correction
            </button>
          </div>

          {historyView === 'calendar' && !loading && (
            <div className="p-4 border-b border-slate-100">
              {isManager && (
                <p className="text-[11px] text-slate-400 mb-2">Calendar always shows your own attendance. In List view, choose Team Records to see the whole team.</p>
              )}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="text-center text-[10px] font-600 text-slate-400 uppercase tracking-wider py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: new Date(filterYear, filterMonth - 1, 1).getDay() }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${filterYear}-${pad2(filterMonth)}-${pad2(day)}`;
                  const rec = ownRecordsByDate[dateStr];
                  const uid = effectiveUserId || '';
                  const st = resolveDayStatus(uid, dateStr, rec, holidayMap, leaveMap, weeklyOffOf(weeklyOffByUser, uid));
                  const cfg = st ? statusConfig[st] : null;
                  const pendingLeave = leaveMap[`${uid}|${dateStr}`]?.pending;
                  const isToday = dateStr === toDateStr(new Date());
                  return (
                    <div
                      key={dateStr}
                      title={holidayMap[dateStr] || (cfg ? cfg.label : 'No record')}
                      className={`min-h-[68px] rounded-lg border p-1.5 flex flex-col ${cfg ? cfg.color : 'text-slate-300 bg-white border-slate-100'} ${isToday ? 'ring-2 ring-blue-500' : ''}`}
                    >
                      <span className="text-[11px] font-700">{day}</span>
                      {st === 'holiday' && holidayMap[dateStr] ? (
                        <span className="text-[10px] font-600 leading-tight mt-0.5 line-clamp-2">{holidayMap[dateStr]}</span>
                      ) : cfg ? (
                        <span className="text-[10px] font-600 leading-tight mt-0.5">{cfg.label}</span>
                      ) : null}
                      {rec && dayHours(rec) > 0 && (
                        <span className="text-[10px] mt-auto opacity-80">{dayHours(rec).toFixed(1)}h{rec.overtime_hours > 0 ? ` (+${rec.overtime_hours}h OT)` : ''}</span>
                      )}
                      {st === 'absent' && pendingLeave && (
                        <span className="text-[9px] mt-auto text-orange-600 font-600">Leave pending</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
                {(['present', 'late', 'half_day', 'work_from_home', 'absent', 'paid_leave', 'unpaid_leave', 'holiday', 'weekend'] as AttendanceStatus[]).map((k) => (
                  <span key={k} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className={`w-2 h-2 rounded-full ${statusConfig[k].dot}`} />{statusConfig[k].label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-slate-400 mb-3" />
              <p className="text-sm text-slate-400">Loading attendance records…</p>
            </div>
          ) : historyView === 'calendar' ? null : effectiveRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Calendar size={32} className="mb-3 opacity-50" />
              <p className="text-sm font-500">No attendance records for this month</p>
              <p className="text-xs mt-1">Records appear once you clock in or your manager logs attendance</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {effectiveRecords.map((record) => {
                const cfg = statusConfig[record.status];
                return (
                  <div key={record.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      {/* Show employee name only when viewing team records */}
                      {isManager && historyScope === 'team' && record.user_profiles?.full_name && (
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <User size={11} className="text-slate-400" />
                          <p className="text-xs font-600 text-slate-700">{record.user_profiles.full_name}
                            {record.user_profiles.department && (
                              <span className="text-slate-400 font-400 ml-1">· {record.user_profiles.department}</span>
                            )}
                          </p>
                        </div>
                      )}
                      <p className="text-sm font-500 text-slate-900">{formatDate(record.work_date)}</p>
                      {record.notes && <p className="text-xs text-slate-400 truncate mt-0.5">{record.notes}</p>}
                    </div>
                    <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {formatTime(record.clock_in)}
                      </span>
                      <span>→</span>
                      <span>{formatTime(record.clock_out)}</span>
                      {dayHours(record) > 0 && (
                        <span className="font-600 text-indigo-600">{dayHours(record).toFixed(1)}h{record.overtime_hours > 0 && <span className="text-orange-600 font-500 ml-1">(incl. {record.overtime_hours}h OT)</span>}</span>
                      )}
                    </div>
                    <span className={`text-[11px] font-600 px-2 py-1 rounded-full border ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <button
                      onClick={() => openCorrectionModal(record)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-blue-600"
                      title="Request correction"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* My Corrections Tab */}
      {activeTab === 'corrections' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-slate-500">{corrections.length} correction request{corrections.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => openCorrectionModal()}
              className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
            >
              <Plus size={13} />
              New Request
            </button>
          </div>

          {corrections.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-card flex flex-col items-center justify-center py-12 text-slate-400">
              <Pencil size={28} className="mb-3 opacity-50" />
              <p className="text-sm font-500">No correction requests yet</p>
              <p className="text-xs mt-1">Submit a request if your clock-in/out time is incorrect</p>
            </div>
          ) : (
            corrections.map((corr) => {
              const cfg = correctionStatusConfig[corr.status];
              const StatusIcon = cfg.icon;
              const isExpanded = expandedCorrection === corr.id;
              return (
                <div key={corr.id} className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
                  <button
                    onClick={() => setExpandedCorrection(isExpanded ? null : corr.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left"
                  >
                    <StatusIcon size={16} className={cfg.color.split(' ')[0]} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-500 text-slate-900">{formatDate(corr.work_date)}</p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{corr.reason}</p>
                    </div>
                    <span className={`text-[11px] font-600 px-2 py-1 rounded-full border ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    {isExpanded ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />}
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-slate-400 mb-0.5">Requested Clock-In</p>
                          <p className="font-500 text-slate-700">{formatTime(corr.requested_clock_in)}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 mb-0.5">Requested Clock-Out</p>
                          <p className="font-500 text-slate-700">{formatTime(corr.requested_clock_out)}</p>
                        </div>
                      </div>
                      {corr.status === 'rejected' && corr.rejection_reason && (
                        <div className="p-2.5 bg-red-50 rounded-lg border border-red-200">
                          <p className="text-xs text-red-700"><span className="font-600">Rejection reason:</span> {corr.rejection_reason}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Team Corrections Tab (Manager) */}
      {activeTab === 'team-corrections' && isManager && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 mb-2">{corrections.filter(c => c.status === 'pending').length} pending approval{corrections.filter(c => c.status === 'pending').length !== 1 ? 's' : ''}</p>

          {corrections.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-card flex flex-col items-center justify-center py-12 text-slate-400">
              <CheckCircle2 size={28} className="mb-3 opacity-50" />
              <p className="text-sm font-500">No correction requests from team</p>
            </div>
          ) : (
            corrections.map((corr) => {
              const cfg = correctionStatusConfig[corr.status];
              const StatusIcon = cfg.icon;
              const isExpanded = expandedCorrection === corr.id;
              return (
                <div key={corr.id} className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
                  <button
                    onClick={() => setExpandedCorrection(isExpanded ? null : corr.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left"
                  >
                    <StatusIcon size={16} className={cfg.color.split(' ')[0]} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-500 text-slate-900">
                        {corr.user_profiles?.full_name || 'Employee'}
                        <span className="text-slate-400 font-400 ml-2 text-xs">{corr.user_profiles?.department}</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{formatDate(corr.work_date)} · {corr.reason}</p>
                    </div>
                    <span className={`text-[11px] font-600 px-2 py-1 rounded-full border ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    {isExpanded ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-slate-400 mb-0.5">Requested Clock-In</p>
                          <p className="font-500 text-slate-700">{formatTime(corr.requested_clock_in)}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 mb-0.5">Requested Clock-Out</p>
                          <p className="font-500 text-slate-700">{formatTime(corr.requested_clock_out)}</p>
                        </div>
                      </div>
                      {corr.requested_status && (
                        <div>
                          <p className="text-slate-400 mb-0.5 text-xs">Requested Day Status</p>
                          <p className="font-500 text-slate-700 text-xs">{corr.requested_status === 'present' ? 'Full Day' : 'Half Day'}</p>
                        </div>
                      )}
                      {corr.status === 'pending' && (
                        <div>
                          <p className="text-slate-400 mb-1 text-xs">Approve as (you can change this)</p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {([
                              ['', 'No status change'],
                              ['present', 'Full Day'],
                              ['half_day', 'Half Day'],
                            ] as const).map(([val, label]) => {
                              const current = approvalStatusChoice[corr.id] ?? corr.requested_status ?? '';
                              return (
                                <button
                                  key={label}
                                  type="button"
                                  onClick={() => setApprovalStatusChoice((prev) => ({ ...prev, [corr.id]: val }))}
                                  className={`text-[11px] font-600 px-2 py-1.5 rounded-lg border transition-colors ${
                                    current === val
                                      ? 'bg-blue-600 border-blue-600 text-white'
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {corr.status === 'pending' && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => handleApproveCorrection(corr.id, corr)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-600 transition-colors"
                          >
                            <CheckCircle2 size={13} />
                            Approve
                          </button>
                          <button
                            onClick={() => setRejectModal({ id: corr.id, reason: '' })}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-600 transition-colors"
                          >
                            <XCircle size={13} />
                            Reject
                          </button>
                        </div>
                      )}
                      {corr.status === 'rejected' && corr.rejection_reason && (
                        <div className="p-2.5 bg-red-50 rounded-lg border border-red-200">
                          <p className="text-xs text-red-700"><span className="font-600">Rejection reason:</span> {corr.rejection_reason}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Monthly Hours Per User Tab (Manager) */}
      {activeTab === 'monthly-hours' && isManager && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={exportMonthlyHours}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-600 transition-colors"
            >
              <Download size={14} />
              Export CSV
            </button>
            <button onClick={fetchUserMonthlyHours} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
              <RefreshCw size={16} />
            </button>
          </div>

          {userMonthlyHours.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-12 text-slate-400">
              <BarChart2 size={32} className="mb-3 opacity-50" />
              <p className="text-sm font-500">No attendance data for this month</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <Users size={15} className="text-slate-400" />
                <h3 className="text-sm font-600 text-slate-800">Monthly Attendance Hours per Employee</h3>
                <span className="ml-auto text-xs text-slate-400">{userMonthlyHours.length} employees</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                      <th className="text-left px-5 py-3 font-medium">Employee</th>
                      <th className="text-left px-4 py-3 font-medium">Department</th>
                      <th className="text-right px-4 py-3 font-medium">Total Hours (incl. OT)</th>
                      <th className="text-right px-4 py-3 font-medium">Overtime</th>
                      <th className="text-right px-4 py-3 font-medium">Present</th>
                      <th className="text-right px-4 py-3 font-medium">Absent</th>
                      <th className="text-right px-4 py-3 font-medium">Late</th>
                      <th className="text-right px-4 py-3 font-medium">Avg/Day</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {userMonthlyHours.map((u) => (
                      <tr key={u.user_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-700 text-indigo-700">{u.full_name.charAt(0).toUpperCase()}</span>
                            </div>
                            <p className="font-500 text-slate-800">{u.full_name}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{u.department}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-700 text-indigo-700">{u.total_hours.toFixed(1)}h</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-600 ${u.overtime_hours > 0 ? 'text-orange-600' : 'text-slate-400'}`}>
                            {u.overtime_hours.toFixed(1)}h
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-600 text-emerald-600">{u.present_days}</span>
                          <span className="text-[11px] text-slate-400"> / {u.working_days}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-600 ${u.absent_days > 0 ? 'text-red-600' : 'text-slate-400'}`}>{u.absent_days}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-600 ${u.late_days > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{u.late_days}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-600 text-purple-700">{u.present_days > 0 ? `${u.avg_hours_per_day.toFixed(1)}h` : '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td colSpan={2} className="px-5 py-3 text-xs font-700 text-slate-600">TOTAL</td>
                      <td className="px-4 py-3 text-right font-700 text-indigo-700">
                        {userMonthlyHours.reduce((s, u) => s + u.total_hours, 0).toFixed(1)}h
                      </td>
                      <td className="px-4 py-3 text-right font-700 text-orange-600">
                        {userMonthlyHours.reduce((s, u) => s + u.overtime_hours, 0).toFixed(1)}h
                      </td>
                      <td className="px-4 py-3 text-right font-700 text-emerald-600">
                        {userMonthlyHours.reduce((s, u) => s + u.present_days, 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-700 text-red-600">
                        {userMonthlyHours.reduce((s, u) => s + u.absent_days, 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-700 text-amber-600">
                        {userMonthlyHours.reduce((s, u) => s + u.late_days, 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-400">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Correction Request Modal */}
      {showCorrectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCorrectionModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-700 text-slate-900">Request Attendance Correction</h3>
              <button onClick={() => setShowCorrectionModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <form onSubmit={submitCorrection} className="space-y-4">
              <div>
                <label className="block text-sm font-600 text-slate-700 mb-1.5">Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={correctionForm.work_date}
                  onChange={(e) => setCorrectionForm((prev) => ({ ...prev, work_date: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-600 text-slate-700 mb-1.5">Mark this day as</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['', 'Just fix time'],
                    ['present', 'Full Day'],
                    ['half_day', 'Half Day'],
                  ] as const).map(([val, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setCorrectionForm((prev) => ({ ...prev, requested_status: val }))}
                      className={`text-xs font-600 px-3 py-2 rounded-lg border transition-colors ${
                        correctionForm.requested_status === val
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Pick Full Day or Half Day for a day you were auto-marked absent — or just fix your clock-in/out time below.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-600 text-slate-700 mb-1.5">Correct Clock-In</label>
                  <input
                    type="datetime-local"
                    value={correctionForm.requested_clock_in}
                    onChange={(e) => setCorrectionForm((prev) => ({ ...prev, requested_clock_in: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-600 text-slate-700 mb-1.5">Correct Clock-Out</label>
                  <input
                    type="datetime-local"
                    value={correctionForm.requested_clock_out}
                    onChange={(e) => setCorrectionForm((prev) => ({ ...prev, requested_clock_out: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-600 text-slate-700 mb-1.5">Reason <span className="text-red-500">*</span></label>
                <textarea
                  value={correctionForm.reason}
                  onChange={(e) => setCorrectionForm((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder="Explain why the correction is needed..."
                  rows={3}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCorrectionModal(false)} className="flex-1 btn-ghost border border-slate-200 text-sm py-2.5">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCorrection}
                  className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {submittingCorrection && <Loader2 size={14} className="animate-spin" />}
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRejectModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-700 text-slate-900 mb-4">Reject Correction</h3>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal((prev) => prev ? { ...prev, reason: e.target.value } : null)}
              placeholder="Reason for rejection..."
              rows={3}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setRejectModal(null)} className="flex-1 btn-ghost border border-slate-200 text-sm py-2.5">Cancel</button>
              <button
                onClick={handleRejectCorrection}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-600 py-2.5 rounded-lg transition-colors"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overtime Modal */}
      {showOvertimeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowOvertimeModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-700 text-slate-900">Log Overtime Hours</h3>
              <button onClick={() => setShowOvertimeModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">Log your own overtime hours. No director approval needed.</p>
            <form onSubmit={submitOvertime} className="space-y-4">
              <div>
                <label className="block text-sm font-600 text-slate-700 mb-1.5">Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={overtimeForm.work_date}
                  onChange={(e) => setOvertimeForm((p) => ({ ...p, work_date: e.target.value }))}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-600 text-slate-700 mb-1.5">Overtime Hours <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="12"
                  value={overtimeForm.overtime_hours}
                  onChange={(e) => setOvertimeForm((p) => ({ ...p, overtime_hours: e.target.value }))}
                  placeholder="e.g. 2.5"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-600 text-slate-700 mb-1.5">Notes (optional)</label>
                <textarea
                  value={overtimeForm.notes}
                  onChange={(e) => setOvertimeForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="What did you work on during overtime?"
                  rows={2}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowOvertimeModal(false)} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-600 text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOvertime}
                  className="flex-1 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {submittingOvertime && <Loader2 size={14} className="animate-spin" />}
                  Log Overtime
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}