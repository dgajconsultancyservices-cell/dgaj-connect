'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, CheckSquare, Square, Clock, Bell, Users, Building2, ChevronDown, AlertTriangle, CheckCircle2, Circle, X, Calendar, Flag, Repeat, Search, ArrowRight, Trash2, BellRing, Edit2, Save, Tag, Copy, Briefcase, MessageSquare, HelpCircle, Power, PowerOff, UserPlus } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import ClientOrganisations from './ClientOrganisations';
import TaskCategoryManager from './TaskCategoryManager';
import { useLanguage } from '@/contexts/LanguageContext';
import TaskSubtasks from '@/components/TaskSubtasks';
import InstanceSubtasks from '@/components/InstanceSubtasks';

type Priority = 'critical' | 'high' | 'medium' | 'low';
type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done' | 'overdue';
type TaskCategory = 'all' | 'daily' | 'daily-excel' | 'monthly' | 'monthly-excel' | 'general';

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  dueTime?: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  due_date: string;
  due_time: string;
  assigned_to: string | null;
  assigned_to_user_id: string | null;
  assigned_to_name: string;
  assigned_to_dept: string;
  assigned_by_name: string;
  assigned_by_dept: string;
  assigned_user_ids: string[];
  checklist: ChecklistItem[];
  tags: string[];
  recurring?: string | null;
  notify_before_minutes?: number;
  is_overdue?: boolean;
  is_template?: boolean;
  task_category?: string;
  firm_id?: string | null;
  firm_ids?: string[] | null;
  client_org_id?: string | null;
  client_org_name?: string | null;
  organisation_relates_to?: string | null;
  notes?: string;
  is_flagged?: boolean;
  flag_reason?: string;
  helper_user_ids?: string[];
  is_active?: boolean;
  reminder_times?: number[];
  created_at?: string;
  assigned_by?: string | null;
}

// Local calendar date as YYYY-MM-DD. Do not use toISOString() for dates: it
// converts to UTC, which moves India (IST) dates back a day.
const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface UserProfile {
  id: string;
  full_name: string;
  role: string;
  department: string;
  job_title?: string;
  firm_id?: string | null;
}

interface ClientOrg {
  id: string;
  name: string;
}

const departments = ['Engineering', 'Product', 'Design', 'Marketing', 'Sales', 'HR & Operations', 'Finance', 'Customer Support'];

const priorityConfig: Record<Priority, { label: string; color: string; dot: string; border: string }> = {
  critical: { label: 'Critical', color: 'text-red-600 bg-red-50', dot: 'bg-red-500', border: 'border-l-red-500' },
  high: { label: 'High', color: 'text-orange-600 bg-orange-50', dot: 'bg-orange-500', border: 'border-l-orange-500' },
  medium: { label: 'Medium', color: 'text-amber-600 bg-amber-50', dot: 'bg-amber-400', border: 'border-l-amber-400' },
  low: { label: 'Low', color: 'text-slate-500 bg-slate-100', dot: 'bg-slate-400', border: 'border-l-slate-300' },
};

const statusConfig: Record<TaskStatus, { label: string; color: string }> = {
  'todo': { label: 'To Do', color: 'text-slate-600 bg-slate-100' },
  'in-progress': { label: 'In Progress', color: 'text-blue-600 bg-blue-50' },
  'review': { label: 'Review', color: 'text-purple-600 bg-purple-50' },
  'done': { label: 'Done', color: 'text-emerald-600 bg-emerald-50' },
  'overdue': { label: 'Overdue', color: 'text-red-600 bg-red-50' },
};

const defaultCategoryLabels: Record<string, string> = {
  'daily': 'Daily Tasks',
  'daily-excel': 'Daily Excel',
  'monthly': 'Monthly Tasks',
  'monthly-excel': 'Monthly Excel',
  'general': 'General',
};

// Hindi translations for common task-related terms
const hindiTaskTranslations: Record<string, string> = {
  'Daily Tasks': 'दैनिक कार्य',
  'Daily Excel': 'दैनिक एक्सेल',
  'Monthly Tasks': 'मासिक कार्य',
  'Monthly Excel': 'मासिक एक्सेल',
  'General': 'सामान्य',
  'Review': 'समीक्षा',
  'Prepare': 'तैयार करें',
  'Update': 'अपडेट करें',
  'Complete': 'पूर्ण करें',
  'Submit': 'जमा करें',
  'Check': 'जांचें',
  'Send': 'भेजें',
  'Create': 'बनाएं',
  'Review and approve': 'समीक्षा और अनुमोदन',
  'Follow up': 'अनुवर्ती',
  'Meeting': 'बैठक',
  'Report': 'रिपोर्ट',
  'Analysis': 'विश्लेषण',
  'Documentation': 'दस्तावेज़ीकरण',
};

interface NewTaskForm {
  title: string;
  description: string;
  priority: Priority;
  dueDate: string;
  dueTime: string;
  assignedToDept: string;
  firmIds: string[];
  subtasks: { title: string; assigned_to: string }[];
  assignedUserIds: string[];
  recurring: string;
  notifyBefore: number;
  reminderTimes: number[];
  checklistItems: string[];
  organisationRelatesTo: string;
    clientOrgId: string;
  taskCategory: string;
  helperUserIds: string[];
  collaboratorUserIds: string[];
  isFlagged: boolean;
  flagReason: string;
}

const defaultForm: NewTaskForm = {
  title: '', description: '', priority: 'medium', dueDate: '', dueTime: '',
  assignedToDept: '', firmIds: [], subtasks: [], assignedUserIds: [], recurring: '', notifyBefore: 30, reminderTimes: [],
    checklistItems: [''], organisationRelatesTo: '', clientOrgId: '', taskCategory: 'general',
  helperUserIds: [], collaboratorUserIds: [], isFlagged: false, flagReason: '',
};

// Extended recurring options
const RECURRING_OPTIONS = [
  { value: '', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'bi-monthly', label: 'Bi-Monthly (15th & 30th)' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'custom', label: 'Custom' },
];

