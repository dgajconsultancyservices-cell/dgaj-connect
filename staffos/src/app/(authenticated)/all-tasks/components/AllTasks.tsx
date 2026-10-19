// 'use client';

// import React, { useState, useEffect, useCallback, useRef } from 'react';
// import { Plus, Search, Download, RefreshCw, CheckSquare, Square, AlertTriangle, Repeat, X, Users, Flag, Loader2, ArrowUpDown, SlidersHorizontal, ArrowLeft } from 'lucide-react';
// import { toast, Toaster } from 'sonner';
// import { useAuth } from '@/contexts/AuthContext';
// import { createClient } from '@/lib/supabase/client';
// import { useRouter } from 'next/navigation';

// type TaskStatus = 'not_started' | 'in_progress' | 'waiting' | 'blocked' | 'completed' | 'cancelled';
// type Priority = 'critical' | 'high' | 'medium' | 'low';

// interface Task {
//   id: string;
//   title: string;
//   description: string;
//   task_status: TaskStatus;
//   priority: Priority;
//   category_id: string | null;
//   category_name?: string;
//   assigned_to: string | null;
//   assignee_name?: string;
//   creator_id: string | null;
//   creator_name?: string;
//   client_org_id: string | null;
//   client_org_name?: string;
//   organisation_id: string | null;
//   project_id: string | null;
//   project_name?: string;
//   start_date: string | null;
//   start_time: string | null;
//   due_date: string | null;
//   due_time: string | null;
//   estimated_hours: number;
//   actual_hours: number;
//   completion_percentage: number;
//   is_recurring: boolean;
//   is_blocked: boolean;
//   is_overdue: boolean;
//   completed_at: string | null;
//   created_at: string;
//   updated_at: string;
//   collaborators?: { user_id: string; full_name: string }[];
// }

// interface UserProfile { id: string; full_name: string; role: string; }
// interface Category { id: string; name: string; color: string; }
// interface ClientOrg { id: string; name: string; }
// interface Project { id: string; name: string; }

// const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string; dot: string }> = {
//   not_started: { label: 'Not Started', color: 'text-slate-600', bg: 'bg-slate-100 dark:bg-slate-700', dot: 'bg-slate-400' },
//   in_progress:  { label: 'In Progress', color: 'text-blue-600',  bg: 'bg-blue-50 dark:bg-blue-900/30',  dot: 'bg-blue-500' },
//   waiting:      { label: 'Waiting',     color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/30', dot: 'bg-amber-400' },
//   blocked:      { label: 'Blocked',     color: 'text-red-600',   bg: 'bg-red-50 dark:bg-red-900/30',    dot: 'bg-red-500' },
//   completed:    { label: 'Completed',   color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/30', dot: 'bg-emerald-500' },
//   cancelled:    { label: 'Cancelled',   color: 'text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800',  dot: 'bg-slate-300' },
// };

// const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string }> = {
//   critical: { label: 'Urgent',  color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/30' },
//   high:     { label: 'High',    color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/30' },
//   medium:   { label: 'Medium',  color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-900/30' },
//   low:      { label: 'Low',     color: 'text-slate-500',  bg: 'bg-slate-100 dark:bg-slate-700' },
// };

// function fmt(d: string | null) {
//   if (!d) return '—';
//   try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; }
// }

// function isOverdue(task: Task): boolean {
//   if (task.task_status === 'completed' || task.task_status === 'cancelled') return false;
//   if (!task.due_date) return false;
//   return new Date(task.due_date) < new Date(new Date().toDateString());
// }

// interface CreateTaskModalProps {
//   onClose: () => void;
//   onCreated: () => void;
//   users: UserProfile[];
//   categories: Category[];
//   clients: ClientOrg[];
//   projects: Project[];
//   currentUserId: string;
//   isManager: boolean;
// }

// function CreateTaskModal({ onClose, onCreated, users, categories, clients, projects, currentUserId, isManager }: CreateTaskModalProps) {
//   const supabase = createClient();
//   const [saving, setSaving] = useState(false);
//   const [form, setForm] = useState({
//     title: '', description: '', task_status: 'not_started' as TaskStatus,
//     priority: 'medium' as Priority, category_id: '', assigned_to: currentUserId,
//     client_org_id: '', project_id: '', start_date: '', start_time: '',
//     due_date: '', due_time: '', estimated_hours: '', collaborators: [] as string[],
//     is_blocked: false, blocker_reason: '',
//   });

//   const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!form.title.trim()) { toast.error('Task title is required'); return; }
//     setSaving(true);
//     try {
//       const { data: task, error } = await supabase.from('tasks').insert({
//         title: form.title.trim(),
//         description: form.description,
//         task_status: form.task_status,
//         priority: form.priority,
//         category_id: form.category_id || null,
//         assigned_to: form.assigned_to || null,
//         creator_id: currentUserId,
//         client_org_id: form.client_org_id || null,
//         project_id: form.project_id || null,
//         start_date: form.start_date || null,
//         start_time: form.start_time || null,
//         due_date: form.due_date || null,
//         due_time: form.due_time || null,
//         estimated_hours: parseFloat(form.estimated_hours) || 0,
//         is_blocked: form.is_blocked,
//         blocker_reason: form.blocker_reason || null,
//         assigned_by: currentUserId,
//         status: 'todo',
//       }).select('id').single();

//       if (error) throw error;

//       // Add collaborators
//       if (form.collaborators.length > 0 && task) {
//         await supabase.from('task_collaborators').insert(
//           form.collaborators.map(uid => ({ task_id: task.id, user_id: uid, added_by: currentUserId }))
//         );
//       }

//       // Log activity
//       if (task) {
//         await supabase.from('task_activity').insert({
//           task_id: task.id, user_id: currentUserId, action: 'created',
//           new_value: form.title.trim(),
//         });
//       }

//       toast.success('Task created successfully');
//       onCreated();
//       onClose();
//     } catch (err: any) {
//       toast.error(err.message || 'Failed to create task');
//     } finally {
//       setSaving(false);
//     }
//   };

//   const toggleCollaborator = (uid: string) => {
//     set('collaborators', form.collaborators.includes(uid)
//       ? form.collaborators.filter(id => id !== uid)
//       : [...form.collaborators, uid]);
//   };

//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
//       <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
//         <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
//           <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Create New Task</h2>
//           <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
//             <X size={18} className="text-slate-500" />
//           </button>
//         </div>
//         <form onSubmit={handleSubmit} className="p-6 space-y-4">
//           {/* Title */}
//           <div>
//             <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Task Title *</label>
//             <input value={form.title} onChange={e => set('title', e.target.value)}
//               className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
//               placeholder="Enter task title..." required />
//           </div>
//           {/* Description */}
//           <div>
//             <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
//             <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
//               className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
//               placeholder="Describe the task..." />
//           </div>
//           {/* Priority + Status */}
//           <div className="grid grid-cols-2 gap-3">
//             <div>
//               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Priority</label>
//               <select value={form.priority} onChange={e => set('priority', e.target.value)}
//                 className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
//                 <option value="critical">Urgent</option>
//                 <option value="high">High</option>
//                 <option value="medium">Medium</option>
//                 <option value="low">Low</option>
//               </select>
//             </div>
//             <div>
//               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
//               <select value={form.task_status} onChange={e => set('task_status', e.target.value)}
//                 className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
//                 {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
//               </select>
//             </div>
//           </div>
//           {/* Category + Assignee */}
//           <div className="grid grid-cols-2 gap-3">
//             <div>
//               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
//               <select value={form.category_id} onChange={e => set('category_id', e.target.value)}
//                 className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
//                 <option value="">No Category</option>
//                 {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
//               </select>
//             </div>
//             <div>
//               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Assignee</label>
//               <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}
//                 className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
//                 <option value="">Unassigned</option>
//                 {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
//               </select>
//             </div>
//           </div>
//           {/* Client + Project */}
//           <div className="grid grid-cols-2 gap-3">
//             <div>
//               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Client / Organisation</label>
//               <select value={form.client_org_id} onChange={e => set('client_org_id', e.target.value)}
//                 className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
//                 <option value="">Internal (No Client)</option>
//                 {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
//               </select>
//             </div>
//             <div>
//               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Project</label>
//               <select value={form.project_id} onChange={e => set('project_id', e.target.value)}
//                 className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
//                 <option value="">No Project</option>
//                 {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
//               </select>
//             </div>
//           </div>
//           {/* Dates */}
//           <div className="grid grid-cols-2 gap-3">
//             <div>
//               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Date</label>
//               <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}
//                 className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
//             </div>
//             <div>
//               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Due Date</label>
//               <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}
//                 className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
//             </div>
//           </div>
//           {/* Times + Estimated Hours */}
//           <div className="grid grid-cols-3 gap-3">
//             <div>
//               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Time</label>
//               <input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)}
//                 className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
//             </div>
//             <div>
//               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Due Time</label>
//               <input type="time" value={form.due_time} onChange={e => set('due_time', e.target.value)}
//                 className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
//             </div>
//             <div>
//               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Est. Hours</label>
//               <input type="number" min="0" step="0.25" value={form.estimated_hours} onChange={e => set('estimated_hours', e.target.value)}
//                 className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
//                 placeholder="0.00" />
//             </div>
//           </div>
//           {/* Collaborators */}
//           <div>
//             <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Collaborators</label>
//             <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
//               {users.filter(u => u.id !== form.assigned_to).map(u => (
//                 <button key={u.id} type="button" onClick={() => toggleCollaborator(u.id)}
//                   className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
//                     form.collaborators.includes(u.id)
//                       ? 'bg-blue-600 text-white' :'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
//                   }`}>
//                   {u.full_name}
//                 </button>
//               ))}
//             </div>
//           </div>
//           {/* Blocked */}
//           <div className="flex items-center gap-3">
//             <input type="checkbox" id="is_blocked" checked={form.is_blocked} onChange={e => set('is_blocked', e.target.checked)}
//               className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
//             <label htmlFor="is_blocked" className="text-sm font-medium text-slate-700 dark:text-slate-300">Mark as Blocked</label>
//           </div>
//           {form.is_blocked && (
//             <input value={form.blocker_reason} onChange={e => set('blocker_reason', e.target.value)}
//               className="w-full px-3 py-2 rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
//               placeholder="Describe the blocker..." />
//           )}
//           {/* Actions */}
//           <div className="flex gap-3 pt-2">
//             <button type="button" onClick={onClose}
//               className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
//               Cancel
//             </button>
//             <button type="submit" disabled={saving}
//               className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
//               {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
//               {saving ? 'Creating...' : 'Create Task'}
//             </button>
//           </div>
//         </form>
//       </div>
//     </div>
//   );
// }

