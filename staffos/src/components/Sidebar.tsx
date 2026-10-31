'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import { Briefcase, LayoutDashboard, Clock, CalendarDays, FileText, MessageSquare, BarChart3, Settings, ChevronLeft, ChevronRight, ChevronDown, Wallet, BookOpen, Crown, X, UserCircle, UserCog, Shield, Download, Smartphone, Palmtree, Ticket, Receipt, Command, Navigation, ClipboardList, Building2, SlidersHorizontal, AlertTriangle, ScrollText, BookMarked, CheckSquare, ListTodo, Repeat, PieChart, TrendingUp, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import { performClockOut } from '@/app/(authenticated)/employee-dashboard/components/AttendanceHero';

import { usePWAInstall } from '@/hooks/usePWAInstall';
import { createClient } from '@/lib/supabase/client';


interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href: string;
  badge?: number;
  group?: string;
  managerOnly?: boolean; // hidden from employees even though the group itself is open
  directorOrManagerOnly?: boolean; // only directors and managers (not executives)
}

const navItems: NavItem[] = [
  { id: 'nav-dashboard', label: 'My Dashboard', icon: LayoutDashboard, href: '/employee-dashboard', group: 'core' },
  { id: 'nav-attendance', label: 'Attendance', icon: Clock, href: '/attendance-records', group: 'core' },
  { id: 'nav-audit', label: 'Attendance Audit', icon: ClipboardList, href: '/attendance-audit', group: 'core', managerOnly: true },
  { id: 'nav-leave', label: 'Leave Dashboard', icon: CalendarDays, href: '/leave-management', group: 'core' },
  { id: 'nav-leave-admin', label: 'Leave Admin', icon: BookMarked, href: '/leave-admin', group: 'core', managerOnly: true },
  { id: 'nav-holidays', label: 'Holiday Management', icon: Palmtree, href: '/holiday-management', group: 'core', managerOnly: true },
  { id: 'nav-payroll', label: 'Payroll', icon: Wallet, href: '/payroll', group: 'core' },
  { id: 'nav-profile', label: 'My Profile', icon: UserCircle, href: '/employee-profile', group: 'core' },

  // { id: 'nav-my-tasks', label: 'My Tasks', icon: ListTodo, href: '/all-tasks', group: 'tasks' },
  { id: 'nav-all-tasks', label: 'All Tasks', icon: CheckSquare, href: '/all-tasks', group: 'tasks' },
  { id: 'nav-recurring-tasks', label: 'Recurring Tasks', icon: Repeat, href: '/recurring-tasks', group: 'tasks' },
  { id: 'nav-task-analytics', label: 'Task Analytics', icon: PieChart, href: '/task-analytics', group: 'tasks', managerOnly: true },
  
  // { id: 'nav-task-management', label: 'Task Management', icon: ListTodo, href: '/task-management', group: 'tasks', directorOrManagerOnly: true },

  { id: 'nav-calendar', label: 'Calendar', icon: CalendarDays, href: '/calendar', group: 'collaborate' },
  { id: 'nav-chat', label: 'Chat', icon: MessageSquare, href: '/chat', group: 'collaborate' },
  { id: 'nav-tickets', label: 'Ticket Centre', icon: Ticket, href: '/ticket-centre', group: 'collaborate' },
  { id: 'nav-expenses', label: 'Expense Centre', icon: Receipt, href: '/expense-centre', group: 'collaborate' },
  
  { id: 'nav-clients', label: 'Clients', icon: Briefcase, href: '/clients', group: 'collaborate', directorOrManagerOnly: true },
  { id: 'nav-discrepancy', label: 'Client Discrepancies', icon: AlertTriangle, href: '/client-discrepancy-reports', group: 'collaborate' },

  { id: 'nav-docs', label: 'Documents', icon: BookOpen, href: '/documents', group: 'resources' },
  { id: 'nav-daily-report', label: 'Daily Report', icon: ClipboardList, href: '/daily-report', group: 'resources' },
  { id: 'nav-user-mgmt', label: 'User Management', icon: UserCog, href: '/user-management', group: 'resources', managerOnly: true },
  { id: 'nav-app-settings', label: 'App Settings', icon: SlidersHorizontal, href: '/app-settings', group: 'resources' },

  { id: 'nav-command-hub', label: 'Command Hub', icon: Command, href: '/director-command-hub', group: 'director_only' },
  { id: 'nav-director', label: 'Director Panel', icon: Crown, href: '/director-control-panel', group: 'director_only' },
  { id: 'nav-firm-config', label: 'Firm Configuration', icon: Building2, href: '/firm-configuration', group: 'director_only' },
  { id: 'nav-firm-reports', label: 'Firm Reports', icon: TrendingUp, href: '/firm-reports', group: 'director_only' },
  { id: 'nav-reports', label: 'Reports', icon: FileText, href: '/reports', group: 'director_only' },
  { id: 'nav-analytics', label: 'Analytics', icon: BarChart3, href: '/analytics-reporting-dashboard', group: 'director_only' },
  { id: 'nav-audit-log', label: 'Audit Log', icon: ScrollText, href: '/audit-log', group: 'director_only' },
  { id: 'nav-live-map', label: 'Live Locations', icon: Navigation, href: '/live-location-map', group: 'director_only' },
  { id: 'nav-settings', label: 'Director Settings', icon: Shield, href: '/director-settings', group: 'director_only' },
];

