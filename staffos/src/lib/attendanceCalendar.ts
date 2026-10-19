// Shared attendance calendar logic.
//
// Used by the Attendance Records tab (own cards + team table), Attendance Audit
// and Payroll auto-fill, so working days, present days and absent days are
// counted the same way everywhere. Working days come from the company calendar
// (company_holidays, which also holds weekly-off rows) minus each employee's
// weekly off days, which are set per firm in Firm Configuration (firms.settings.weekly_off_days).
import type { SupabaseClient } from '@supabase/supabase-js';

// Firm Configuration's default when a firm has no weekly off days saved.
export const DEFAULT_WEEKLY_OFF: number[] = [0];

/** Weekly off days (0 = Sunday … 6 = Saturday) for one employee, from their firm. */
export function weeklyOffOf(map: Record<string, number[]>, userId: string): number[] {
  return map[userId] ?? DEFAULT_WEEKLY_OFF;
}

/**
 * Loads each employee's weekly off days from their firm's settings.
 * Employees whose firm has no saved setting get DEFAULT_WEEKLY_OFF.
 */
export async function loadWeeklyOffByUser(
  supabase: SupabaseClient,
  userIds?: string[],
): Promise<Record<string, number[]>> {
  if (userIds && userIds.length === 0) return {};
  let pq = supabase.from('user_profiles').select('id, firm_id');
  if (userIds) pq = pq.in('id', userIds);
  const { data: profiles } = await pq;
  const profs = (profiles || []) as { id: string; firm_id: string | null }[];
  const firmIds = Array.from(new Set(profs.map((p) => p.firm_id).filter(Boolean))) as string[];

  const byFirm: Record<string, number[]> = {};
  if (firmIds.length > 0) {
    const { data: firms } = await supabase.from('firms').select('id, settings').in('id', firmIds);
    (firms || []).forEach((f: any) => {
      const days = f.settings?.weekly_off_days;
      byFirm[f.id] = Array.isArray(days) ? days.map(Number) : DEFAULT_WEEKLY_OFF;
    });
  }

  const out: Record<string, number[]> = {};
  profs.forEach((p) => { out[p.id] = (p.firm_id && byFirm[p.firm_id]) || DEFAULT_WEEKLY_OFF; });
  return out;
}

export type AttendanceStatus =
  | 'present' | 'absent' | 'late' | 'half_day' | 'work_from_home'
  | 'holiday' | 'weekend' | 'paid_leave' | 'unpaid_leave';

export type LeaveInfo = { status: 'paid_leave' | 'unpaid_leave'; pending: boolean };
export type HolidayMap = Record<string, string>; // 'YYYY-MM-DD' -> holiday name
export type LeaveMap = Record<string, LeaveInfo>; // `${userId}|${YYYY-MM-DD}` -> leave

export interface CalendarRecord {
  work_date: string;
  status: AttendanceStatus;
  clock_in: string | null;
  total_hours?: number | null;
  overtime_hours?: number | null;
}