// export default function AllTasks() {
//   const { effectiveUserId, pinSession } = useAuth();
//   const supabase = createClient();
//   const router = useRouter();
//   const [tasks, setTasks] = useState<Task[]>([]);
//   const [users, setUsers] = useState<UserProfile[]>([]);
//   const [categories, setCategories] = useState<Category[]>([]);
//   const [clients, setClients] = useState<ClientOrg[]>([]);
//   const [projects, setProjects] = useState<Project[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [showCreate, setShowCreate] = useState(false);
//   const [selected, setSelected] = useState<Set<string>>(new Set());
//   const [search, setSearch] = useState('');
//   const [filterStatus, setFilterStatus] = useState('all');
//   const [filterPriority, setFilterPriority] = useState('all');
//   const [filterCategory, setFilterCategory] = useState('all');
//   const [filterClient, setFilterClient] = useState('all');
//   const [sortBy, setSortBy] = useState<'due_date' | 'priority' | 'created_at' | 'title'>('due_date');
//   const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
//   const [page, setPage] = useState(1);
//   const [showFilters, setShowFilters] = useState(false);
//   const PAGE_SIZE = 25;

//   const role = pinSession?.role || '';
//   const isManager = role === 'director' || role === 'manager' || role === 'executive';

//   const fetchAll = useCallback(async () => {
//     if (!effectiveUserId) return;
//     setLoading(true);
//     try {
//       const [usersRes, catsRes, clientsRes, projectsRes] = await Promise.all([
//         supabase.from('user_profiles').select('id, full_name, role').eq('is_active', true).order('full_name'),
//         supabase.from('task_categories').select('id, name, color').eq('is_active', true).order('name'),
//         supabase.from('client_organisations').select('id, name').order('name'),
//         supabase.from('projects').select('id, name').order('name'),
//       ]);
//       setUsers(usersRes.data || []);
//       setCategories(catsRes.data || []);
//       setClients(clientsRes.data || []);
//       setProjects(projectsRes.data || []);

//       // Fetch tasks
//       let query = supabase.from('tasks').select(`
//         id, title, description, task_status, priority, category_id, assigned_to,
//         creator_id, client_org_id, organisation_id, project_id,
//         start_date, start_time, due_date, due_time, estimated_hours, actual_hours,
//         completion_percentage, is_recurring, is_blocked, is_overdue,
//         completed_at, created_at, updated_at
//       `).eq('is_recurring', false);

//       if (!isManager) {
//         query = query.or(`assigned_to.eq.${effectiveUserId},creator_id.eq.${effectiveUserId}`);
//       }

//       const { data: taskData, error } = await query.order('created_at', { ascending: false }).limit(500);
//       if (error) throw error;

//       // Fetch collaborators for tasks
//       const taskIds = (taskData || []).map((t: any) => t.id);
//       let collabMap: Record<string, { user_id: string; full_name: string }[]> = {};
//       if (taskIds.length > 0) {
//         const { data: collabs } = await supabase
//           .from('task_collaborators')
//           .select('task_id, user_id, user_profiles(full_name)')
//           .in('task_id', taskIds.slice(0, 100));
//         (collabs || []).forEach((c: any) => {
//           if (!collabMap[c.task_id]) collabMap[c.task_id] = [];
//           collabMap[c.task_id].push({ user_id: c.user_id, full_name: c.user_profiles?.full_name || '' });
//         });
//       }

//       // Also include tasks where user is collaborator
//       let extraTasks: any[] = [];
//       if (!isManager) {
//         const { data: myCollabs } = await supabase
//           .from('task_collaborators')
//           .select('task_id')
//           .eq('user_id', effectiveUserId);
//         const collabTaskIds = (myCollabs || []).map((c: any) => c.task_id);
//         if (collabTaskIds.length > 0) {
//           const existingIds = new Set((taskData || []).map((t: any) => t.id));
//           const newIds = collabTaskIds.filter((id: string) => !existingIds.has(id));
//           if (newIds.length > 0) {
//             const { data: collabTasks } = await supabase
//               .from('tasks')
//               .select(`id, title, description, task_status, priority, category_id, assigned_to,
//                 creator_id, client_org_id, organisation_id, project_id,
//                 start_date, start_time, due_date, due_time, estimated_hours, actual_hours,
//                 completion_percentage, is_recurring, is_blocked, is_overdue,
//                 completed_at, created_at, updated_at`)
//               .eq('is_recurring', false)
//               .in('id', newIds.slice(0, 50));
//             extraTasks = collabTasks || [];
//           }
//         }
//       }

//       const allTasks = [...(taskData || []), ...extraTasks];
//       const userMap = Object.fromEntries((usersRes.data || []).map((u: any) => [u.id, u.full_name]));
//       const catMap = Object.fromEntries((catsRes.data || []).map((c: any) => [c.id, c.name]));
//       const clientMap = Object.fromEntries((clientsRes.data || []).map((c: any) => [c.id, c.name]));
//       const projMap = Object.fromEntries((projectsRes.data || []).map((p: any) => [p.id, p.name]));

//       const enriched: Task[] = allTasks.map((t: any) => ({
//         ...t,
//         task_status: t.task_status || 'not_started',
//         assignee_name: t.assigned_to ? userMap[t.assigned_to] || '—' : '—',
//         creator_name: t.creator_id ? userMap[t.creator_id] || '—' : '—',
//         category_name: t.category_id ? catMap[t.category_id] || '—' : '—',
//         client_org_name: t.client_org_id ? clientMap[t.client_org_id] || '—' : '—',
//         project_name: t.project_id ? projMap[t.project_id] || '—' : '—',
//         collaborators: collabMap[t.id] || [],
//         is_overdue: isOverdue(t),
//       }));

//       setTasks(enriched);
//     } catch (err: any) {
//       toast.error('Failed to load tasks');
//     } finally {
//       setLoading(false);
//     }
//   }, [effectiveUserId, isManager]);

//   useEffect(() => { fetchAll(); }, [fetchAll]);

//   const filtered = tasks.filter(t => {
//     if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
//         !(t.assignee_name || '').toLowerCase().includes(search.toLowerCase()) &&
//         !(t.client_org_name || '').toLowerCase().includes(search.toLowerCase())) return false;
//     if (filterStatus !== 'all' && t.task_status !== filterStatus) return false;
//     if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
//     if (filterCategory !== 'all' && t.category_id !== filterCategory) return false;
//     if (filterClient !== 'all' && t.client_org_id !== filterClient) return false;
//     return true;
//   }).sort((a, b) => {
//     let av: any, bv: any;
//     if (sortBy === 'due_date') { av = a.due_date || '9999'; bv = b.due_date || '9999'; }
//     else if (sortBy === 'priority') {
//       const order = { critical: 0, high: 1, medium: 2, low: 3 };
//       av = order[a.priority]; bv = order[b.priority];
//     }
//     else if (sortBy === 'title') { av = a.title; bv = b.title; }
//     else { av = a.created_at; bv = b.created_at; }
//     if (av < bv) return sortDir === 'asc' ? -1 : 1;
//     if (av > bv) return sortDir === 'asc' ? 1 : -1;
//     return 0;
//   });

//   const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
//   const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

//   const toggleSort = (col: typeof sortBy) => {
//     if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
//     else { setSortBy(col); setSortDir('asc'); }
//   };

//   const toggleSelect = (id: string) => {
//     setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
//   };
//   const toggleAll = () => {
//     if (selected.size === paginated.length) setSelected(new Set());
//     else setSelected(new Set(paginated.map(t => t.id)));
//   };

//   const handleBulkStatus = async (status: TaskStatus) => {
//     if (selected.size === 0) return;
//     try {
//       await supabase.from('tasks').update({ task_status: status }).in('id', Array.from(selected));
//       toast.success(`Updated ${selected.size} tasks`);
//       setSelected(new Set());
//       fetchAll();
//     } catch { toast.error('Bulk update failed'); }
//   };

//   const exportCSV = () => {
//     const headers = ['ID','Title','Status','Priority','Category','Assignee','Client','Project','Due Date','Est Hours','Actual Hours','Completion%','Recurring','Blocked','Created'];
//     const rows = filtered.map(t => [
//       t.id.slice(0,8), t.title, STATUS_CONFIG[t.task_status]?.label || t.task_status,
//       PRIORITY_CONFIG[t.priority]?.label || t.priority, t.category_name || '—',
//       t.assignee_name || '—', t.client_org_name || '—', t.project_name || '—',
//       t.due_date || '—', String(t.estimated_hours || 0), String(t.actual_hours || 0),
//       String(t.completion_percentage || 0), t.is_recurring ? 'Yes' : 'No',
//       t.is_blocked ? 'Yes' : 'No', fmt(t.created_at),
//     ]);
//     const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
//     const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
//     const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
//     const url = URL.createObjectURL(blob);
//     const a = document.createElement('a'); a.href = url; a.download = `Tasks_${new Date().toISOString().split('T')[0]}.csv`; a.click();
//     URL.revokeObjectURL(url);
//   };

//   const SortIcon = ({ col }: { col: typeof sortBy }) => (
//     <ArrowUpDown size={12} className={`ml-1 inline ${sortBy === col ? 'text-blue-500' : 'text-slate-300'}`} />
//   );

//   return (
//     <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
//       <Toaster position="top-right" richColors />
//       {showCreate && (
//         <CreateTaskModal
//           onClose={() => setShowCreate(false)}
//           onCreated={fetchAll}
//           users={users}
//           categories={categories}
//           clients={clients}
//           projects={projects}
//           currentUserId={effectiveUserId || ''}
//           isManager={isManager}
//         />
//       )}

//       {/* Header */}
//       <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-6 py-4">
//         <div className="flex items-center justify-between gap-4">
//           <div className="flex items-center gap-3">
//             <button onClick={() => router.back()} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" title="Go back">
//               <ArrowLeft size={16} />
//             </button>
//             <div>
//             <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">All Tasks</h1>
//             <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
//               {filtered.length} task{filtered.length !== 1 ? 's' : ''} {search || filterStatus !== 'all' ? '(filtered)' : ''}
//             </p>
//           </div>
//           </div>
//           <div className="flex items-center gap-2">
//             <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
//               <Download size={14} /> Export
//             </button>
//             <button onClick={fetchAll} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
//               <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
//             </button>
//             <button onClick={() => setShowCreate(true)}
//               className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
//               <Plus size={14} /> New Task
//             </button>
//           </div>
//         </div>