const groups = [
  { id: 'core', label: 'Workspace' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'collaborate', label: 'Collaborate' },
  { id: 'resources', label: 'Resources' },
  { id: 'director_only', label: 'Director Only' },
];

interface SidebarProps {
  activePath?: string;
  onClose?: () => void;
}

export default function Sidebar({ activePath, onClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };
  const { signOut, clearPinSession, user, pinSession } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const { canInstall, isIOS, triggerInstall, showIOSInstructions, setShowIOSInstructions } = usePWAInstall();
  const [profile, setProfile] = useState<{ full_name?: string; job_title?: string } | null>(null);
  const [showLogoutWarning, setShowLogoutWarning] = useState(false);

  useEffect(() => {
    const uid = user?.id || pinSession?.userId;
    if (!uid) return;
    const supabase = createClient();
    supabase
      .from('user_profiles')
      .select('full_name, job_title')
      .eq('id', uid)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data);
      });
  }, [user?.id, pinSession?.userId]);

  // Daily Report menu: directors always; others only if assigned as an editor of at least one firm
  const [dailyReportAccess, setDailyReportAccess] = useState(false);
  useEffect(() => {
    const uid = user?.id || pinSession?.userId;
    if (!uid) return;
    if (pinSession?.role === 'director') { setDailyReportAccess(true); return; }
    const supabase = createClient();
    supabase
      .from('daily_report_editors')
      .select('firm_id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .then(({ count }) => setDailyReportAccess((count ?? 0) > 0));
  }, [user?.id, pinSession?.userId, pinSession?.role]);

  const role = pinSession?.role || '';
  const isManagerOrDirector = role === 'director' || role === 'manager' || role === 'executive';
  const isDirectorOnly = role === 'director';

  const displayName = profile?.full_name || user?.email?.split('@')[0] || pinSession?.email?.split('@')[0] || 'User';
  const displayTitle = profile?.job_title || pinSession?.jobTitle || pinSession?.role || '';
  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleSignOut = async () => {
    if (isWorkingHours()) {
      setShowLogoutWarning(true);
      return;
    }
    await performSignOut();
  };

  const performSignOut = async () => {
    try {
      if (user?.id) {
        await performClockOut(user.id);
      }
    } catch {}
    try {
      await signOut();
    } catch {}
    clearPinSession?.();
    router.push('/sign-up-login-screen');
  };

  const isWorkingHours = () => {
    const now = new Date();
    const hours = now.getHours();
    const day = now.getDay(); // 0=Sun, 6=Sat
    // Working hours: Mon-Fri 8am-6pm
    return day >= 1 && day <= 5 && hours >= 8 && hours < 18;
  };

  return (
    <aside
      className={`
        relative flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 h-full flex-shrink-0
        transition-all duration-300 ease-in-out
        ${(collapsed && !onClose) ? 'w-16' : 'w-60'}
      `}
    >
      {/* Logo */}
      <div className={`flex items-center h-16 border-b border-slate-100 dark:border-slate-700 px-3 flex-shrink-0 ${(collapsed && !onClose) ? 'justify-center' : 'gap-2.5'}`}>
        <AppLogo size={32} className="flex-shrink-0" />
        {!(collapsed && !onClose) && (
          <span className="font-bold text-slate-900 dark:text-slate-100 text-base tracking-tight flex-1 truncate min-w-0">DGaj Connect</span>
        )}
        {/* Mobile close button — always shown when onClose is present */}
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-auto min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0">
            <X size={20} className="text-slate-500 dark:text-slate-400" />
          </button>
        )}
        {/* Desktop collapse toggle */}
        {!onClose && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`hidden lg:flex p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0 ${collapsed ? '' : 'ml-auto'}`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} className="text-slate-400" /> : <ChevronLeft size={16} className="text-slate-400" />}
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin py-3 px-2">
        {groups.map((group) => {
          const items = navItems.filter((n) => {
            if (n.group !== group.id) return false;
            if (group.id === 'director_only') return isDirectorOnly;
            if (n.id === 'nav-daily-report') return dailyReportAccess;
            if (n.managerOnly) return isManagerOrDirector;
            if (n.directorOrManagerOnly) return role === 'director' || role === 'manager';
            return true;
          });

          const groupLabel = group.id === 'core' ? t('workspace')
            : group.id === 'tasks' ? t('tasksGroup')
            : group.id === 'collaborate' ? t('collaborate')
            : group.id === 'resources' ? t('resources')
            : t('directorOnly');

          // Nothing this role can see in this group — don't show a dangling
          // empty category header (e.g. "Director Only" for an employee).
          if (items.length === 0) return null;

          const isGroupCollapsed = collapsedGroups.has(group.id);

          return (
            <div key={`group-${group.id}`} className="mb-4">
              {!(collapsed && !onClose) && (
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 select-none hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <span className="truncate">{groupLabel}</span>
                  <ChevronDown size={12} className={`flex-shrink-0 transition-transform ${isGroupCollapsed ? '-rotate-90' : ''}`} />
                </button>
              )}
              {(isGroupCollapsed && !(collapsed && !onClose)) ? null : items.map((item) => {
                const ItemIcon = item.icon;
                const isActive = activePath === item.href;

                const itemLabel = item.id === 'nav-dashboard' ? t('myDashboard')
                  : item.id === 'nav-attendance' ? t('attendance')
                  : item.id === 'nav-leave-request' ? t('applyForLeave')
                  : item.id === 'nav-leave' ? t('leaveHolidays')
                  : item.id === 'nav-holidays' ? t('holidayManagement')
                  : item.id === 'nav-payroll' ? t('payroll')
                  : item.id === 'nav-profile' ? t('myProfile')
                  : item.id === 'nav-my-tasks' ? 'My Tasks'
                  : item.id === 'nav-all-tasks' ? 'All Tasks'
                  : item.id === 'nav-task-management' ? 'Task Management'
                  : item.id === 'nav-clients' ? 'Clients'
                  : item.id === 'nav-recurring-tasks' ? 'Recurring Tasks'
                  : item.id === 'nav-task-analytics' ? 'Task Analytics'
                  : item.id === 'nav-calendar' ? t('calendar')
                  : item.id === 'nav-tickets' ? t('ticketCentre')
                  : item.id === 'nav-expenses' ? t('expenseCentre')
                  : item.id === 'nav-chat' ? t('chat')
                  : item.id === 'nav-docs' ? t('documents')
                  : item.id === 'nav-analytics' ? t('analytics')
                  : item.id === 'nav-people' ? t('people')
                  : item.id === 'nav-reports' ? t('reports')
                  : item.id === 'nav-user-mgmt' ? t('userManagement')
                  : item.id === 'nav-tickets-mgmt' ? t('ticketCentre')
                  : item.id === 'nav-live-map' ? t('liveLocations')
                  : item.id === 'nav-audit' ? t('attendanceAudit')
                  : item.id === 'nav-audit-log' ? t('auditLog')
                  : item.id === 'nav-leave-admin' ? t('leaveAdmin')
                  : item.id === 'nav-task-analytics' ? t('taskAnalytics')
                  : item.id === 'nav-discrepancy' ? t('clientDiscrepancies')
                  : item.id === 'nav-firm-reports' ? t('firmReports')
                  : item.id === 'nav-all-tasks' ? t('allTasks')
                  : item.id === 'nav-recurring-tasks' ? t('recurringTasks')
                  : item.id === 'nav-command-hub' ? t('commandHub')
                  : item.id === 'nav-director' ? t('directorPanel')
                  : item.id === 'nav-firm-config' ? t('firmConfiguration')
                  : item.id === 'nav-settings' ? t('directorSettings')
                  : item.id === 'nav-app-settings' ? t('appSettings')
                  : item.label;

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    title={(collapsed && !onClose) ? itemLabel : undefined}
                    onClick={onClose}
                    className={`sidebar-nav-item mb-0.5 ${isActive ? 'sidebar-nav-item-active' : 'sidebar-nav-item-inactive'} ${(collapsed && !onClose) ? 'justify-center px-0' : ''}`}
                  >
                    <ItemIcon size={18} className="flex-shrink-0 min-w-[18px]" />
                    {!(collapsed && !onClose) && (
                      <span className="flex-1 truncate min-w-0 text-sm">
                        {itemLabel}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-slate-100 dark:border-slate-700 px-2 py-3 flex-shrink-0">
        {/* Install App Button */}
        {canInstall && (
          <button
            onClick={triggerInstall}
            title={collapsed ? 'Install App' : undefined}
            className={`sidebar-nav-item sidebar-nav-item-inactive mb-1 w-full text-left bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 ${collapsed ? 'justify-center' : ''}`}
          >
            {isIOS ? <Smartphone size={18} className="flex-shrink-0 text-blue-600" /> : <Download size={18} className="flex-shrink-0 text-blue-600" />}
            {!collapsed && <span className="flex-1 font-semibold text-blue-700">Install App</span>}
          </button>
        )}

        {/* iOS Instructions Modal */}
        {showIOSInstructions && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4" onClick={() => setShowIOSInstructions(false)}>
            <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Smartphone size={20} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Install DGaj Connect</p>
                  <p className="text-xs text-slate-500">Add to your home screen</p>
                </div>
              </div>
              <ol className="space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2"><span className="font-bold text-blue-600 flex-shrink-0">1.</span>Tap the <strong>Share</strong> button in Safari's toolbar</li>
                <li className="flex items-start gap-2"><span className="font-bold text-blue-600 flex-shrink-0">2.</span>Scroll down and tap <strong>Add to Home Screen</strong></li>
                <li className="flex items-start gap-2"><span className="font-bold text-blue-600 flex-shrink-0">3.</span>Tap <strong>Add</strong> to confirm</li>
              </ol>
              <button onClick={() => setShowIOSInstructions(false)}
                className="mt-4 w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                Got it
              </button>
            </div>
          </div>
        )}

        {/* Logout Warning Modal */}
        {showLogoutWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Sign Out During Work Hours?</p>
                  <p className="text-xs text-slate-500">You are currently within working hours</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">Signing out now will clock you out. Are you sure?</p>
              <div className="flex gap-3">
                <button onClick={() => setShowLogoutWarning(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button onClick={() => { setShowLogoutWarning(false); performSignOut(); }}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors">
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sign Out */}
        <button
          onClick={handleSignOut}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors mb-1 ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span className="text-sm font-semibold">Sign Out</span>}
        </button>

        {/* User Profile */}
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-bold text-white">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{displayName}</p>
              {displayTitle && <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{displayTitle}</p>}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}