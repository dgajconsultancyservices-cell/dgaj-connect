'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, Plus, Download, Search, X, Loader2, Edit2, Eye, Lock, RefreshCw } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useVisibleFirms } from '@/lib/useVisibleFirms';
import FirmFilterTabs from '@/components/FirmFilterTabs';
import FirmBadge from '@/components/FirmBadge';
import { buildHolidayMap, buildLeaveMap, computePeriodStats, loadWeeklyOffByUser, weeklyOffOf, computeMonthlyPay, fullMonthsRange, type MonthlyPayBreakdown } from '@/lib/attendanceCalendar';

interface PayrollRecord {
  id: string;
  user_id: string;
  pay_period_start: string;
  pay_period_end: string;
  basic_salary: number;
  hra: number;
  transport_allowance: number;
  other_allowances: number;
  gross_salary: number;
  pf_deduction: number;
  esi_deduction: number;
  tds_deduction: number;
  other_deductions: number;
  total_deductions: number;
  net_salary: number;
  days_worked: number;
  days_absent: number;
  overtime_hours: number;
  overtime_pay: number;
  bonus: number;
  working_days?: number | null;
  per_day_salary?: number | null;
  amount_payable?: number | null;
  deduction_per_absent_day?: number | null;
  total_deducted?: number | null;
  approved_by?: string | null;
  approved_at?: string | null;
  advance_deduction: number;
  leave_deduction: number;
  status: string;
  payment_date: string | null;
  payment_method: string;
  notes: string;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
  employee?: { full_name: string; department: string; job_title: string; firm_id?: string | null };
}

interface SalaryStructure {
  id: string;
  user_id: string;
  basic_salary: number;
  hra_percent: number;
  transport_allowance: number;
  other_allowances: number;
  pf_percent: number;
  esi_percent: number;
  tds_percent: number;
  effective_from: string;
}