//         {/* Search + Filters */}
//         <div className="flex items-center gap-3 mt-4">
//           <div className="relative flex-1 max-w-sm">
//             <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
//             <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
//               className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
//               placeholder="Search tasks..." />
//           </div>
//           <button onClick={() => setShowFilters(!showFilters)}
//             className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${showFilters ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
//             <SlidersHorizontal size={14} /> Filters
//             {(filterStatus !== 'all' || filterPriority !== 'all' || filterCategory !== 'all' || filterClient !== 'all') && (
//               <span className="w-2 h-2 rounded-full bg-blue-500" />
//             )}
//           </button>
//         </div>

//         {showFilters && (
//           <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
//             <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
//               className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
//               <option value="all">All Statuses</option>
//               {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
//             </select>
//             <select value={filterPriority} onChange={e => { setFilterPriority(e.target.value); setPage(1); }}
//               className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
//               <option value="all">All Priorities</option>
//               {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
//             </select>
//             <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }}
//               className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
//               <option value="all">All Categories</option>
//               {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
//             </select>
//             <select value={filterClient} onChange={e => { setFilterClient(e.target.value); setPage(1); }}
//               className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
//               <option value="all">All Clients</option>
//               {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
//             </select>
//             <button onClick={() => { setFilterStatus('all'); setFilterPriority('all'); setFilterCategory('all'); setFilterClient('all'); setSearch(''); }}
//               className="px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
//               Clear all
//             </button>
//           </div>
//         )}
//       </div>

//       {/* Bulk actions */}
//       {selected.size > 0 && (
//         <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-6 py-2 flex items-center gap-3">
//           <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{selected.size} selected</span>
//           <div className="flex items-center gap-2">
//             {(['in_progress', 'completed', 'cancelled'] as TaskStatus[]).map(s => (
//               <button key={s} onClick={() => handleBulkStatus(s)}
//                 className="px-2.5 py-1 rounded-md text-xs font-medium bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
//                 Mark {STATUS_CONFIG[s].label}
//               </button>
//             ))}
//           </div>
//           <button onClick={() => setSelected(new Set())} className="ml-auto text-blue-500 hover:text-blue-700 transition-colors">
//             <X size={14} />
//           </button>
//         </div>
//       )}

//       {/* Table */}
//       <div className="overflow-x-auto">
//         {loading ? (
//           <div className="flex items-center justify-center py-20">
//             <Loader2 size={24} className="animate-spin text-blue-500" />
//           </div>
//         ) : paginated.length === 0 ? (
//           <div className="flex flex-col items-center justify-center py-20 text-slate-400">
//             <CheckSquare size={40} className="mb-3 opacity-30" />
//             <p className="text-base font-medium">No tasks found</p>
//             <p className="text-sm mt-1">
//               {search || filterStatus !== 'all' ? 'Try adjusting your filters' : 'Create your first task to get started'}
//             </p>
//             {!search && filterStatus === 'all' && (
//               <button onClick={() => setShowCreate(true)} className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
//                 <Plus size={14} className="inline mr-1" /> New Task
//               </button>
//             )}
//           </div>
//         ) : (
//           <table className="w-full text-sm">
//             <thead>
//               <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
//                 <th className="w-10 px-4 py-3 text-left">
//                   <button onClick={toggleAll} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
//                     {selected.size === paginated.length && paginated.length > 0 ? <CheckSquare size={16} className="text-blue-500" /> : <Square size={16} />}
//                   </button>
//                 </th>
//                 <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400 cursor-pointer whitespace-nowrap" onClick={() => toggleSort('title')}>
//                   Task <SortIcon col="title" />
//                 </th>
//                 <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">Status</th>
//                 <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400 cursor-pointer whitespace-nowrap" onClick={() => toggleSort('priority')}>
//                   Priority <SortIcon col="priority" />
//                 </th>
//                 <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">Category</th>
//                 <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">Assignee</th>
//                 <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">Client</th>
//                 <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400 cursor-pointer whitespace-nowrap" onClick={() => toggleSort('due_date')}>
//                   Due Date <SortIcon col="due_date" />
//                 </th>
//                 <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">Est h</th>
//                 <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">%</th>
//                 <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">Flags</th>
//               </tr>
//             </thead>
//             <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
//               {paginated.map(task => {
//                 const sc = STATUS_CONFIG[task.task_status] || STATUS_CONFIG.not_started;
//                 const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
//                 const overdue = isOverdue(task);
//                 return (
//                   <tr key={task.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${selected.has(task.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
//                     <td className="px-4 py-3">
//                       <button onClick={() => toggleSelect(task.id)} className="text-slate-400 hover:text-blue-500 transition-colors">
//                         {selected.has(task.id) ? <CheckSquare size={16} className="text-blue-500" /> : <Square size={16} />}
//                       </button>
//                     </td>
//                     <td className="px-4 py-3 max-w-xs">
//                       <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{task.title}</div>
//                       {task.project_name && task.project_name !== '—' && (
//                         <div className="text-xs text-slate-400 truncate mt-0.5">{task.project_name}</div>
//                       )}
//                     </td>
//                     <td className="px-4 py-3">
//                       <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.color}`}>
//                         <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
//                         {sc.label}
//                       </span>
//                     </td>
//                     <td className="px-4 py-3">
//                       <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pc.bg} ${pc.color}`}>
//                         {pc.label}
//                       </span>
//                     </td>
//                     <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap">
//                       {task.category_name && task.category_name !== '—' ? task.category_name : <span className="text-slate-300">—</span>}
//                     </td>
//                     <td className="px-4 py-3 text-slate-700 dark:text-slate-300 text-xs whitespace-nowrap">
//                       {task.assignee_name && task.assignee_name !== '—' ? task.assignee_name : <span className="text-slate-300">—</span>}
//                     </td>
//                     <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap">
//                       {task.client_org_name && task.client_org_name !== '—' ? task.client_org_name : <span className="text-slate-300">Internal</span>}
//                     </td>
//                     <td className="px-4 py-3 whitespace-nowrap">
//                       <span className={`text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>
//                         {fmt(task.due_date)}
//                       </span>
//                     </td>
//                     <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
//                       {task.estimated_hours > 0 ? `${task.estimated_hours}h` : '—'}
//                     </td>
//                     <td className="px-4 py-3">
//                       <div className="flex items-center gap-1.5">
//                         <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
//                           <div className="h-full bg-blue-500 rounded-full" style={{ width: `${task.completion_percentage || 0}%` }} />
//                         </div>
//                         <span className="text-xs text-slate-500">{task.completion_percentage || 0}%</span>
//                       </div>
//                     </td>
//                     <td className="px-4 py-3">
//                       <div className="flex items-center gap-1">
//                         {overdue && <AlertTriangle size={12} className="text-red-500" title="Overdue" />}
//                         {task.is_blocked && <Flag size={12} className="text-red-500" title="Blocked" />}
//                         {task.is_recurring && <Repeat size={12} className="text-purple-500" title="Recurring" />}
//                         {(task.collaborators || []).length > 0 && (
//                           <span className="text-xs text-slate-400" title={`${task.collaborators?.length} collaborator(s)`}>
//                             <Users size={12} className="text-blue-400" />
//                           </span>
//                         )}
//                       </div>
//                     </td>
//                   </tr>
//                 );
//               })}
//             </tbody>
//           </table>
//         )}
//       </div>