// Local-date helpers. Do NOT use toISOString() for date-only strings: in IST
// (UTC+5:30) local midnight becomes the previous UTC day.
export const pad2 = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function eachDateInRange(start: string, end: string, cb: (dateStr: string) => void) {
  const [sy, sm, sd] = start.slice(0, 10).split('-').map(Number);
  const [ey, em, ed] = end.slice(0, 10).split('-').map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const last = new Date(ey, em - 1, ed);
  while (cur <= last) {
    cb(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
}

/** Working hours for a day = regular hours + overtime hours */
export const dayHours = (r: { total_hours?: number | null; overtime_hours?: number | null }) =>
  (Number(r.total_hours) || 0) + (Number(r.overtime_hours) || 0);

/** True when the date is one of the employee's weekly off days (from their firm). */
export function isWeekend(dateStr: string, weeklyOff: number[]): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return weeklyOff.includes(dow);
}

/** Company calendar for a date range: one entry per holiday date (includes weekly-off rows). */
export function buildHolidayMap(rows: { holiday_date: string; name: string }[]): HolidayMap {
  const m: HolidayMap = {};
  rows.forEach((h) => { m[String(h.holiday_date).slice(0, 10)] = h.name; });
  return m;
}

/** Approved and pending leave rows -> per-day map. Approved beats pending when both overlap. */
export function buildLeaveMap(
  leaves: { user_id: string; leave_type: string | null; start_date: string; end_date: string; status: string }[],
  startDate: string,
  endDate: string,
): LeaveMap {
  const lMap: LeaveMap = {};
  leaves.forEach((lv) => {
    const unpaid = /unpaid|lop|loss/i.test(String(lv.leave_type || ''));
    const pending = lv.status !== 'approved';
    eachDateInRange(lv.start_date, lv.end_date, (ds) => {
      if (ds < startDate || ds > endDate) return;
      const key = `${lv.user_id}|${ds}`;
      if (lMap[key] && !lMap[key].pending && pending) return;
      lMap[key] = { status: unpaid ? 'unpaid_leave' : 'paid_leave', pending };
    });
  });
  return lMap;
}

/**
 * Holiday / leave aware status for one day.
 *   worked day (present/late/half_day/wfh) ........ always wins
 *   company holiday ............................... holiday
 *   weekend ....................................... weekend
 *   approved leave ................................ paid / unpaid leave
 *   past working day, nothing recorded ............ absent
 *   today / future, nothing recorded .............. null
 */
export function resolveDayStatus(
  userId: string,
  dateStr: string,
  rec: { status: AttendanceStatus; clock_in: string | null } | undefined,
  holidayMap: HolidayMap,
  leaveMap: LeaveMap,
  weeklyOff: number[],
): AttendanceStatus | null {
  if (rec && (['present', 'late', 'half_day', 'work_from_home'].includes(rec.status) || rec.clock_in)) return rec.status;
  if (holidayMap[dateStr] || rec?.status === 'holiday') return 'holiday';
  if (isWeekend(dateStr, weeklyOff) || rec?.status === 'weekend') return 'weekend';
  const leave = leaveMap[`${userId}|${dateStr}`];
  if (leave && !leave.pending) return leave.status;
  if (dateStr < toDateStr(new Date())) return 'absent';
  return rec && rec.status === 'absent' ? 'absent' : null;
}

export interface PeriodStats {
  workingDays: number;      // weekdays minus company holidays in the period
  workedDays: number;       // present + late + half day + WFH on working days
  lateDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;       // past working days with no work and no approved leave
  avgHoursPerWorkedDay: number;
}

/**
 * Counts one employee's period from the company calendar, their attendance rows
 * and their leave. Worked hours on a holiday/weekend are not counted as a working
 * day; they are paid through overtime.
 */
export function computePeriodStats(opts: {
  userId: string;
  startDate: string;
  endDate: string;
  records: CalendarRecord[];
  holidayMap: HolidayMap;
  leaveMap: LeaveMap;
  weeklyOff: number[];
}): PeriodStats {
  const { userId, startDate, endDate, records, holidayMap, leaveMap, weeklyOff } = opts;
  const byDate: Record<string, CalendarRecord> = {};
  records.forEach((r) => { byDate[String(r.work_date).slice(0, 10)] = r; });

  let workingDays = 0, workedDays = 0, lateDays = 0, paidLeaveDays = 0, unpaidLeaveDays = 0, absentDays = 0;
  let workedHours = 0;

  eachDateInRange(startDate, endDate, (ds) => {
    if (isWeekend(ds, weeklyOff) || holidayMap[ds]) return;
    const rec = byDate[ds];
    const st = resolveDayStatus(userId, ds, rec, holidayMap, leaveMap, weeklyOff);
    if (st === 'holiday' || st === 'weekend') return;
    workingDays++;
    if (st === 'present' || st === 'late' || st === 'half_day' || st === 'work_from_home') {
      workedDays++;
      if (st === 'late') lateDays++;
      workedHours += dayHours(rec || {});
    } else if (st === 'paid_leave') paidLeaveDays++;
    else if (st === 'unpaid_leave') unpaidLeaveDays++;
    else if (st === 'absent') absentDays++;
  });

  return {
    workingDays,
    workedDays,
    lateDays,
    paidLeaveDays,
    unpaidLeaveDays,
    absentDays,
    avgHoursPerWorkedDay: workedDays > 0 ? workedHours / workedDays : 0,
  };
}