// Multi-user selector component
function UserMultiSelect({
  allUsers,
  selectedIds,
  onChange,
  roleGroups,
}: {
  allUsers: UserProfile[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  roleGroups: { label: string; roles: string[] }[];
}) {
  const [open, setOpen] = useState(false);

  const toggleUser = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectedUsers = allUsers.filter((u) => selectedIds.includes(u.id));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input-field w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          <Users size={14} className="text-slate-400 flex-shrink-0" />
          {selectedUsers.length === 0 ? (
            <span className="text-slate-400 text-sm">— Select one or more users —</span>
          ) : (
            selectedUsers.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-500">
                {u.full_name}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleUser(u.id); }}
                  className="hover:text-red-500 transition-colors"
                >
                  <X size={10} />
                </button>
              </span>
            ))
          )}
        </span>
        <ChevronDown size={14} className={`text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg max-h-56 overflow-y-auto">
          {roleGroups.map((group) => {
            const groupUsers = allUsers.filter((u) => group.roles.includes(u.role));
            if (groupUsers.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="px-3 py-1.5 text-[10px] font-700 text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                  {group.label}
                </div>
                {groupUsers.map((u) => {
                  const checked = selectedIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleUser(u.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left ${checked ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-500'}`}>
                        {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </div>
                      <span className={`font-500 ${checked ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}`}>
                        {u.full_name}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto flex-shrink-0">{u.job_title || u.role}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | TaskStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory>('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTask, setNewTask] = useState<NewTaskForm>(defaultForm);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [userRole, setUserRole] = useState<string>('employee');
  const [userName, setUserName] = useState<string>('');
  const [userDept, setUserDept] = useState<string>('');
  const [clientOrgs, setClientOrgs] = useState<ClientOrg[]>([]);
  const [showClientOrgs, setShowClientOrgs] = useState(false);
  const [copyToClientTask, setCopyToClientTask] = useState<Task | null>(null);
  const [copyTargetOrgId, setCopyTargetOrgId] = useState<string>('');
  const [copyingTask, setCopyingTask] = useState(false);
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [dynamicCategories, setDynamicCategories] = useState<{ id: string; name: string; slug: string; color: string }[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [assignedUserFilter, setAssignedUserFilter] = useState<string>('all');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'created' | 'due_date' | 'priority' | 'status'>('created');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [showNoteModal, setShowNoteModal] = useState<{ taskId: string; taskTitle: string } | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [taskNotes, setTaskNotes] = useState<Record<string, any[]>>({});
  const [savingNote, setSavingNote] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState<Task | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [showHelperModal, setShowHelperModal] = useState<Task | null>(null);
  const [helperIds, setHelperIds] = useState<string[]>([]);
  const [showCollaboratorModal, setShowCollaboratorModal] = useState<Task | null>(null);
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>([]);
  const [taskCollaborators, setTaskCollaborators] = useState<Record<string, any[]>>({});
  const [savingCollaborators, setSavingCollaborators] = useState(false);
  const [myPendingInvites, setMyPendingInvites] = useState<any[]>([]);
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);
  // My Tasks section filters
  const [myTasksSearch, setMyTasksSearch] = useState('');
  const [myTasksCollapsed, setMyTasksCollapsed] = useState(false);
  const [myTasksCompleting, setMyTasksCompleting] = useState<string | null>(null);
  // Recurring task instances for current user
  const [myRecurringInstances, setMyRecurringInstances] = useState<any[]>([]);
  const [recurringInstancesLoading, setRecurringInstancesLoading] = useState(false);
  const { user, pinSession, effectiveUserId } = useAuth();
  // Subsidiaries the user can see, offered alongside clients in the task client picker.
  // Loaded directly here (visibility rule, then subsidiary firms only).
  const [visibleSubs, setVisibleSubs] = useState<{ id: string; name: string }[]>([]);
  // Every firm the user can see, for the multi-firm picker on the create form
  const [visibleFirmList, setVisibleFirmList] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!effectiveUserId) return;
    (async () => {
      const { data: ids, error: rpcErr } = await createClient().rpc('get_visible_firm_ids', { p_user_id: effectiveUserId, p_module: 'all' });
      if (rpcErr) { console.warn('Visible firms failed:', rpcErr.message); return; }
      if (!ids || ids.length === 0) { setVisibleSubs([]); setVisibleFirmList([]); return; }
      const { data, error } = await createClient()
        .from('firms')
        .select('id, name, firm_type')
        .in('id', ids as string[])
        .order('name', { ascending: true });
      if (error) { console.warn('Firm load failed:', error.message); return; }
      const all = (data || []) as { id: string; name: string; firm_type: string }[];
      setVisibleFirmList(all.map(({ id, name }) => ({ id, name })));
      setVisibleSubs(all.filter((f) => f.firm_type === 'subsidiary').map(({ id, name }) => ({ id, name })));
    })();
  }, [effectiveUserId]);
  const { language } = useLanguage();

  // ── Client + subsidiary picker (shared by filter, create, edit and copy) ──
  // Values: "client:<id>" = client, "firm:<id>" = subsidiary, "none" = Internal (filter only),
  // "text:<name>" = older free-text value, "" = nothing chosen.
  const subNameSet = visibleSubs.map((f) => f.name);
  const subById = (id: string) => visibleSubs.find((f) => f.id === id);
  const pickRef = (clientOrgId?: string | null, orgName?: string | null) => {
    if (clientOrgId) return `client:${clientOrgId}`;
    if (!orgName) return '';
    const sub = visibleSubs.find((f) => f.name === orgName);
    return sub ? `firm:${sub.id}` : `text:${orgName}`;
  };
  const applyPick = (v: string) => {
    if (v.startsWith('client:')) {
      const org = clientOrgs.find((o) => o.id === v.slice(7));
      return { clientOrgId: org?.id || '', clientOrgName: org?.name || null, organisationRelatesTo: org?.name || '' };
    }
    if (v.startsWith('firm:')) {
      const f = subById(v.slice(5));
      return { clientOrgId: '', clientOrgName: null, organisationRelatesTo: f?.name || '' };
    }
    if (v.startsWith('text:')) return { clientOrgId: '', clientOrgName: null, organisationRelatesTo: v.slice(5) };
    return { clientOrgId: '', clientOrgName: null, organisationRelatesTo: '' };
  };
  const pickerOptions = (includeInternal: boolean) => (
    <>
      {includeInternal && <option value="">— {language === 'hi' ? 'कोई नहीं (आंतरिक)' : 'None (Internal)'} —</option>}
      {visibleSubs.length > 0 && (
        <optgroup label={language === 'hi' ? 'सहायक कंपनियां' : 'Subsidiaries'}>
          {visibleSubs.map((f) => <option key={`firm:${f.id}`} value={`firm:${f.id}`}>{f.name}</option>)}
        </optgroup>
      )}
      {clientOrgs.length > 0 && (
        <optgroup label={language === 'hi' ? 'क्लाइंट' : 'Clients'}>
          {clientOrgs.map((o) => <option key={`client:${o.id}`} value={`client:${o.id}`}>{o.name}</option>)}
        </optgroup>
      )}
    </>
  );
  const supabase = createClient();
  const subscriptionsRef = useRef<any[]>([]);

  // Build category labels from dynamic categories (fallback to defaults)
  const categoryLabels: Record<string, string> = dynamicCategories.length > 0
    ? Object.fromEntries(dynamicCategories.map((c) => [c.slug, c.name]))
    : defaultCategoryLabels;

  // Build category filter options
  const categoryFilterOptions = dynamicCategories.length > 0
    ? dynamicCategories.map((c) => c.slug)
    : ['daily', 'daily-excel', 'monthly', 'monthly-excel', 'general'];

  // Helper: translate text to Hindi if language is Hindi
  const translateToHindi = useCallback((text: string): string => {
    if (language !== 'hi' || !text) return text;
    // Check direct match first
    if (hindiTaskTranslations[text]) return hindiTaskTranslations[text];
    // Check partial matches for common prefixes
    for (const [en, hi] of Object.entries(hindiTaskTranslations)) {
      if (text.toLowerCase().startsWith(en.toLowerCase())) {
        return hi + text.slice(en.length);
      }
    }
    return text;
  }, [language]);

  // Process raw task data from DB
  const processTask = useCallback((t: any): Task => {
    const today = new Date().toISOString().split('T')[0];
    const isOverdue = t.is_overdue || (t.due_date && t.due_date < today && t.status !== 'done' && t.status !== 'overdue');
    return {
      ...t,
      assigned_user_ids: Array.isArray(t.assigned_user_ids) ? t.assigned_user_ids : [],
      is_overdue: isOverdue,
      status: isOverdue && t.status !== 'done' ? 'overdue' as TaskStatus : t.status as TaskStatus,
      checklist: Array.isArray(t.checklist) ? t.checklist : [],
      tags: Array.isArray(t.tags) ? t.tags : [],
    };
  }, []);

  // Compute the next due date for a recurring task based on its frequency
  const getNextDueDate = useCallback((fromDate: string, frequency: string): string => {
    const d = new Date(fromDate + 'T00:00:00');
    switch (frequency) {
      case 'daily': d.setDate(d.getDate() + 1); break;
      case 'weekly': d.setDate(d.getDate() + 7); break;
      case 'bi-monthly': {
        // 15th and 30th of each month
        const dom = d.getDate();
        if (dom < 15) {
          d.setDate(15);
        } else if (dom < 30) {
          d.setDate(30);
        } else {
          // Move to 15th of next month
          d.setMonth(d.getMonth() + 1);
          d.setDate(15);
        }
        break;
      }
      case 'monthly': d.setMonth(d.getMonth() + 1); break;
      case 'quarterly': d.setMonth(d.getMonth() + 3); break;
      case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
      case 'hourly': d.setHours(d.getHours() + 1); break;
      default: d.setDate(d.getDate() + 1); break;
    }
    return ymdLocal(d);
  }, []);

  // Reset recurring tasks that were completed on a previous day — make them fresh again
  // CRITICAL: Only resets tasks that have last_completed_date set AND do NOT have a
  // spawned_from_task_id (old-style tasks created before the spawn-new-row system).
  // Tasks with spawned_from_task_id use the new spawn system — they stay completed as history.
  // Tasks WITHOUT last_completed_date are NEVER reset — they remain as overdue/pending history.
  const resetRecurringTasksIfNeeded = useCallback(async (loadedTasks: Task[]) => {
    const today = ymdLocal(new Date());
    const tasksToReset = loadedTasks.filter((t) => {
      if (!t.recurring) return false;
      if (t.status !== 'done') return false;
      // Skip tasks that use the new spawn-new-row system (they have a spawned_from_task_id)
      if ((t as any).spawned_from_task_id) return false;
      // Only reset if last_completed_date is explicitly set and is before today
      const lastCompleted = (t as any).last_completed_date;
      if (!lastCompleted) return false; // No tracked completion date — keep as-is (historical record)
      return lastCompleted < today;
    });

    if (tasksToReset.length === 0) return;

    const resetPromises = tasksToReset.map(async (t) => {
      const freshChecklist = t.checklist.map((c) => ({ ...c, done: false }));
      const newDueDate = t.due_date ? getNextDueDate(t.due_date, t.recurring!) : today;
      const effectiveDueDate = newDueDate <= today ? today : newDueDate;
      const updatePayload: any = {
        status: 'todo',
        checklist: freshChecklist,
        is_overdue: false,
        due_date: effectiveDueDate,
        last_completed_date: null,
        completed_at: null,
      };
      try {
        await supabase.from('tasks').update(updatePayload).eq('id', t.id);
        return { id: t.id, updates: updatePayload };
      } catch {
        return null;
      }
    });

    const results = await Promise.all(resetPromises);
    setTasks((prev) => prev.map((t) => {
      const result = results.find((r) => r && r.id === t.id);
      if (result) return { ...t, ...result.updates };
      return t;
    }));
  }, [supabase, getNextDueDate]);

  // Single batched fetch for all initial data
  const fetchAllData = useCallback(async () => {
    const uid = effectiveUserId;
    if (!uid) return;
    setLoading(true);
    try {
      const { data: visibleFirmIds } = await supabase.rpc('get_visible_firm_ids', { p_user_id: uid, p_module: 'tasks' });

      // Real (PIN-session-safe) task visibility scoping — the DB-side RLS
      // policy is best-effort for PIN sessions (no auth.uid()), so this
      // query is what actually enforces it day to day:
      //   employee  -> own tasks only (created / assigned / collaborator)
      //   manager   -> every task in their visible firm(s)
      //   director  -> everything
      let tasksQuery = supabase
        .from('tasks')
        .select('id, title, description, priority, status, due_date, due_time, assigned_to, assigned_to_user_id, assigned_to_name, assigned_to_dept, assigned_by_name, assigned_by_dept, assigned_user_ids, checklist, tags, recurring, notify_before_minutes, is_overdue, is_template, task_category, client_org_id, client_org_name, organisation_relates_to, last_completed_date, created_at, notes, is_flagged, flag_reason, helper_user_ids, is_active, reminder_times, firm_id')
        .order('created_at', { ascending: false });

      const [profileRes, usersRes, orgsRes, catsRes] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('role, full_name, department')
          .eq('id', uid)
          .single(),
        supabase
          .from('user_profiles')
          .select('id, full_name, role, department, job_title, firm_id')
          .order('full_name', { ascending: true }),
        supabase
          .from('client_organisations')
          .select('id, name')
          .order('name', { ascending: true }),
        supabase
          .from('task_categories')
          .select('id, name, slug, color')
          .order('name', { ascending: true }),
      ]);
      // Firm-based visibility for everyone, regardless of role: every task
      // belonging to a firm you're allowed to see (your own firm's members,
      // plus any firm that's explicitly shared tasks with you via
      // firm_data_sharing) — not just tasks you personally created/are
      // assigned to/collaborate on.
      // A task shows if its primary firm OR any of its firms (firm_ids) is visible to you
      if (visibleFirmIds && (visibleFirmIds as string[]).length > 0) {
        const fl = (visibleFirmIds as string[]).join(',');
        tasksQuery = tasksQuery.or(`firm_id.in.(${fl}),firm_ids.ov.{${fl}}`);
      }

      const tasksRes = await tasksQuery;

      if (profileRes.data) {
        setUserRole(profileRes.data.role || 'employee');
        setUserName(profileRes.data.full_name || '');
        setUserDept(profileRes.data.department || '');
      }

      if (usersRes.data) {
        setAllUsers(usersRes.data);
      }

      if (tasksRes.data) {
        const processed = tasksRes.data.map(processTask);
        setTasks(processed);
        // After loading, reset any recurring tasks that were completed on a previous day
        resetRecurringTasksIfNeeded(processed);
      }

      if (orgsRes.data) {
        setClientOrgs(orgsRes.data);
      }

      if (catsRes.data && catsRes.data.length > 0) {
        setDynamicCategories(catsRes.data);
      }
    } catch (err) {
      console.error('Data fetch error:', err);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, processTask, resetRecurringTasksIfNeeded]);

  // Fetch recurring task instances for current user
  const fetchMyRecurringInstances = useCallback(async () => {
    const uid = effectiveUserId;
    if (!uid) return;
    setRecurringInstancesLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('recurring_task_instances')
        .select('*, recurring_tasks(title, frequency, description)')
        .eq('assigned_to', uid)
        .order('due_date', { ascending: false })
        .limit(100);

      if (data) {
        // Auto-mark overdue
        const processed = data.map((i: any) => ({
          ...i,
          task_name: i.task_name || i.recurring_tasks?.title || 'Recurring Task',
          frequency: i.recurring_tasks?.frequency || 'daily',
          is_overdue: i.is_overdue || (i.due_date < today && i.status !== 'completed' && i.status !== 'cancelled'),
          status: (i.is_overdue || (i.due_date < today && i.status !== 'completed' && i.status !== 'cancelled'))
            ? 'overdue' : i.status,
        }));
        setMyRecurringInstances(processed);
      }
    } catch (err) {
      console.error('Failed to load recurring instances:', err);
    } finally {
      setRecurringInstancesLoading(false);
    }
  }, [effectiveUserId]);

  // Set up real-time subscriptions
  const setupSubscriptions = useCallback(() => {
    // Clean up existing subscriptions
    subscriptionsRef.current.forEach((sub) => {
      try { supabase.removeChannel(sub); } catch {}
    });
    subscriptionsRef.current = [];

    // Tasks subscription — all collaborators see live status/priority/completion changes
    const tasksSub = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, (payload) => {
        const newTask = processTask(payload.new);
        setTasks((prev) => {
          if (prev.find((t) => t.id === newTask.id)) return prev;
          return [newTask, ...prev];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, (payload) => {
        const updatedTask = processTask(payload.new);
        setTasks((prev) => prev.map((t) => t.id === updatedTask.id ? updatedTask : t));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, (payload) => {
        setTasks((prev) => prev.filter((t) => t.id !== payload.old.id));
      })
      .subscribe();

    // Task categories subscription
    const categoriesSub = supabase
      .channel('task-categories-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_categories' }, (payload) => {
        setDynamicCategories((prev) => {
          if (prev.find((c) => c.id === payload.new.id)) return prev;
          return [...prev, payload.new as any].sort((a, b) => a.name.localeCompare(b.name));
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'task_categories' }, (payload) => {
        setDynamicCategories((prev) =>
          prev.map((c) => c.id === payload.new.id ? payload.new as any : c)
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'task_categories' }, (payload) => {
        setDynamicCategories((prev) => prev.filter((c) => c.id !== payload.old.id));
      })
      .subscribe();

    // Recurring task instances subscription — collaborators see live completion/status updates
    const today = new Date().toISOString().split('T')[0];
    const recurringInstancesSub = supabase
      .channel('recurring-instances-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'recurring_task_instances' }, (payload) => {
        const updated = payload.new as any;
        setMyRecurringInstances((prev) => {
          // If the instance is now completed or cancelled, remove it from the list
          if (updated.status === 'completed' || updated.status === 'cancelled') {
            return prev.filter((i) => i.id !== updated.id);
          }
          // Otherwise update in place
          return prev.map((i) => i.id === updated.id
            ? {
                ...i,
                ...updated,
                is_overdue: updated.is_overdue || (updated.due_date < today && updated.status !== 'completed' && updated.status !== 'cancelled'),
                status: (updated.is_overdue || (updated.due_date < today && updated.status !== 'completed' && updated.status !== 'cancelled'))
                  ? 'overdue' : updated.status,
              }
            : i
          );
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'recurring_task_instances' }, (payload) => {
        const inserted = payload.new as any;
        // Only add if it belongs to the current user and is relevant (today or overdue)
        setMyRecurringInstances((prev) => {
          if (prev.find((i) => i.id === inserted.id)) return prev;
          if (inserted.status === 'completed' || inserted.status === 'cancelled') return prev;
          return [inserted, ...prev];
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'recurring_task_instances' }, (payload) => {
        setMyRecurringInstances((prev) => prev.filter((i) => i.id !== payload.old.id));
      })
      .subscribe();

    subscriptionsRef.current = [tasksSub, categoriesSub, recurringInstancesSub];
  }, [supabase, processTask]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    if (effectiveUserId) fetchMyRecurringInstances();
  }, [effectiveUserId, fetchMyRecurringInstances]);

  useEffect(() => {
    if (!effectiveUserId) return;
    setupSubscriptions();
    return () => {
      subscriptionsRef.current.forEach((sub) => {
        try { supabase.removeChannel(sub); } catch {}
      });
      subscriptionsRef.current = [];
    };
  }, [effectiveUserId, setupSubscriptions]);

  const toggleChecklist = async (taskId: string, itemId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const updated = task.checklist.map((c) => c.id === itemId ? { ...c, done: !c.done } : c);
    const allDone = updated.every((c) => c.done);
    const newStatus = allDone ? 'done' : task.status === 'done' ? 'in-progress' : task.status;
    try {
      const today = new Date().toISOString().split('T')[0];
      // For recurring tasks: store last_completed_date when all items are checked off
      const extraFields: any = {};
      if (allDone && task.recurring) {
        extraFields.last_completed_date = today;
        extraFields.completed_at = new Date().toISOString();
      } else if (!allDone && task.recurring) {
        // Unchecking an item — clear last_completed_date so it won't be reset prematurely
        extraFields.last_completed_date = null;
      }
      await supabase.from('tasks').update({ checklist: updated, status: newStatus, ...extraFields }).eq('id', taskId);
      // Real-time will handle the state update, but also update locally for instant feedback
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, checklist: updated, status: newStatus, ...extraFields } : t));

      // ── Spawn next occurrence when checklist completes a recurring task ────
      if (allDone && task.recurring && task.due_date && !(task as any).spawned_from_task_id) {
        const nextDueDate = getNextDueDate(task.due_date, task.recurring);
        const { data: existingNext } = await supabase
          .from('tasks')
          .select('id')
          .eq('spawned_from_task_id', taskId)
          .eq('due_date', nextDueDate)
          .neq('status', 'done')
          .maybeSingle();

        if (!existingNext) {
          const freshChecklist = updated.map((c) => ({ ...c, done: false }));
          const newTaskData = {
            title: task.title,
            description: task.description,
            priority: task.priority,
            status: 'todo' as TaskStatus,
            due_date: nextDueDate,
            due_time: task.due_time || null,
            assigned_to: task.assigned_to,
            assigned_to_user_id: task.assigned_to_user_id,
            assigned_to_name: task.assigned_to_name,
            assigned_to_dept: task.assigned_to_dept,
            assigned_user_ids: task.assigned_user_ids || [],
            assigned_by: task.assigned_by || null,
            assigned_by_name: task.assigned_by_name,
            assigned_by_dept: task.assigned_by_dept,
            checklist: freshChecklist,
            tags: task.tags || [],
            recurring: task.recurring,
            notify_before_minutes: task.notify_before_minutes || 30,
            is_template: false,
            task_category: task.task_category || 'general',
            client_org_id: task.client_org_id || null,
            client_org_name: task.client_org_name || null,
            organisation_relates_to: task.organisation_relates_to || null,
            helper_user_ids: task.helper_user_ids || [],
            is_active: true,
            is_overdue: false,
            spawned_from_task_id: taskId,
          };
          const { data: spawnedTask, error: spawnErr } = await supabase
            .from('tasks')
            .insert(newTaskData)
            .select()
            .single();
          if (!spawnErr && spawnedTask) {
            setTasks((prev) => [processTask(spawnedTask), ...prev]);
          }
        }
      }
    } catch (err) {
      toast.error('Failed to update checklist');
    }
  };

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) { toast.error('Task title is required'); return; }
    const uid = effectiveUserId;
    if (!uid) return;
    setSaving(true);
    try {
      // Primary assignee = first selected user (for backwards compat)
      const primaryUserId = newTask.assignedUserIds[0] || null;
      const primaryUser = allUsers.find((u) => u.id === primaryUserId);

      // Build display name for assigned_to_name
      const assignedNames = newTask.assignedUserIds
        .map((id) => allUsers.find((u) => u.id === id)?.full_name)
        .filter(Boolean)
        .join(', ');

      // Resolve client org info
            const selectedOrg = newTask.clientOrgId ? clientOrgs.find(o => o.id === newTask.clientOrgId) : null;

      const taskData = {
        title: newTask.title,
        description: newTask.description,
        priority: newTask.priority,
        status: 'todo',
        due_date: newTask.dueDate || null,
        due_time: newTask.dueTime || null,
        assigned_to: primaryUserId,
        assigned_to_user_id: primaryUserId,
        assigned_to_name: assignedNames || 'Unassigned',
        assigned_to_dept: primaryUser?.department || newTask.assignedToDept || 'General',
        assigned_user_ids: newTask.assignedUserIds,
        // First firm picked is the primary firm; every picked firm is kept in firm_ids
        firm_id: newTask.firmIds[0] || null,
        firm_ids: newTask.firmIds.length ? newTask.firmIds : null,
        assigned_by: uid,
        created_by: uid,
        assigned_by_name: userName,
        assigned_by_dept: userDept,
        checklist: newTask.checklistItems.filter((i) => i.trim()).map((text, idx) => ({
          id: `cl-${Date.now()}-${idx}`, text, done: false,
        })),
        tags: [],
        recurring: newTask.recurring || null,
        notify_before_minutes: newTask.notifyBefore,
        is_template: false,
        task_category: newTask.taskCategory || 'general',
                organisation_relates_to: selectedOrg?.name || newTask.organisationRelatesTo.trim() || null,
        client_org_id: newTask.clientOrgId || null,
        client_org_name: selectedOrg?.name || null,
      };

            const { data: insertedTask, error } = await supabase.from('tasks').insert(taskData).select().single();
      if (error) throw error;

      // Subtasks: one row each, linked to the new task
      const subs = newTask.subtasks.filter((s) => s.title.trim());
      if (subs.length > 0 && insertedTask?.id) {
        const { error: subErr } = await supabase.from('task_subtasks').insert(
          subs.map((s, i) => ({
            task_id: insertedTask.id,
            title: s.title.trim(),
            sort_order: i,
          })),
        );
        if (subErr) toast.error(`Task created, but subtasks failed: ${subErr.message}`);
      }

      // Send pending collaboration requests, same as the "afterward" flow —
      // they still need to accept, same as if invited after creation.
      if (insertedTask && newTask.collaboratorUserIds.length > 0) {
        const collabInserts = newTask.collaboratorUserIds.map((userId) => ({
          task_id: insertedTask.id,
          user_id: userId,
          invited_by: uid,
          invited_by_name: userName,
          role: 'collaborator',
          status: 'pending',
        }));
        const { error: collabErr } = await supabase.from('task_collaborators').insert(collabInserts);
        if (collabErr) {
          toast.error('Task created, but failed to send collaboration requests: ' + collabErr.message);
        }
      }

      // Real-time subscription will add the task to state
      if (insertedTask) setTasks((prev) => [{ ...insertedTask, assigned_user_ids: insertedTask.assigned_user_ids || [], checklist: insertedTask.checklist || [], tags: insertedTask.tags || [] }, ...prev]);
      setNewTask(defaultForm);
      setShowNewTask(false);
      toast.success('Task created and assigned!', { duration: 3000 });
    } catch (err: any) {
      toast.error(err.message || 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingTask) return;
    setSaving(true);
    try {
      const primaryUserId = editingTask.assigned_user_ids?.[0] || editingTask.assigned_to_user_id || editingTask.assigned_to || null;
      const primaryUser = allUsers.find((u) => u.id === primaryUserId);

      const assignedNames = (editingTask.assigned_user_ids || [])
        .map((id) => allUsers.find((u) => u.id === id)?.full_name)
        .filter(Boolean)
        .join(', ');

      const updateData = {
        title: editingTask.title,
        description: editingTask.description,
        priority: editingTask.priority,
        due_date: editingTask.due_date || null,
        due_time: editingTask.due_time || null,
        assigned_to: primaryUserId,
        assigned_to_user_id: primaryUserId,
        assigned_to_name: assignedNames || editingTask.assigned_to_name,
        assigned_to_dept: primaryUser?.department || editingTask.assigned_to_dept,
        assigned_user_ids: editingTask.assigned_user_ids || [],
        checklist: editingTask.checklist,
        recurring: editingTask.recurring || null,
        notify_before_minutes: editingTask.notify_before_minutes,
        is_template: false,
        task_category: editingTask.task_category || 'general',
        organisation_relates_to: editingTask.organisation_relates_to?.trim() || null,
        client_org_id: editingTask.client_org_id || null,
        client_org_name: editingTask.client_org_name || null,
      };
      const { error } = await supabase.from('tasks').update(updateData).eq('id', editingTask.id);
      if (error) throw error;
      // Real-time will update state, but also update locally for instant feedback
      setTasks((prev) => prev.map((t) => t.id === editingTask.id ? { ...t, ...updateData } : t));
      setEditingTask(null);
      toast.success('Task updated successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update task');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      await supabase.from('tasks').delete().eq('id', id);
      // Real-time will remove from state, but also update locally for instant feedback
      setTasks((prev) => prev.filter((t) => t.id !== id));
      toast.success('Task deleted');
    } catch (err) {
      toast.error('Failed to delete task');
    }
  };

  const handleStatusChange = async (id: string, status: TaskStatus) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const now = new Date().toISOString();
      const task = tasks.find((t) => t.id === id);
      const extraFields: any = {};
      if (status === 'done') {
        extraFields.completed_at = now;
        if (task?.recurring) {
          extraFields.last_completed_date = today;
        }
        // Calculate time to complete if we have created_at
        if (task?.created_at) {
          const createdAt = new Date(task.created_at).getTime();
          const completedAt = new Date(now).getTime();
          extraFields.time_to_complete_minutes = Math.round((completedAt - createdAt) / 60000);
        }
      } else if (status !== 'done') {
        extraFields.completed_at = null;
        if (task?.recurring) {
          extraFields.last_completed_date = null;
        }
      }
      // Update is_overdue flag
      extraFields.is_overdue = status === 'overdue';
      await supabase.from('tasks').update({ status, ...extraFields }).eq('id', id);
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status, ...extraFields } : t));

      // ── Spawn next occurrence for recurring tasks when marked done ──────────
      // Creates a NEW task row for the next recurrence date.
      // The completed task is preserved as historical record — never deleted or overridden.
      if (status === 'done' && task?.recurring && task.due_date) {
        const nextDueDate = getNextDueDate(task.due_date, task.recurring);
        // Check if a future pending instance already exists for this recurring task
        const { data: existingNext } = await supabase
          .from('tasks')
          .select('id')
          .eq('spawned_from_task_id', id)
          .eq('due_date', nextDueDate)
          .neq('status', 'done')
          .maybeSingle();

        if (!existingNext) {
          const freshChecklist = task.checklist.map((c) => ({ ...c, done: false }));
          const newTaskData = {
            title: task.title,
            description: task.description,
            priority: task.priority,
            status: 'todo' as TaskStatus,
            due_date: nextDueDate,
            due_time: task.due_time || null,
            assigned_to: task.assigned_to,
            assigned_to_user_id: task.assigned_to_user_id,
            assigned_to_name: task.assigned_to_name,
            assigned_to_dept: task.assigned_to_dept,
            assigned_user_ids: task.assigned_user_ids || [],
            assigned_by: task.assigned_by || null,
            assigned_by_name: task.assigned_by_name,
            assigned_by_dept: task.assigned_by_dept,
            checklist: freshChecklist,
            tags: task.tags || [],
            recurring: task.recurring,
            notify_before_minutes: task.notify_before_minutes || 30,
            is_template: false,
            task_category: task.task_category || 'general',
            client_org_id: task.client_org_id || null,
            client_org_name: task.client_org_name || null,
            organisation_relates_to: task.organisation_relates_to || null,
            helper_user_ids: task.helper_user_ids || [],
            is_active: true,
            is_overdue: false,
            spawned_from_task_id: id,
          };
          const { data: newTask, error: insertErr } = await supabase
            .from('tasks')
            .insert(newTaskData)
            .select()
            .single();
          if (!insertErr && newTask) {
            // Add new task to state immediately
            setTasks((prev) => [processTask(newTask), ...prev]);
          }
        }
      }
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const handleCopyToClient = async () => {
    if (!copyToClientTask || !copyTargetOrgId) { toast.error('Please select a client or subsidiary'); return; }
    const uid = effectiveUserId;
    if (!uid) return;
    setCopyingTask(true);
    try {
      const copyPick = applyPick(copyTargetOrgId);
      const copiedChecklist = copyToClientTask.checklist.map((item) => ({
        ...item,
        id: `cl-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        done: false,
      }));

      const taskData = {
        title: copyToClientTask.title,
        description: copyToClientTask.description,
        priority: copyToClientTask.priority,
        status: 'todo' as TaskStatus,
        due_date: copyToClientTask.due_date || null,
        due_time: copyToClientTask.due_time || null,
        assigned_to: copyToClientTask.assigned_to,
        assigned_to_user_id: copyToClientTask.assigned_to_user_id,
        assigned_to_name: copyToClientTask.assigned_to_name,
        assigned_to_dept: copyToClientTask.assigned_to_dept,
        assigned_user_ids: copyToClientTask.assigned_user_ids || [],
        assigned_by: uid,
        assigned_by_name: userName,
        assigned_by_dept: userDept,
        checklist: copiedChecklist,
        tags: copyToClientTask.tags || [],
        recurring: copyToClientTask.recurring || null,
        notify_before_minutes: copyToClientTask.notify_before_minutes || 30,
        is_template: false,
        task_category: copyToClientTask.task_category || 'general',
        client_org_id: copyPick.clientOrgId || null,
        client_org_name: copyPick.clientOrgName,
        organisation_relates_to: copyPick.organisationRelatesTo || null,
      };

            const { data, error } = await supabase.from('tasks').insert(taskData).select().single();
      if (error) throw error;

      // Real-time will add to state
      setCopyToClientTask(null);
      setCopyTargetOrgId('');
      toast.success(`Task copied to ${targetOrg?.name}!`, { duration: 3000 });
    } catch (err: any) {
      toast.error(err.message || 'Failed to copy task');
    } finally {
      setCopyingTask(false);
    }
  };

  // Copy Task: opens the New Task form already filled with this task's details, so the
  // user can change firm, assignee, date etc. before saving. Nothing is saved until they submit.
  const handleCopyTask = async (task: Task) => {
    const { data: subs } = await supabase
      .from('task_subtasks').select('title').eq('task_id', task.id).order('sort_order');
    setNewTask({
      ...defaultForm,
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      dueDate: task.due_date || '',
      dueTime: task.due_time ? String(task.due_time).slice(0, 5) : '',
      firmIds: task.firm_ids?.length ? task.firm_ids : (task.firm_id ? [task.firm_id] : []),
      assignedUserIds: task.assigned_user_ids?.length ? task.assigned_user_ids : (task.assigned_to ? [task.assigned_to] : []),
      clientOrgId: task.client_org_id || '',
      organisationRelatesTo: task.organisation_relates_to || '',
      taskCategory: task.task_category || 'general',
      subtasks: (subs || []).map((s: any) => ({ title: s.title, assigned_to: '' })),
    });
    setShowNewTask(true);
  };

  const fetchTaskNotes = useCallback(async (taskId: string) => {
    const { data } = await supabase
      .from('task_notes')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    if (data) setTaskNotes(prev => ({ ...prev, [taskId]: data }));
  }, [supabase]);

  const handleAddNote = async () => {
    if (!noteContent.trim() || !showNoteModal) return;
    const uid = effectiveUserId;
    if (!uid) return;
    setSavingNote(true);
    try {
      const { data: profile } = await supabase.from('user_profiles').select('full_name').eq('id', uid).single();
      const { error } = await supabase.from('task_notes').insert({
        task_id: showNoteModal.taskId,
        user_id: uid,
        user_name: profile?.full_name || 'Unknown',
        content: noteContent.trim(),
      });
      if (error) throw error;
      toast.success('Note added');
      setNoteContent('');
      fetchTaskNotes(showNoteModal.taskId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to add note');
    } finally {
      setSavingNote(false);
    }
  };

  const handleFlagTask = async () => {
    if (!showFlagModal) return;
    try {
      const { error } = await supabase.from('tasks').update({
        is_flagged: !showFlagModal.is_flagged,
        flag_reason: !showFlagModal.is_flagged ? flagReason : '',
      }).eq('id', showFlagModal.id);
      if (error) throw error;
      setTasks(prev => prev.map(t => t.id === showFlagModal.id ? { ...t, is_flagged: !showFlagModal.is_flagged, flag_reason: !showFlagModal.is_flagged ? flagReason : '' } : t));
      toast.success(showFlagModal.is_flagged ? 'Flag removed' : 'Task flagged for help');
      setShowFlagModal(null);
      setFlagReason('');
    } catch (err: any) {
      toast.error('Failed to update flag');
    }
  };

  const handleSaveHelpers = async () => {
    if (!showHelperModal) return;
    try {
      const { error } = await supabase.from('tasks').update({ helper_user_ids: helperIds }).eq('id', showHelperModal.id);
      if (error) throw error;
      setTasks(prev => prev.map(t => t.id === showHelperModal.id ? { ...t, helper_user_ids: helperIds } : t));
      toast.success('Day helpers updated');
      setShowHelperModal(null);
    } catch (err: any) {
      toast.error('Failed to update helpers');
    }
  };

  const fetchTaskCollaborators = useCallback(async (taskId: string) => {
    const { data } = await supabase
      .from('task_collaborators')
      .select('*, user_profiles(full_name, role, department)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    if (data) setTaskCollaborators(prev => ({ ...prev, [taskId]: data }));
  }, [supabase]);

  const fetchMyPendingInvites = useCallback(async () => {
    const uid = effectiveUserId;
    if (!uid) return;
    const { data } = await supabase
      .from('task_collaborators')
      .select('id, task_id, role, invited_by_name, created_at, tasks(title, status)')
      .eq('user_id', uid)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    // A task could have been completed after the invite was sent — don't
    // show a request to collaborate on something already done.
    setMyPendingInvites((data || []).filter((inv: any) => inv.tasks?.status !== 'done'));
  }, [supabase, effectiveUserId]);

  const respondToInvite = async (inviteId: string, taskId: string, accept: boolean) => {
    setRespondingInviteId(inviteId);
    try {
      if (accept) {
        const { error } = await supabase.from('task_collaborators')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .eq('id', inviteId);
        if (error) throw error;
        toast.success('Collaboration request accepted');
      } else {
        const { error } = await supabase.from('task_collaborators').delete().eq('id', inviteId);
        if (error) throw error;
        toast.success('Collaboration request declined');
      }
      setMyPendingInvites(prev => prev.filter(i => i.id !== inviteId));
      fetchTaskCollaborators(taskId);
      if (accept) fetchAllData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to respond to request');
    } finally {
      setRespondingInviteId(null);
    }
  };

  useEffect(() => { fetchMyPendingInvites(); }, [fetchMyPendingInvites]);

  const handleSaveCollaborators = async () => {
    if (!showCollaboratorModal) return;
    const uid = effectiveUserId;
    if (!uid) return;
    setSavingCollaborators(true);
    try {
      const task = showCollaboratorModal;
      // Get existing collaborators
      const { data: existing } = await supabase
        .from('task_collaborators')
        .select('user_id')
        .eq('task_id', task.id);
      const existingIds = (existing || []).map((c: any) => c.user_id);

      // Add new collaborators
      const toAdd = collaboratorIds.filter(id => !existingIds.includes(id));
      // Remove deselected collaborators
      const toRemove = existingIds.filter((id: string) => !collaboratorIds.includes(id));

      if (toAdd.length > 0) {
        const inserts = toAdd.map(userId => {
          return {
            task_id: task.id,
            user_id: userId,
            invited_by: uid,
            invited_by_name: userName,
            role: 'collaborator',
            status: 'pending',
          };
        });
        const { error: collabErr } = await supabase.from('task_collaborators').insert(inserts);
        if (collabErr) {
          toast.error(collabErr.message?.includes('completed') ? 'Cannot invite collaborators on a completed task' : 'Failed to send collaboration request');
          setSavingCollaborators(false);
          return;
        }
      }

      if (toRemove.length > 0) {
        await supabase.from('task_collaborators')
          .delete()
          .eq('task_id', task.id)
          .in('user_id', toRemove);
      }

      // Also update helper_user_ids on the task to include collaborators for visibility
      const allCollabIds = [...new Set([...collaboratorIds])];
      await supabase.from('tasks').update({ helper_user_ids: allCollabIds }).eq('id', task.id);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, helper_user_ids: allCollabIds } : t));

      toast.success('Collaborators updated successfully');
      fetchTaskCollaborators(task.id);
      setShowCollaboratorModal(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update collaborators');
    } finally {
      setSavingCollaborators(false);
    }
  };

  const handleToggleTaskActive = async (taskId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase.from('tasks').update({ is_active: !currentActive }).eq('id', taskId);
      if (error) throw error;
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_active: !currentActive } : t));
      toast.success(!currentActive ? 'Task activated' : 'Task deactivated');
    } catch (err: any) {
      toast.error('Failed to toggle task');
    }
  };

  // Sort tasks
  const sortTasks = (taskList: Task[]) => {
    return [...taskList].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'due_date') {
        const da = a.due_date || '9999-99-99';
        const db = b.due_date || '9999-99-99';
        cmp = da.localeCompare(db);
      } else if (sortBy === 'priority') {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        cmp = (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
      } else if (sortBy === 'status') {
        const order = { overdue: 0, 'in-progress': 1, todo: 2, review: 3, done: 4 };
        cmp = (order[a.status] ?? 2) - (order[b.status] ?? 2);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  };

  const todayDateStr = new Date().toISOString().split('T')[0];

  const filtered = tasks.filter((t) => {
    // No future-dated tasks (only show tasks whose due_date <= today or no due_date)
    if (t.due_date && t.due_date > todayDateStr) return false;
    // Only show tasks from May 1 2026 onwards
    const taskDate = t.due_date || t.created_at?.split('T')[0] || '';
    if (taskDate && taskDate < '2026-05-01') return false;

    const matchStatus = filter === 'all' || t.status === filter;
    const matchDept = deptFilter === 'all' || t.assigned_to_dept === deptFilter || t.assigned_by_dept === deptFilter;
    const matchSearch = !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.assigned_to_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = categoryFilter === 'all' || t.task_category === categoryFilter;
    const matchClient = clientFilter === 'all'
      ? true
      : clientFilter === 'none'
        ? !t.client_org_id && !subNameSet.includes(t.organisation_relates_to || '')
        : clientFilter.startsWith('client:')
          ? t.client_org_id === clientFilter.slice(7)
          : !t.client_org_id && t.organisation_relates_to === subById(clientFilter.slice(5))?.name;
    const matchPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchAssignedUser = assignedUserFilter === 'all' || (t.assigned_user_ids || []).includes(assignedUserFilter) || t.assigned_to_user_id === assignedUserFilter || t.assigned_to === assignedUserFilter;
    const matchDate = !dateFilter || t.due_date === dateFilter;
    return matchStatus && matchDept && matchSearch && matchCategory && matchClient && matchPriority && matchAssignedUser && matchDate;
  });

  const sortedFiltered = sortTasks(filtered);

  const activeFilterCount = [
    filter !== 'all',
    categoryFilter !== 'all',
    deptFilter !== 'all',
    clientFilter !== 'all',
    priorityFilter !== 'all',
    assignedUserFilter !== 'all',
  ].filter(Boolean).length;

  const filteredUsersForSearch = allUsers.filter((u) =>
    !userSearchQuery || u.full_name.toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  const stats = {
    total: tasks.length,
    done: tasks.filter((t) => t.status === 'done').length,
    overdue: tasks.filter((t) => t.is_overdue || t.status === 'overdue').length,
    inProgress: tasks.filter((t) => t.status === 'in-progress').length,
  };

    const canCreateTask = true; // All users can create and assign tasks
  const isDirector = userRole === 'director';

  const roleGroups = [
    { label: 'Directors', roles: ['director'] },
    { label: 'Managers', roles: ['manager', 'executive'] },
    { label: 'Employees', roles: ['employee', 'staff'] },
  ];

  // Helper: get display names for assigned users
  const getAssigneeDisplay = (task: Task): string => {
    if (task.assigned_user_ids?.length > 0) {
      const names = task.assigned_user_ids
        .map((id) => allUsers.find((u) => u.id === id)?.full_name)
        .filter(Boolean);
      if (names.length > 0) return names.join(', ');
    }
    return task.assigned_to_name || 'Unassigned';
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
      <Toaster position="bottom-right" richColors />

      {/* Pending collaboration requests — invites sent to me, awaiting my response */}
      {myPendingInvites.length > 0 && (
        <div className="mb-4 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 p-3.5 space-y-2">
          <p className="text-xs font-700 text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
            <Users size={13} /> {myPendingInvites.length} collaboration request{myPendingInvites.length > 1 ? 's' : ''} waiting for your response
          </p>
          {myPendingInvites.map((inv: any) => (
            <div key={inv.id} className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl px-3 py-2 border border-indigo-100 dark:border-indigo-800">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-600 text-slate-800 dark:text-slate-100 truncate">{inv.tasks?.title || 'Untitled task'}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{inv.invited_by_name || 'Someone'} invited you as {inv.role}</p>
              </div>
              <button
                disabled={respondingInviteId === inv.id}
                onClick={() => respondToInvite(inv.id, inv.task_id, true)}
                className="text-xs font-600 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              >
                Accept
              </button>
              <button
                disabled={respondingInviteId === inv.id}
                onClick={() => respondToInvite(inv.id, inv.task_id, false)}
                className="text-xs font-600 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-slate-900 dark:text-slate-100">
            {language === 'hi' ? 'कार्य प्रबंधन' : 'Task Management'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-1">
            {language === 'hi' ? 'विभागों में कार्य सौंपें, ट्रैक करें और पूर्ण करें' : 'Assign, track, and complete tasks across departments'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isDirector && (
            <>
              <button onClick={() => setShowCategoryManager(true)} className="flex items-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-600 text-xs sm:text-sm font-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors min-h-[36px]">
                <Tag size={14} /><span className="hidden sm:inline">{language === 'hi' ? 'श्रेणियां' : 'Categories'}</span>
              </button>
              <button onClick={() => setShowClientOrgs(true)} className="flex items-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-600 text-xs sm:text-sm font-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors min-h-[36px]">
                <Briefcase size={14} /><span className="hidden sm:inline">{language === 'hi' ? 'क्लाइंट' : 'Clients'}</span>
              </button>
            </>
          )}
          <button onClick={() => setShowNewTask(true)} className="btn-primary py-2 px-3 sm:px-4 min-h-[36px]">
            <Plus size={16} /><span className="hidden sm:inline">{language === 'hi' ? 'नया कार्य' : 'New Task'}</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: language === 'hi' ? 'कुल कार्य' : 'Total Tasks', value: stats.total, color: 'text-slate-700', bg: 'bg-slate-50 dark:bg-slate-800' },
          { label: language === 'hi' ? 'प्रगति में' : 'In Progress', value: stats.inProgress, color: 'text-blue-700', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: language === 'hi' ? 'पूर्ण' : 'Completed', value: stats.done, color: 'text-emerald-700', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: language === 'hi' ? 'अतिदेय' : 'Overdue', value: stats.overdue, color: 'text-red-700', bg: 'bg-red-50 dark:bg-red-900/20' },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700`}>
            <p className={`text-xl sm:text-2xl font-700 ${s.color}`}>{loading ? '…' : s.value}</p>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Category Filter Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap overflow-x-auto pb-1">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`px-3 py-2 rounded-lg text-xs font-600 border transition-all whitespace-nowrap min-h-[36px] ${categoryFilter === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-blue-300'}`}
        >
          {language === 'hi' ? 'सभी श्रेणियां' : 'All Categories'}
        </button>
        {categoryFilterOptions.map((slug) => (
          <button
            key={slug}
            onClick={() => setCategoryFilter(slug as TaskCategory)}
            className={`px-3 py-2 rounded-lg text-xs font-600 border transition-all whitespace-nowrap min-h-[36px] ${categoryFilter === slug ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-blue-300'}`}
          >
            {language === 'hi'
              ? (hindiTaskTranslations[categoryLabels[slug]] || categoryLabels[slug] || slug)
              : (categoryLabels[slug] || slug)}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 sm:gap-3 mb-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder={language === 'hi' ? 'कार्य या लोग खोजें…' : 'Search tasks or people…'} value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-9 py-2.5 text-sm w-full" />
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-700 rounded-xl p-1 text-xs overflow-x-auto">
          {(['all', 'todo', 'in-progress', 'overdue', 'done'] as const).map((f) => (
            <button key={`filter-${f}`} onClick={() => setFilter(f)}
              className={`px-2.5 py-2 rounded-lg font-500 transition-all duration-150 capitalize whitespace-nowrap min-h-[36px] ${filter === f ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              {f === 'in-progress' ? (language === 'hi' ? 'सक्रिय' : 'Active') :
               f === 'all' ? (language === 'hi' ? 'सभी' : 'all') :
               f === 'todo' ? (language === 'hi' ? 'करना है' : 'todo') :
               f === 'overdue' ? (language === 'hi' ? 'अतिदेय' : 'overdue') :
               f === 'done' ? (language === 'hi' ? 'पूर्ण' : 'done') : f}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowFilterPanel(!showFilterPanel)}
          className={`flex items-center gap-1.5 py-2.5 px-3 rounded-xl border text-xs font-600 transition-all min-h-[36px] ${showFilterPanel || activeFilterCount > 0 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-blue-300'}`}
        >
          <Search size={13} />
          {language === 'hi' ? 'फ़िल्टर' : 'Filters'}
          {activeFilterCount > 0 && (
            <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-700 ${showFilterPanel || activeFilterCount > 0 ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'}`}>
              {activeFilterCount}
            </span>
          )}
          <ChevronDown size={13} className={`transition-transform ${showFilterPanel ? 'rotate-180' : ''}`} />
        </button>
        {activeFilterCount > 0 && (
          <button
            onClick={() => {
              setFilter('all');
              setCategoryFilter('all');
              setDeptFilter('all');
              setClientFilter('all');
              setPriorityFilter('all');
              setAssignedUserFilter('all');
              setSearchQuery('');
              setUserSearchQuery('');
            }}
            className="flex items-center gap-1 py-2.5 px-3 rounded-xl border border-red-200 text-xs font-600 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors min-h-[36px]"
          >
            <X size={12} />{language === 'hi' ? 'सभी हटाएं' : 'Clear All'}
          </button>
        )}
      </div>

      {/* Advanced Filter Panel */}
      {showFilterPanel && (
        <div className="mb-5 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* Priority Filter */}
            <div>
              <label className="block text-xs font-700 text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Flag size={11} />{language === 'hi' ? 'प्राथमिकता' : 'Priority'}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'critical', 'high', 'medium', 'low'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriorityFilter(p)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-600 border transition-colors ${
                      priorityFilter === p
                        ? p === 'all' ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-800 dark:border-slate-200'
                          : p === 'critical' ? 'bg-red-600 text-white border-red-600'
                          : p === 'high' ? 'bg-orange-500 text-white border-orange-500'
                          : p === 'medium'? 'bg-amber-400 text-white border-amber-400' :'bg-slate-400 text-white border-slate-400' :'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-blue-300'
                    }`}
                  >
                    {p === 'all' ? (language === 'hi' ? 'सभी' : 'All') : p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Department Filter */}
            <div>
              <label className="block text-xs font-700 text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Building2 size={11} />{language === 'hi' ? 'विभाग' : 'Department'}
              </label>
              <div className="relative">
                <Building2 size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
                  className="input-field pl-7 pr-7 py-2 text-xs appearance-none cursor-pointer w-full">
                  <option value="all">{language === 'hi' ? 'सभी विभाग' : 'All Departments'}</option>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Client Organisation Filter */}
            <div>
              <label className="block text-xs font-700 text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Briefcase size={11} />{language === 'hi' ? 'क्लाइंट संगठन' : 'Client Organisation'}
              </label>
              <div className="relative">
                <Briefcase size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}
                  className="input-field pl-7 pr-7 py-2 text-xs appearance-none cursor-pointer w-full">
                  <option value="all">{language === 'hi' ? 'सभी क्लाइंट' : 'All Clients'}</option>
                  <option value="none">{language === 'hi' ? 'केवल आंतरिक' : 'Internal Only'}</option>
                  {pickerOptions(false)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Assigned User Filter */}
            <div>
              <label className="block text-xs font-700 text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Users size={11} />{language === 'hi' ? 'नियुक्त उपयोगकर्ता' : 'Assigned User'}
              </label>
              <div className="space-y-1.5">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder={language === 'hi' ? 'उपयोगकर्ता खोजें…' : 'Search users…'}
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="input-field pl-7 py-2 text-xs w-full"
                  />
                </div>
                <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700/40">
                  <button
                    onClick={() => setAssignedUserFilter('all')}
                    className={`w-full text-left px-3 py-2 text-xs font-600 transition-colors ${assignedUserFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                  >
                    {language === 'hi' ? 'सभी उपयोगकर्ता' : 'All Users'}
                  </button>
                  {filteredUsersForSearch.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => setAssignedUserFilter(u.id)}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2 ${assignedUserFilter === u.id ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                    >
                      <span className="font-500 truncate">{u.full_name}</span>
                      <span className={`text-[10px] flex-shrink-0 ${assignedUserFilter === u.id ? 'text-blue-100' : 'text-slate-400'}`}>{u.job_title || u.role}</span>
                    </button>
                  ))}
                  {filteredUsersForSearch.length === 0 && (
                    <p className="px-3 py-2 text-xs text-slate-400 italic">{language === 'hi' ? 'कोई उपयोगकर्ता नहीं मिला' : 'No users found'}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Date Filter + Sort Controls */}
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
            <div>
              <label className="block text-xs font-700 text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">Filter by Date</label>
              <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-300 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300" />
              {dateFilter && <button onClick={() => setDateFilter('')} className="ml-2 text-xs text-red-500 hover:underline">Clear</button>}
            </div>
            <div>
              <label className="block text-xs font-700 text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">Sort By</label>
              <div className="flex gap-1.5">
                {([
                  { value: 'created', label: 'Created' },
                  { value: 'due_date', label: 'Due Date' },
                  { value: 'priority', label: 'Priority' },
                  { value: 'status', label: 'Status' },
                ] as const).map(opt => (
                  <button key={opt.value} onClick={() => { if (sortBy === opt.value) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy(opt.value); setSortDir('asc'); } }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-600 border transition-colors flex items-center gap-1 ${sortBy === opt.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-blue-300'}`}>
                    {opt.label}
                    {sortBy === opt.value && <span className="text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
              <span className="text-[11px] text-slate-400 font-600 self-center">{language === 'hi' ? 'सक्रिय:' : 'Active:'}</span>
              {filter !== 'all' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-600 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                  Status: {statusConfig[filter]?.label || filter}
                  <button onClick={() => setFilter('all')} className="hover:text-red-500"><X size={10} /></button>
                </span>
              )}
              {priorityFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-600 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full">
                  Priority: {priorityFilter.charAt(0).toUpperCase() + priorityFilter.slice(1)}
                  <button onClick={() => setPriorityFilter('all')} className="hover:text-red-500"><X size={10} /></button>
                </span>
              )}
              {categoryFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-600 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full">
                  Category: {categoryLabels[categoryFilter] || categoryFilter}
                  <button onClick={() => setCategoryFilter('all')} className="hover:text-red-500"><X size={10} /></button>
                </span>
              )}
              {deptFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-600 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full">
                  Dept: {deptFilter}
                  <button onClick={() => setDeptFilter('all')} className="hover:text-red-500"><X size={10} /></button>
                </span>
              )}
              {clientFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-600 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                  Client: {clientFilter === 'none' ? 'Internal Only'
                    : clientFilter.startsWith('client:') ? (clientOrgs.find((o) => o.id === clientFilter.slice(7))?.name || clientFilter)
                    : (subById(clientFilter.slice(5))?.name || clientFilter)}
                  <button onClick={() => setClientFilter('all')} className="hover:text-red-500"><X size={10} /></button>
                </span>
              )}
              {assignedUserFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-600 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                  User: {allUsers.find((u) => u.id === assignedUserFilter)?.full_name || assignedUserFilter}
                  <button onClick={() => setAssignedUserFilter('all')} className="hover:text-red-500"><X size={10} /></button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── My Tasks Section (Today + Overdue, checkbox completion) ── */}
      {(() => {
        const todayStr = new Date().toISOString().split('T')[0];
        const myId = effectiveUserId;

        // My tasks: assigned to me, from May 1 2026, not future-dated
        const allMyTasks = tasks.filter(t => {
          const isAssigned = (t.assigned_user_ids || []).includes(myId || '') ||
            t.assigned_to_user_id === myId ||
            t.assigned_to === myId;
          if (!isAssigned) return false;
          // No future tasks
          if (t.due_date && t.due_date > todayStr) return false;
          // From May 1 2026
          const taskDate = t.due_date || t.created_at?.split('T')[0] || '';
          if (taskDate && taskDate < '2026-05-01') return false;
          return true;
        });

        // ── Unified Today + Overdue lists (regular tasks only; recurring merged below) ──
        const myTodayTasks = allMyTasks.filter(t => t.due_date === todayStr && t.status !== 'done');
        const myOldOverdueTasks = allMyTasks.filter(t => t.due_date && t.due_date < todayStr && t.status !== 'done').sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));

        // ── Merge recurring instances ──
        interface UnifiedMyTask {
          id: string;
          title: string;
          priority: Priority;
          due_date: string;
          due_time: string;
          assigned_by_name: string;
          client_org_name: string | null;
          organisation_relates_to: string | null;
          task_type: string;
          source: 'task' | 'recurring';
          frequency?: string | null;
          sequence_number?: number;
          recurring_task_id?: string | null; // recurring occurrences: template id (for its subtasks)
        }

        const mapTaskToUnified = (t: Task): UnifiedMyTask => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          due_date: t.due_date,
          due_time: t.due_time,
          assigned_by_name: t.assigned_by_name || '',
          client_org_name: t.client_org_name || null,
          organisation_relates_to: t.organisation_relates_to || null,
          task_type: t.recurring ? 'recurring' : (t as any).task_type || 'one-time',
          source: 'task',
        });

        const mapInstToUnified = (i: any): UnifiedMyTask => ({
          id: i.id,
          title: i.task_name || 'Recurring Task',
          priority: (i.priority || 'medium') as Priority,
          due_date: i.due_date,
          due_time: i.due_time || '',
          assigned_by_name: '',
          client_org_name: i.client_org_name || null,
          organisation_relates_to: i.organisation_relates_to || null,
          task_type: 'recurring',
          source: 'recurring',
          frequency: i.frequency || null,
          sequence_number: i.sequence_number,
          recurring_task_id: i.recurring_task_id || null,
        });

        const todayInstances = myRecurringInstances.filter(i => i.due_date === todayStr && i.status !== 'completed' && i.status !== 'cancelled');
        const overdueInstances = myRecurringInstances.filter(i => i.due_date < todayStr && i.status !== 'completed' && i.status !== 'cancelled').sort((a: any, b: any) => (a.due_date || '').localeCompare(b.due_date || ''));

        const unifiedToday: UnifiedMyTask[] = [
          ...myTodayTasks.map(mapTaskToUnified),
          ...todayInstances.map(mapInstToUnified),
        ].filter(t => !myTasksSearch || t.title.toLowerCase().includes(myTasksSearch.toLowerCase()))
          .sort((a, b) => (a.due_time || '23:59').localeCompare(b.due_time || '23:59'));

        const unifiedOverdue: UnifiedMyTask[] = [
          ...myOldOverdueTasks.map(mapTaskToUnified),
          ...overdueInstances.map(mapInstToUnified),
        ].filter(t => !myTasksSearch || t.title.toLowerCase().includes(myTasksSearch.toLowerCase()))
          .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));

        const totalMyCount = unifiedToday.length + unifiedOverdue.length;

        // ── Checkbox complete handler ──
        const handleMyTaskComplete = async (task: UnifiedMyTask) => {
          if (myTasksCompleting === task.id) return;
          setMyTasksCompleting(task.id);
          try {
            const now = new Date().toISOString();
            if (task.source === 'recurring') {
              await supabase.from('recurring_task_instances').update({
                status: 'completed',
                is_overdue: false,
                completion_datetime: now,
                updated_at: now,
              }).eq('id', task.id);
              setMyRecurringInstances(prev => prev.filter(i => i.id !== task.id));
            } else {
              const today2 = new Date().toISOString().split('T')[0];
              const t = tasks.find(x => x.id === task.id);
              const extraFields: any = { status: 'done' as TaskStatus, completed_at: now, is_overdue: false };
              if (t?.recurring) extraFields.last_completed_date = today2;
              if (t?.created_at) extraFields.time_to_complete_minutes = Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000);
              await supabase.from('tasks').update(extraFields).eq('id', task.id);
              setTasks(prev => prev.map(x => x.id === task.id ? { ...x, ...extraFields } : x));

              // ── Spawn next occurrence for recurring tasks ──────────────────
              // Creates a NEW task row for the next recurrence date.
              // The completed task is preserved as historical record.
              if (t?.recurring && t.due_date) {
                const nextDueDate = getNextDueDate(t.due_date, t.recurring);
                const { data: existingNext } = await supabase
                  .from('tasks')
                  .select('id')
                  .eq('spawned_from_task_id', task.id)
                  .eq('due_date', nextDueDate)
                  .neq('status', 'done')
                  .maybeSingle();

                if (!existingNext) {
                  const freshChecklist = (t.checklist || []).map((c) => ({ ...c, done: false }));
                  const newTaskData = {
                    title: t.title,
                    description: t.description,
                    priority: t.priority,
                    status: 'todo' as TaskStatus,
                    due_date: nextDueDate,
                    due_time: t.due_time || null,
                    assigned_to: t.assigned_to,
                    assigned_to_user_id: t.assigned_to_user_id,
                    assigned_to_name: t.assigned_to_name,
                    assigned_to_dept: t.assigned_to_dept,
                    assigned_user_ids: t.assigned_user_ids || [],
                    assigned_by: t.assigned_by || null,
                    assigned_by_name: t.assigned_by_name,
                    assigned_by_dept: t.assigned_by_dept,
                    checklist: freshChecklist,
                    tags: t.tags || [],
                    recurring: t.recurring,
                    notify_before_minutes: t.notify_before_minutes || 30,
                    is_template: false,
                    task_category: t.task_category || 'general',
                    client_org_id: t.client_org_id || null,
                    client_org_name: t.client_org_name || null,
                    organisation_relates_to: t.organisation_relates_to || null,
                    helper_user_ids: t.helper_user_ids || [],
                    is_active: true,
                    is_overdue: false,
                    spawned_from_task_id: task.id,
                  };
                  const { data: newSpawnedTask, error: spawnErr } = await supabase
                    .from('tasks')
                    .insert(newTaskData)
                    .select()
                    .single();
                  if (!spawnErr && newSpawnedTask) {
                    setTasks(prev => [processTask(newSpawnedTask), ...prev]);
                  }
                }
              }
            }
            toast.success(`"${task.title}" marked as completed!`, { duration: 2500 });
          } catch {
            toast.error('Failed to complete task. Please try again.');
          } finally {
            setMyTasksCompleting(null);
          }
        };

        // ── Task card renderer ──
        const renderMyTaskCard = (task: UnifiedMyTask) => {
          const pc = priorityConfig[task.priority] || priorityConfig.medium;
          const isCompleting = myTasksCompleting === task.id;
          const typeLabel = task.task_type === 'recurring' ? 'Recurring' : task.task_type === 'additional' ? 'Additional' : 'One-Time';
          const typeColor = task.task_type === 'recurring' ? 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' : task.task_type === 'additional' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-slate-500 bg-slate-100 dark:bg-slate-700';
          return (
            <div key={task.id} className={`flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors border-l-2 ${pc.border}`}>
              {/* Checkbox */}
              <button
                onClick={() => handleMyTaskComplete(task)}
                disabled={isCompleting}
                className="mt-0.5 flex-shrink-0 text-slate-300 hover:text-emerald-500 transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center disabled:opacity-50"
                title="Mark as completed"
              >
                {isCompleting
                  ? <div className="w-[18px] h-[18px] border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  : <Square size={18} />
                }
              </button>
              <div className="flex-1 min-w-0">
                {/* Task Name */}
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1.5 leading-snug">
                  {task.title}
                  {task.sequence_number && (
                    <span className="ml-1.5 text-[10px] font-mono text-slate-400">#{task.sequence_number}</span>
                  )}
                </p>
                {/* Row 1: Client + Org + Assigned By */}
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  {task.client_org_name && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-md">
                      <Building2 size={10} />{task.client_org_name}
                    </span>
                  )}
                  {!task.client_org_name && task.organisation_relates_to && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded-md">
                      <Building2 size={10} />{task.organisation_relates_to}
                    </span>
                  )}
                  {task.assigned_by_name && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <Users size={10} />By: {task.assigned_by_name}
                    </span>
                  )}
                </div>
                {/* Row 2: Priority + Due Time + Task Type */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${pc.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />{pc.label}
                  </span>
                  {task.due_time && (
                    <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <Clock size={10} />{String(task.due_time).slice(0, 5)}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${typeColor}`}>
                    {task.task_type === 'recurring' ? <Repeat size={10} /> : <Tag size={10} />}
                    {typeLabel}
                  </span>
                </div>
                {task.source === 'recurring' && task.recurring_task_id && (
                  <div className="mt-2 rounded-lg bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700 p-2.5">
                    <InstanceSubtasks instanceId={task.id} templateId={task.recurring_task_id} />
                  </div>
                )}
              </div>
            </div>
          );
        };

        return (
          <div className="mb-6 bg-gradient-to-br from-blue-50/60 to-slate-50/60 dark:from-blue-900/10 dark:to-slate-800/30 rounded-2xl border border-blue-100 dark:border-blue-900/30 p-4">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                <h2 className="text-base font-700 text-slate-900 dark:text-slate-100">My Tasks</h2>
                <span className="text-xs text-slate-400 font-500 bg-white dark:bg-slate-700 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-600">
                  {unifiedToday.length} today · {unifiedOverdue.length} overdue
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search…"
                    value={myTasksSearch}
                    onChange={e => setMyTasksSearch(e.target.value)}
                    className="pl-6 pr-2 py-1 text-[11px] border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-400 w-28"
                  />
                  {myTasksSearch && (
                    <button onClick={() => setMyTasksSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500">
                      <X size={10} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setMyTasksCollapsed(c => !c)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                >
                  <ChevronDown size={14} className={`transition-transform ${myTasksCollapsed ? '' : 'rotate-180'}`} />
                  {myTasksCollapsed ? 'Expand' : 'Collapse'}
                </button>
              </div>
            </div>

            {!myTasksCollapsed && (
              <>
                {totalMyCount === 0 ? (
                  <div className="py-8 text-center bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <CheckCircle2 size={28} className="text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">All caught up!</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">No pending or overdue tasks for today.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* ── TODAY'S TASKS ── */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-700/40 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
                        <Calendar size={13} className="text-blue-500" />
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Today&apos;s Tasks</span>
                        <span className="ml-auto text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">{unifiedToday.length}</span>
                      </div>
                      {unifiedToday.length === 0 ? (
                        <div className="px-5 py-5 text-center">
                          <CheckCircle2 size={22} className="text-emerald-400 mx-auto mb-1.5" />
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">No tasks due today</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
                          {unifiedToday.map(task => renderMyTaskCard(task))}
                        </div>
                      )}
                    </div>

                    {/* ── OVERDUE TASKS ── */}
                    {unifiedOverdue.length > 0 && (
                      <div className="bg-white dark:bg-slate-800 rounded-xl border border-red-100 dark:border-red-900/30 overflow-hidden">
                        <div className="px-4 py-2.5 bg-red-50/60 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/30 flex items-center gap-2">
                          <AlertTriangle size={13} className="text-red-500" />
                          <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wide">Overdue Tasks</span>
                          <span className="ml-auto text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full">{unifiedOverdue.length}</span>
                        </div>
                        <p className="px-4 py-1.5 text-[11px] text-red-500 dark:text-red-400 bg-red-50/40 dark:bg-red-900/10 border-b border-red-50 dark:border-red-900/20">
                          Sorted oldest first · Complete to remove from this list
                        </p>
                        <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
                          {unifiedOverdue.map(task => (
                            <div key={task.id} className="relative">
                              <div className="absolute top-3.5 right-4 flex items-center gap-1 text-[10px] font-semibold text-red-500">
                                <AlertTriangle size={9} />{task.due_date}
                              </div>
                              {renderMyTaskCard(task)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Divider before All Tasks */}
            <div className="flex items-center gap-3 mt-5 -mx-4 -mb-4 px-4 pb-0 pt-4 border-t border-blue-100 dark:border-blue-900/30">
              <span className="text-[10px] font-700 text-slate-400 uppercase tracking-wider">Workspace — All Tasks</span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>
        );
      })()}

      {/* Task List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-16 text-center bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />
          </div>
        ) : sortedFiltered.length === 0 ? (
          <div className="py-16 text-center bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <CheckSquare size={36} className="text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-500 text-slate-500 dark:text-slate-400">{language === 'hi' ? 'कोई कार्य नहीं मिला' : 'No tasks found'}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{language === 'hi' ? 'फ़िल्टर बदलें या नया कार्य बनाएं' : 'Try adjusting your filters or create a new task'}</p>
          </div>
        ) : (
          sortedFiltered.map((task) => {
            const pc = priorityConfig[task.priority] || priorityConfig.medium;
            const sc = statusConfig[task.status] || statusConfig.todo;
            const isExpanded = expandedTask === task.id;
            const checkDone = task.checklist.filter((c) => c.done).length;
            const checkTotal = task.checklist.length;
            const checkPct = checkTotal > 0 ? Math.round((checkDone / checkTotal) * 100) : 0;
            const assigneeDisplay = getAssigneeDisplay(task);
            const multiAssigned = (task.assigned_user_ids?.length || 0) > 1;
            const isClientTask = !!task.client_org_id;

            // Translate task title and checklist items for Hindi
            const displayTitle = language === 'hi' ? translateToHindi(task.title) : task.title;

            return (
              <div key={task.id} className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 ${pc.border} shadow-sm overflow-hidden`}>
                {/* Client org header banner */}
                {isClientTask && (
                  <div className="flex items-center gap-2 px-5 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/30">
                    <Briefcase size={12} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    <span className="text-xs font-700 text-amber-700 dark:text-amber-400 truncate">{task.client_org_name || 'Client Task'}</span>
                    <span className="text-[10px] text-amber-500 dark:text-amber-500 ml-auto flex-shrink-0">{language === 'hi' ? 'क्लाइंट संगठन' : 'Client Organisation'}</span>
                  </div>
                )}
                {task.organisation_relates_to && (
                  <div className="flex items-center gap-2 px-5 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800/30">
                    <Building2 size={12} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <span className="text-xs font-700 text-blue-700 dark:text-blue-300 truncate">{task.organisation_relates_to}</span>
                    <span className="text-[10px] text-blue-400 dark:text-blue-500 ml-auto flex-shrink-0">{language === 'hi' ? 'संबंधित' : 'Relates to'}</span>
                  </div>
                )}
                <div className="flex items-start gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors"
                  onClick={() => setExpandedTask(isExpanded ? null : task.id)}>
                  <div className="mt-0.5 flex-shrink-0">
                    {task.status === 'done' ? <CheckCircle2 size={18} className="text-emerald-500" /> :
                      task.is_overdue ? <AlertTriangle size={18} className="text-red-500" /> :
                        <Circle size={18} className="text-slate-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <p className={`text-sm font-600 text-slate-900 dark:text-slate-100 flex-1 min-w-0 ${task.status === 'done' ? 'line-through text-slate-400' : ''}`}>
                        {displayTitle}
                      </p>
                      {task.task_category && task.task_category !== 'general' && (
                        <span className="flex items-center gap-1 text-[10px] font-600 text-violet-600 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded-full">
                          <Tag size={9} />{language === 'hi'
                            ? (hindiTaskTranslations[categoryLabels[task.task_category]] || categoryLabels[task.task_category] || task.task_category)
                            : (categoryLabels[task.task_category] || task.task_category)}
                        </span>
                      )}
                      {task.recurring && (
                        <span className="flex items-center gap-1 text-[10px] font-600 text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded-full">
                          <Repeat size={10} />{task.recurring}
                        </span>
                      )}
                      {/* Task type badge */}
                      {(task as any).task_type && (task as any).task_type !== 'recurring' && (
                        <span className="flex items-center gap-1 text-[10px] font-600 text-teal-600 bg-teal-50 dark:bg-teal-900/30 px-1.5 py-0.5 rounded-full capitalize">
                          {(task as any).task_type}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`text-[11px] font-600 px-1.5 py-0.5 rounded-md ${sc.color}`}>{sc.label}</span>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-600 px-1.5 py-0.5 rounded-md ${pc.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />{pc.label}
                      </span>
                      {task.due_date && (
                        <span className={`flex items-center gap-1 text-[11px] ${task.is_overdue ? 'text-red-500 font-600' : 'text-slate-400 dark:text-slate-500'}`}>
                          <Clock size={11} />{task.due_date}{task.due_time ? ` · ${String(task.due_time).slice(0, 5)}` : ''}
                        </span>
                      )}
                      <span className={`flex items-center gap-1 text-[11px] ${multiAssigned ? 'text-blue-600 dark:text-blue-400 font-600' : 'text-slate-400 dark:text-slate-500'}`}>
                        <Users size={11} />
                        {multiAssigned ? `${task.assigned_user_ids.length} ${language === 'hi' ? 'नियुक्त' : 'assignees'}` : assigneeDisplay}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                        <Building2 size={11} />{task.assigned_to_dept}
                      </span>
                    </div>
                    {checkTotal > 0 && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 max-w-[120px] h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-300 ${checkPct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${checkPct}%` }} />
                        </div>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">{checkDone}/{checkTotal} {language === 'hi' ? 'चरण' : 'steps'}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {task.notify_before_minutes && (
                      <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">
                        <Bell size={10} />{task.notify_before_minutes}m
                      </span>
                    )}
                    <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-700 px-5 py-4 bg-slate-50/50 dark:bg-slate-700/20">
                    {task.description && (
                      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">{task.description}</p>
                    )}
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700 mb-4">
                      <TaskSubtasks taskId={task.id} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-xs">
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                        <p className="text-slate-400 mb-1">{language === 'hi' ? 'द्वारा सौंपा गया' : 'Assigned by'}</p>
                        <p className="font-600 text-slate-800 dark:text-slate-200">{task.assigned_by_name}</p>
                        <p className="text-slate-500 dark:text-slate-400">{task.assigned_by_dept}</p>
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700 sm:col-span-1">
                        <p className="text-slate-400 mb-1 flex items-center gap-1">
                          <Users size={11} />{language === 'hi' ? 'को सौंपा गया' : 'Assigned to'} {multiAssigned && <span className="text-blue-600 font-600">({task.assigned_user_ids.length})</span>}
                        </p>
                        {multiAssigned ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {task.assigned_user_ids.map((id) => {
                              const u = allUsers.find((x) => x.id === id);
                              return u ? (
                                <span key={id} className="text-[11px] bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-500">
                                  {u.full_name}
                                </span>
                              ) : null;
                            })}
                          </div>
                        ) : (
                          <>
                            <p className="font-600 text-slate-800 dark:text-slate-200">{task.assigned_to_name}</p>
                            <p className="text-slate-500 dark:text-slate-400">{task.assigned_to_dept}</p>
                          </>
                        )}
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                        <p className="text-slate-400 mb-1">{language === 'hi' ? 'नियत तारीख' : 'Due'}</p>
                        <p className="font-600 text-slate-800 dark:text-slate-200">{task.due_date || 'TBD'}</p>
                        <p className="text-slate-500 dark:text-slate-400">{task.due_time ? String(task.due_time).slice(0, 5) : (language === 'hi' ? 'समय निर्धारित नहीं है' : 'No time set')}</p>
                      </div>
                    </div>

                    {/* Workflow Steps / Checklist */}
                    {task.checklist.length > 0 ? (
                      <div className="mb-4">
                        <h4 className="text-xs font-700 text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                          <CheckSquare size={13} />{language === 'hi' ? 'कार्यप्रवाह चरण' : 'Workflow Steps'} ({checkDone}/{checkTotal})
                        </h4>
                        <div className="space-y-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                          {task.checklist.map((item, idx) => (
                            <div key={item.id} className="flex items-start gap-2.5 group">
                              <button
                                onClick={() => toggleChecklist(task.id, item.id)}
                                className="flex-shrink-0 mt-0.5"
                              >
                                {item.done
                                  ? <CheckSquare size={16} className="text-emerald-500" />
                                  : <Square size={16} className="text-slate-300 hover:text-blue-500 transition-colors" />}
                              </button>
                              <span className={`text-sm leading-snug ${item.done ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                <span className="text-[10px] font-700 text-slate-400 mr-1.5">{idx + 1}.</span>
                                {language === 'hi' ? translateToHindi(item.text) : item.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mb-4 text-xs text-slate-400 dark:text-slate-500 italic">
                        {language === 'hi' ? 'इस कार्य के लिए कोई कार्यप्रवाह चरण परिभाषित नहीं है।' : 'No workflow steps defined for this task.'}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 flex-wrap">
                      <div className="flex gap-1.5 flex-wrap">
                        {(['todo', 'in-progress', 'review', 'done'] as TaskStatus[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => handleStatusChange(task.id, s)}
                            className={`text-[11px] font-600 px-2 py-1 rounded-lg transition-all ${task.status === s ? 'bg-slate-800 dark:bg-slate-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                          >
                            {statusConfig[s].label}
                          </button>
                        ))}
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        {canCreateTask && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopyTask(task); }}
                            className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition-colors"
                          >
                            <Copy size={13} />{language === 'hi' ? 'कॉपी करें' : 'Copy Task'}
                          </button>
                        )}
                        {canCreateTask && clientOrgs.length > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setCopyToClientTask(task); setCopyTargetOrgId(''); }}
                            className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1 transition-colors"
                          >
                            <Copy size={13} />{language === 'hi' ? 'क्लाइंट को कॉपी करें' : 'Copy to Client'}
                          </button>
                        )}
                        {(isDirector || canCreateTask) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingTask({ ...task, assigned_user_ids: task.assigned_user_ids || [] }); }}
                            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
                          >
                            <Edit2 size={13} />{language === 'hi' ? 'संपादित करें' : 'Edit & Assign'}
                          </button>
                        )}
                        {/* Notes button */}
                        <button onClick={() => { setShowNoteModal({ taskId: task.id, taskTitle: task.title }); fetchTaskNotes(task.id); }}
                          className="text-xs text-slate-500 hover:text-blue-600 flex items-center gap-1 transition-colors">
                          <MessageSquare size={13} />Notes{(taskNotes[task.id]?.length || 0) > 0 ? ` (${taskNotes[task.id].length})` : ''}
                        </button>
                        {/* Invite Collaborators */}
                        <button onClick={() => {
                          setShowCollaboratorModal(task);
                          setCollaboratorIds(task.helper_user_ids || []);
                          fetchTaskCollaborators(task.id);
                        }}
                          className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition-colors font-600">
                          <UserPlus size={13} />Collaborate{(task.helper_user_ids?.length || 0) > 0 ? ` (${task.helper_user_ids!.length})` : ''}
                        </button>
                        {/* Flag for help */}
                        <button onClick={() => { setShowFlagModal(task); setFlagReason(task.flag_reason || ''); }}
                          className={`text-xs flex items-center gap-1 transition-colors ${task.is_flagged ? 'text-orange-600 font-600' : 'text-slate-500 hover:text-orange-600'}`}>
                          <HelpCircle size={13} />{task.is_flagged ? 'Flagged' : 'Flag Help'}
                        </button>
                        {/* Day helpers */}
                        <button onClick={() => { setShowHelperModal(task); setHelperIds(task.helper_user_ids || []); }}
                          className="text-xs text-slate-500 hover:text-purple-600 flex items-center gap-1 transition-colors">
                          <Users size={13} />Helpers{(task.helper_user_ids?.length || 0) > 0 ? ` (${task.helper_user_ids!.length})` : ''}
                        </button>
                        {/* Activate/Deactivate — Director only */}
                        {isDirector && (
                          <button onClick={() => handleToggleTaskActive(task.id, task.is_active !== false)}
                            className={`text-xs flex items-center gap-1 transition-colors ${task.is_active === false ? 'text-slate-400 hover:text-emerald-600' : 'text-slate-500 hover:text-red-500'}`}>
                            {task.is_active === false ? <><Power size={13} />Activate</> : <><PowerOff size={13} />Deactivate</>}
                          </button>
                        )}
                        {canCreateTask && (
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 transition-colors"
                          >
                            <Trash2 size={13} />{language === 'hi' ? 'हटाएं' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Notes Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-base font-700 text-slate-900 dark:text-slate-100">Task Notes</h3>
                <p className="text-xs text-slate-500 truncate max-w-xs">{showNoteModal.taskTitle}</p>
              </div>
              <button onClick={() => setShowNoteModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {(taskNotes[showNoteModal.taskId] || []).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No notes yet. Add the first note below.</p>
              ) : (taskNotes[showNoteModal.taskId] || []).map((note: any) => (
                <div key={note.id} className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3 border border-slate-200 dark:border-slate-600">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-600 text-slate-700 dark:text-slate-300">{note.user_name}</span>
                    <span className="text-[11px] text-slate-400">{new Date(note.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{note.content}</p>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700">
              <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)}
                placeholder="Add a note about progress, remaining work, or updates…" rows={3}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-300 resize-none bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 mb-3" />
              <button onClick={handleAddNote} disabled={savingNote || !noteContent.trim()}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-600 transition-colors disabled:opacity-60">
                <MessageSquare size={14} />{savingNote ? 'Adding…' : 'Add Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flag Modal */}
      {showFlagModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-700 text-slate-900 dark:text-slate-100">{showFlagModal.is_flagged ? 'Remove Flag' : 'Flag Task for Help'}</h3>
              <button onClick={() => setShowFlagModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-5">
              {!showFlagModal.is_flagged && (
                <div className="mb-4">
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">Reason for flagging (optional)</label>
                  <textarea value={flagReason} onChange={e => setFlagReason(e.target.value)}
                    placeholder="Describe what help is needed…" rows={3}
                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-orange-300 resize-none bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowFlagModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Cancel</button>
                <button onClick={handleFlagTask}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-sm font-600 transition-colors ${showFlagModal.is_flagged ? 'bg-slate-600 hover:bg-slate-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
                  <HelpCircle size={14} />{showFlagModal.is_flagged ? 'Remove Flag' : 'Flag for Help'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Day Helpers Modal */}
      {showHelperModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-base font-700 text-slate-900 dark:text-slate-100">Add Day Helpers</h3>
                <p className="text-xs text-slate-500">These helpers are for today only — not added as recurring assignees</p>
              </div>
              <button onClick={() => setShowHelperModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-5">
              <UserMultiSelect
                allUsers={allUsers}
                selectedIds={helperIds}
                onChange={setHelperIds}
                roleGroups={[
                  { label: 'Directors', roles: ['director'] },
                  { label: 'Managers', roles: ['manager', 'executive'] },
                  { label: 'Employees', roles: ['employee', 'staff'] },
                ]}
              />
              <p className="text-xs text-slate-400 mt-2">Selected helpers will assist with this task today. They will not be added as permanent assignees.</p>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setShowHelperModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Cancel</button>
                <button onClick={handleSaveHelpers}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-600 transition-colors">
                  <Users size={14} />Save Helpers
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Copy to Client Modal */}
      {copyToClientTask && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Copy size={16} className="text-amber-600" />
                <h3 className="text-base font-700 text-slate-900 dark:text-slate-100">{language === 'hi' ? 'क्लाइंट को कार्य कॉपी करें' : 'Copy Task to Client'}</h3>
              </div>
              <button onClick={() => { setCopyToClientTask(null); setCopyTargetOrgId(''); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-700/40 rounded-xl border border-slate-200 dark:border-slate-600">
                <p className="text-[11px] text-slate-400 mb-0.5">{language === 'hi' ? 'कार्य कॉपी हो रहा है' : 'Copying task'}</p>
                <p className="text-sm font-600 text-slate-800 dark:text-slate-200">{copyToClientTask.title}</p>
                {copyToClientTask.checklist.length > 0 && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{copyToClientTask.checklist.length} {language === 'hi' ? 'कार्यप्रवाह चरण कॉपी होंगे' : 'workflow steps will be copied'}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">
                  <Briefcase size={12} className="inline mr-1" />{language === 'hi' ? 'क्लाइंट संगठन चुनें *' : 'Select Client Organisation *'}
                </label>
                <div className="relative">
                  <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={copyTargetOrgId}
                    onChange={(e) => setCopyTargetOrgId(e.target.value)}
                    className="input-field pl-8 appearance-none cursor-pointer"
                  >
                    <option value="">— {language === 'hi' ? 'संगठन चुनें' : 'Select client or subsidiary'} —</option>
                    {pickerOptions(false)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
              <button onClick={() => { setCopyToClientTask(null); setCopyTargetOrgId(''); }} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                {language === 'hi' ? 'रद्द करें' : 'Cancel'}
              </button>
              <button onClick={handleCopyToClient} disabled={copyingTask || !copyTargetOrgId} className="flex-1 btn-primary py-2.5 disabled:opacity-50">
                <Copy size={15} />{copyingTask ? (language === 'hi' ? 'कॉपी हो रहा है…' : 'Copying…') : (language === 'hi' ? 'कार्य कॉपी करें' : 'Copy Task')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Organisations Modal */}
      {showClientOrgs && (
        <ClientOrganisations
          canManage={userRole === 'director' || userRole === 'manager'}
          onClose={() => setShowClientOrgs(false)}
          onOrgAdded={() => {
            supabase.from('client_organisations').select('id, name').order('name').then(({ data }) => {
              if (data) setClientOrgs(data);
            });
          }}
        />
      )}

      {/* New Task Modal */}
      {showNewTask && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-700 text-slate-900 dark:text-slate-100">{language === 'hi' ? 'नया कार्य बनाएं' : 'Create New Task'}</h3>
              <button onClick={() => setShowNewTask(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">{language === 'hi' ? 'कार्य शीर्षक *' : 'Task Title *'}</label>
                <input type="text" placeholder={language === 'hi' ? 'क्या करना है?' : 'What needs to be done?'} value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">{language === 'hi' ? 'विवरण' : 'Description'}</label>
                <textarea placeholder={language === 'hi' ? 'अधिक संदर्भ जोड़ें…' : 'Add more context…'} value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  rows={2} className="input-field resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">{language === 'hi' ? 'प्राथमिकता' : 'Priority'}</label>
                  <div className="relative">
                    <Flag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as Priority })}
                      className="input-field pl-8 appearance-none cursor-pointer">
                      <option value="low">{language === 'hi' ? 'निम्न' : 'Low'}</option>
                      <option value="medium">{language === 'hi' ? 'मध्यम' : 'Medium'}</option>
                      <option value="high">{language === 'hi' ? 'उच्च' : 'High'}</option>
                      <option value="critical">{language === 'hi' ? 'अत्यावश्यक' : 'Critical'}</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">{language === 'hi' ? 'आवर्ती' : 'Recurring'}</label>
                  <div className="relative">
                    <Repeat size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select value={newTask.recurring} onChange={(e) => setNewTask({ ...newTask, recurring: e.target.value })}
                      className="input-field pl-8 appearance-none cursor-pointer">
                      <option value="">{language === 'hi' ? 'एक बार' : 'One-time'}</option>
                      <option value="hourly">Hourly</option>
                      <option value="daily">{language === 'hi' ? 'दैनिक' : 'Daily'}</option>
                      <option value="weekly">{language === 'hi' ? 'साप्ताहिक' : 'Weekly'}</option>
                      <option value="monthly">{language === 'hi' ? 'मासिक' : 'Monthly'}</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                      <option value="custom">Custom</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">{language === 'hi' ? 'नियत तारीख' : 'Due Date'}</label>
                  <div className="relative">
                    <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="date" value={newTask.dueDate} onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                      className="input-field pl-8" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">{language === 'hi' ? 'नियत समय' : 'Due Time'}</label>
                  <div className="relative">
                    <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="time" value={newTask.dueTime} onChange={(e) => setNewTask({ ...newTask, dueTime: e.target.value })}
                      className="input-field pl-8" />
                  </div>
                </div>
              </div>

              {/* Subtasks: each has its own title and assignee */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-600 text-slate-700 dark:text-slate-300">Subtasks</label>
                  <button type="button"
                    onClick={() => setNewTask((p) => ({ ...p, subtasks: [...p.subtasks, { title: '', assigned_to: '' }] }))}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700">+ Add subtask</button>
                </div>
                {newTask.subtasks.length === 0 && <p className="text-[11px] text-slate-400">No subtasks yet.</p>}
                <div className="space-y-2">
                  {newTask.subtasks.map((s, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <input className="input-field col-span-11" placeholder="Subtask title" value={s.title}
                        onChange={(e) => setNewTask((p) => ({ ...p, subtasks: p.subtasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }))} />
                      <button type="button"
                        onClick={() => setNewTask((p) => ({ ...p, subtasks: p.subtasks.filter((_, j) => j !== i) }))}
                        className="col-span-1 flex justify-center text-red-500 hover:text-red-600" aria-label="Remove subtask">×</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Firms: one or more; the people list below shows members of the picked firms */}
              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">
                  Firms <span className="text-slate-400 font-400">({language === 'hi' ? 'एक या अधिक चुनें' : 'select one or more'})</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {visibleFirmList.map((fm) => {
                    const on = newTask.firmIds.includes(fm.id);
                    return (
                      <button
                        key={fm.id}
                        type="button"
                        onClick={() => setNewTask((p) => {
                          const firmIds = p.firmIds.includes(fm.id)
                            ? p.firmIds.filter((x) => x !== fm.id)
                            : [...p.firmIds, fm.id];
                          // Drop anyone whose firm is no longer picked
                          return {
                            ...p,
                            firmIds,
                            assignedUserIds: p.assignedUserIds.filter((id) => {
                              const firmOfUser = allUsers.find((u) => u.id === id)?.firm_id;
                              return firmIds.length === 0 || (!!firmOfUser && firmIds.includes(firmOfUser));
                            }),
                          };
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
                  {newTask.firmIds.length === 0 ? 'No firm picked: people from all firms are shown' : `${newTask.firmIds.length} firm${newTask.firmIds.length > 1 ? 's' : ''} selected`}
                </p>
              </div>

              {/* Multi-user assignment */}
              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">
                  <Users size={12} className="inline mr-1" />{language === 'hi' ? 'उपयोगकर्ताओं को सौंपें' : 'Assign to Users'} <span className="text-slate-400 font-400">({language === 'hi' ? 'एक या अधिक चुनें' : 'select one or more'})</span>
                </label>
                <UserMultiSelect
                  allUsers={allUsers.filter((u) => newTask.firmIds.length === 0 || (!!u.firm_id && newTask.firmIds.includes(u.firm_id)))}
                  selectedIds={newTask.assignedUserIds}
                  onChange={(ids) => setNewTask({ ...newTask, assignedUserIds: ids })}
                  roleGroups={roleGroups}
                />
              </div>

              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">
                  <UserPlus size={12} className="inline mr-1" />Invite Collaborators <span className="text-slate-400 font-400">(optional — they'll need to accept)</span>
                </label>
                <UserMultiSelect
                  allUsers={allUsers.filter(u => !newTask.assignedUserIds.includes(u.id))}
                  selectedIds={newTask.collaboratorUserIds}
                  onChange={(ids) => setNewTask({ ...newTask, collaboratorUserIds: ids })}
                  roleGroups={roleGroups}
                />
              </div>

              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">
                  <Building2 size={12} className="inline mr-1" />{language === 'hi' ? 'संबंधित संगठन / क्लाइंट' : 'Client / Organisation Relates To'}
                </label>
                <div className="relative">
                  <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={pickRef(newTask.clientOrgId, newTask.organisationRelatesTo)}
                    onChange={(e) => {
                      const r = applyPick(e.target.value);
                      setNewTask({ ...newTask, clientOrgId: r.clientOrgId, organisationRelatesTo: r.organisationRelatesTo });
                    }}
                    className="input-field pl-8 appearance-none cursor-pointer"
                  >
                    {pickerOptions(true)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300">
                    <Tag size={12} className="inline mr-1" />{language === 'hi' ? 'श्रेणी' : 'Category'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCategoryManager(true)}
                    className="text-[11px] text-violet-600 hover:text-violet-700 font-600 flex items-center gap-1 hover:underline"
                  >
                    <Edit2 size={11} />{language === 'hi' ? 'श्रेणियां प्रबंधित करें' : 'Manage Categories'}
                  </button>
                </div>
                <div className="relative">
                  <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={newTask.taskCategory}
                    onChange={(e) => setNewTask({ ...newTask, taskCategory: e.target.value })}
                    className="input-field pl-8 appearance-none cursor-pointer"
                  >
                    <option value="general">{language === 'hi' ? 'सामान्य' : 'General'}</option>
                    {dynamicCategories.map((c) => (
                      <option key={c.id} value={c.slug}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">
                  <Building2 size={12} className="inline mr-1" />{language === 'hi' ? 'विभाग (वैकल्पिक)' : 'Department (optional override)'}
                </label>
                <div className="relative">
                  <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select value={newTask.assignedToDept} onChange={(e) => setNewTask({ ...newTask, assignedToDept: e.target.value })}
                    className="input-field pl-8 appearance-none cursor-pointer">
                      <option value="">{language === 'hi' ? 'विभाग चुनें…' : 'Select dept…'}</option>
                      {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">
                  <BellRing size={12} className="inline mr-1" />{language === 'hi' ? 'पहले सूचित करें (मिनट)' : 'Notify before (minutes)'}
                </label>
                <div className="flex gap-2">
                  {[15, 30, 60, 120].map((m) => (
                    <button key={m} onClick={() => setNewTask({ ...newTask, notifyBefore: m })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-600 border transition-all ${newTask.notifyBefore === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-blue-300'}`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300">{language === 'hi' ? 'कार्यप्रवाह चरण' : 'Workflow Steps'}</label>
                  <button onClick={() => setNewTask({ ...newTask, checklistItems: [...newTask.checklistItems, ''] })}
                    className="text-xs text-blue-600 font-600 hover:underline flex items-center gap-1">
                    <Plus size={12} />{language === 'hi' ? 'चरण जोड़ें' : 'Add Step'}
                  </button>
                </div>
                <div className="space-y-2">
                  {newTask.checklistItems.map((item, idx) => (
                    <div key={`new-cl-${idx}`} className="flex items-center gap-2">
                      <Square size={14} className="text-slate-300 flex-shrink-0" />
                      <input type="text" placeholder={language === 'hi' ? `चरण ${idx + 1}…` : `Step ${idx + 1}…`} value={item}
                        onChange={(e) => {
                          const updated = [...newTask.checklistItems];
                          updated[idx] = e.target.value;
                          setNewTask({ ...newTask, checklistItems: updated });
                        }}
                        className="flex-1 text-sm input-field py-1.5" />
                      {newTask.checklistItems.length > 1 && (
                        <button onClick={() => setNewTask({ ...newTask, checklistItems: newTask.checklistItems.filter((_, i) => i !== idx) })}
                          className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
              <button onClick={() => setShowNewTask(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                {language === 'hi' ? 'रद्द करें' : 'Cancel'}
              </button>
              <button onClick={handleCreateTask} disabled={saving} className="flex-1 btn-primary py-2.5 disabled:opacity-50">
                <ArrowRight size={15} />{saving ? (language === 'hi' ? 'बन रहा है…' : 'Creating…') : (language === 'hi' ? 'बनाएं और सौंपें' : 'Create & Assign')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit & Assign Task Modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-700 text-slate-900 dark:text-slate-100">{language === 'hi' ? 'कार्य संपादित करें और सौंपें' : 'Edit & Assign Task'}</h3>
              <button onClick={() => setEditingTask(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">{language === 'hi' ? 'कार्य शीर्षक *' : 'Task Title *'}</label>
                <input type="text" value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">{language === 'hi' ? 'विवरण' : 'Description'}</label>
                <textarea value={editingTask.description}
                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                  rows={3} className="input-field resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">{language === 'hi' ? 'प्राथमिकता' : 'Priority'}</label>
                  <div className="relative">
                    <Flag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select value={editingTask.priority}
                      onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value as Priority })}
                      className="input-field pl-8 appearance-none cursor-pointer">
                      <option value="low">{language === 'hi' ? 'निम्न' : 'Low'}</option>
                      <option value="medium">{language === 'hi' ? 'मध्यम' : 'Medium'}</option>
                      <option value="high">{language === 'hi' ? 'उच्च' : 'High'}</option>
                      <option value="critical">{language === 'hi' ? 'अत्यावश्यक' : 'Critical'}</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">{language === 'hi' ? 'आवर्ती' : 'Recurring'}</label>
                  <div className="relative">
                    <Repeat size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select value={editingTask.recurring || ''}
                      onChange={(e) => setEditingTask({ ...editingTask, recurring: e.target.value || null })}
                      className="input-field pl-8 appearance-none cursor-pointer">
                      <option value="">{language === 'hi' ? 'एक बार' : 'One-time'}</option>
                      <option value="hourly">Hourly</option>
                      <option value="daily">{language === 'hi' ? 'दैनिक' : 'Daily'}</option>
                      <option value="weekly">{language === 'hi' ? 'साप्ताहिक' : 'Weekly'}</option>
                      <option value="monthly">{language === 'hi' ? 'मासिक' : 'Monthly'}</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                      <option value="custom">Custom</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">{language === 'hi' ? 'नियत तारीख' : 'Due Date'}</label>
                  <div className="relative">
                    <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="date" value={editingTask.due_date || ''}
                      onChange={(e) => setEditingTask({ ...editingTask, due_date: e.target.value })}
                      className="input-field pl-8" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">{language === 'hi' ? 'नियत समय' : 'Due Time'}</label>
                  <div className="relative">
                    <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="time" value={editingTask.due_time ? String(editingTask.due_time).slice(0, 5) : ''}
                      onChange={(e) => setEditingTask({ ...editingTask, due_time: e.target.value })}
                      className="input-field pl-8" />
                  </div>
                </div>
              </div>

              {/* Multi-user assignment */}
              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">
                  <Users size={12} className="inline mr-1" />{language === 'hi' ? 'उपयोगकर्ताओं को सौंपें' : 'Assign to Users'} <span className="text-slate-400 font-400">({language === 'hi' ? 'एक या अधिक चुनें' : 'select one or more'})</span>
                </label>
                <UserMultiSelect
                  allUsers={allUsers}
                  selectedIds={editingTask.assigned_user_ids || []}
                  onChange={(ids) => setEditingTask({ ...editingTask, assigned_user_ids: ids })}
                  roleGroups={roleGroups}
                />
              </div>

              <div>
                <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1.5">
                  <Building2 size={12} className="inline mr-1" />{language === 'hi' ? 'संबंधित संगठन' : 'Organisation Relates To'}
                </label>
                <div className="relative">
                  <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={pickRef(editingTask.client_org_id, editingTask.organisation_relates_to)}
                    onChange={(e) => {
                      const r = applyPick(e.target.value);
                      setEditingTask({
                        ...editingTask,
                        client_org_id: r.clientOrgId || null,
                        client_org_name: r.clientOrgName,
                        organisation_relates_to: r.organisationRelatesTo || null,
                      });
                    }}
                    className="input-field pl-8 appearance-none cursor-pointer"
                  >
                    {pickerOptions(true)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300">
                    <Tag size={12} className="inline mr-1" />{language === 'hi' ? 'श्रेणी' : 'Category'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCategoryManager(true)}
                    className="text-[11px] text-violet-600 hover:text-violet-700 font-600 flex items-center gap-1 hover:underline"
                  >
                    <Edit2 size={11} />{language === 'hi' ? 'श्रेणियां प्रबंधित करें' : 'Manage Categories'}
                  </button>
                </div>
                <div className="relative">
                  <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={editingTask.task_category || 'general'}
                    onChange={(e) => setEditingTask({ ...editingTask, task_category: e.target.value })}
                    className="input-field pl-8 appearance-none cursor-pointer"
                  >
                    <option value="general">{language === 'hi' ? 'सामान्य' : 'General'}</option>
                    {dynamicCategories.map((c) => (
                      <option key={c.id} value={c.slug}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Workflow Steps editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-600 text-slate-700 dark:text-slate-300">{language === 'hi' ? 'कार्यप्रवाह चरण' : 'Workflow Steps'}</label>
                  <button
                    type="button"
                    onClick={() => setEditingTask({
                      ...editingTask,
                      checklist: [...editingTask.checklist, { id: `cl-${Date.now()}`, text: '', done: false }]
                    })}
                    className="text-xs text-blue-600 font-600 hover:underline flex items-center gap-1"
                  >
                    <Plus size={12} />{language === 'hi' ? 'चरण जोड़ें' : 'Add Step'}
                  </button>
                </div>
                {editingTask.checklist.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">{language === 'hi' ? 'अभी कोई चरण नहीं — "चरण जोड़ें" पर क्लिक करें।' : 'No steps yet — click "Add Step" to add workflow steps.'}</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {editingTask.checklist.map((item, idx) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <span className="text-[10px] font-700 text-slate-400 w-5 text-right flex-shrink-0">{idx + 1}.</span>
                        <input
                          type="text"
                          value={item.text}
                          onChange={(e) => {
                            const updated = editingTask.checklist.map((c, i) => i === idx ? { ...c, text: e.target.value } : c);
                            setEditingTask({ ...editingTask, checklist: updated });
                          }}
                          className="flex-1 text-sm input-field py-1.5"
                        />
                        <button
                          type="button"
                          onClick={() => setEditingTask({
                            ...editingTask,
                            checklist: editingTask.checklist.filter((_, i) => i !== idx)
                          })}
                          className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
              <button onClick={() => setEditingTask(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                {language === 'hi' ? 'रद्द करें' : 'Cancel'}
              </button>
              <button onClick={handleSaveEdit} disabled={saving} className="flex-1 btn-primary py-2.5 disabled:opacity-50">
                <Save size={15} />{saving ? (language === 'hi' ? 'सहेजा जा रहा है…' : 'Saving…') : (language === 'hi' ? 'सहेजें और सौंपें' : 'Save & Assign')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Manager Modal */}
      {showCategoryManager && (
        <TaskCategoryManager
          onClose={() => setShowCategoryManager(false)}
          onCategoriesChanged={() => {
            // Real-time subscription handles this, but also fetch to ensure consistency
            supabase
              .from('task_categories')
              .select('id, name, slug, color')
              .order('name')
              .then(({ data }) => {
                if (data) setDynamicCategories(data);
              });
          }}
        />
      )}

      {/* Collaborators Modal */}
      {showCollaboratorModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-base font-700 text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <UserPlus size={16} className="text-indigo-600" />
                  Invite Collaborators
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{showCollaboratorModal.title}</p>
              </div>
              <button onClick={() => setShowCollaboratorModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select users to collaborate on this task. Collaborators can view, update status, and add notes.
              </p>
              <UserMultiSelect
                allUsers={allUsers.filter(u => {
                  // Exclude already-assigned users
                  const assignedIds = showCollaboratorModal.assigned_user_ids || [];
                  return !assignedIds.includes(u.id);
                })}
                selectedIds={collaboratorIds}
                onChange={setCollaboratorIds}
                roleGroups={[
                  { label: 'Directors', roles: ['director'] },
                  { label: 'Managers', roles: ['manager', 'executive'] },
                  { label: 'Employees', roles: ['employee', 'staff'] },
                ]}
              />
              {showCollaboratorModal.status === 'done' && (
                <p className="text-xs font-600 text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg p-2.5">
                  This task is completed — new collaboration requests can no longer be sent.
                </p>
              )}
              {/* Show current collaborators */}
              {(taskCollaborators[showCollaboratorModal.id] || []).length > 0 && (
                <div>
                  <p className="text-xs font-600 text-slate-600 dark:text-slate-400 mb-2">Collaborators</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(taskCollaborators[showCollaboratorModal.id] || []).map((c: any) => (
                      <span key={c.id} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-500 ${
                        c.status === 'pending' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                        : c.status === 'declined' ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 line-through'
                        : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                      }`}>
                        <Users size={10} />
                        {c.user_profiles?.full_name || 'Unknown'}
                        <span className="text-[10px] opacity-70">({c.status === 'pending' ? 'pending' : c.status === 'declined' ? 'declined' : c.role})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[11px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-700/40 rounded-lg p-2.5">
                💡 Invited collaborators must accept before they're added — they'll see a request to respond to.
              </p>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => setShowCollaboratorModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Cancel</button>
              <button onClick={handleSaveCollaborators} disabled={savingCollaborators || showCollaboratorModal.status === 'done'}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-600 transition-colors disabled:opacity-60">
                <UserPlus size={14} />{savingCollaborators ? 'Saving…' : 'Save Collaborators'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}