//       {/* Pagination */}
//       {totalPages > 1 && (
//         <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
//           <span className="text-sm text-slate-500">
//             Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
//           </span>
//           <div className="flex items-center gap-2">
//             <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
//               className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
//               Previous
//             </button>
//             <span className="text-sm text-slate-600 dark:text-slate-400">{page} / {totalPages}</span>
//             <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
//               className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
//               Next
//             </button>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import TaskSubtasks from '@/components/TaskSubtasks';
import InstanceSubtasks from '@/components/InstanceSubtasks';
import {
  CheckCircle2, Circle, AlertTriangle, Clock, Flag, Repeat, Users, Calendar, CalendarDays,
  Loader2, RefreshCw, Plus, ArrowLeft, Search, X, SlidersHorizontal, ChevronDown, Zap,
  BarChart3, TrendingUp, Inbox, CheckSquare, Building2, Tag, User, Trash2, Copy,
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { useVisibleFirms } from '@/lib/useVisibleFirms';
import FirmBadge from '@/components/FirmBadge';
import FirmFilterTabs from '@/components/FirmFilterTabs';

/* ───────────────────────── Types ───────────────────────── */

type TaskStatus = 'not_started' | 'in_progress' | 'waiting' | 'blocked' | 'completed' | 'cancelled';
type Priority = 'critical' | 'high' | 'medium' | 'low';
type Scope = 'mine' | 'all';
type TypeFilter = 'all' | 'one-time' | 'recurring';
type Quick = 'none' | 'today' | 'overdue' | 'next7' | 'done' | 'urgent' | 'blocked';
type Bucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'nodate' | 'done';

interface Row {
  key: string;
  id: string;
  source: 'task' | 'instance';
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  due_time: string | null;
  assignee: string;
  assigneeNames: string[];
  assigned_by: string;
  client: string;
  category: string;
  recurring: boolean;
  frequency: string | null;
  blocked: boolean;
  progress: number;
  est_hours: number;
  completed_at: string | null;
  created_at: string;
  collaborator: boolean;
  mine: boolean; // assigned to me or created by me (lets me ask others to join)
  invite: boolean; // someone asked me to join this task; I can accept or decline
  collabs: { name: string; status: string }[]; // other people attached to the task (accepted or requested)
  firm_id: string | null;
  firm_ids: string[] | null; // every firm the task belongs to (firm_id is the primary one)
  recurring_task_id?: string | null; // for recurring occurrences: the template they belong to (its subtasks)
}

interface UserProfile { id: string; full_name: string; role: string; department: string | null; firm_id?: string | null; }
interface Category { id: string; name: string; slug: string; color: string; }
interface ClientOrg { id: string; name: string; }

/* ───────────────────────── Config ───────────────────────── */

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string; dot: string }> = {
  not_started: { label: 'Not Started', color: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-700', dot: 'bg-slate-400' },
  in_progress: { label: 'In Progress', color: 'text-blue-600 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-900/30', dot: 'bg-blue-500' },
  waiting: { label: 'Waiting', color: 'text-amber-600 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-900/30', dot: 'bg-amber-400' },
  blocked: { label: 'Blocked', color: 'text-red-600 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-900/30', dot: 'bg-red-500' },
  completed: { label: 'Completed', color: 'text-emerald-600 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-900/30', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelled', color: 'text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800', dot: 'bg-slate-300' },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: 'Urgent', color: 'text-red-600 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-900/30', border: 'border-l-red-500' },
  high: { label: 'High', color: 'text-orange-600 dark:text-orange-300', bg: 'bg-orange-50 dark:bg-orange-900/30', border: 'border-l-orange-400' },
  medium: { label: 'Medium', color: 'text-amber-600 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-900/30', border: 'border-l-amber-300' },
  low: { label: 'Low', color: 'text-slate-500 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-700', border: 'border-l-slate-300' },
};

// Older screens used `status` (todo / in-progress / review / done); newer ones use `task_status`.
const LEGACY_IN: Record<string, TaskStatus> = {
  todo: 'not_started', 'in-progress': 'in_progress', review: 'waiting', done: 'completed', overdue: 'in_progress',
};
const LEGACY_OUT: Record<TaskStatus, string> = {
  not_started: 'todo', in_progress: 'in-progress', waiting: 'review', blocked: 'in-progress', completed: 'done', cancelled: 'todo',
};

const RECURRING_OPTIONS = [
  { value: '', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'bi-monthly', label: 'Bi-Monthly (15th & 30th)' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const SECTIONS: { key: Bucket; label: string; icon: any; head: string; badge: string }[] = [
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle, head: 'text-red-600 dark:text-red-400', badge: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300' },
  { key: 'today', label: 'Today', icon: Calendar, head: 'text-blue-600 dark:text-blue-400', badge: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' },
  { key: 'tomorrow', label: 'Tomorrow', icon: CalendarDays, head: 'text-slate-800 dark:text-slate-200', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  { key: 'week', label: 'Later this week', icon: CalendarDays, head: 'text-slate-800 dark:text-slate-200', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  { key: 'later', label: 'Later', icon: CalendarDays, head: 'text-slate-800 dark:text-slate-200', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  { key: 'nodate', label: 'No due date', icon: Inbox, head: 'text-slate-500 dark:text-slate-400', badge: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300' },
  { key: 'done', label: 'Completed', icon: CheckCircle2, head: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300' },
];

const TASK_COLS = `id, title, description, task_status, status, priority, category_id, task_category,
  assigned_to, assigned_to_user_id, assigned_to_name, assigned_user_ids, assigned_by_name, creator_id,
  client_org_id, client_org_name, organisation_relates_to, due_date, due_time, estimated_hours,
  completion_percentage, is_recurring, recurring, is_blocked, completed_at, created_at, firm_id, firm_ids`;

/* ───────────────────────── Helpers ───────────────────────── */

const toLocalDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(a + 'T00:00:00') - Date.parse(b + 'T00:00:00')) / 86400000);

function fmtDay(d: string) {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return d; }
}

function nextDueDate(from: string, frequency: string): string {
  const d = new Date(from + 'T00:00:00');
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'bi-monthly': {
      const dom = d.getDate();
      if (dom < 15) d.setDate(15);
      else if (dom < 30) d.setDate(30);
      else { d.setMonth(d.getMonth() + 1); d.setDate(15); }
      break;
    }
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    default: d.setDate(d.getDate() + 1); // daily / hourly / custom
  }
  return toLocalDate(d);
}

function normStatus(t: any): TaskStatus {
  const modern = t.task_status as TaskStatus | null;
  const legacy = t.status ? LEGACY_IN[t.status as string] : undefined;
  if (modern === 'completed' || legacy === 'completed') return 'completed';
  if (modern === 'cancelled') return 'cancelled';
  if (modern && modern !== 'not_started') return modern;
  return legacy || modern || 'not_started';
}

function bucketOf(r: Row, today: string): Bucket {
  if (r.status === 'completed') return 'done';
  if (!r.due_date) return 'nodate';
  const diff = daysBetween(r.due_date, today);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 7) return 'week';
  return 'later';
}

/* ───────────────────────── Small UI pieces ───────────────────────── */

function Segmented<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number; icon?: any }[];
}) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 gap-1">
      {options.map(o => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              active
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {Icon && <Icon size={14} />}
            {o.label}
            {typeof o.count === 'number' && (
              <span className={`text-[11px] px-1.5 rounded-full ${active ? 'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-200' : 'text-slate-400'}`}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function FilterSelect({
  value, onChange, label, options,
}: { value: string; onChange: (v: string) => void; label: string; options: string[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="all">{label}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

interface TaskRowProps {
  row: Row;
  today: string;
  expanded: boolean;
  busy: boolean;
  showAssignee: boolean;
  firm?: { name: string; code: string } | null;
  canDelete: boolean;
  candidates: UserProfile[];
  onToggle: () => void;
  onComplete: () => void;
  onStatus: (s: TaskStatus) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRequest: (userId: string) => Promise<boolean>;
  onRespond: (accept: boolean) => void;
}

/* One table row. Click the row to open the description; click again to close. */
function TaskRow({
  row, today, expanded, busy, showAssignee, firm, canDelete, candidates,
  onToggle, onComplete, onStatus, onDelete, onDuplicate, onRequest, onRespond,
}: TaskRowProps) {
  const [pick, setPick] = useState('');
  const [sending, setSending] = useState(false);
  const sc = STATUS_CONFIG[row.status];
  const pc = PRIORITY_CONFIG[row.priority];
  const done = row.status === 'completed';
  const overdue = !done && !!row.due_date && row.due_date < today;
  const diff = row.due_date ? daysBetween(row.due_date, today) : null;
  const dueLabel =
    diff === null ? null
      : diff < 0 ? `${Math.abs(diff)}d overdue`
      : diff === 0 ? 'Today'
      : diff === 1 ? 'Tomorrow'
      : fmtDay(row.due_date!);
  const names = row.assigneeNames;
  const canRequest = row.source === 'task' && !done && row.mine && candidates.length > 0;

  const sendRequest = async () => {
    if (!pick) return;
    setSending(true);
    const ok = await onRequest(pick);
    setSending(false);
    if (ok) setPick('');
  };

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer align-top transition-colors ${
          expanded ? 'bg-slate-50 dark:bg-slate-800/60' : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
        }`}
      >
        <td className="py-3 pl-2 pr-1 w-9">
          <button
            onClick={e => { e.stopPropagation(); onComplete(); }}
            disabled={busy || (row.source === 'instance' && done)}
            className="disabled:opacity-60"
            title={done ? 'Reopen' : 'Mark complete'}
          >
            {busy ? <Loader2 size={18} className="animate-spin text-blue-500" />
              : done ? <CheckCircle2 size={18} className="text-emerald-500" />
              : <Circle size={18} className="text-slate-300 hover:text-emerald-500 transition-colors" />}
          </button>
        </td>

        <td className="py-3 pr-4 min-w-[200px]">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-semibold ${done ? 'line-through text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
              {row.title}
            </span>
            {row.recurring && <Repeat size={11} className="text-purple-500 flex-shrink-0" />}
            {row.blocked && row.status !== 'blocked' && <Flag size={11} className="text-red-500 flex-shrink-0" />}
            {row.collaborator && <Users size={11} className="text-indigo-500 flex-shrink-0" />}
            {row.invite && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Invite</span>
            )}
          </div>
          {(row.client || row.category || (showAssignee && firm)) && (
            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
              {row.client && <span>{row.client}</span>}
              {row.client && row.category && <span className="text-slate-300">·</span>}
              {row.category && <span>{row.category}</span>}
              {showAssignee && firm && <FirmBadge firmName={firm.name} firmCode={firm.code} />}
            </div>
          )}
        </td>

        <td className="py-3 pr-4 whitespace-nowrap">
          <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${pc.bg} ${pc.color}`}>{pc.label}</span>
        </td>

        <td className="py-3 pr-4 whitespace-nowrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${sc.bg} ${sc.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
          </span>
        </td>

        <td className="py-3 pr-4 text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap" title={names.join(', ')}>
          {names.length === 0 ? <span className="text-slate-300">—</span> : (
            <>
              {names[0]}
              {names.length > 1 && <span className="ml-1 text-[10px] font-semibold text-blue-600 dark:text-blue-300">+{names.length - 1}</span>}
            </>
          )}
          {row.collabs.length > 0 && (
            <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400 mt-0.5 max-w-[240px] truncate">
              with {row.collabs.map(c => (c.status === 'pending' ? `${c.name} (requested)` : c.name)).join(', ')}
            </div>
          )}
        </td>

        <td className="py-3 pr-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
          {row.assigned_by || <span className="text-slate-300">—</span>}
        </td>

        <td className="py-3 pr-2 text-xs whitespace-nowrap">
          {dueLabel ? (
            <span className={`inline-flex items-center gap-1 ${overdue ? 'text-red-600 font-semibold' : 'text-slate-600 dark:text-slate-300'}`}>
              <Clock size={11} />{dueLabel}{row.due_time ? ` · ${String(row.due_time).slice(0, 5)}` : ''}
            </span>
          ) : <span className="text-slate-300">—</span>}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-slate-50 dark:bg-slate-800/60" onClick={e => e.stopPropagation()}>
          <td />
          <td colSpan={6} className="pb-4 pr-4">
            <div className="space-y-3">
              <p className={`text-sm whitespace-pre-wrap ${row.description ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 italic'}`}>
                {row.description || 'No description'}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div><p className="text-slate-400">Assigned to</p><p className="font-medium text-slate-700 dark:text-slate-200">{names.join(', ') || '—'}</p></div>
                {row.collabs.length > 0 && (
                  <div className="col-span-2">
                    <p className="text-slate-400">Collaborators</p>
                    <p className="font-medium text-slate-700 dark:text-slate-200">
                      {row.collabs.map(c => (c.status === 'pending' ? `${c.name} (requested)` : c.name)).join(', ')}
                    </p>
                  </div>
                )}
                <div><p className="text-slate-400">Assigned by</p><p className="font-medium text-slate-700 dark:text-slate-200">{row.assigned_by || '—'}</p></div>
                <div><p className="text-slate-400">Category</p><p className="font-medium text-slate-700 dark:text-slate-200">{row.category || '—'}</p></div>
                <div><p className="text-slate-400">Est. hours</p><p className="font-medium text-slate-700 dark:text-slate-200">{row.est_hours > 0 ? `${row.est_hours}h` : '—'}</p></div>
              </div>

              {row.source === 'task' && (
                <div className="rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3">
                  <TaskSubtasks taskId={row.id} />
                </div>
              )}

              {row.source === 'task' ? (
                <div className="flex flex-wrap gap-1.5">
                  {(['not_started', 'in_progress', 'waiting', 'blocked', 'completed'] as TaskStatus[]).map(s => (
                    <button
                      key={s}
                      onClick={() => onStatus(s)}
                      disabled={busy}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        row.status === s
                          ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'
                          : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                      }`}
                    >
                      {STATUS_CONFIG[s].label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {row.recurring_task_id && (
                    <div className="rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3">
                      <InstanceSubtasks
                        instanceId={row.id}
                        templateId={row.recurring_task_id}
                        readOnly={row.status === 'completed' || row.status === 'cancelled'}
                      />
                    </div>
                  )}
                  <p className="text-xs text-slate-400">Recurring instance — tick the circle to mark it done.</p>
                </div>
              )}

              {row.invite && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-600 dark:text-slate-300">You have been asked to join this task.</span>
                  <button
                    onClick={() => onRespond(true)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => onRespond(false)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium text-slate-600 dark:text-slate-300 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              )}

              {canRequest && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Ask someone to join:</span>
                  <select
                    value={pick}
                    onChange={e => setPick(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choose a person…</option>
                    {candidates.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                  <button
                    onClick={sendRequest}
                    disabled={!pick || sending}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium disabled:opacity-50"
                  >
                    {sending ? 'Sending…' : 'Send request'}
                  </button>
                </div>
              )}

              {row.source === 'task' && (
                <div>
                  <button
                    onClick={onDuplicate}
                    disabled={busy}
                    className="text-xs text-slate-500 hover:text-blue-600 flex items-center gap-1 transition-colors disabled:opacity-50"
                  >
                    <Copy size={13} /> Duplicate task
                  </button>
                </div>
              )}

              {canDelete && row.source === 'task' && (
                <div>
                  <button
                    onClick={onDelete}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    <Trash2 size={13} /> Delete task
                  </button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ───────────────────────── Create modal ───────────────────────── */

// Details copied from an existing task when the user clicks Duplicate
interface DuplicateSeed {
  title: string; description: string; priority: Priority; due_date: string; due_time: string;
  firmIds: string[]; assignees: string[]; clientOrgId: string; relatesTo: string;
  category_id: string; subtasks: string[];
}

function CreateTaskModal({
  onClose, onCreated, users, categories, clients, uid, userName, userDept, supabase,
  ownFirmId, firms, canPickFirm, initial,
}: {
  onClose: () => void; onCreated: () => void;
  users: UserProfile[]; categories: Category[]; clients: ClientOrg[];
  uid: string; userName: string; userDept: string; supabase: any;
  ownFirmId: string | null; firms: { id: string; name: string; code: string }[]; canPickFirm: boolean;
  initial?: DuplicateSeed | null;
}) {
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState(() => ({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    priority: (initial?.priority ?? 'medium') as Priority,
    assignees: (initial?.assignees?.length ? initial.assignees : [uid]) as string[],
    // Defaults to the creator's own firm. Employees stay in it; directors and managers can pick a visible firm.
    firmIds: (initial ? initial.firmIds : (ownFirmId ? [ownFirmId] : [])) as string[],
    due_date: initial?.due_date ?? '', due_time: initial?.due_time ?? '', recurring: '',
    category_id: initial?.category_id ?? '',
    // Client picker value: "client:<id>" (client organisation), "firm:<id>" (subsidiary) or "" (Internal)
    pick: initial?.clientOrgId ? `client:${initial.clientOrgId}` : '',
    // Subtasks added on the form (title + optional assignee)
    subtasks: (initial?.subtasks ?? []).map((t) => ({ title: t, assigned_to: '' })) as { title: string; assigned_to: string }[],
  }));
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  // Subsidiaries the user can see, offered alongside clients in the client picker
  const [subs, setSubs] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!uid) return;
    (async () => {
      const { data: ids, error: rpcErr } = await supabase.rpc('get_visible_firm_ids', { p_user_id: uid, p_module: 'all' });
      if (rpcErr || !ids || ids.length === 0) { setSubs([]); return; }
      const { data, error } = await supabase
        .from('firms')
        .select('id, name')
        .in('id', ids as string[])
        .eq('firm_type', 'subsidiary')
        .order('name', { ascending: true });
      if (!error) setSubs((data as { id: string; name: string }[]) || []);
    })();
  }, [uid, supabase]);

  // Duplicate of a task that was for a subsidiary: pick it by name once the list is loaded
  useEffect(() => {
    if (!initial?.relatesTo || initial.clientOrgId) return;
    const s = subs.find((x) => x.name === initial.relatesTo);
    if (s) setF((p) => (p.pick ? p : { ...p, pick: `firm:${s.id}` }));
  }, [subs]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = 'block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1';

  // Every new task starts today (local date, so India time never shows yesterday)
  const startToday = toLocalDate(new Date());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) { toast.error('Task title is required'); return; }
    if (!f.due_date) { toast.error('Due date is required'); return; }
    if (f.due_date < startToday) { toast.error('Due date cannot be before today'); return; }
    setSaving(true);
    try {
      const picked = users.filter(u => f.assignees.includes(u.id));
      const cat = categories.find(c => c.id === f.category_id);
      const org = f.pick.startsWith('client:') ? clients.find(c => c.id === f.pick.slice(7)) : undefined;
      const sub = f.pick.startsWith('firm:') ? subs.find(s => s.id === f.pick.slice(5)) : undefined;
      const { data: createdTask, error } = await supabase.from('tasks').insert({
        title: f.title.trim(),
        description: f.description,
        priority: f.priority,
        status: 'todo',
        task_status: 'not_started',
        start_date: startToday,
        due_date: f.due_date,
        due_time: f.due_time || null,
        // First picked person is the primary assignee; every picked person is in assigned_user_ids
        assigned_to: f.assignees[0] || null,
        assigned_to_user_id: f.assignees[0] || null,
        assigned_to_name: picked.map(u => u.full_name).join(', ') || 'Unassigned',
        assigned_to_dept: picked[0]?.department || 'General',
        assigned_user_ids: f.assignees,
        // First firm picked is the primary firm; every picked firm is kept in firm_ids
        firm_id: f.firmIds[0] || null,
        firm_ids: f.firmIds.length ? f.firmIds : null,
        assigned_by: uid,
        created_by: uid,
        creator_id: uid,
        assigned_by_name: userName,
        assigned_by_dept: userDept,
        checklist: [],
        tags: [],
        recurring: f.recurring || null,
        is_recurring: !!f.recurring,
        notify_before_minutes: 30,
        is_template: false,
        task_category: cat?.slug || 'general',
        category_id: cat?.id || null,
        client_org_id: org?.id || null,
        client_org_name: org?.name || null,
        organisation_relates_to: org?.name || sub?.name || null,
      }).select('id').single();
      if (error) throw error;

      // Subtasks: one row each, linked to the new task
      const subs = f.subtasks.filter(s => s.title.trim());
      if (subs.length > 0 && createdTask?.id) {
        const { error: subErr } = await supabase.from('task_subtasks').insert(
          subs.map((s, i) => ({
            task_id: createdTask.id,
            title: s.title.trim(),
            sort_order: i,
          })),
        );
        if (subErr) toast.error(`Task created, but subtasks failed: ${subErr.message}`);
      }
      toast.success('Task created');
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">New Task</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} className="text-slate-500" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className={labelCls}>Title *</label>
            <input className={inputCls} value={f.title} onChange={e => set('title', e.target.value)} placeholder="What needs to be done?" autoFocus />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea className={`${inputCls} resize-none`} rows={2} value={f.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Priority</label>
              <select className={inputCls} value={f.priority} onChange={e => set('priority', e.target.value)}>
                <option value="critical">Urgent</option><option value="high">High</option>
                <option value="medium">Medium</option><option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Repeats</label>
              <select className={inputCls} value={f.recurring} onChange={e => set('recurring', e.target.value)}>
                {RECURRING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Start date</label>
              <input type="date" className={`${inputCls} opacity-70 cursor-not-allowed`} value={startToday} readOnly disabled />
            </div>
            <div>
              <label className={labelCls}>Due date *</label>
              <input type="date" className={inputCls} value={f.due_date} min={startToday} required
                onChange={e => set('due_date', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Due time</label>
              <input type="time" className={inputCls} value={f.due_time} onChange={e => set('due_time', e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Firm</label>
            {canPickFirm && firms.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {firms.map(fm => {
                  const on = f.firmIds.includes(fm.id);
                  return (
                    <button
                      key={fm.id}
                      type="button"
                      onClick={() => setF(p => {
                        const firmIds = p.firmIds.includes(fm.id)
                          ? p.firmIds.filter(x => x !== fm.id)
                          : [...p.firmIds, fm.id];
                        // Drop anyone whose firm is no longer picked
                        return {
                          ...p,
                          firmIds,
                          assignees: p.assignees.filter(id => {
                            const firmOfUser = users.find(u => u.id === id)?.firm_id;
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
                      {fm.name}{fm.id === ownFirmId ? ' (my firm)' : ''}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                {firms.find(fm => fm.id === ownFirmId)?.name || 'My firm'}
              </p>
            )}
            {canPickFirm && (
              <p className="text-[11px] text-slate-400 mt-1">
                {f.firmIds.length === 0 ? 'Pick one or more firms' : `${f.firmIds.length} firm${f.firmIds.length > 1 ? 's' : ''} selected`}
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>Assign to (one or more)</label>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
              {users.filter(u => f.firmIds.length === 0 || (!!u.firm_id && f.firmIds.includes(u.firm_id))).map(u => {
                const on = f.assignees.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setF(p => ({
                      ...p,
                      assignees: p.assignees.includes(u.id)
                        ? p.assignees.filter(x => x !== u.id)
                        : [...p.assignees, u.id],
                    }))}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      on
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {u.full_name}{u.id === uid ? ' (me)' : ''}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {f.assignees.length === 0 ? 'Unassigned' : `${f.assignees.length} selected`}
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelCls + ' mb-0'}>Subtasks</label>
              <button type="button" onClick={() => setF(p => ({ ...p, subtasks: [...p.subtasks, { title: '', assigned_to: '' }] }))}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700">+ Add subtask</button>
            </div>
            {f.subtasks.length === 0 && <p className="text-[11px] text-slate-400">No subtasks yet.</p>}
            <div className="space-y-2">
              {f.subtasks.map((s, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input className={inputCls + ' col-span-11'} placeholder="Subtask title" value={s.title}
                    onChange={e => setF(p => ({ ...p, subtasks: p.subtasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }))} />
                  <button type="button" onClick={() => setF(p => ({ ...p, subtasks: p.subtasks.filter((_, j) => j !== i) }))}
                    className="col-span-1 flex justify-center text-red-500 hover:text-red-600" aria-label="Remove subtask">×</button>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Category</label>
              <select className={inputCls} value={f.category_id} onChange={e => set('category_id', e.target.value)}>
                <option value="">General</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Client</label>
              <select className={inputCls} value={f.pick} onChange={e => set('pick', e.target.value)}>
                <option value="">Internal</option>
                {subs.length > 0 && (
                  <optgroup label="Subsidiaries">
                    {subs.map(s => <option key={`firm:${s.id}`} value={`firm:${s.id}`}>{s.name}</option>)}
                  </optgroup>
                )}
                {clients.length > 0 && (
                  <optgroup label="Clients">
                    {clients.map(c => <option key={`client:${c.id}`} value={`client:${c.id}`}>{c.name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}{saving ? 'Creating…' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ───────────────────────── Page ───────────────────────── */

export default function TasksHub() {
  const { effectiveUserId } = useAuth();
  const uid = effectiveUserId;
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { firms: visibleFirms } = useVisibleFirms();

  const [role, setRole] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [userDept, setUserDept] = useState('');
  const [ownFirmId, setOwnFirmId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [clients, setClients] = useState<ClientOrg[]>([]);
  const [rawTasks, setRawTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [duplicateSeed, setDuplicateSeed] = useState<DuplicateSeed | null>(null);

  // Opens the New Task form with this task's details (firm, people, client, subtasks copied).
  // The user can change anything before saving; nothing is saved until they submit.
  const duplicateTask = async (r: Row) => {
    const raw = rawTasks.find((t) => t.__source === 'task' && t.id === r.id);
    if (!raw) return;
    const { data: subs } = await supabase
      .from('task_subtasks').select('title').eq('task_id', raw.id).order('sort_order');
    setDuplicateSeed({
      title: raw.title || '',
      description: raw.description || '',
      priority: (raw.priority || 'medium') as Priority,
      due_date: raw.due_date || '',
      due_time: raw.due_time ? String(raw.due_time).slice(0, 5) : '',
      firmIds: Array.isArray(raw.firm_ids) && raw.firm_ids.length ? raw.firm_ids : (raw.firm_id ? [raw.firm_id] : []),
      assignees: Array.isArray(raw.assigned_user_ids) && raw.assigned_user_ids.length ? raw.assigned_user_ids : (raw.assigned_to ? [raw.assigned_to] : []),
      clientOrgId: raw.client_org_id || '',
      relatesTo: raw.organisation_relates_to || '',
      category_id: raw.category_id || '',
      subtasks: (subs || []).map((s: any) => s.title),
    });
    setExpanded(null);
    setShowCreate(true);
  };

  // Directors and managers can switch between their own tasks and the firm-scoped list.
  // Employees only ever see their own tasks (effectiveScope).
  const [scope, setScope] = useState<Scope>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [quick, setQuick] = useState<Quick>('none');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [statusF, setStatusF] = useState('all');
  const [priorityF, setPriorityF] = useState('all');
  const [categoryF, setCategoryF] = useState('all');
  const [clientF, setClientF] = useState('all');
  const [assigneeF, setAssigneeF] = useState('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [firms, setFirms] = useState<{ id: string; name: string; code: string }[]>([]);
  const [firmF, setFirmF] = useState('all');
  // How far back completed tasks are shown (only used when "Show completed" is on)
  const [doneRange, setDoneRange] = useState<'yesterday' | '7d' | '30d' | 'all'>('7d');

  const isDirector = role === 'director';
  const isManager = role === 'manager' || role === 'executive';
  const canToggleScope = isDirector || isManager;
  const effectiveScope: Scope = canToggleScope ? scope : 'mine';
  const today = toLocalDate(new Date());

  /* ── reference data + role ── */
  useEffect(() => {
    if (!uid) return;
    (async () => {
      const [p, u, c, o] = await Promise.all([
        supabase.from('user_profiles').select('role, full_name, department, firm_id').eq('id', uid).single(),
        supabase.from('user_profiles').select('id, full_name, role, department, firm_id').order('full_name'),
        supabase.from('task_categories').select('id, name, slug, color').order('name'),
        supabase.from('client_organisations').select('id, name').order('name'),
      ]);
      setRole(p.data?.role || 'employee');
      setUserName(p.data?.full_name || '');
      setUserDept(p.data?.department || '');
      setOwnFirmId(p.data?.firm_id || null);
      setUsers(u.data || []);
      setCategories(c.data || []);
      setClients(o.data || []);
      // Firm names for the firm dropdown (falls back to "Firm 1, Firm 2…" if this table can't be read)
      const f = await supabase.from('firms').select('*');
      if (!f.error) setFirms((f.data || []).map((x: any) => ({ id: x.id, name: x.name || x.firm_name || x.title || '' })));
    })();
  }, [uid, supabase]);

  /* ── tasks ── */
  const loadTasks = useCallback(async () => {
    if (!uid || !role) return;
    setLoading(true);
    try {
      const rows = new Map<string, any>();
      const collabIds = new Set<string>();
      const add = (list: any[] | null | undefined, collab = false) =>
        (list || []).forEach(t => {
          if (collab) collabIds.add(t.id);
          rows.set(t.id, { ...t, __source: 'task' });
        });

      if (canToggleScope && scope === 'all') {
        let q: any = supabase.from('tasks').select(TASK_COLS).order('created_at', { ascending: false }).limit(1000);
        if (!isDirector) {
          const { data: firmIds, error: fe } = await supabase.rpc('get_visible_firm_ids', { p_user_id: uid, p_module: 'tasks' });
          if (fe || !firmIds || firmIds.length === 0) throw new Error('Could not work out which firm(s) you can see');
          // A task shows if its primary firm OR any of its firms (firm_ids) is visible to you
          const fl = (firmIds as string[]).join(',');
          q = q.or(`firm_id.in.(${fl}),firm_ids.ov.{${fl}}`);
        }
        const { data, error } = await q;
        if (error) throw error;
        add(data);
      } else {
        const parts = [`assigned_to.eq.${uid}`, `assigned_to_user_id.eq.${uid}`];
        if (!canToggleScope) parts.push(`creator_id.eq.${uid}`); // employees also see tasks they created
        const r1 = await supabase.from('tasks').select(TASK_COLS).or(parts.join(',')).order('created_at', { ascending: false }).limit(1000);
        if (r1.error) throw r1.error;
        add(r1.data);

        // multi-assignee tasks (array column) — ignore if the column type doesn't support it
        const r2 = await supabase.from('tasks').select(TASK_COLS).contains('assigned_user_ids', [uid]).limit(1000);
        if (!r2.error) add(r2.data);

        // tasks I collaborate on (accepted invites only)
        let links = await supabase.from('task_collaborators').select('task_id').eq('user_id', uid).or('status.is.null,status.eq.accepted');
        if (links.error) links = await supabase.from('task_collaborators').select('task_id').eq('user_id', uid);
        const ids = (links.data || []).map((l: any) => l.task_id);
        if (ids.length > 0) {
          const r3 = await supabase.from('tasks').select(TASK_COLS).in('id', ids).limit(1000);
          if (!r3.error) add(r3.data, true);
        }
      }

      // Collaboration requests waiting for me to accept or decline (shown to the invitee in All Tasks)
      const inv = await supabase.from('task_collaborators').select('task_id').eq('user_id', uid).eq('status', 'pending');
      const invIds = (inv.data || []).map((l: any) => l.task_id);
      if (invIds.length > 0) {
        const r4 = await supabase.from('tasks').select(TASK_COLS).in('id', invIds).limit(200);
        if (!r4.error) (r4.data || []).forEach((t: any) => rows.set(t.id, { ...t, __source: 'task', __invite: true }));
      }

      const list: any[] = Array.from(rows.values()).map(t => ({
        ...t,
        __collab: collabIds.has(t.id) || !!t.__invite,
      }));

      // Everyone attached to these tasks (accepted and requested), so each row can show the other names
      const taskIdsForCollabs = list.filter(t => t.__source !== 'instance').map(t => t.id);
      if (taskIdsForCollabs.length > 0) {
        const cl = await supabase
          .from('task_collaborators')
          .select('task_id, user_id, status')
          .in('task_id', taskIdsForCollabs.slice(0, 300));
        const byTask: Record<string, any[]> = {};
        (cl.data || []).forEach((c: any) => {
          if (!byTask[c.task_id]) byTask[c.task_id] = [];
          byTask[c.task_id].push(c);
        });
        list.forEach(t => { if (t.__source !== 'instance') t.__collabs = byTask[t.id] || []; });
      }

      // Recurring instances (separate table). Employees: their own. Directors: everyone.
      // Managers: people in the firms they can see (sharing rule).
      let riQuery: any = supabase
        .from('recurring_task_instances')
        .select('*, recurring_tasks(title, frequency)')
        .order('due_date', { ascending: false })
        .limit(500);
      if (!canToggleScope || scope === 'mine') {
        riQuery = riQuery.eq('assigned_to', uid);
      } else if (!isDirector) {
        const { data: fids } = await supabase.rpc('get_visible_firm_ids', { p_user_id: uid, p_module: 'tasks' });
        const { data: people } = await supabase.from('user_profiles').select('id').in('firm_id', fids || []);
        const allowedIds = (people || []).map((p: any) => p.id);
        riQuery = allowedIds.length > 0 ? riQuery.in('assigned_to', allowedIds) : null;
      }
      const ri = riQuery ? await riQuery : { data: [], error: null };
      if (!ri.error) (ri.data || []).forEach((i: any) => list.push({ ...i, __source: 'instance' }));

      setRawTasks(list);
    } catch (err: any) {
      console.error('Task load error:', err);
      toast.error(err?.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [uid, role, scope, canToggleScope, isDirector, supabase]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  /* ── normalise ── */
  const userMap = useMemo(() => Object.fromEntries(users.map(u => [u.id, u.full_name])), [users]);
  const catMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c.name])), [categories]);
  const catSlugMap = useMemo(() => Object.fromEntries(categories.map(c => [c.slug, c.name])), [categories]);
  const clientMap = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c.name])), [clients]);

  const rows: Row[] = useMemo(() => rawTasks.map((t: any): Row => {
    if (t.__source === 'instance') {
      const st = t.status === 'completed' ? 'completed' : t.status === 'cancelled' ? 'cancelled' : 'not_started';
      return {
        key: `instance-${t.id}`, id: t.id, source: 'instance',
        title: t.task_name || t.recurring_tasks?.title || 'Recurring task',
        description: '', status: st as TaskStatus,
        priority: (['critical', 'high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium') as Priority,
        due_date: t.due_date || null, due_time: t.due_time || null,
        assignee: userMap[t.assigned_to] || userName || 'Me', assigneeNames: [userMap[t.assigned_to] || userName || 'Me'],
        assigned_by: '', client: t.client_org_name || '', category: '',
        recurring: true, frequency: t.recurring_tasks?.frequency || null,
        blocked: false, progress: 0, est_hours: 0,
        completed_at: t.completion_datetime || null, created_at: t.created_at || '', collaborator: false, firm_id: null,
        mine: true, invite: false, collabs: [],
        recurring_task_id: t.recurring_task_id || null,
      };
    }
    const ids: string[] = Array.isArray(t.assigned_user_ids) ? t.assigned_user_ids : [];
    const names = ids.map(i => userMap[i]).filter(Boolean) as string[];
    const single = userMap[t.assigned_to] || t.assigned_to_name;
    const assigneeNames = names.length ? names : single && single !== 'Unassigned' ? [single] : [];
    const mine = t.assigned_to === uid || t.assigned_to_user_id === uid || ids.includes(uid || '');
    const status = normStatus(t);
    return {
      key: `task-${t.id}`, id: t.id, source: 'task',
      title: t.title || 'Untitled', description: t.description || '', status,
      priority: (['critical', 'high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium') as Priority,
      due_date: t.due_date || null, due_time: t.due_time || null,
      assignee: assigneeNames.length ? assigneeNames.join(', ') : 'Unassigned', assigneeNames,
      assigned_by: t.assigned_by_name || '',
      client: t.client_org_name || (t.client_org_id ? clientMap[t.client_org_id] : '') || '',
      category: (t.category_id && catMap[t.category_id]) || (t.task_category && catSlugMap[t.task_category]) || '',
      recurring: !!(t.is_recurring || t.recurring), frequency: t.recurring || null,
      blocked: !!t.is_blocked || status === 'blocked',
      progress: Number(t.completion_percentage) || 0, est_hours: Number(t.estimated_hours) || 0,
      completed_at: t.completed_at || null, created_at: t.created_at || '',
      collaborator: !!t.__collab && !mine,
      mine: mine || uid === t.creator_id,
      invite: !!t.__invite,
      collabs: (t.__collabs || []).map((c: any) => ({ name: userMap[c.user_id] || 'Unknown', status: c.status || 'accepted' })),
      firm_id: t.firm_id || null,
      firm_ids: t.firm_ids || (t.firm_id ? [t.firm_id] : null),
    };
  }).filter(r => r.status !== 'cancelled'), [rawTasks, userMap, catMap, catSlugMap, clientMap, uid, userName]);

  /* ── derived: type filter → KPIs → visible list ── */
  const firmRows = useMemo(
    () => (firmF === 'all' ? rows : rows.filter(r => r.firm_id === firmF || (r.firm_ids || []).includes(firmF))),
    [rows, firmF]
  );

  const typed = useMemo(() => firmRows.filter(r =>
    typeFilter === 'all' ? true : typeFilter === 'recurring' ? r.recurring : !r.recurring
  ), [firmRows, typeFilter]);

  // Badge counts match what the list shows: completed tasks are hidden unless "Show completed" is on
  const typeCounts = useMemo(() => {
    const countable = firmRows.filter(r => showCompleted || r.status !== 'completed');
    return {
      all: countable.length,
      recurring: countable.filter(r => r.recurring).length,
      oneTime: countable.filter(r => !r.recurring).length,
    };
  }, [firmRows, showCompleted]);

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return toLocalDate(d);
  }, []);

  const completedLocalDate = (r: Row) => (r.completed_at ? toLocalDate(new Date(r.completed_at)) : '');

  // Date window for completed tasks: yesterday, last 7 / 30 days, or all past
  const doneCutoff = useMemo(() => {
    const d = new Date();
    if (doneRange === 'yesterday') {
      d.setDate(d.getDate() - 1);
      const y = toLocalDate(d);
      return { from: y, to: y as string | null };
    }
    if (doneRange === '7d') { d.setDate(d.getDate() - 6); return { from: toLocalDate(d), to: null as string | null }; }
    if (doneRange === '30d') { d.setDate(d.getDate() - 29); return { from: toLocalDate(d), to: null as string | null }; }
    return { from: null as string | null, to: null as string | null };
  }, [doneRange]);

  const inDoneRange = (r: Row) => {
    const c = completedLocalDate(r);
    if (!c) return false;
    if (doneCutoff.from && c < doneCutoff.from) return false;
    if (doneCutoff.to && c > doneCutoff.to) return false;
    return true;
  };

  const kpis = useMemo(() => {
    const active = typed.filter(r => r.status !== 'completed');
    const completed = typed.filter(r => r.status === 'completed');
    const onTime = completed.filter(r => r.due_date && r.completed_at && completedLocalDate(r) <= r.due_date);
    const withDue = completed.filter(r => r.due_date);
    return {
      today: active.filter(r => r.due_date === today).length,
      overdue: active.filter(r => r.due_date && r.due_date < today).length,
      next7: active.filter(r => r.due_date && daysBetween(r.due_date, today) >= 1 && daysBetween(r.due_date, today) <= 7).length,
      done: completed.filter(r => r.completed_at && completedLocalDate(r) >= weekStart).length,
      urgent: active.filter(r => r.priority === 'critical' || r.priority === 'high').length,
      blocked: active.filter(r => r.blocked).length,
      completionRate: typed.length ? (completed.length / typed.length) * 100 : 0,
      onTimeRate: withDue.length ? (onTime.length / withDue.length) * 100 : 0,
    };
  }, [typed, today, weekStart]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return typed.filter(r => {
      const b = bucketOf(r, today);
      if (b === 'done' && !(showCompleted || statusF === 'completed' || quick === 'done')) return false;
      if (b === 'done' && quick !== 'done' && statusF !== 'completed' && !inDoneRange(r)) return false;
      if (q && !(r.title.toLowerCase().includes(q) || r.assignee.toLowerCase().includes(q) || r.client.toLowerCase().includes(q))) return false;
      if (statusF !== 'all' && r.status !== statusF) return false;
      if (priorityF !== 'all' && r.priority !== priorityF) return false;
      if (categoryF !== 'all' && r.category !== categoryF) return false;
      if (clientF !== 'all' && r.client !== clientF) return false;
      if (assigneeF !== 'all' && !r.assigneeNames.includes(assigneeF)) return false;
      switch (quick) {
        case 'today': return b === 'today';
        case 'overdue': return b === 'overdue';
        case 'next7': return !!r.due_date && r.status !== 'completed' && daysBetween(r.due_date, today) >= 1 && daysBetween(r.due_date, today) <= 7;
        case 'done': return r.status === 'completed' && !!r.completed_at && completedLocalDate(r) >= weekStart;
        case 'urgent': return r.status !== 'completed' && (r.priority === 'critical' || r.priority === 'high');
        case 'blocked': return r.status !== 'completed' && r.blocked;
        default: return true;
      }
    });
  }, [typed, search, statusF, priorityF, categoryF, clientF, assigneeF, quick, showCompleted, today, weekStart, doneCutoff]);

  const grouped = useMemo(() => {
    const g: Record<Bucket, Row[]> = { overdue: [], today: [], tomorrow: [], week: [], later: [], nodate: [], done: [] };
    visible.forEach(r => g[bucketOf(r, today)].push(r));
    const pr = { critical: 0, high: 1, medium: 2, low: 3 };
    (Object.keys(g) as Bucket[]).forEach(k => {
      g[k].sort((a, b) => {
        if (k === 'done') return (b.completed_at || '').localeCompare(a.completed_at || '');
        const d = (a.due_date || '9999').localeCompare(b.due_date || '9999');
        if (d) return d;
        const t = (a.due_time || '99:99').localeCompare(b.due_time || '99:99');
        return t || pr[a.priority] - pr[b.priority];
      });
    });
    return g;
  }, [visible, today]);

  const categoryOptions = useMemo(() => Array.from(new Set(rows.map(r => r.category).filter(Boolean))).sort(), [rows]);
  const clientOptions = useMemo(() => Array.from(new Set(rows.map(r => r.client).filter(Boolean))).sort(), [rows]);
  const assigneeOptions = useMemo(() => Array.from(new Set(firmRows.flatMap(r => r.assigneeNames))).sort(), [firmRows]);

  const firmOptions = useMemo(() => {
    const ids = new Set(rows.map(r => r.firm_id).filter(Boolean) as string[]);
    if (isDirector) firms.forEach(f => ids.add(f.id));
    const names = Object.fromEntries(firms.map(f => [f.id, f.name]));
    return Array.from(ids)
      .map((id, i) => ({ id, name: names[id] || `Firm ${i + 1}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, firms, isDirector]);

  const activeFilters = [statusF, priorityF, categoryF, clientF, assigneeF].filter(f => f !== 'all').length;
  const clearAll = () => {
    setStatusF('all'); setPriorityF('all'); setCategoryF('all'); setClientF('all'); setAssigneeF('all');
    setQuick('none'); setSearch('');
  };

  /* ── mutations ── */
  const spawnNext = async (taskId: string) => {
    try {
      const { data: src, error } = await supabase.from('tasks').select('*').eq('id', taskId).single();
      if (error || !src || !src.recurring || !src.due_date) return;
      const due = nextDueDate(src.due_date, src.recurring);
      const { data: existing } = await supabase.from('tasks').select('id').eq('spawned_from_task_id', taskId).eq('due_date', due).maybeSingle();
      if (existing) return;
      const { id, created_at, updated_at, completed_at, last_completed_date, time_to_complete_minutes, ...rest } = src;
      const { data: spawned, error: insErr } = await supabase.from('tasks').insert({
        ...rest,
        status: 'todo', task_status: 'not_started', due_date: due, is_overdue: false, completion_percentage: 0,
        spawned_from_task_id: taskId,
        checklist: Array.isArray(src.checklist) ? src.checklist.map((c: any) => ({ ...c, done: false })) : [],
      }).select().single();
      if (insErr) throw insErr;
      if (spawned) setRawTasks(prev => [{ ...spawned, __source: 'task' }, ...prev]);
    } catch (err) {
      console.error('Spawn next occurrence failed:', err);
      toast.warning("Marked done, but couldn't create the next occurrence");
    }
  };

  const changeStatus = async (row: Row, status: TaskStatus) => {
    if (busyKey) return;
    setBusyKey(row.key);
    try {
      const now = new Date().toISOString();
      if (row.source === 'instance') {
        if (status !== 'completed') return;
        const patch = { status: 'completed', is_overdue: false, completion_datetime: now, updated_at: now };
        const { error } = await supabase.from('recurring_task_instances').update(patch).eq('id', row.id);
        if (error) throw error;
        setRawTasks(prev => prev.map(r => (r.__source === 'instance' && r.id === row.id ? { ...r, ...patch } : r)));
        toast.success('Marked as completed');
        return;
      }
      const patch: any = { task_status: status, status: LEGACY_OUT[status], is_blocked: status === 'blocked' };
      if (status === 'completed') {
        patch.completed_at = now;
        patch.is_overdue = false;
        if (row.created_at) patch.time_to_complete_minutes = Math.round((Date.now() - Date.parse(row.created_at)) / 60000);
        if (row.recurring) patch.last_completed_date = today;
      } else {
        patch.completed_at = null;
        if (row.recurring) patch.last_completed_date = null;
      }
      const { error } = await supabase.from('tasks').update(patch).eq('id', row.id);
      if (error) throw error;
      setRawTasks(prev => prev.map(r => (r.__source === 'task' && r.id === row.id ? { ...r, ...patch } : r)));
      toast.success(status === 'completed' ? 'Task completed' : `Moved to ${STATUS_CONFIG[status].label}`);
      if (status === 'completed' && row.frequency) await spawnNext(row.id);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update task');
    } finally {
      setBusyKey(null);
    }
  };

  /* ── render ── */
  const kpiCards: { key: Quick; label: string; value: string | number; icon: any; text: string; bg: string; ring: string; clickable: boolean }[] = [
    { key: 'today', label: 'Due Today', value: kpis.today, icon: Calendar, text: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', ring: 'ring-blue-400', clickable: true },
    { key: 'overdue', label: 'Overdue', value: kpis.overdue, icon: AlertTriangle, text: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20', ring: 'ring-red-400', clickable: true },
    { key: 'next7', label: 'Next 7 Days', value: kpis.next7, icon: Clock, text: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', ring: 'ring-amber-400', clickable: true },
    { key: 'done', label: 'Done This Week', value: kpis.done, icon: CheckCircle2, text: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', ring: 'ring-emerald-400', clickable: true },
    { key: 'urgent', label: 'Urgent / High', value: kpis.urgent, icon: Zap, text: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20', ring: 'ring-orange-400', clickable: true },
    { key: 'blocked', label: 'Blocked', value: kpis.blocked, icon: Flag, text: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-900/20', ring: 'ring-rose-400', clickable: true },
    { key: 'none', label: 'Completion Rate', value: `${kpis.completionRate.toFixed(0)}%`, icon: BarChart3, text: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20', ring: '', clickable: false },
    { key: 'none', label: 'On-Time Rate', value: `${kpis.onTimeRate.toFixed(0)}%`, icon: TrendingUp, text: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-900/20', ring: '', clickable: false },
  ];

  // Ask another person to join a task. They receive it as a pending invite (accept/decline in Task Board).
  const requestCollaborator = async (row: Row, userId: string): Promise<boolean> => {
    const target = users.find(u => u.id === userId);
    const { error } = await supabase.from('task_collaborators').insert({
      task_id: row.id,
      user_id: userId,
      role: 'collaborator',
      status: 'pending',
      invited_by: uid,
      invited_by_name: userName,
      added_by: uid,
    });
    if (error) {
      toast.error(error.code === '23505' ? `${target?.full_name || 'They'} is already on this task` : error.message);
      return false;
    }
    toast.success(`Request sent to ${target?.full_name || 'them'}`);
    return true;
  };

  // Directors and managers only (permission is also checked in the UI; RLS allows any signed-in delete today)
  const deleteTask = async (row: Row) => {
    if (row.source !== 'task') return;
    if (!window.confirm(`Delete "${row.title}"? This cannot be undone.`)) return;
    setBusyKey(row.key);
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', row.id);
      if (error) throw error;
      setRawTasks(prev => prev.filter(r => !(r.__source === 'task' && r.id === row.id)));
      setExpanded(null);
      toast.success('Task deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Could not delete task');
    } finally {
      setBusyKey(null);
    }
  };

  // Respond to a collaboration request addressed to me
  const respondInvite = async (row: Row, accept: boolean) => {
    if (!uid) return;
    setBusyKey(row.key);
    try {
      const { error } = await supabase
        .from('task_collaborators')
        .update(accept ? { status: 'accepted', accepted_at: new Date().toISOString() } : { status: 'declined' })
        .eq('task_id', row.id)
        .eq('user_id', uid);
      if (error) throw error;
      toast.success(accept ? 'You joined the task' : 'Request declined');
      await loadTasks();
    } catch (err: any) {
      toast.error(err?.message || 'Could not update the request');
    } finally {
      setBusyKey(null);
    }
  };

  const scopeSubtitle =
    !canToggleScope ? 'Your tasks'
      : scope === 'mine' ? 'Tasks assigned to you'
      : isDirector ? 'Every task across all firms'
      : 'Tasks in the firms you can see';

  const totalVisible = visible.length;
  const firmById = Object.fromEntries(visibleFirms.map(f => [f.id, { name: f.name, code: f.code }]));
  const canDelete = isDirector || role === 'manager';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Toaster position="top-right" richColors />
      {showCreate && uid && (
        <CreateTaskModal
          onClose={() => { setShowCreate(false); setDuplicateSeed(null); }} onCreated={loadTasks}
          initial={duplicateSeed}
          users={users} categories={categories} clients={clients}
          uid={uid} userName={userName} userDept={userDept} supabase={supabase}
          ownFirmId={ownFirmId}
          firms={visibleFirms}
          canPickFirm={isDirector || isManager}
        />
      )}

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button onClick={() => router.back()} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800" title="Back">
                <ArrowLeft size={16} />
              </button>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Tasks</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">{scopeSubtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadTasks} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800" title="Refresh">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm">
                <Plus size={15} /> New Task
              </button>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            {canToggleScope && (
              <Segmented<Scope>
                value={scope}
                onChange={v => { setScope(v); setExpanded(null); setAssigneeF('all'); setFirmF('all'); }}
                options={[
                  { value: 'mine', label: 'My Tasks', icon: User },
                  { value: 'all', label: isDirector ? 'All Tasks · All Firms' : 'All Tasks · My Firms', icon: Users },
                ]}
              />
            )}
            <Segmented<TypeFilter>
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: 'all', label: 'All', count: typeCounts.all },
                { value: 'one-time', label: 'One-time', count: typeCounts.oneTime },
                { value: 'recurring', label: 'Recurring', icon: Repeat, count: typeCounts.recurring },
              ]}
            />
          </div>
          {/* Firm tabs: shown in both My Tasks and All Tasks, only when the user can see more than one firm */}
          <FirmFilterTabs
            firms={visibleFirms}
            selectedFirmId={firmF}
            onSelect={id => { setFirmF(id); setAssigneeF('all'); }}
          />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpiCards.map(k => {
            const Icon = k.icon;
            const active = k.clickable && quick === k.key;
            return (
              <button
                key={k.label}
                disabled={!k.clickable}
                onClick={() => setQuick(active ? 'none' : k.key)}
                className={`${k.bg} rounded-xl p-3.5 text-left border border-transparent transition-all ${
                  k.clickable ? 'hover:shadow-md cursor-pointer' : 'cursor-default'
                } ${active ? `ring-2 ${k.ring}` : ''}`}
              >
                <Icon size={15} className={k.text} />
                <p className={`text-2xl font-bold mt-1 ${k.text}`}>{loading ? '–' : k.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{k.label}</p>
              </button>
            );
          })}
        </div>

        {/* Search + filters */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder={effectiveScope === 'all' ? 'Search tasks, people or clients…' : 'Search tasks or clients…'}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => setShowFilters(s => !s)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${
                showFilters || activeFilters > 0
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <SlidersHorizontal size={14} /> Filters{activeFilters > 0 && ` (${activeFilters})`}
            </button>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer select-none px-1">
              <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} className="rounded border-slate-300" />
              Show completed
            </label>
            {showCompleted && (
              <Segmented<'yesterday' | '7d' | '30d' | 'all'>
                value={doneRange}
                onChange={setDoneRange}
                options={[
                  { value: 'yesterday', label: 'Yesterday' },
                  { value: '7d', label: 'Last 7 days' },
                  { value: '30d', label: 'Last 30 days' },
                  { value: 'all', label: 'All past' },
                ]}
              />
            )}
            {(activeFilters > 0 || quick !== 'none' || search) && (
              <button onClick={clearAll} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1">
                <X size={13} /> Clear
              </button>
            )}
          </div>
          {showFilters && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <FilterSelect value={statusF} onChange={setStatusF} label="All statuses" options={['not_started', 'in_progress', 'waiting', 'blocked', 'completed']} />
              <FilterSelect value={priorityF} onChange={setPriorityF} label="All priorities" options={['critical', 'high', 'medium', 'low']} />
              {categoryOptions.length > 0 && <FilterSelect value={categoryF} onChange={setCategoryF} label="All categories" options={categoryOptions} />}
              {clientOptions.length > 0 && <FilterSelect value={clientF} onChange={setClientF} label="All clients" options={clientOptions} />}
              {effectiveScope === 'all' && assigneeOptions.length > 0 && <FilterSelect value={assigneeF} onChange={setAssigneeF} label="All assignees" options={assigneeOptions} />}
            </div>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-slate-200/60 dark:bg-slate-800 animate-pulse" />)}
          </div>
        ) : totalVisible === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <CheckSquare size={44} className="mx-auto mb-3 opacity-30" />
            <p className="text-base font-medium text-slate-500 dark:text-slate-300">
              {rows.length === 0 ? "You're all caught up" : 'No tasks match these filters'}
            </p>
            <p className="text-sm mt-1">
              {rows.length === 0 ? 'Nothing assigned here yet.' : 'Try clearing a filter or turning on "Show completed".'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="py-2 pl-2 pr-1 w-9" />
                  <th className="py-2 pr-4 font-semibold">Task</th>
                  <th className="py-2 pr-4 font-semibold">Priority</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 pr-4 font-semibold">Assigned to</th>
                  <th className="py-2 pr-4 font-semibold">Assigned by</th>
                  <th className="py-2 pr-2 font-semibold">Due</th>
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map(sec => {
                  const items = grouped[sec.key];
                  if (items.length === 0) return null;
                  const Icon = sec.icon;
                  return (
                    <React.Fragment key={sec.key}>
                      <tr>
                        <td colSpan={7} className="pt-6 pb-2">
                          <div className="flex items-center gap-2">
                            <Icon size={14} className={sec.head} />
                            <span className={`text-sm font-bold ${sec.head}`}>{sec.label}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${sec.badge}`}>{items.length}</span>
                          </div>
                        </td>
                      </tr>
                      {items.map(r => (
                        <TaskRow
                          key={r.key} row={r} today={today}
                          expanded={expanded === r.key}
                          busy={busyKey === r.key}
                          showAssignee={effectiveScope === 'all'}
                          firm={r.firm_id ? firmById[r.firm_id] : null}
                          canDelete={canDelete}
                          candidates={users.filter(u => u.id !== uid)}
                          onToggle={() => setExpanded(expanded === r.key ? null : r.key)}
                          onComplete={() => changeStatus(r, r.status === 'completed' ? 'not_started' : 'completed')}
                          onStatus={s => changeStatus(r, s)}
                          onDelete={() => deleteTask(r)}
                          onDuplicate={() => duplicateTask(r)}
                          onRequest={userId => requestCollaborator(r, userId)}
                          onRespond={accept => respondInvite(r, accept)}
                        />
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}