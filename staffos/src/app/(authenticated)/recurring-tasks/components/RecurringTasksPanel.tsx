'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Repeat, Plus, X, ChevronDown, Users, Clock, Calendar, Zap, Power, PowerOff,
  Edit2, Trash2, CheckCircle2, Circle, PlayCircle, AlertTriangle, Search, RefreshCw,
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import InstanceSubtasks from '@/components/InstanceSubtasks';

type Frequency = 'daily' | 'weekday' | 'weekly' | 'fortnightly' | 'bi-monthly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
type InstanceStatus = 'pending' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';
type Priority = 'critical' | 'high' | 'medium' | 'low';

interface RecurringTask {
  id: string;
  title: string;
  description: string | null;
  frequency: Frequency;
  assigned_to_users: string[];
  department: string | null;
  time_limit_minutes: number | null;
  notify_before_minutes: number | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  due_time: string | null;
  custom_interval_days: number | null;
  weekday_only: boolean;
  priority: Priority;
  created_by: string | null;
  created_at: string;
  firm_id?: string | null;
  firm_ids?: string[] | null;
  client_org_id?: string | null;
  organisation_relates_to?: string | null;
}

interface FirmOption { id: string; name: string; firm_type: string; }
interface ClientOption { id: string; name: string; }
interface SubtaskDraft { id?: string; title: string; assigned_to: string; }

interface TaskInstance {
  id: string;
  recurring_task_id: string;
  assigned_to: string;
  due_date: string;
  due_time: string | null;
  status: InstanceStatus;
  task_name: string | null;
  priority: Priority;
  frequency: string | null;
  is_overdue: boolean;
  time_taken_minutes: number | null;
  completion_datetime: string | null;
  user_profiles?: { full_name: string; department: string | null };
}

interface UserOption { id: string; full_name: string; role: string; department: string | null; firm_id?: string | null; }

const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'Daily', weekday: 'Weekdays only', weekly: 'Weekly', fortnightly: 'Fortnightly',
  'bi-monthly': 'Bi-monthly (15th & month-end)', monthly: 'Monthly', quarterly: 'Quarterly',
  yearly: 'Yearly', custom: 'Custom interval',
};

const PRIORITY_STYLE: Record<Priority, string> = {
  critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700', low: 'bg-slate-100 text-slate-600',
};

const STATUS_STYLE: Record<InstanceStatus, { label: string; className: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', className: 'bg-slate-100 text-slate-600', icon: Circle },
  in_progress: { label: 'In progress', className: 'bg-blue-100 text-blue-700', icon: PlayCircle },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-700', icon: AlertTriangle },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-400', icon: X },
};

// Local calendar date as YYYY-MM-DD (toISOString() is UTC and shows yesterday in India before 5:30 am)
const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const emptyForm = {
  title: '', description: '', frequency: 'daily' as Frequency, assigned_to_users: [] as string[],
  department: '', time_limit_minutes: 60, notify_before_minutes: 30, due_time: '17:00',
  start_date: ymdLocal(new Date()), end_date: '', custom_interval_days: 7,
  weekday_only: false, priority: 'medium' as Priority,
  // Firms picked (several allowed); client_pick = "client:<id>" | "firm:<id>" | "" (Internal)
  firm_ids: [] as string[], client_pick: '',
  subtasks: [] as SubtaskDraft[],
};

