'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { CalendarDays, Upload, FileText, X, CheckCircle2, Clock, AlertCircle, ChevronLeft, Loader2, Eye, Info } from 'lucide-react';
import Link from 'next/link';
import { toast, Toaster } from 'sonner';
import { fetchSavedQuotas, quotaForRole, quotaValue, type RoleQuotas } from '@/lib/leaveQuotas';

type LeaveType = 'substitute' | 'paid' | 'unpaid' | 'medical' | 'half_day';

interface LeaveBalance {
  leave_type: LeaveType;
  total_days: number;
  used_days: number;
}

interface FormState {
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string;
  is_half_day: boolean;
  half_day_period: string;
  certificate_file: File | null;
}

const leaveTypeConfig: Record<LeaveType, {
  label: string;
  color: string;
  bg: string;
  bar: string;
  requiresCertificate: boolean;
  description: string;
}> = {
  substitute: { label: 'Substitute Leave', color: 'text-blue-700 dark:text-blue-300',    bg: 'bg-blue-50 dark:bg-blue-900/30',    bar: 'bg-blue-500',   requiresCertificate: false, description: 'Substitute / compensatory leave' },
  paid:       { label: 'Paid Leave',        color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-900/30', bar: 'bg-emerald-500',requiresCertificate: false, description: 'Earned paid time off' },
  unpaid:     { label: 'Unpaid Leave',      color: 'text-slate-600 dark:text-slate-300',   bg: 'bg-slate-50 dark:bg-slate-700/40',   bar: 'bg-slate-400',  requiresCertificate: false, description: 'Leave without pay' },
  medical:    { label: 'Medical Leave',     color: 'text-red-700 dark:text-red-300',     bg: 'bg-red-50 dark:bg-red-900/30',     bar: 'bg-red-400',    requiresCertificate: true,  description: 'Medical leave — doctor certificate required' },
  half_day:   { label: 'Half Day',          color: 'text-amber-700 dark:text-amber-300',   bg: 'bg-amber-50 dark:bg-amber-900/30',   bar: 'bg-amber-400',  requiresCertificate: false, description: 'Half day leave (morning or afternoon)' },
};

function getFiscalYear(date: Date = new Date()): number {
  const month = date.getMonth() + 1;
  return month >= 4 ? date.getFullYear() : date.getFullYear() - 1;
}

function calcWorkingDays(start: string, end: string, isHalf: boolean): number {
  if (!start || !end) return 0;
  if (isHalf) return 0.5;
  const s = new Date(start);
  const e = new Date(end);
  if (e < s) return 0;
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const defaultForm: FormState = {
  leave_type: 'substitute',
  start_date: '',
  end_date: '',
  reason: '',
  is_half_day: false,
  half_day_period: 'morning',
  certificate_file: null,
};

export default function LeaveRequestForm() {
  const { user, pinSession } = useAuth();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(defaultForm);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [quota, setQuota] = useState<RoleQuotas>({});
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [currentFY] = useState<number>(getFiscalYear());

  const fetchBalances = useCallback(async () => {
    const uid = user?.id || pinSession?.userId;
    if (!uid) { setLoadingBalances(false); return; }
    setLoadingBalances(true);
    try {
      const fy = getFiscalYear();
      // Entitlements come from Director Settings (per role), the same source the dashboard uses
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', uid).maybeSingle();
      const roleQuota = quotaForRole(await fetchSavedQuotas(supabase), profile?.role);
      setQuota(roleQuota);

      const { data, error } = await supabase
        .from('leave_balances')
        .select('leave_type, total_days, used_days')
        .eq('user_id', uid)
        .eq('fiscal_year', fy);

      if (!error) {
        // Sync total_days from the saved role quota; keep each person's used_days
        const leaveTypes: LeaveType[] = ['substitute', 'paid', 'medical'];
        await supabase.from('leave_balances').upsert(
          leaveTypes.map((lt) => ({
            user_id: uid,
            leave_type: lt,
            fiscal_year: fy,
            total_days: quotaValue(roleQuota, lt),
            used_days: (data || []).find((b: any) => b.leave_type === lt)?.used_days ?? 0,
            carry_forward_days: 0,
          })),
          { onConflict: 'user_id,leave_type,fiscal_year', ignoreDuplicates: false },
        );
        const { data: finalData } = await supabase
          .from('leave_balances')
          .select('leave_type, total_days, used_days')
          .eq('user_id', uid)
          .eq('fiscal_year', fy);
        setBalances(finalData || []);
      }
    } finally {
      setLoadingBalances(false);
    }
  }, [user, pinSession]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const getBalance = (type: LeaveType): { total: number; used: number; remaining: number } => {
    const found = balances.find((b) => b.leave_type === type);
    // Director Settings is the source of truth for the total
    const total = quotaValue(quota, type);
    const used = found?.used_days ?? 0;
    return { total, used, remaining: total - used };
  };

  const selectedConfig = leaveTypeConfig[form.leave_type];
  const selectedBalance = getBalance(form.leave_type);
  const requestedDays = calcWorkingDays(form.start_date, form.end_date, form.is_half_day);
  const willExceed = requestedDays > selectedBalance.remaining && form.leave_type !== 'unpaid';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && file.size > 10 * 1024 * 1024) {
      toast.error('File size must be under 10MB');
      return;
    }
    setForm((prev) => ({ ...prev, certificate_file: file }));
  };

  const uploadCertificate = async (file: File): Promise<{ path: string; url: string } | null> => {
    if (!user) return null;
    setUploadingCert(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `${user.id}/leave-cert-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('leave-certificates')
        .upload(filePath, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('leave-certificates').getPublicUrl(filePath);
      return { path: filePath, url: urlData?.publicUrl || '' };
    } catch (err: any) {
      toast.error('Certificate upload failed: ' + (err.message || 'Unknown error'));
      return null;
    } finally {
      setUploadingCert(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!form.start_date || !form.end_date) {
      toast.error('Please select start and end dates');
      return;
    }
    if (new Date(form.end_date) < new Date(form.start_date)) {
      toast.error('End date cannot be before start date');
      return;
    }
    if (!form.reason.trim()) {
      toast.error('Please provide a reason for your leave');
      return;
    }
    if (selectedConfig.requiresCertificate && !form.certificate_file) {
      toast.error(`A doctor certificate is required for ${selectedConfig.label}`);
      return;
    }

    setSubmitting(true);
    try {
      let certPath = '';
      let certUrl = '';

      if (form.certificate_file) {
        const uploaded = await uploadCertificate(form.certificate_file);
        if (!uploaded && selectedConfig.requiresCertificate) {
          setSubmitting(false);
          return;
        }
        certPath = uploaded?.path || '';
        certUrl = uploaded?.url || '';
      }

      const { error } = await supabase.from('leave_requests').insert({
        user_id: user.id,
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        total_days: requestedDays,
        reason: form.reason.trim(),
        is_half_day: form.is_half_day,
        half_day_period: form.is_half_day ? form.half_day_period : '',
        doctor_certificate_url: certUrl,
        doctor_certificate_path: certPath,
        status: 'pending',
      });

      if (error) throw error;
      setSubmitted(true);
      toast.success('Leave request submitted successfully!');
    } catch (err: any) {
      toast.error('Submission failed: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-screen-lg mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Toaster richColors position="top-right" />
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-emerald-600" />
          </div>
          <h2 className="text-xl font-700 text-slate-900 mb-2">Leave Request Submitted</h2>
          <p className="text-slate-500 text-sm mb-6">
            Your {selectedConfig.label} request for {requestedDays} day{requestedDays !== 1 ? 's' : ''} has been sent to your manager for approval.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => { setForm(defaultForm); setSubmitted(false); }}
              className="btn-ghost border border-slate-200 text-sm px-5 py-2"
            >
              Submit Another
            </button>
            <Link href="/leave-management" className="btn-primary text-sm px-5 py-2">
              View My Leaves
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-screen-lg mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <Toaster richColors position="top-right" />

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/employee-dashboard" className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-700 text-slate-900">Apply for Leave</h1>
          <p className="text-xs text-slate-500 mt-0.5">FY {currentFY}–{currentFY + 1}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-card p-6 space-y-5">

            {/* Leave Type */}
            <div>
              <label className="block text-sm font-600 text-slate-700 mb-2">Leave Type</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(leaveTypeConfig) as LeaveType[]).map((type) => {
                  const cfg = leaveTypeConfig[type];
                  const bal = getBalance(type);
                  const isSelected = form.leave_type === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, leave_type: type }))}
                      className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? `border-blue-500 ${cfg.bg}`
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <p className={`text-xs font-600 ${isSelected ? cfg.color : 'text-slate-700'}`}>{cfg.label}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                        {bal.remaining} / {bal.total} left
                      </p>
                      {cfg.requiresCertificate && (
                        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-purple-500" title="Certificate required" />
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedConfig.requiresCertificate && (
                <p className="mt-2 text-xs text-purple-600 flex items-center gap-1.5">
                  <Info size={12} />
                  Doctor certificate is required for {selectedConfig.label}
                </p>
              )}
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-600 text-slate-700 mb-1.5">Start Date</label>
                <div className="relative">
                  <CalendarDays size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={form.start_date}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-600 text-slate-700 mb-1.5">End Date</label>
                <div className="relative">
                  <CalendarDays size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={form.end_date}
                    min={form.start_date || new Date().toISOString().split('T')[0]}
                    onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Half Day Toggle */}
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, is_half_day: !prev.is_half_day }))}
                className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.is_half_day ? 'bg-blue-600' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_half_day ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-sm text-slate-700 font-500">Half Day</span>
              {form.is_half_day && (
                <select
                  value={form.half_day_period}
                  onChange={(e) => setForm((prev) => ({ ...prev, half_day_period: e.target.value }))}
                  className="ml-auto text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                </select>
              )}
            </div>

            {/* Days Preview */}
            {form.start_date && form.end_date && (
              <div className={`flex items-center gap-3 p-3 rounded-lg border ${willExceed ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                <Clock size={15} className={willExceed ? 'text-red-500' : 'text-blue-500'} />
                <div className="flex-1">
                  <p className={`text-sm font-600 ${willExceed ? 'text-red-700' : 'text-blue-700'}`}>
                    {requestedDays} working day{requestedDays !== 1 ? 's' : ''} requested
                  </p>
                  {willExceed && (
                    <p className="text-xs text-red-600 mt-0.5">
                      Exceeds available balance ({selectedBalance.remaining} days remaining)
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-sm font-600 text-slate-700 mb-1.5">Reason</label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder={`Briefly describe the reason for your ${selectedConfig.label.toLowerCase()}...`}
                rows={3}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                required
              />
              <p className="text-xs text-slate-400 mt-1 text-right">{form.reason.length}/500</p>
            </div>

            {/* Certificate Upload */}
            <div>
              <label className="block text-sm font-600 text-slate-700 mb-1.5">
                Doctor Certificate
                {selectedConfig.requiresCertificate && <span className="text-red-500 ml-1">*</span>}
                {!selectedConfig.requiresCertificate && <span className="text-slate-400 font-400 ml-1">(optional)</span>}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              {form.certificate_file ? (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <FileText size={16} className="text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-500 text-slate-800 truncate">{form.certificate_file.name}</p>
                    <p className="text-xs text-slate-500">{(form.certificate_file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setForm((prev) => ({ ...prev, certificate_file: null })); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <X size={14} className="text-slate-400 hover:text-red-500" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center gap-2 p-5 border-2 border-dashed border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all text-slate-500 hover:text-blue-600"
                >
                  <Upload size={20} />
                  <span className="text-sm font-500">Click to upload certificate</span>
                  <span className="text-xs text-slate-400">PDF, JPG, PNG, WebP — max 10MB</span>
                </button>
              )}
            </div>

            {/* Submit */}
            <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
              <Link href="/employee-dashboard" className="btn-ghost border border-slate-200 text-sm px-5 py-2.5 flex-1 text-center">
                Cancel
              </Link>
              <button
                type="submit"
                disabled={submitting || uploadingCert}
                className="btn-primary text-sm px-6 py-2.5 flex-1 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {(submitting || uploadingCert) && <Loader2 size={15} className="animate-spin" />}
                {uploadingCert ? 'Uploading...' : submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>

        {/* Leave Balance Sidebar */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-card p-5">
            <h3 className="text-base font-600 text-slate-900 dark:text-slate-100">Leave Balance</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">FY {currentFY}–{currentFY + 1}</p>

            {loadingBalances ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={20} className="animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="space-y-3">
                {(Object.keys(leaveTypeConfig) as LeaveType[]).filter(t => t !== 'unpaid').map((type) => {
                  const cfg = leaveTypeConfig[type];
                  const bal = getBalance(type);
                  const pct = bal.total > 0 ? Math.min((bal.used / bal.total) * 100, 100) : 0;
                  const isLow = bal.remaining <= 1 && type !== 'unpaid';
                  const isSelected = form.leave_type === type;
                  return (
                    <div key={type} className={`rounded-lg p-3 ${cfg.bg} ${isSelected ? 'ring-2 ring-amber-300' : ''}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-xs font-600 ${cfg.color}`}>{cfg.label}</span>
                        <div className="flex items-center gap-1.5">
                          {isLow && <span className="text-[10px] text-red-600 dark:text-red-300 font-600 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">Low</span>}
                          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            <span className={`font-700 ${isLow ? 'text-red-600 dark:text-red-300' : cfg.color}`}>{bal.remaining}</span>/{bal.total} days
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{bal.used} used</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Policy Note */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-600 text-amber-800 mb-1">Leave Policy</p>
                <ul className="text-xs text-amber-700 space-y-1">
                  <li>• Sick &amp; Maternity leave require a doctor certificate</li>
                  <li>• Requests must be submitted at least 1 day in advance</li>
                  <li>• Sundays are non-working days</li>
                  <li>• Balances reset each financial year (Apr 1)</li>
                </ul>
              </div>
            </div>
          </div>

          <Link
            href="/leave-management"
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-500 px-1"
          >
            <Eye size={14} />
            View all my leave requests
          </Link>
        </div>
      </div>
    </div>
  );
}