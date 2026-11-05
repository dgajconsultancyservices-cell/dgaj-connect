// v2 - force chunk rebuild
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { AlertTriangle, CheckCircle2, RefreshCw, Calendar, Download, Filter, Search, TrendingUp, Clock, ListTodo, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast, Toaster } from 'sonner';
import { useRouter } from 'next/navigation';


interface TaskRecord {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  due_time: string | null;
  assigned_to_name: string;
  assigned_to_dept: string;
  assigned_user_ids: string[];
  assigned_to_user_id: string | null;
  created_at: string;
  completed_at: string | null;
  time_to_complete_minutes: number | null;
  is_overdue: boolean;
  task_category: string;
  recurring: string | null;
  instance_date: string | null;
  parent_recurring_task_id: string | null;
  source?: 'task' | 'recurring_instance';
}

interface UserProfile {
  id: string;
  full_name: string;
  department: string;
}

const STATUS_COLORS: Record<string, string> = {
  done: '#10b981',
  'in-progress': '#3b82f6',
  todo: '#94a3b8',
  overdue: '#ef4444',
  review: '#8b5cf6',
  completed: '#10b981',
  pending: '#94a3b8',
};

const DEPT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  if (typeof window !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

function formatMinutes(mins: number | null): string {
  if (!mins) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDateTime(dt: string | null): string {
  if (!dt) return '—';
  try {
    return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dt; }
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}

export default function TaskAnalytics() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const { effectiveUserId, pinSession } = useAuth();
  const supabase = createClient();

  // Filters
  const [userFilter, setUserFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [taskTypeFilter, setTaskTypeFilter] = useState('all'); // all | recurring | one-time | additional
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeView, setActiveView] = useState<'overview' | 'table' | 'per-user'>('overview');

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const fetchData = useCallback(async () => {
    const uid = effectiveUserId;
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      // Supabase returns at most 1,000 rows per request, so read every page
      const fetchAll = async (build: () => any): Promise<any[]> => {
        const out: any[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await build().range(from, from + 999);
          if (error) throw error;
          out.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
        return out;
      };

      const [tasksRows, usersRes, instancesRows] = await Promise.all([
        fetchAll(() => supabase
          .from('tasks')
          .select('id, title, status, priority, due_date, due_time, assigned_to_name, assigned_to_dept, assigned_user_ids, assigned_to_user_id, created_at, completed_at, time_to_complete_minutes, is_overdue, task_category, recurring, instance_date, parent_recurring_task_id')
          .eq('is_recurring', false)
          .order('created_at', { ascending: false })
          .order('id')),
        supabase.from('user_profiles').select('id, full_name, department').order('full_name'),
        fetchAll(() => supabase
          .from('recurring_task_instances')
          .select('id, task_name, status, priority, due_date, due_time, assigned_to, assigned_datetime, completion_datetime, time_taken_minutes, is_overdue, frequency, recurring_task_id, client_org_name, organisation_relates_to')
          .order('due_date', { ascending: false })
          .order('id')),
      ]);
      if (usersRes.error) throw usersRes.error;

      const mapped = tasksRows.map((t: any) => ({
        ...t,
        assigned_user_ids: Array.isArray(t.assigned_user_ids) ? t.assigned_user_ids : [],
        is_overdue: t.is_overdue || (t.due_date && t.due_date < today && t.status !== 'done' && t.status !== 'completed'),
        source: 'task' as const,
      }));

      // Occurrence names come from the user list, not from columns that may be missing in the database
      const userById = new Map<string, UserProfile>((usersRes.data || []).map((u: any) => [u.id, u as UserProfile]));

      // Map recurring instances to TaskRecord shape
      const instancesMapped = instancesRows.map((i: any) => ({
        id: i.id,
        title: i.task_name || 'Recurring Task',
        status: i.status,
        priority: i.priority || 'medium',
        due_date: i.due_date,
        due_time: i.due_time || null,
        assigned_to_name: userById.get(i.assigned_to)?.full_name || '—',
        assigned_to_dept: userById.get(i.assigned_to)?.department || '—',
        assigned_user_ids: i.assigned_to ? [i.assigned_to] : [],
        assigned_to_user_id: i.assigned_to || null,
        created_at: i.assigned_datetime || i.due_date,
        completed_at: i.completion_datetime || null,
        time_to_complete_minutes: i.time_taken_minutes || null,
        is_overdue: i.is_overdue || (i.due_date && i.due_date < today && i.status !== 'completed' && i.status !== 'cancelled'),
        task_category: 'recurring',
        recurring: i.frequency || 'recurring',
        instance_date: i.due_date,
        parent_recurring_task_id: i.recurring_task_id || null,
        source: 'recurring_instance' as const,
      }));

      setTasks([...mapped, ...instancesMapped]);
      setUsers(usersRes.data || []);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, today]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Departments list
  const departments = useMemo(() => {
    const depts = Array.from(new Set(tasks.map(t => t.assigned_to_dept).filter(Boolean)));
    return depts.sort();
  }, [tasks]);

  // Apply filters — use actual historical task records
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const matchUser = userFilter === 'all' ||
        t.assigned_user_ids.includes(userFilter) ||
        t.assigned_to_user_id === userFilter;
      const matchStatus = statusFilter === 'all' ||
        t.status === statusFilter ||
        (statusFilter === 'done' && t.status === 'completed') ||
        (statusFilter === 'overdue' && t.is_overdue);
      const matchDept = deptFilter === 'all' || t.assigned_to_dept === deptFilter;
      const matchType = taskTypeFilter === 'all' ||
        (taskTypeFilter === 'recurring' && (t.recurring || t.parent_recurring_task_id || (t as any).source === 'recurring_instance')) ||
        (taskTypeFilter === 'one-time' && !t.recurring && !t.parent_recurring_task_id && (t as any).source !== 'recurring_instance') ||
        (taskTypeFilter === 'additional' && t.task_category === 'additional');
      // Date filter: use occurrence date (instance_date) or due_date or created_at
      const taskDate = t.instance_date || t.due_date || t.created_at?.split('T')[0];
      const matchDate = (!dateFrom || (taskDate && taskDate >= dateFrom)) &&
        (!dateTo || (taskDate && taskDate <= dateTo));
      const matchSearch = !searchQuery ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.assigned_to_name?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchUser && matchStatus && matchDept && matchType && matchDate && matchSearch;
    });
  }, [tasks, userFilter, statusFilter, deptFilter, taskTypeFilter, dateFrom, dateTo, searchQuery]);

  // ── Core Metrics ──
  const total = filteredTasks.length;
  const done = filteredTasks.filter(t => t.status === 'done' || t.status === 'completed').length;
  const inProgress = filteredTasks.filter(t => t.status === 'in-progress' || t.status === 'in_progress').length;
  const overdueTasks = filteredTasks.filter(t =>
    t.is_overdue || t.status === 'overdue' ||
    (t.due_date && t.due_date < today && t.status !== 'done' && t.status !== 'completed')
  );
  const overdueCount = overdueTasks.length;

  // Completion Rate = Completed ÷ Total Assigned × 100
  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
  // Overdue Rate = Overdue ÷ Total Assigned × 100
  const overdueRate = total > 0 ? Math.round((overdueCount / total) * 100) : 0;
  // On-Time Completion Rate = Tasks completed before due date ÷ Completed × 100
  const onTimeCompletions = filteredTasks.filter(t => {
    if (t.status !== 'done' && t.status !== 'completed') return false;
    if (!t.due_date) return true;
    const completedDate = t.completed_at?.split('T')[0];
    if (!completedDate) return false;
    return completedDate <= t.due_date;
  }).length;
  const onTimeRate = done > 0 ? Math.round((onTimeCompletions / done) * 100) : 0;

  // Average completion time
  const avgCompletionTime = (() => {
    const completed = filteredTasks.filter(t => t.time_to_complete_minutes && t.time_to_complete_minutes > 0);
    if (completed.length === 0) return null;
    return Math.round(completed.reduce((sum, t) => sum + (t.time_to_complete_minutes || 0), 0) / completed.length);
  })();

  // Status breakdown
  const statusBreakdown = [
    { name: 'Completed', value: done, color: STATUS_COLORS.done },
    { name: 'In Progress', value: inProgress, color: STATUS_COLORS['in-progress'] },
    { name: 'To Do', value: filteredTasks.filter(t => t.status === 'todo' || t.status === 'pending').length, color: STATUS_COLORS.todo },
    { name: 'Overdue', value: overdueCount, color: STATUS_COLORS.overdue },
  ].filter(s => s.value > 0);

  // Task type breakdown — counts recurring instances separately
  const typeBreakdown = [
    { name: 'Recurring Instances', value: filteredTasks.filter(t => (t as any).source === 'recurring_instance' || t.recurring || t.parent_recurring_task_id).length, color: '#8b5cf6' },
    { name: 'One-Time', value: filteredTasks.filter(t => (t as any).source !== 'recurring_instance' && !t.recurring && !t.parent_recurring_task_id).length, color: '#3b82f6' },
  ].filter(s => s.value > 0);

  // Per-user stats
  const userStats = users
    .map(u => {
      const userTasks = filteredTasks.filter(t =>
        t.assigned_user_ids.includes(u.id) ||
        t.assigned_to_user_id === u.id ||
        t.assigned_to_name === u.full_name
      );
      const userDone = userTasks.filter(t => t.status === 'done' || t.status === 'completed').length;
      const userOverdue = userTasks.filter(t =>
        t.is_overdue || t.status === 'overdue' ||
        (t.due_date && t.due_date < today && t.status !== 'done' && t.status !== 'completed')
      ).length;
      const userInProgress = userTasks.filter(t => t.status === 'in-progress').length;
      const onTime = userTasks.filter(t => {
        if (t.status !== 'done' && t.status !== 'completed') return false;
        if (!t.due_date) return true;
        const cd = t.completed_at?.split('T')[0];
        return cd ? cd <= t.due_date : false;
      }).length;
      const avgTime = (() => {
        const c = userTasks.filter(t => t.time_to_complete_minutes && t.time_to_complete_minutes > 0);
        return c.length > 0 ? Math.round(c.reduce((s, t) => s + (t.time_to_complete_minutes || 0), 0) / c.length) : null;
      })();
      return {
        id: u.id, name: u.full_name, dept: u.department,
        total: userTasks.length, done: userDone, overdue: userOverdue, inProgress: userInProgress,
        onTime, onTimeRate: userDone > 0 ? Math.round((onTime / userDone) * 100) : 0,
        rate: userTasks.length > 0 ? Math.round((userDone / userTasks.length) * 100) : 0,
        avgTime,
      };
    })
    .filter(u => u.total > 0)
    .sort((a, b) => b.total - a.total);

  // Per-department stats
  const deptStats = departments.map((dept, i) => {
    const deptTasks = filteredTasks.filter(t => t.assigned_to_dept === dept);
    const deptDone = deptTasks.filter(t => t.status === 'done' || t.status === 'completed').length;
    const deptOverdue = deptTasks.filter(t =>
      t.is_overdue || t.status === 'overdue' ||
      (t.due_date && t.due_date < today && t.status !== 'done' && t.status !== 'completed')
    ).length;
    return {
      dept: dept.length > 14 ? dept.slice(0, 12) + '…' : dept,
      total: deptTasks.length, done: deptDone, overdue: deptOverdue,
      inProgress: deptTasks.filter(t => t.status === 'in-progress').length,
      rate: deptTasks.length > 0 ? Math.round((deptDone / deptTasks.length) * 100) : 0,
      color: DEPT_COLORS[i % DEPT_COLORS.length],
    };
  }).filter(d => d.total > 0);

  // Report table rows
  const reportRows = filteredTasks.map(t => {
    const occurrenceDate = t.instance_date || t.due_date || t.created_at?.split('T')[0] || '';
    const isOverdue = t.is_overdue || t.status === 'overdue' ||
      (t.due_date && t.due_date < today && t.status !== 'done' && t.status !== 'completed');
    const dueDateTime = t.due_date ? `${t.due_date}${t.due_time ? ' ' + t.due_time : ''}` : null;
    const isRecurring = (t as any).source === 'recurring_instance' || t.recurring || t.parent_recurring_task_id;
    return {
      date: occurrenceDate,
      task: t.title,
      assignedTo: t.assigned_to_name || '—',
      dateAssigned: t.created_at,
      dueDate: dueDateTime,
      timeCompleted: t.completed_at,
      timeTaken: t.time_to_complete_minutes,
      isOverdue: isOverdue ? 'Yes' : 'No',
      status: t.status,
      taskType: isRecurring ? 'Recurring' : 'One-Time',
      dept: t.assigned_to_dept || '—',
    };
  });

  const handleExportCSV = () => {
    const headers = ['Date', 'Task', 'Assigned To', 'Department', 'Task Type', 'Date Assigned', 'Due Date', 'Time Completed', 'Time Taken', 'Status', 'Overdue'];
    const rows = reportRows.map(r => [
      formatDate(r.date),
      r.task,
      r.assignedTo,
      r.dept,
      r.taskType,
      formatDateTime(r.dateAssigned),
      r.dueDate ? formatDateTime(r.dueDate) : '—',
      formatDateTime(r.timeCompleted),
      formatMinutes(r.timeTaken),
      r.status,
      r.isOverdue,
    ]);
    downloadCSV(`task-analytics-${dateFrom}-to-${dateTo}.csv`, headers, rows);
    toast.success('CSV exported');
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <Toaster richColors position="top-right" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <button
              onClick={() => router.back()}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-500 dark:text-slate-400 mr-1"
              aria-label="Go back"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <TrendingUp size={16} className="text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Task Analytics</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Historical task performance — all instances, recurring &amp; one-time
            {lastRefresh && <span className="ml-2 text-slate-400">· Updated {lastRefresh.toLocaleTimeString()}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-500">
            <RefreshCw size={16} />
          </button>
          <button onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showFilters ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            <Filter size={14} /> Filters
          </button>
          <button onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 mb-5 shadow-sm">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-blue-300 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-blue-300 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Employee</label>
              <select value={userFilter} onChange={e => setUserFilter(e.target.value)}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-blue-300 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                <option value="all">All Employees</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Department</label>
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-blue-300 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                <option value="all">All Departments</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Task Type</label>
              <select value={taskTypeFilter} onChange={e => setTaskTypeFilter(e.target.value)}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-blue-300 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                <option value="all">All Tasks</option>
                <option value="recurring">Recurring Only</option>
                <option value="one-time">One-Time Only</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-blue-300 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                <option value="all">All Status</option>
                <option value="done">Completed</option>
                <option value="in-progress">In Progress</option>
                <option value="todo">To Do</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>
          <div className="mt-3 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search tasks or employees…"
              className="w-full text-sm pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-300 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-center gap-2 text-red-700">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Total Tasks', value: total, color: 'text-slate-700', bg: 'bg-white border-slate-200', icon: ListTodo },
          { label: 'Completed', value: done, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
          { label: 'In Progress', value: inProgress, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: Clock },
          { label: 'Overdue', value: overdueCount, color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: AlertTriangle },
          { label: 'Completion %', value: `${completionRate}%`, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: TrendingUp },
          { label: 'On-Time %', value: `${onTimeRate}%`, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: Calendar },
        ].map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`rounded-xl border p-4 ${card.bg} dark:bg-slate-800 dark:border-slate-700`}>
              <div className="flex items-center justify-between mb-1">
                <Icon size={14} className={card.color} />
              </div>
              <p className={`text-2xl font-bold tabular-nums ${card.color}`}>{card.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
            </div>
          );
        })}
      </div>

      {/* Formula Note */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 mb-5 text-xs text-blue-700 dark:text-blue-300">
        <strong>Formulas:</strong> Completion Rate = Completed ÷ Total Assigned × 100 &nbsp;|&nbsp;
        On-Time Rate = Completed Before Due ÷ Completed × 100 &nbsp;|&nbsp;
        Overdue Rate = {overdueRate}% &nbsp;|&nbsp;
        Avg Completion Time = {formatMinutes(avgCompletionTime)}
      </div>

      {/* View Tabs */}
      <div className="flex gap-2 mb-5">
        {(['overview', 'table', 'per-user'] as const).map(v => (
          <button key={v} onClick={() => setActiveView(v)}
            className={`px-4 py-2 text-sm font-semibold rounded-xl border transition-colors capitalize ${activeView === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-300'}`}>
            {v === 'per-user' ? 'Per Employee' : v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Charts */}
      {activeView === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Status Breakdown */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Task Status Breakdown</h3>
              {statusBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={statusBreakdown} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                      {statusBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-slate-400 text-center py-8">No data for selected filters</p>}
            </div>

            {/* Department Performance */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Department Completion Rate (%)</h3>
              {deptStats.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={deptStats} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="dept" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip formatter={(v: any) => [`${v}%`, 'Completion Rate']} />
                    <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                      {deptStats.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-slate-400 text-center py-8">No department data</p>}
            </div>
          </div>

          {/* Task Type Breakdown */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Task Type Distribution</h3>
            <div className="flex flex-wrap gap-4">
              {typeBreakdown.map(t => (
                <div key={t.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="text-sm text-slate-600 dark:text-slate-400">{t.name}: <strong>{t.value}</strong></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Report Table */}
      {activeView === 'table' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Task Report — {reportRows.length} records</h3>
            <button onClick={handleExportCSV} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
              <Download size={13} /> Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/50">
                  {['Date', 'Task', 'Assigned To', 'Dept', 'Type', 'Date Assigned', 'Due Date', 'Time Completed', 'Time Taken', 'Status', 'Overdue'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {reportRows.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-8 text-slate-400">No tasks match the selected filters</td></tr>
                ) : reportRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-700 dark:text-slate-300">{formatDate(r.date)}</td>
                    <td className="px-3 py-2.5 max-w-[180px] truncate text-slate-900 dark:text-slate-100 font-medium">{r.task}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-400">{r.assignedTo}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-500">{r.dept}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${r.taskType === 'Recurring' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{r.taskType}</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-500">{formatDateTime(r.dateAssigned)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-500">{r.dueDate ? formatDateTime(r.dueDate) : '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-500">{formatDateTime(r.timeCompleted)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-500">{formatMinutes(r.timeTaken)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${r.status === 'done' || r.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : r.status === 'overdue' ? 'bg-red-100 text-red-700' : r.status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`font-semibold ${r.isOverdue === 'Yes' ? 'text-red-600' : 'text-emerald-600'}`}>{r.isOverdue}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-User Stats */}
      {activeView === 'per-user' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Employee Performance — {userStats.length} employees</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/50">
                  {['Employee', 'Department', 'Total', 'Completed', 'In Progress', 'Overdue', 'Completion %', 'On-Time %', 'Avg Time'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {userStats.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-slate-400">No employee data for selected filters</td></tr>
                ) : userStats.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{u.name}</td>
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{u.dept || '—'}</td>
                    <td className="px-3 py-2.5 font-bold text-slate-700 dark:text-slate-300">{u.total}</td>
                    <td className="px-3 py-2.5 text-emerald-600 font-semibold">{u.done}</td>
                    <td className="px-3 py-2.5 text-blue-600 font-semibold">{u.inProgress}</td>
                    <td className="px-3 py-2.5 text-red-600 font-semibold">{u.overdue}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${u.rate}%` }} />
                        </div>
                        <span className="font-semibold text-emerald-700">{u.rate}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-blue-600 font-semibold">{u.onTimeRate}%</td>
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{formatMinutes(u.avgTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}