export default function RecurringTasksPanel() {
  const { effectiveUserId } = useAuth();
  const supabase = createClient();

  const [tab, setTab] = useState<'templates' | 'instances'>('templates');
  const [role, setRole] = useState<string>('employee');
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [templates, setTemplates] = useState<RecurringTask[]>([]);
  const [instances, setInstances] = useState<TaskInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [instanceStatusFilter, setInstanceStatusFilter] = useState<'all' | InstanceStatus>('all');
  const [instanceScope, setInstanceScope] = useState<'mine' | 'all'>('mine');
  const [search, setSearch] = useState('');
  const [firmOptions, setFirmOptions] = useState<FirmOption[]>([]);
  const [clientOrgs, setClientOrgs] = useState<ClientOption[]>([]);

  const isManager = role === 'director' || role === 'manager' || role === 'executive';

  const fetchRole = useCallback(async () => {
    if (!effectiveUserId) return;
    const { data } = await supabase.from('user_profiles').select('role').eq('id', effectiveUserId).single();
    if (data?.role) setRole(data.role);
  }, [effectiveUserId]);

  const fetchUsers = useCallback(async () => {
    if (!effectiveUserId) return;
    const { data: visibleFirmIds } = await supabase.rpc('get_visible_firm_ids', { p_user_id: effectiveUserId, p_module: 'tasks' });
    let query = supabase.from('user_profiles').select('id, full_name, role, department, firm_id').order('full_name');
    if (visibleFirmIds) query = query.in('firm_id', visibleFirmIds);
    const { data } = await query;
    if (data) setAllUsers(data as UserOption[]);
  }, [effectiveUserId]);

  const fetchTemplates = useCallback(async () => {
    if (!effectiveUserId) return;
    const { data: visibleFirmIds } = await supabase.rpc('get_visible_firm_ids', { p_user_id: effectiveUserId, p_module: 'tasks' });
    let query = supabase.from('recurring_tasks').select('*').order('created_at', { ascending: false });
    if (visibleFirmIds) query = query.in('firm_id', visibleFirmIds);
    const { data, error } = await query;
    if (error) { console.error(error); return; }
    setTemplates((data as any) || []);
  }, [effectiveUserId]);

  const fetchInstances = useCallback(async () => {
    if (!effectiveUserId) return;
    let query = supabase
      .from('recurring_task_instances')
      .select('id, recurring_task_id, assigned_to, due_date, due_time, status, task_name, priority, frequency, is_overdue, time_taken_minutes, completion_datetime, firm_id, user_profiles(full_name, department)')
      .order('due_date', { ascending: true })
      .limit(300);

    if (instanceScope === 'mine' || !isManager) {
      query = query.eq('assigned_to', effectiveUserId);
    } else {
      const { data: visibleFirmIds } = await supabase.rpc('get_visible_firm_ids', { p_user_id: effectiveUserId, p_module: 'tasks' });
      if (visibleFirmIds) query = query.in('firm_id', visibleFirmIds);
    }
    if (instanceStatusFilter !== 'all') {
      query = query.eq('status', instanceStatusFilter);
    }
    const { data, error } = await query;
    if (error) { console.error(error); return; }
    setInstances((data as any) || []);
  }, [effectiveUserId, instanceScope, instanceStatusFilter, isManager]);

  // Firms the user can see (for the firm chips) and client organisations (for the client picker)
  const fetchFirmsAndClients = useCallback(async () => {
    if (!effectiveUserId) return;
    const { data: ids } = await supabase.rpc('get_visible_firm_ids', { p_user_id: effectiveUserId, p_module: 'all' });
    if (ids && (ids as string[]).length > 0) {
      const { data } = await supabase.from('firms').select('id, name, firm_type').in('id', ids as string[]).order('name');
      setFirmOptions((data || []) as FirmOption[]);
    } else {
      setFirmOptions([]);
    }
    const { data: orgs } = await supabase.from('client_organisations').select('id, name').order('name');
    setClientOrgs((orgs || []) as ClientOption[]);
  }, [effectiveUserId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchTemplates(), fetchInstances(), fetchUsers(), fetchFirmsAndClients()]);
    setLoading(false);
  }, [fetchTemplates, fetchInstances, fetchUsers]);

  useEffect(() => { fetchRole(); }, [fetchRole]);
  useEffect(() => { if (effectiveUserId) loadAll(); }, [effectiveUserId]); // eslint-disable-line
  useEffect(() => { fetchInstances(); }, [instanceScope, instanceStatusFilter]); // eslint-disable-line

  // Keep overdue flags fresh once per session for managers opening the panel —
  // cheap RPC, avoids stale "pending" instances lingering past their due date.
  useEffect(() => {
    if (!isManager || !effectiveUserId) return;
    supabase.rpc('mark_overdue_recurring_instances').then(() => fetchInstances());
  }, [isManager, effectiveUserId]); // eslint-disable-line

  // Real-time: templates and instances update live for everyone viewing the
  // panel — e.g. a manager creating a template instantly shows up for other
  // managers, and completing an instance updates dashboards immediately.
  useEffect(() => {
    if (!effectiveUserId) return;
    const channel = supabase
      .channel(`recurring-tasks-${effectiveUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_tasks' }, () => fetchTemplates())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_task_instances' }, () => fetchInstances())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [effectiveUserId, fetchTemplates, fetchInstances]);

  const resetForm = () => { setForm(emptyForm); setEditingId(null); };

  const openEdit = (t: RecurringTask) => {
    setForm({
      title: t.title, description: t.description || '', frequency: t.frequency,
      assigned_to_users: t.assigned_to_users || [], department: t.department || '',
      time_limit_minutes: t.time_limit_minutes || 60, notify_before_minutes: t.notify_before_minutes || 30,
      due_time: (t.due_time || '17:00:00').slice(0, 5), start_date: t.start_date || emptyForm.start_date,
      end_date: t.end_date || '', custom_interval_days: t.custom_interval_days || 7,
      weekday_only: t.weekday_only, priority: t.priority || 'medium',
      firm_ids: t.firm_ids?.length ? t.firm_ids : (t.firm_id ? [t.firm_id] : []),
      subtasks: [],
      client_pick: t.client_org_id
        ? `client:${t.client_org_id}`
        : (() => {
          const sub = firmOptions.find((f) => f.name === t.organisation_relates_to);
          return sub ? `firm:${sub.id}` : '';
        })(),
    });
    setEditingId(t.id);
    setShowForm(true);
    // Load this template's subtasks into the form
    supabase.from('recurring_subtasks').select('id, title, assigned_to, sort_order').eq('recurring_task_id', t.id).order('sort_order')
      .then(({ data }) => setForm((f) => ({
        ...f,
        subtasks: ((data || []) as { id: string; title: string; assigned_to: string | null }[]).map((s) => ({
          id: s.id, title: s.title, assigned_to: s.assigned_to || '',
        })),
      })));
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (form.assigned_to_users.length === 0) { toast.error('Assign at least one person'); return; }
    setSaving(true);
    try {
      const { data: creatorProfile } = await supabase.from('user_profiles').select('firm_id').eq('id', effectiveUserId).single();
      // Client or subsidiary picked (same rule as normal tasks)
      const pickedOrg = form.client_pick.startsWith('client:')
        ? clientOrgs.find((o) => o.id === form.client_pick.slice(7))
        : undefined;
      const pickedFirm = form.client_pick.startsWith('firm:')
        ? firmOptions.find((f) => f.id === form.client_pick.slice(5))
        : undefined;
      const payload = {
        title: form.title.trim(),
        description: form.description || null,
        frequency: form.frequency,
        // First firm picked is the primary firm; every picked firm is kept in firm_ids
        firm_id: form.firm_ids[0] || creatorProfile?.firm_id || null,
        firm_ids: form.firm_ids.length ? form.firm_ids : (creatorProfile?.firm_id ? [creatorProfile.firm_id] : null),
        client_org_id: pickedOrg?.id ?? null,
        client_org_name: pickedOrg?.name ?? null,
        organisation_relates_to: pickedOrg?.name ?? pickedFirm?.name ?? null,
        assigned_to_users: form.assigned_to_users,
        department: form.department || null,
        time_limit_minutes: form.time_limit_minutes,
        notify_before_minutes: form.notify_before_minutes,
        due_time: form.due_time,
        start_date: form.start_date,
        end_date: form.end_date || null,
        custom_interval_days: form.frequency === 'custom' ? form.custom_interval_days : null,
        weekday_only: form.weekday_only,
        priority: form.priority,
        created_by: effectiveUserId,
      };

      let taskId = editingId;
      if (editingId) {
        const { error } = await supabase.from('recurring_tasks').update(payload).eq('id', editingId);
        if (error) throw error;
        toast.success('Recurring task updated');
      } else {
        const { data, error } = await supabase.from('recurring_tasks').insert(payload).select('id').single();
        if (error) throw error;
        taskId = data.id;
        toast.success('Recurring task created');
      }

      // Save subtasks: update kept ones (keeps their id and progress), insert new, delete removed
      if (taskId) {
        const keep = form.subtasks.filter((s) => s.title.trim());
        if (editingId) {
          const { data: existing } = await supabase.from('recurring_subtasks').select('id').eq('recurring_task_id', taskId);
          const keepIds = keep.map((s) => s.id).filter(Boolean) as string[];
          const removed = ((existing || []) as { id: string }[]).map((r) => r.id).filter((id) => !keepIds.includes(id));
          if (removed.length > 0) {
            const { error: delErr } = await supabase.from('recurring_subtasks').delete().in('id', removed);
            if (delErr) throw delErr;
          }
        }
        for (let i = 0; i < keep.length; i++) {
          const s = keep[i];
          const row = { recurring_task_id: taskId, title: s.title.trim(), sort_order: i };
          const { error: subErr } = s.id
            ? await supabase.from('recurring_subtasks').update(row).eq('id', s.id)
            : await supabase.from('recurring_subtasks').insert(row);
          if (subErr) throw subErr;
        }
      }

      // Immediately generate the next 30 days of instances so the schedule
      // is populated right away instead of waiting for a nightly job.
      if (taskId) {
        await supabase.rpc('generate_recurring_instances', {
          p_recurring_task_id: taskId,
          p_from_date: form.start_date,
          p_to_date: ymdLocal(new Date(Date.now() + 30 * 86400000)),
        });
      }

      setShowForm(false);
      resetForm();
      await Promise.all([fetchTemplates(), fetchInstances()]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save recurring task');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (t: RecurringTask) => {
    const { error } = await supabase.from('recurring_tasks').update({ is_active: !t.is_active }).eq('id', t.id);
    if (error) { toast.error('Failed to update'); return; }
    toast.success(t.is_active ? 'Paused' : 'Activated');
    fetchTemplates();
  };

  const deleteTemplate = async (t: RecurringTask) => {
    if (!confirm(`Delete "${t.title}"? This also removes its scheduled instances.`)) return;
    const { error } = await supabase.from('recurring_tasks').delete().eq('id', t.id);
    if (error) { toast.error('Failed to delete'); return; }
    toast.success('Recurring task deleted');
    fetchTemplates();
    fetchInstances();
  };

  // Duplicate: opens the form with this template's details as a NEW template.
  // Nothing is saved until Save; the start date resets to today so old occurrences are not back-filled.
  const duplicateTemplate = (t: RecurringTask) => {
    openEdit(t);
    setEditingId(null);
    setForm((f) => ({ ...f, start_date: ymdLocal(new Date()) }));
  };

  const generateMore = async (t: RecurringTask) => {
    setGeneratingId(t.id);
    try {
      const { data, error } = await supabase.rpc('generate_recurring_instances', {
        p_recurring_task_id: t.id,
        p_from_date: ymdLocal(new Date()),
        p_to_date: ymdLocal(new Date(Date.now() + 60 * 86400000)),
      });
      if (error) throw error;
      toast.success(`Generated ${data ?? 0} new instance(s) for the next 60 days`);
      fetchInstances();
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate instances');
    } finally {
      setGeneratingId(null);
    }
  };

  const generateAllForOrg = async () => {
    setGeneratingId('all');
    try {
      const { data, error } = await supabase.rpc('generate_all_recurring_instances', { p_days_ahead: 30 });
      if (error) throw error;
      toast.success(`Generated ${data ?? 0} instance(s) across all active recurring tasks`);
      fetchInstances();
    } catch (err: any) {
      toast.error(err.message || 'Failed to run bulk generation');
    } finally {
      setGeneratingId(null);
    }
  };

  const updateInstanceStatus = async (inst: TaskInstance, status: InstanceStatus) => {
    const payload: Record<string, any> = { status };
    if (status === 'completed') payload.completion_datetime = new Date().toISOString();
    const { error } = await supabase.from('recurring_task_instances').update(payload).eq('id', inst.id);
    if (error) { toast.error('Failed to update task'); return; }
    toast.success(status === 'completed' ? 'Marked complete ✅' : 'Status updated');
    fetchInstances();
  };

  const filteredTemplates = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter((t) => t.title.toLowerCase().includes(q) || (t.department || '').toLowerCase().includes(q));
  }, [templates, search]);

  const userName = (id: string) => allUsers.find((u) => u.id === id)?.full_name || 'Unknown';

  return (
    <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
      <Toaster position="bottom-right" richColors />

      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Repeat size={22} className="text-blue-600" /> Recurring Tasks
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-1">
            Automatically schedule repeating work — daily standups, monthly compliance filings, weekly reports, and more.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isManager && (
            <button
              onClick={generateAllForOrg}
              disabled={generatingId === 'all'}
              className="flex items-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-600 text-xs sm:text-sm font-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={generatingId === 'all' ? 'animate-spin' : ''} /> Generate all (30d)
            </button>
          )}
          {isManager && (
            <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary flex items-center gap-1.5 py-2 px-3 text-xs sm:text-sm">
              <Plus size={16} /> New recurring task
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setTab('templates')}
          className={`px-4 py-2.5 text-sm font-600 border-b-2 transition-colors ${tab === 'templates' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Templates ({templates.length})
        </button>
        <button
          onClick={() => setTab('instances')}
          className={`px-4 py-2.5 text-sm font-600 border-b-2 transition-colors ${tab === 'instances' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Scheduled occurrences ({instances.length})
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400 text-sm">Loading…</div>
      ) : tab === 'templates' ? (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…" className="input-field pl-8" />
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              No recurring tasks yet{isManager ? ' — create one to get started.' : '.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredTemplates.map((t) => (
                <div key={t.id} className={`rounded-2xl border p-4 bg-white dark:bg-slate-800 ${t.is_active ? 'border-slate-200 dark:border-slate-700' : 'border-slate-200 dark:border-slate-700 opacity-60'}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-700 text-sm text-slate-900 dark:text-slate-100">{t.title}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-600 ${PRIORITY_STYLE[t.priority]}`}>{t.priority}</span>
                  </div>
                  {t.description && <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">{t.description}</p>}
                  <div className="flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                    <span className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-lg">
                      <Repeat size={11} /> {FREQUENCY_LABELS[t.frequency]}
                    </span>
                    <span className="flex items-center gap-1 bg-slate-50 dark:bg-slate-700 px-2 py-1 rounded-lg">
                      <Clock size={11} /> Due {t.due_time?.slice(0, 5) || '17:00'}
                    </span>
                    <span className="flex items-center gap-1 bg-slate-50 dark:bg-slate-700 px-2 py-1 rounded-lg">
                      <Users size={11} /> {t.assigned_to_users?.length || 0} assigned
                    </span>
                  </div>
                  {isManager && (
                    <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-700">
                      <button onClick={() => toggleActive(t)} title={t.is_active ? 'Pause' : 'Activate'} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                        {t.is_active ? <PowerOff size={14} /> : <Power size={14} />}
                      </button>
                      <button onClick={() => generateMore(t)} disabled={generatingId === t.id} title="Generate more occurrences" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 disabled:opacity-50">
                        <Zap size={14} className={generatingId === t.id ? 'animate-pulse' : ''} />
                      </button>
                      <button onClick={() => duplicateTemplate(t)} title="Duplicate" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                        <Copy size={14} />
                      </button>
                      <button onClick={() => openEdit(t)} title="Edit" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => deleteTemplate(t)} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 ml-auto">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {isManager && (
              <div className="flex rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden text-xs font-600">
                <button onClick={() => setInstanceScope('mine')} className={`px-3 py-1.5 ${instanceScope === 'mine' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>Mine</button>
                <button onClick={() => setInstanceScope('all')} className={`px-3 py-1.5 ${instanceScope === 'all' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>Everyone</button>
              </div>
            )}
            <div className="relative">
              <select value={instanceStatusFilter} onChange={(e) => setInstanceStatusFilter(e.target.value as any)} className="input-field pr-8 appearance-none cursor-pointer text-xs py-1.5">
                <option value="all">All statuses</option>
                {(Object.keys(STATUS_STYLE) as InstanceStatus[]).map((s) => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {instances.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              No scheduled occurrences match this filter.
            </div>
          ) : (
            <div className="space-y-2">
              {instances.map((inst) => {
                const s = STATUS_STYLE[inst.status];
                const StatusIcon = s.icon;
                const mine = inst.assigned_to === effectiveUserId;
                return (
                  <div key={inst.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                  <div className="flex items-center gap-3 p-3">
                    <StatusIcon size={16} className={s.className.includes('red') ? 'text-red-500' : s.className.includes('emerald') ? 'text-emerald-500' : s.className.includes('blue') ? 'text-blue-500' : 'text-slate-400'} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-600 text-slate-800 dark:text-slate-100 truncate">{inst.task_name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar size={10} /> {inst.due_date}{inst.due_time ? ` · ${inst.due_time.slice(0, 5)}` : ''}</span>
                        {instanceScope === 'all' && <span>· {inst.user_profiles?.full_name || userName(inst.assigned_to)}</span>}
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-600 ${PRIORITY_STYLE[inst.priority]}`}>{inst.priority}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-600 ${s.className}`}>{s.label}</span>
                    {mine && inst.status !== 'completed' && inst.status !== 'cancelled' && (
                      <div className="flex items-center gap-1">
                        {inst.status === 'pending' && (
                          <button onClick={() => updateInstanceStatus(inst, 'in_progress')} className="text-[11px] px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100">Start</button>
                        )}
                        <button onClick={() => updateInstanceStatus(inst, 'completed')} className="text-[11px] px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Complete</button>
                      </div>
                    )}
                  </div>
                  {/* Each occurrence has its own subtask ticks, independent of other days */}
                  <InstanceSubtasks
                    instanceId={inst.id}
                    templateId={inst.recurring_task_id}
                    readOnly={!(mine && inst.status !== 'completed' && inst.status !== 'cancelled')}
                  />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Create / Edit template modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-700 text-slate-900 dark:text-slate-100">{editingId ? 'Edit recurring task' : 'New recurring task'}</h3>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Title *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Weekly compliance report" className="input-field" />
              </div>

              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="input-field resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Frequency</label>
                  <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })} className="input-field appearance-none cursor-pointer">
                    {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })} className="input-field appearance-none cursor-pointer">
                    {(['low', 'medium', 'high', 'critical'] as Priority[]).map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {form.frequency === 'custom' && (
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Repeat every N days</label>
                  <input type="number" min={1} value={form.custom_interval_days} onChange={(e) => setForm({ ...form, custom_interval_days: Number(e.target.value) })} className="input-field" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Due date (first occurrence)</label>
                  <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="input-field" />
                  <p className="text-[11px] text-slate-400 mt-1">Repeats are based on this due date.</p>
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Repeat up to (optional)</label>
                  <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="input-field" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Due time</label>
                  <input type="time" value={form.due_time} onChange={(e) => setForm({ ...form, due_time: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Time limit (min)</label>
                  <input type="number" min={5} value={form.time_limit_minutes} onChange={(e) => setForm({ ...form, time_limit_minutes: Number(e.target.value) })} className="input-field" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-600 text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={form.weekday_only} onChange={(e) => setForm({ ...form, weekday_only: e.target.checked })} />
                Skip weekends
              </label>

              {/* Firms: one or more; people below are members of the picked firms */}
              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">
                  Firms <span className="text-slate-400 font-400">(select one or more)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {firmOptions.map((fm) => {
                    const on = form.firm_ids.includes(fm.id);
                    return (
                      <button
                        key={fm.id}
                        type="button"
                        onClick={() => setForm((f) => {
                          const firm_ids = f.firm_ids.includes(fm.id)
                            ? f.firm_ids.filter((x) => x !== fm.id)
                            : [...f.firm_ids, fm.id];
                          // Drop anyone whose firm is no longer picked
                          const assigned_to_users = f.assigned_to_users.filter((id) => {
                            const firmOfUser = allUsers.find((u) => u.id === id)?.firm_id;
                            return firm_ids.length === 0 || (!!firmOfUser && firm_ids.includes(firmOfUser));
                          });
                          return { ...f, firm_ids, assigned_to_users };
                        })}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          on
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        {fm.name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {form.firm_ids.length === 0 ? 'No firm picked: people from all firms are shown' : `${form.firm_ids.length} firm${form.firm_ids.length > 1 ? 's' : ''} selected`}
                </p>
              </div>

              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Client / Subsidiary</label>
                <select value={form.client_pick} onChange={(e) => setForm({ ...form, client_pick: e.target.value })} className="input-field appearance-none cursor-pointer">
                  <option value="">Internal</option>
                  {firmOptions.some((f) => f.firm_type === 'subsidiary') && (
                    <optgroup label="Subsidiaries">
                      {firmOptions.filter((f) => f.firm_type === 'subsidiary').map((f) => (
                        <option key={`firm:${f.id}`} value={`firm:${f.id}`}>{f.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {clientOrgs.length > 0 && (
                    <optgroup label="Clients">
                      {clientOrgs.map((o) => <option key={`client:${o.id}`} value={`client:${o.id}`}>{o.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Assign to *</label>
                <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-xl p-2 space-y-1">
                  {allUsers.filter((u) => form.firm_ids.length === 0 || (!!u.firm_id && form.firm_ids.includes(u.firm_id))).map((u) => (
                    <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={form.assigned_to_users.includes(u.id)}
                        onChange={(e) => {
                          setForm((f) => ({
                            ...f,
                            assigned_to_users: e.target.checked
                              ? [...f.assigned_to_users, u.id]
                              : f.assigned_to_users.filter((id) => id !== u.id),
                          }));
                        }}
                      />
                      <span className="text-slate-700 dark:text-slate-200">{u.full_name}</span>
                      <span className="text-[10px] text-slate-400 ml-auto">{u.department || u.role}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Subtasks: each has its own title and assignee; every occurrence gets its own tick */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-600 text-slate-700 dark:text-slate-300">Subtasks</label>
                  <button type="button"
                    onClick={() => setForm((f) => ({ ...f, subtasks: [...f.subtasks, { title: '', assigned_to: '' }] }))}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    <Plus size={12} /> Add subtask
                  </button>
                </div>
                {form.subtasks.length === 0 && (
                  <p className="text-[11px] text-slate-400">No subtasks yet.</p>
                )}
                <div className="space-y-2">
                  {form.subtasks.map((s, i) => (
                    <div key={s.id || `new-${i}`} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        className="input-field col-span-11"
                        placeholder="Subtask title"
                        value={s.title}
                        onChange={(e) => setForm((f) => ({ ...f, subtasks: f.subtasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }))}
                      />
                      <button type="button"
                        onClick={() => setForm((f) => ({ ...f, subtasks: f.subtasks.filter((_, j) => j !== i) }))}
                        className="col-span-1 flex justify-center text-red-500 hover:text-red-600"
                        aria-label="Remove subtask">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
              <button onClick={() => { setShowForm(false); resetForm(); }} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary py-2.5 disabled:opacity-50">
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create & schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}