import { useCallback, useEffect, useState } from 'react';
import { syncRuleReminders } from '../lib/notifications';
import { supabase } from '../lib/supabase';
import type { RuleEvent } from '../lib/types';
import { useRealtimeRefetch, useSpace } from '../providers/SpaceProvider';

/** Невидимый компонент: держит локальные напоминания 2-2-2 в актуальном состоянии */
export function RuleReminderSync() {
  const { space } = useSpace();
  const [events, setEvents] = useState<RuleEvent[] | null>(null);

  const load = useCallback(async () => {
    if (!space?.rule222_enabled) {
      setEvents([]);
      return;
    }
    const { data } = await supabase.from('rule_events').select('*').eq('space_id', space.id);
    setEvents((data ?? []) as RuleEvent[]);
  }, [space?.id, space?.rule222_enabled]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefetch(['rule_events'], load);

  useEffect(() => {
    if (events === null) return;
    syncRuleReminders(space, events);
  }, [events, space?.rule222_enabled, space?.rule222_start, space]);

  return null;
}
