'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

// Subtask ticks for ONE occurrence of a recurring task. Template subtasks come from
// recurring_subtasks; progress is stored per occurrence in recurring_instance_subtask_status,
// so ticking one day does not tick the others.
type SubStatus = 'pending' | 'in_progress' | 'completed';

export default function InstanceSubtasks({ instanceId, templateId, readOnly = false }: { instanceId: string; templateId: string; readOnly?: boolean }) {
  const supabase = createClient();
  const { t } = useLanguage();
  const [subs, setSubs] = useState<{ id: string; title: string }[]>([]);
  const [status, setStatus] = useState<Record<string, SubStatus>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: tpl }, { data: st }] = await Promise.all([
        supabase.from('recurring_subtasks').select('id, title').eq('recurring_task_id', templateId).order('sort_order'),
        supabase.from('recurring_instance_subtask_status').select('subtask_id, status').eq('instance_id', instanceId),
      ]);
      if (cancelled) return;
      setSubs((tpl || []) as { id: string; title: string }[]);
      const map: Record<string, SubStatus> = {};
      (st || []).forEach((r: any) => { map[r.subtask_id] = r.status; });
      setStatus(map);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [instanceId, templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = async (subtaskId: string, next: SubStatus) => {
    const prev = status[subtaskId] || 'pending';
    setStatus((m) => ({ ...m, [subtaskId]: next }));
    const { error } = await supabase.from('recurring_instance_subtask_status').upsert(
      { instance_id: instanceId, subtask_id: subtaskId, status: next, completed_at: next === 'completed' ? new Date().toISOString() : null },
      { onConflict: 'instance_id,subtask_id' }
    );
    if (error) {
      toast.error(t('stCouldNotUpdate'));
      setStatus((m) => ({ ...m, [subtaskId]: prev }));
    }
  };

  if (!loaded || subs.length === 0) return null;
  const done = subs.filter((s) => (status[s.id] || 'pending') === 'completed').length;

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{t('stSubtasks')} · {done}/{subs.length} {t('stDone')}</p>
      {subs.map((s) => {
        const v = status[s.id] || 'pending';
        return (
          <div key={s.id} className="flex items-center gap-2 text-xs">
            <select
              value={v}
              disabled={readOnly}
              onChange={(e) => change(s.id, e.target.value as SubStatus)}
              aria-label={t('stSubtaskStatus')}
              className="border border-slate-200 dark:border-slate-600 rounded-md px-1.5 py-0.5 text-[11px] bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-60"
            >
              <option value="pending">{t('stPending')}</option>
              <option value="in_progress">{t('stInProgress')}</option>
              <option value="completed">{t('stCompleted')}</option>
            </select>
            <span className={`flex-1 min-w-0 truncate ${v === 'completed' ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>{s.title}</span>
          </div>
        );
      })}
    </div>
  );
}