interface UserProfile {
  id: string;
  full_name: string;
  department: string;
  job_title: string;
  role: string;
  firm_id?: string | null;
}

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  processed: { label: 'Processed', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  paid: { label: 'Paid', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
};

function formatCurrency(amount: number): string {
  return `₹${(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getMonthYear(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function PayrollPage() {
  const { effectiveUserId, pinSession } = useAuth();
  const supabase = createClient();

  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [salaryStructures, setSalaryStructures] = useState<SalaryStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('employee');
  const [activeTab, setActiveTab] = useState<'payslips' | 'salary-structures' | 'process'>('payslips');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [showSalaryModal, setShowSalaryModal] = useState<UserProfile | null>(null);
  const [processing, setProcessing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Month-by-month pay from attendance (null when the form was typed by hand)
  const [payBreakdown, setPayBreakdown] = useState<MonthlyPayBreakdown | null>(null);
  const [processForm, setProcessForm] = useState({
    user_id: '',
    pay_period_start: '',
    pay_period_end: '',
    total_salary: '',
    working_days: '',
    days_present: '',
    days_absent: '',
    deduction_per_absent_day: '1000',
    avg_hours_per_day: '',
    overtime_hours: '',
    overtime_pay: '',
    bonus: '',
    other_deduction: '',
    notes: '',
    payment_method: 'bank_transfer',
  });
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [autoFilling, setAutoFilling] = useState(false);

  const [salaryForm, setSalaryForm] = useState({
    basic_salary: '',
    hra_percent: '40',
    transport_allowance: '0',
    other_allowances: '0',
    pf_percent: '12',
    esi_percent: '0.75',
    tds_percent: '0',
  });

  const isDirectorOrManager = userRole === 'director' || userRole === 'manager' || userRole === 'executive';
  const [firmFilter, setFirmFilter] = useState<'all' | string>('all');
  const { firms: visibleFirms } = useVisibleFirms();

  useEffect(() => {
    if (!effectiveUserId) return;
    init();
  }, [effectiveUserId]);

  const init = async () => {
    setLoading(true);
    try {
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', effectiveUserId!).single();
      const role = profile?.role || 'employee';
      setUserRole(role);

      const isManager = role === 'director' || role === 'manager' || role === 'executive';

      // SECURITY: a manager must only ever see payroll for firms they're
      // actually allowed to see (their own firm, plus subsidiaries only if
      // their own firm is a holding/parent firm). Without this, any manager
      // at ANY firm saw every firm's payroll records — including the
      // holding company's, regardless of hierarchy direction.
      let visibleFirmIds: string[] | null = null;
      if (isManager) {
        const { data: idsData } = await supabase.rpc('get_visible_firm_ids', {
          p_user_id: effectiveUserId!,
          p_module: 'all',
        });
        visibleFirmIds = idsData || [];
      }

      let recordsQuery = isManager
        ? supabase.from('payroll_records').select('*, employee:user_profiles!payroll_records_user_id_fkey(full_name, department, job_title, firm_id)').order('pay_period_start', { ascending: false })
        : supabase.from('payroll_records').select('*, employee:user_profiles!payroll_records_user_id_fkey(full_name, department, job_title, firm_id)').eq('user_id', effectiveUserId!).order('pay_period_start', { ascending: false });
      let usersQueryBase = isManager
        ? supabase.from('user_profiles').select('id, full_name, department, job_title, role, firm_id').order('full_name')
        : Promise.resolve({ data: [] });
      let structuresQuery = isManager
        ? supabase.from('salary_structures').select('*')
        : supabase.from('salary_structures').select('*').eq('user_id', effectiveUserId!);

      if (isManager && visibleFirmIds) {
        recordsQuery = recordsQuery.in('firm_id', visibleFirmIds);
        usersQueryBase = supabase.from('user_profiles').select('id, full_name, department, job_title, role, firm_id').in('firm_id', visibleFirmIds).order('full_name');
        structuresQuery = structuresQuery.in('firm_id', visibleFirmIds);
      }

      const [recordsRes, usersRes, structuresRes] = await Promise.all([
        recordsQuery,
        usersQueryBase,
        structuresQuery,
      ]);

      setRecords(recordsRes.data || []);
      setUsers(usersRes.data || []);
      setSalaryStructures(structuresRes.data || []);
    } catch (err) {
      toast.error('Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  };

  const getSalaryStructure = (userId: string): SalaryStructure | null => {
    return salaryStructures.find(s => s.user_id === userId) || null;
  };

  // total salary for an employee = their full monthly structure (basic + HRA + transport + other allowances)
  const getTotalMonthlySalary = (structure: SalaryStructure) =>
    structure.basic_salary + structure.basic_salary * (structure.hra_percent / 100) + structure.transport_allowance + structure.other_allowances;

  // Per-day salary = total salary / working days (holidays & weekly-off already excluded
  // by attendance_summary_for_period when working_days was fetched). Live-recalculated
  // any time an input changes — this is a pure function of the current form state.
  // Prorated pay: per-day salary x days present. Deduction is whatever is not paid,
  // so Total Deducted and Total To Be Paid always agree with Amount Payable.
  // Overtime pay and bonus are added on top; other deduction (manual) is taken off.
  // Total Deducted = unpaid salary + other deduction, so the figures always agree:
  // Total To Be Paid = Total Salary − Total Deducted + Overtime Pay + Bonus.
  const computeSimplePayroll = (
    totalSalary: number,
    workingDays: number,
    daysPresent: number,
    overtimePay = 0,
    bonus = 0,
    otherDeduction = 0,
    earnedFromMonths?: number, // month-by-month amount (each month at its own per-day rate)
  ) => {
    const perDaySalary = workingDays > 0 ? totalSalary / workingDays : 0;
    const amountPayable = earnedFromMonths ?? perDaySalary * daysPresent;
    const unpaidSalary = Math.max(0, totalSalary - Math.max(0, amountPayable));
    const totalDeducted = unpaidSalary + Math.max(0, otherDeduction);
    const totalToPay = Math.max(0, amountPayable + Math.max(0, overtimePay) + Math.max(0, bonus) - Math.max(0, otherDeduction));
    return { perDaySalary, amountPayable, totalDeducted, totalToPay };
  };

  // Live preview for whatever is currently in the form (create or edit) —
  // recomputes on every render from current form state, so editing any field
  // instantly updates the totals shown to the manager.
  const livePreview = computeSimplePayroll(
    parseFloat(processForm.total_salary) || 0,
    parseFloat(processForm.working_days) || 0,
    parseFloat(processForm.days_present) || 0,
    parseFloat(processForm.overtime_pay) || 0,
    parseFloat(processForm.bonus) || 0,
    parseFloat(processForm.other_deduction) || 0,
    payBreakdown?.amountPayable,
  );
  const hourlyRate = livePreview.perDaySalary > 0 ? livePreview.perDaySalary / 8 : 0;

  // Auto-fill working days / days present / days absent from actual attendance
  // for the selected employee + period, plus their total salary from their
  // salary structure. Only runs when creating a new payslip — editing an
  // existing one keeps whatever was saved (and lets the manager override it).
  const autoFillFromAttendance = async (userId: string, start: string, end: string) => {
    if (!userId || !start || !end) return;
    setAutoFilling(true);
    try {
      const structure = getSalaryStructure(userId);

      // Same company-calendar rules as the Attendance Records tab: working days =
      // weekdays minus company holidays (weekly-off rows included); present = worked
      // days on working days; paid leave is payable; absent = past working days with
      // no work and no approved leave.
      // Holidays cover the WHOLE calendar months, because each month's per-day rate uses its full working days
      const fullRange = fullMonthsRange(start, end);
      const [{ data: hols }, { data: att }, { data: leaves }] = await Promise.all([
        supabase.from('company_holidays').select('name, holiday_date').gte('holiday_date', fullRange.start).lte('holiday_date', fullRange.end),
        supabase.from('attendance_records')
          .select('work_date, status, clock_in, total_hours, overtime_hours')
          .eq('user_id', userId).gte('work_date', start).lte('work_date', end),
        supabase.from('leave_requests')
          .select('user_id, leave_type, start_date, end_date, status')
          .eq('user_id', userId).in('status', ['approved', 'pending'])
          .lte('start_date', end).gte('end_date', start),
      ]);
      const weeklyOffMap = await loadWeeklyOffByUser(supabase, [userId]);
      const stats = computePeriodStats({
        userId,
        startDate: start,
        endDate: end,
        records: (att || []) as any[],
        holidayMap: buildHolidayMap(hols || []),
        leaveMap: buildLeaveMap((leaves || []) as any[], start, end),
        weeklyOff: weeklyOffOf(weeklyOffMap, userId),
      });
      // Month by month: each calendar month's monthly salary / its own working days x days in the period
      const pay = computeMonthlyPay({
        userId,
        startDate: start,
        endDate: end,
        monthlySalary: structure ? getTotalMonthlySalary(structure) : 0,
        records: (att || []) as any[],
        holidayMap: buildHolidayMap(hols || []),
        leaveMap: buildLeaveMap((leaves || []) as any[], start, end),
        weeklyOff: weeklyOffOf(weeklyOffMap, userId),
      });
      const overtimeTotal = (att || []).reduce((s: number, r: any) => s + Number(r.overtime_hours || 0), 0);

      setPayBreakdown(structure ? pay : null);
      setProcessForm(p => ({
        ...p,
        total_salary: structure ? String(Math.round(pay.salaryForPeriod * 100) / 100) : p.total_salary,
        working_days: String(pay.workingDays),
        days_present: String(pay.daysPresent),
        days_absent: String(pay.daysAbsent),
        avg_hours_per_day: stats.workedDays > 0 ? stats.avgHoursPerWorkedDay.toFixed(2) : '',
        overtime_hours: overtimeTotal > 0 ? overtimeTotal.toFixed(2) : '',
      }));
    } catch {
      // Non-fatal — manager can still fill these in by hand.
    } finally {
      setAutoFilling(false);
    }
  };

  useEffect(() => {
    if (editingRecordId) return; // don't clobber a record being edited
    if (processForm.user_id && processForm.pay_period_start && processForm.pay_period_end) {
      autoFillFromAttendance(processForm.user_id, processForm.pay_period_start, processForm.pay_period_end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processForm.user_id, processForm.pay_period_start, processForm.pay_period_end, editingRecordId]);

  const openEditRecord = (record: PayrollRecord) => {
    setEditingRecordId(record.id);
    setPayBreakdown(null);
    setProcessForm({
      user_id: record.user_id,
      pay_period_start: record.pay_period_start,
      pay_period_end: record.pay_period_end,
      total_salary: String((record.working_days || 0) * (record.per_day_salary || 0) || record.gross_salary || 0),
      working_days: String(record.working_days ?? ''),
      days_present: String(record.days_worked ?? ''),
      days_absent: String(record.days_absent ?? ''),
      deduction_per_absent_day: String(record.deduction_per_absent_day ?? 1000),
      avg_hours_per_day: '',
      overtime_hours: String(record.overtime_hours ?? ''),
      overtime_pay: String(record.overtime_pay ?? ''),
      bonus: String(record.bonus ?? ''),
      other_deduction: String(record.other_deductions ?? ''),
      notes: record.notes || '',
      payment_method: record.payment_method || 'bank_transfer',
    });
    setSelectedRecord(null);
    setShowProcessModal(true);
  };

  // Manager cannot edit/approve once a payslip is approved; director always can.
  const isLockedForUser = (record: PayrollRecord) => !!record.approved_at && userRole !== 'director';

  const openNewPayrollForm = () => {
    setEditingRecordId(null);
    setPayBreakdown(null);
    setProcessForm({
      user_id: '', pay_period_start: '', pay_period_end: '', total_salary: '',
      working_days: '', days_present: '', days_absent: '', deduction_per_absent_day: '1000',
      avg_hours_per_day: '', overtime_hours: '', overtime_pay: '', bonus: '', other_deduction: '',
      notes: '', payment_method: 'bank_transfer',
    });
    setShowProcessModal(true);
  };

  const handleProcessPayroll = async () => {
    if (!processForm.user_id || !processForm.pay_period_start || !processForm.pay_period_end) {
      toast.error('Please fill all required fields'); return;
    }
    const totalSalary = parseFloat(processForm.total_salary) || 0;
    const workingDays = parseFloat(processForm.working_days) || 0;
    const daysPresent = parseFloat(processForm.days_present) || 0;
    const daysAbsent = parseFloat(processForm.days_absent) || 0;
    const overtimeHours = parseFloat(processForm.overtime_hours) || 0;
    const overtimePay = parseFloat(processForm.overtime_pay) || 0;
    const bonus = parseFloat(processForm.bonus) || 0;
    const otherDeduction = parseFloat(processForm.other_deduction) || 0;

    if (totalSalary <= 0) { toast.error('Total salary must be greater than 0'); return; }
    if (workingDays <= 0) { toast.error('Working days must be greater than 0'); return; }

    setProcessing(true);
    try {
      const calc = computeSimplePayroll(totalSalary, workingDays, daysPresent, overtimePay, bonus, otherDeduction, payBreakdown?.amountPayable);

      const payload = {
        user_id: processForm.user_id,
        firm_id: users.find(u => u.id === processForm.user_id)?.firm_id || null,
        pay_period_start: processForm.pay_period_start,
        pay_period_end: processForm.pay_period_end,
        gross_salary: totalSalary,
        working_days: workingDays,
        per_day_salary: calc.perDaySalary,
        days_worked: daysPresent,
        amount_payable: calc.amountPayable,
        days_absent: daysAbsent,
        deduction_per_absent_day: 0,
        overtime_hours: overtimeHours,
        overtime_pay: overtimePay,
        bonus,
        other_deductions: otherDeduction,
        total_deducted: calc.totalDeducted,
        total_deductions: calc.totalDeducted,
        net_salary: calc.totalToPay,
        payment_method: processForm.payment_method,
        notes: processForm.notes,
      };

      if (editingRecordId) {
        const { error } = await supabase.from('payroll_records').update(payload).eq('id', editingRecordId);
        if (error) throw error;
        toast.success('Payslip updated');
      } else {
        const { error } = await supabase.from('payroll_records').insert({
          ...payload,
          status: 'processed',
          processed_by: effectiveUserId,
          processed_at: new Date().toISOString(),
        });
        if (error) throw error;
        toast.success('Payroll processed successfully');
      }

      setShowProcessModal(false);
      setEditingRecordId(null);
      init();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save payslip');
    } finally {
      setProcessing(false);
    }
  };

const handleSaveSalaryStructure = async () => {
  if (!showSalaryModal || !parseFloat(salaryForm.basic_salary)) {
    toast.error('Basic salary is required'); return;
  }
  try {
    const { error } = await supabase.from('salary_structures').upsert({
      user_id: showSalaryModal.id,
      firm_id: showSalaryModal.firm_id || null,
      basic_salary: parseFloat(salaryForm.basic_salary),
      hra_percent: parseFloat(salaryForm.hra_percent),
      transport_allowance: parseFloat(salaryForm.transport_allowance),
      other_allowances: parseFloat(salaryForm.other_allowances),
      pf_percent: parseFloat(salaryForm.pf_percent),
      esi_percent: parseFloat(salaryForm.esi_percent),
      tds_percent: parseFloat(salaryForm.tds_percent),
      created_by: effectiveUserId,
    }, { onConflict: 'user_id' });
    if (error) throw error;
    toast.success('Salary structure saved');
    setShowSalaryModal(null);
    init();
  } catch (err: any) {
    toast.error(err.message || 'Failed to save salary structure');
  }
};

  const handleApprove = async (record: PayrollRecord) => {
  if (isLockedForUser(record)) {
    toast.error('This payslip is already approved and locked. Only a director can make further changes.');
    return;
  }
  try {
    const { error } = await supabase.from('payroll_records').update({
      status: 'paid',
      payment_date: new Date().toISOString().split('T')[0],
      approved_by: effectiveUserId,
      approved_at: new Date().toISOString(),
    }).eq('id', record.id);
    if (error) throw error;
    toast.success('Payslip approved');
    setSelectedRecord(null);
    init();
  } catch (err: any) {
    toast.error(err.message || 'Failed to approve');
  }
};

  const exportPayroll = () => {
    const filtered = records.filter(r => !searchQuery || r.employee?.full_name.toLowerCase().includes(searchQuery.toLowerCase()));
    const headers = ['Employee', 'Department', 'Pay Period', 'Basic', 'HRA', 'Transport', 'Gross', 'PF', 'ESI', 'TDS', 'Total Deductions', 'Net Salary', 'Days Worked', 'Status'];
    const rows = filtered.map(r => [
      r.employee?.full_name || '', r.employee?.department || '',
      `${r.pay_period_start} to ${r.pay_period_end}`,
      String(r.basic_salary), String(r.hra), String(r.transport_allowance),
      String(r.gross_salary), String(r.pf_deduction), String(r.esi_deduction), String(r.tds_deduction),
      String(r.total_deductions), String(r.net_salary), String(r.days_worked), r.status,
    ]);
    downloadCSV(`payroll_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast.success('Payroll exported');
  };

  const filteredRecords = records.filter(r => {
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchSearch = !searchQuery || r.employee?.full_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchFirm = firmFilter === 'all' || r.employee?.firm_id === firmFilter;
    return matchStatus && matchSearch && matchFirm;
  });

  const totalNetPayroll = filteredRecords.filter(r => r.status !== 'cancelled').reduce((sum, r) => sum + r.net_salary, 0);
  const pendingCount = records.filter(r => r.status === 'processed').length;

  if (loading) {
    return (
              <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 size={28} className="animate-spin text-blue-500" />
        </div>
    );
  }

  return (
    <>
          <Toaster position="bottom-right" richColors />
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Wallet size={18} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-700 text-slate-900 dark:text-slate-100">Payroll</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isDirectorOrManager ? 'Process and manage employee payroll' : 'Your salary and payslips'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isDirectorOrManager && (
              <>
                <button onClick={exportPayroll}
                  className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <Download size={14} /> Export
                </button>
                <button onClick={openNewPayrollForm}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-600 px-4 py-2.5 rounded-xl transition-colors">
                  <Plus size={15} /> Process Payroll
                </button>
              </>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        {isDirectorOrManager && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-600 mb-1">Total Net Payroll</p>
              <p className="text-xl font-700 text-emerald-800 dark:text-emerald-300">{formatCurrency(totalNetPayroll)}</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <p className="text-xs text-blue-700 dark:text-blue-400 font-600 mb-1">Pending Payment</p>
              <p className="text-xl font-700 text-blue-800 dark:text-blue-300">{pendingCount}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-600 rounded-xl p-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 font-600 mb-1">Total Employees</p>
              <p className="text-xl font-700 text-slate-800 dark:text-slate-200">{users.length}</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
              <p className="text-xs text-amber-700 dark:text-amber-400 font-600 mb-1">Salary Structures</p>
              <p className="text-xl font-700 text-amber-800 dark:text-amber-300">{salaryStructures.length}</p>
            </div>
          </div>
        )}

        {/* Firm filter — only shown if this user can see more than one firm */}
        {isDirectorOrManager && visibleFirms.length > 1 && (
          <FirmFilterTabs firms={visibleFirms} selectedFirmId={firmFilter} onSelect={setFirmFilter} />
        )}

        {/* Tabs */}
        {isDirectorOrManager && (
          <div className="flex gap-2 mb-5 border-b border-slate-200 dark:border-slate-700">
            {[
              { id: 'payslips', label: 'Payslips' },
              { id: 'salary-structures', label: 'Salary Structures' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2.5 text-sm font-600 border-b-2 transition-colors ${activeTab === tab.id ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Payslips Tab */}
        {(activeTab === 'payslips' || !isDirectorOrManager) && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search employee…" value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300">
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="processed">Processed</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {filteredRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Wallet size={40} className="mb-3 opacity-30" />
                  <p className="text-sm font-500">No payroll records found</p>
                  {isDirectorOrManager && (
                    <button onClick={openNewPayrollForm} className="mt-3 text-sm text-emerald-600 font-600 hover:underline">
                      Process first payroll
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                        {isDirectorOrManager && <th className="text-left px-4 py-3 text-xs font-600 text-slate-500 dark:text-slate-400">Employee</th>}
                        <th className="text-left px-4 py-3 text-xs font-600 text-slate-500 dark:text-slate-400">Pay Period</th>
                        <th className="text-right px-4 py-3 text-xs font-600 text-slate-500 dark:text-slate-400">Gross</th>
                        <th className="text-right px-4 py-3 text-xs font-600 text-slate-500 dark:text-slate-400">Deductions</th>
                        <th className="text-right px-4 py-3 text-xs font-600 text-slate-500 dark:text-slate-400">Net Salary</th>
                        <th className="text-center px-4 py-3 text-xs font-600 text-slate-500 dark:text-slate-400">Status</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {filteredRecords.map(record => {
                        const sc = statusConfig[record.status] || statusConfig.draft;
                        return (
                          <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                            {isDirectorOrManager && (
                              <td className="px-4 py-3">
                                <p className="font-600 text-slate-900 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                                  {record.employee?.full_name || '—'}
                                  <FirmBadge firmName={visibleFirms.find(f => f.id === record.employee?.firm_id)?.name} />
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{record.employee?.department || ''}</p>
                              </td>
                            )}
                            <td className="px-4 py-3">
                              <p className="text-slate-700 dark:text-slate-300">{getMonthYear(record.pay_period_start)}</p>
                              <p className="text-xs text-slate-400">{record.days_worked} days worked</p>
                            </td>
                            <td className="px-4 py-3 text-right font-600 text-slate-800 dark:text-slate-200">{formatCurrency(record.gross_salary)}</td>
                            <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">{formatCurrency(record.total_deductions)}</td>
                            <td className="px-4 py-3 text-right font-700 text-emerald-700 dark:text-emerald-400">{formatCurrency(record.net_salary)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-xs font-600 px-2.5 py-1 rounded-full ${sc.color}`}>{sc.label}</span>
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => setSelectedRecord(record)}
                                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                                <Eye size={14} className="text-slate-400" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Salary Structures Tab */}
        {activeTab === 'salary-structures' && isDirectorOrManager && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map(u => {
              const structure = getSalaryStructure(u.id);
              return (
                <div key={u.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-600 text-slate-900 dark:text-slate-100">{u.full_name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{u.department} · {u.job_title || u.role}</p>
                    </div>
                    <button onClick={() => {
                      setShowSalaryModal(u);
                      if (structure) {
                        setSalaryForm({
                          basic_salary: String(structure.basic_salary),
                          hra_percent: String(structure.hra_percent),
                          transport_allowance: String(structure.transport_allowance),
                          other_allowances: String(structure.other_allowances),
                          pf_percent: String(structure.pf_percent),
                          esi_percent: String(structure.esi_percent),
                          tds_percent: String(structure.tds_percent),
                        });
                      } else {
                        setSalaryForm({ basic_salary: '', hra_percent: '40', transport_allowance: '0', other_allowances: '0', pf_percent: '12', esi_percent: '0.75', tds_percent: '0' });
                      }
                    }}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                      <Edit2 size={14} className="text-slate-400" />
                    </button>
                  </div>
                  {structure ? (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">Basic Salary</span>
                        <span className="font-600 text-slate-800 dark:text-slate-200">{formatCurrency(structure.basic_salary)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">HRA ({structure.hra_percent}%)</span>
                        <span className="text-slate-700 dark:text-slate-300">{formatCurrency(structure.basic_salary * structure.hra_percent / 100)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">PF ({structure.pf_percent}%)</span>
                        <span className="text-red-600 dark:text-red-400">-{formatCurrency(structure.basic_salary * structure.pf_percent / 100)}</span>
                      </div>
                      <div className="border-t border-slate-100 dark:border-slate-700 pt-1.5 flex justify-between text-xs font-700">
                        <span className="text-slate-600 dark:text-slate-400">Est. Net</span>
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(structure.basic_salary + (structure.basic_salary * structure.hra_percent / 100) + structure.transport_allowance + structure.other_allowances - (structure.basic_salary * structure.pf_percent / 100))}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-3">
                      <p className="text-xs text-slate-400 mb-2">No salary structure set</p>
                      <button onClick={() => { setShowSalaryModal(u); setSalaryForm({ basic_salary: '', hra_percent: '40', transport_allowance: '0', other_allowances: '0', pf_percent: '12', esi_percent: '0.75', tds_percent: '0' }); }}
                        className="text-xs text-emerald-600 font-600 hover:underline">Set up salary</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payslip Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-700 text-slate-900 dark:text-slate-100">Payslip Details</h3>
              <button onClick={() => setSelectedRecord(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-700 text-slate-900 dark:text-slate-100">{selectedRecord.employee?.full_name || 'Employee'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{selectedRecord.employee?.department}</p>
                </div>
                <span className={`text-xs font-600 px-2.5 py-1 rounded-full ${statusConfig[selectedRecord.status]?.color || ''}`}>
                  {statusConfig[selectedRecord.status]?.label}
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 font-500">
                Pay Period: {getMonthYear(selectedRecord.pay_period_start)}
              </p>
              {isLockedForUser(selectedRecord) && (
                <div className="mb-3 flex items-center gap-2 bg-slate-100 dark:bg-slate-700/50 rounded-xl px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                  <Lock size={12} /> Approved and locked — only a director can make further changes.
                </div>
              )}
              <div className="space-y-2 text-sm">
                {/* Row 1: working days, total salary, per-day salary */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3 text-center">
                    <p className="text-lg font-700 text-slate-800 dark:text-slate-100">{selectedRecord.working_days ?? '—'}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Working Days</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3 text-center">
                    <p className="text-lg font-700 text-slate-800 dark:text-slate-100">{formatCurrency(selectedRecord.gross_salary)}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Total Salary</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3 text-center">
                    <p className="text-lg font-700 text-slate-800 dark:text-slate-100">{formatCurrency(selectedRecord.per_day_salary || 0)}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Per-Day Salary</p>
                  </div>
                </div>
                {/* Row 2: days present, amount payable */}
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">Days Present (present + paid leave)</p>
                    <p className="text-lg font-700 text-emerald-700 dark:text-emerald-400">{selectedRecord.days_worked}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">Amount Payable</p>
                    <p className="text-lg font-700 text-emerald-700 dark:text-emerald-400">{formatCurrency(selectedRecord.amount_payable || 0)}</p>
                  </div>
                </div>
                {/* Row 3: absent days, deduction/day, total deducted */}
                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-700 text-red-700 dark:text-red-400">{selectedRecord.days_absent}</p>
                    <p className="text-[11px] text-red-600 dark:text-red-400">Absent Days</p>
                  </div>
                  <div>
                    <p className="text-lg font-700 text-red-700 dark:text-red-400">{formatCurrency(selectedRecord.per_day_salary || 0)}</p>
                    <p className="text-[11px] text-red-600 dark:text-red-400">Per Absent Day</p>
                  </div>
                  <div>
                    <p className="text-lg font-700 text-red-700 dark:text-red-400">{formatCurrency(selectedRecord.total_deducted || 0)}</p>
                    <p className="text-[11px] text-red-600 dark:text-red-400">Total Deducted</p>
                  </div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 flex justify-between items-center">
                  <span className="font-700 text-blue-800 dark:text-blue-300">TOTAL TO BE PAID</span>
                  <span className="text-xl font-700 text-blue-800 dark:text-blue-300">{formatCurrency(selectedRecord.net_salary)}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
              {isDirectorOrManager && !isLockedForUser(selectedRecord) && (
                <button onClick={() => openEditRecord(selectedRecord)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  Edit
                </button>
              )}
              {isDirectorOrManager && selectedRecord.status !== 'paid' && !isLockedForUser(selectedRecord) && (
                <button onClick={() => handleApprove(selectedRecord)}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-600 transition-colors">
                  Approve
                </button>
              )}
              <button onClick={() => setSelectedRecord(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Process Payroll Modal */}
      {showProcessModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-700 text-slate-900 dark:text-slate-100">{editingRecordId ? 'Edit Payslip' : 'Process Payroll'}</h3>
              <button onClick={() => { setShowProcessModal(false); setEditingRecordId(null); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Employee *</label>
                <select value={processForm.user_id} disabled={!!editingRecordId} onChange={e => setProcessForm(p => ({ ...p, user_id: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60">
                  <option value="">Select employee…</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name} — {u.department}</option>)}
                </select>
                {processForm.user_id && !getSalaryStructure(processForm.user_id) && !editingRecordId && (
                  <p className="text-xs text-amber-600 mt-1">⚠️ No salary structure found — you can still fill in total salary manually below.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Period Start *</label>
                  <input type="date" value={processForm.pay_period_start} disabled={!!editingRecordId}
                    onChange={e => setProcessForm(p => ({ ...p, pay_period_start: e.target.value }))}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60" />
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Period End *</label>
                  <input type="date" value={processForm.pay_period_end} disabled={!!editingRecordId}
                    onChange={e => setProcessForm(p => ({ ...p, pay_period_end: e.target.value }))}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60" />
                </div>
              </div>

              {autoFilling && (
                <p className="text-xs text-slate-400 flex items-center gap-1.5"><RefreshCw size={11} className="animate-spin" /> Auto-filling from attendance…</p>
              )}

              {payBreakdown && payBreakdown.rows.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
                  <p className="text-xs font-600 px-3 py-2 bg-slate-50 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300">
                    Month-wise pay: each month uses its own working days
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500 dark:text-slate-400">
                          <th className="text-left px-3 py-1.5 font-600">Month</th>
                          <th className="text-right px-2 py-1.5 font-600">Month working days</th>
                          <th className="text-right px-2 py-1.5 font-600">Days in period</th>
                          <th className="text-right px-2 py-1.5 font-600">Present</th>
                          <th className="text-right px-2 py-1.5 font-600">Per day</th>
                          <th className="text-right px-3 py-1.5 font-600">Payable</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payBreakdown.rows.map((r) => (
                          <tr key={r.month} className="border-t border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                            <td className="px-3 py-1.5">{getMonthYear(`${r.month}-01`)}</td>
                            <td className="text-right px-2">{r.monthWorkingDays}</td>
                            <td className="text-right px-2">{r.workingDays}</td>
                            <td className="text-right px-2">{r.daysPresent}</td>
                            <td className="text-right px-2">{formatCurrency(r.perDaySalary)}</td>
                            <td className="text-right px-3 font-600">{formatCurrency(r.amountPayable)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Row 1: working days, total salary, per-day salary (per-day is derived, read-only) */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Working Days *</label>
                  <input type="number" min="0" value={processForm.working_days}
                    onChange={e => { setPayBreakdown(null); setProcessForm(p => ({ ...p, working_days: e.target.value })); }}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Total Salary (₹) *</label>
                  <input type="number" min="0" value={processForm.total_salary}
                    onChange={e => { setPayBreakdown(null); setProcessForm(p => ({ ...p, total_salary: e.target.value })); }}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Per-Day Salary</label>
                  <div className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300">
                    {formatCurrency(livePreview.perDaySalary)}
                  </div>
                </div>
              </div>

              {/* Row 2: days present, amount payable (derived) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Days Present (present + paid leave) *</label>
                  <input type="number" min="0" value={processForm.days_present}
                    onChange={e => { setPayBreakdown(null); setProcessForm(p => ({ ...p, days_present: e.target.value })); }}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Amount Payable</label>
                  <div className="w-full border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2.5 text-sm bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-600">
                    {formatCurrency(livePreview.amountPayable)}
                  </div>
                </div>
              </div>

              {/* Row 3: absent days, total deducted (derived) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Absent Days *</label>
                  <input type="number" min="0" value={processForm.days_absent}
                    onChange={e => setProcessForm(p => ({ ...p, days_absent: e.target.value }))}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Total Deducted</label>
                  <div className="w-full border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5 text-sm bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-600">
                    {formatCurrency(livePreview.totalDeducted)}
                  </div>
                </div>
              </div>

              {/* Row 4: average hours per day (from attendance), overtime hours (from attendance) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Avg Hours / Day</label>
                  <div className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300">
                    {processForm.avg_hours_per_day ? `${processForm.avg_hours_per_day} h` : '—'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Overtime Hours</label>
                  <input type="number" min="0" step="0.25" value={processForm.overtime_hours}
                    onChange={e => setProcessForm(p => ({ ...p, overtime_hours: e.target.value }))}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
              </div>

              {/* Row 5: overtime pay, bonus (extra pay) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Overtime Pay (₹)</label>
                  <input type="number" min="0" value={processForm.overtime_pay}
                    onChange={e => setProcessForm(p => ({ ...p, overtime_pay: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                  {hourlyRate > 0 && (
                    <p className="text-[11px] text-slate-400 mt-1">≈ {formatCurrency(hourlyRate)}/hr × {processForm.overtime_hours || 0} h</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Bonus / Extra Pay (₹)</label>
                  <input type="number" min="0" value={processForm.bonus}
                    onChange={e => setProcessForm(p => ({ ...p, bonus: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
              </div>

              {/* Row 6: manual deduction */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Other Deduction (₹)</label>
                  <input type="number" min="0" value={processForm.other_deduction}
                    onChange={e => setProcessForm(p => ({ ...p, other_deduction: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                  <p className="text-[11px] text-slate-400 mt-1">Manual deduction, e.g. a fine or advance recovery.</p>
                </div>
              </div>

              {/* Live total */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3.5 flex justify-between items-center">
                <span className="font-700 text-blue-800 dark:text-blue-300 text-sm">TOTAL TO BE PAID</span>
                <span className="text-xl font-700 text-blue-800 dark:text-blue-300">{formatCurrency(livePreview.totalToPay)}</span>
              </div>

              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Payment Method</label>
                <select value={processForm.payment_method} onChange={e => setProcessForm(p => ({ ...p, payment_method: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300">
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Notes</label>
                <textarea value={processForm.notes} onChange={e => setProcessForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2} placeholder="Any additional notes…"
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => { setShowProcessModal(false); setEditingRecordId(null); }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleProcessPayroll} disabled={processing}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-600 transition-colors flex items-center justify-center gap-2">
                {processing ? <Loader2 size={14} className="animate-spin" /> : null}
                {processing ? (editingRecordId ? 'Saving…' : 'Processing…') : (editingRecordId ? 'Save Changes' : 'Process Payroll')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Salary Structure Modal */}
      {showSalaryModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-base font-700 text-slate-900 dark:text-slate-100">Salary Structure</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{showSalaryModal.full_name}</p>
              </div>
              <button onClick={() => setShowSalaryModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Basic Salary (₹/month) *</label>
                <input type="number" min="0" value={salaryForm.basic_salary}
                  onChange={e => setSalaryForm(p => ({ ...p, basic_salary: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">HRA %</label>
                  <input type="number" min="0" max="100" value={salaryForm.hra_percent}
                    onChange={e => setSalaryForm(p => ({ ...p, hra_percent: e.target.value }))}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Transport (₹)</label>
                  <input type="number" min="0" value={salaryForm.transport_allowance}
                    onChange={e => setSalaryForm(p => ({ ...p, transport_allowance: e.target.value }))}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">PF %</label>
                  <input type="number" min="0" max="100" value={salaryForm.pf_percent}
                    onChange={e => setSalaryForm(p => ({ ...p, pf_percent: e.target.value }))}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">TDS %</label>
                  <input type="number" min="0" max="100" value={salaryForm.tds_percent}
                    onChange={e => setSalaryForm(p => ({ ...p, tds_percent: e.target.value }))}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => setShowSalaryModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveSalaryStructure}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-600 transition-colors">
                Save Structure
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}