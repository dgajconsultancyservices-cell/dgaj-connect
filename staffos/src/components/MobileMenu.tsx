'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import {
  LayoutDashboard, Clock, CalendarDays, FileText, MessageSquare,
  BarChart3, Settings, Wallet, BookOpen, Crown, X, UserCircle, UserCog,
  Shield, Download, Smartphone, Palmtree, Ticket, Receipt, Command,
  Navigation, ClipboardList, Building2, SlidersHorizontal,
  AlertTriangle, ScrollText, BookMarked, LogOut, ChevronRight,
  CheckSquare, Repeat, PieChart, Briefcase, TrendingUp
} from 'lucide-react';
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
  group: string;
  managerOnly?: boolean;
  directorOrManagerOnly?: boolean;
}

// Same items, order and groups as the desktop Sidebar (src/components/Sidebar.tsx).
const navItems: NavItem[] = [
  { id: 'nav-dashboard', label: 'My Dashboard', icon: LayoutDashboard, href: '/employee-dashboard', group: 'core' },
  { id: 'nav-attendance', label: 'Attendance', icon: Clock, href: '/attendance-records', group: 'core' },
  { id: 'nav-audit', label: 'Attendance Audit', icon: ClipboardList, href: '/attendance-audit', group: 'core', managerOnly: true },
  { id: 'nav-leave', label: 'Leave Dashboard', icon: CalendarDays, href: '/leave-management', group: 'core' },
  { id: 'nav-leave-admin', label: 'Leave Admin', icon: BookMarked, href: '/leave-admin', group: 'core', managerOnly: true },
  { id: 'nav-holidays', label: 'Holiday Management', icon: Palmtree, href: '/holiday-management', group: 'core', managerOnly: true },
  { id: 'nav-payroll', label: 'Payroll', icon: Wallet, href: '/payroll', group: 'core' },
  { id: 'nav-profile', label: 'My Profile', icon: UserCircle, href: '/employee-profile', group: 'core' },

  { id: 'nav-all-tasks', label: 'All Tasks', icon: CheckSquare, href: '/all-tasks', group: 'tasks' },
  { id: 'nav-recurring-tasks', label: 'Recurring Tasks', icon: Repeat, href: '/recurring-tasks', group: 'tasks' },
  { id: 'nav-task-analytics', label: 'Task Analytics', icon: PieChart, href: '/task-analytics', group: 'tasks', managerOnly: true },

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

// Quick access items shown as icon grid at top of mobile menu
const quickAccessIds = ['nav-dashboard', 'nav-attendance', 'nav-leave', 'nav-all-tasks', 'nav-chat', 'nav-profile'];

const groups = [
  { id: 'core', label: 'Workspace' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'collaborate', label: 'Collaborate' },
  { id: 'resources', label: 'Resources' },
  { id: 'director_only', label: 'Director Only' },
];

interface MobileMenuProps {
  isOpen: boolean;
  activePath?: string;
  onClose: () => void;
}

export default function MobileMenu({ isOpen, activePath, onClose }: MobileMenuProps) {
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

  const displayName = profile?.full_name || user?.email?.split('@')[0] || pinSession?.email?.split('@')[0] || 'User';
  const displayTitle = profile?.job_title || pinSession?.jobTitle || pinSession?.role || '';
  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const isWorkingHours = () => {
    const now = new Date();
    const hours = now.getHours();
    const day = now.getDay();
    return day >= 1 && day <= 5 && hours >= 8 && hours < 18;
  };

  const handleSignOut = async () => {
    if (isWorkingHours()) {
      setShowLogoutWarning(true);
      return;
    }
    await performSignOut();
  };

  const performSignOut = async () => {
    try {
      if (user?.id) await performClockOut(user.id);
    } catch {}
    try {
      await signOut();
    } catch {}
    clearPinSession?.();
    router.push('/sign-up-login-screen');
  };

  const getItemLabel = (item: NavItem): string => {
    const labelMap: Record<string, string> = {
      'nav-dashboard': t('myDashboard'),
      'nav-attendance': t('attendance'),
      'nav-leave': t('leaveHolidays'),
      'nav-holidays': t('holidayManagement'),
      'nav-payroll': t('payroll'),
      'nav-profile': t('myProfile'),
      'nav-audit': t('attendanceAudit'),
      'nav-leave-admin': t('leaveAdmin'),
      'nav-all-tasks': t('allTasks'),
      'nav-recurring-tasks': t('recurringTasks'),
      'nav-task-analytics': t('taskAnalytics'),
      'nav-calendar': t('calendar'),
      'nav-tickets': t('ticketCentre'),
      'nav-expenses': t('expenseCentre'),
      'nav-chat': t('chat'),
      'nav-clients': t('clients'),
      'nav-discrepancy': t('clientDiscrepancies'),
      'nav-docs': t('documents'),
      'nav-daily-report': t('dailyReport'),
      'nav-user-mgmt': t('userManagement'),
      'nav-app-settings': t('appSettings'),
      'nav-command-hub': t('commandHub'),
      'nav-director': t('directorPanel'),
      'nav-firm-config': t('firmConfiguration'),
      'nav-firm-reports': t('firmReports'),
      'nav-reports': t('reports'),
      'nav-analytics': t('analytics'),
      'nav-audit-log': t('auditLog'),
      'nav-live-map': t('liveLocations'),
      'nav-settings': t('directorSettings'),
    };
    return labelMap[item.id] || item.label;
  };

  const filteredNavItems = navItems.filter((n) => {
    if (n.managerOnly) return isManagerOrDirector;
    if (n.directorOrManagerOnly) return role === 'director' || role === 'manager';
    if (n.id === 'nav-daily-report') return dailyReportAccess;
    if (n.group === 'director_only') return role === 'director';
    return true;
  });

  const quickItems = quickAccessIds
    .map((id) => filteredNavItems.find((n) => n.id === id))
    .filter(Boolean) as NavItem[];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden flex flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
        <AppLogo size={28} className="flex-shrink-0" />
        <span className="font-bold text-slate-900 dark:text-slate-100 text-base flex-1 truncate">DGaj Connect</span>
        <button
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label={t('closeMenu')}
        >
          <X size={22} className="text-slate-500 dark:text-slate-400" />
        </button>
      </div>

      {/* User profile strip */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-white">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{displayName}</p>
          {displayTitle && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{displayTitle}</p>}
        </div>
      </div>

      {/* Quick access icon grid */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">{t('quickAccess')}</p>
        <div className="grid grid-cols-6 gap-2">
          {quickItems.map((item) => {
            const ItemIcon = item.icon;
            const isActive = activePath === item.href;
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onClose}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white' :'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                title={getItemLabel(item)}
              >
                <ItemIcon size={20} className="flex-shrink-0" />
                <span className="text-[9px] font-medium leading-tight text-center truncate w-full">
                  {getItemLabel(item).split(' ')[0]}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Full nav list — scrollable */}
      <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {groups.map((group) => {
          const items = filteredNavItems.filter((n) => n.group === group.id);
          if (items.length === 0) return null;

          const groupLabel = group.id === 'core' ? t('workspace')
            : group.id === 'tasks' ? t('tasksGroup')
            : group.id === 'collaborate' ? t('collaborate')
            : group.id === 'resources' ? t('resources')
            : t('directorOnly');

          return (
            <div key={group.id} className="mb-4">
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                {groupLabel}
              </p>
              {items.map((item) => {
                const ItemIcon = item.icon;
                const isActive = activePath === item.href;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl mb-0.5 transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white' :'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <ItemIcon size={18} className="flex-shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{getItemLabel(item)}</span>
                    {isActive && <ChevronRight size={14} className="flex-shrink-0 opacity-70" />}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-slate-200 dark:border-slate-700 px-3 py-3 flex-shrink-0 space-y-1">
        {canInstall && (
          <button
            onClick={() => { triggerInstall(); onClose(); }}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          >
            {isIOS ? <Smartphone size={18} className="flex-shrink-0" /> : <Download size={18} className="flex-shrink-0" />}
            <span className="text-sm font-semibold">{t('installApp')}</span>
          </button>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <LogOut size={18} className="flex-shrink-0" />
          <span className="text-sm font-semibold">{t('signOut')}</span>
        </button>
      </div>

      {/* iOS Instructions Modal */}
      {showIOSInstructions && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4" onClick={() => setShowIOSInstructions(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Smartphone size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{t('installDgajConnect')}</p>
                <p className="text-xs text-slate-500">Add to your home screen</p>
              </div>
            </div>
            <ol className="space-y-2 text-sm text-slate-700">
              <li className="flex items-start gap-2"><span className="font-bold text-blue-600 flex-shrink-0">1.</span>Tap the <strong>Share</strong> button in Safari&apos;s toolbar</li>
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
                <p className="text-sm font-bold text-slate-900">{t('signOutWorkHours')}</p>
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
                {t('signOut')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}