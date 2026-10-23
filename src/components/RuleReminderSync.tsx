import { useCallback, useEffect, useState } from 'react';
import { syncRuleReminders } from '../lib/notifications';
import { supabase } from '../lib/supabase';
import type { RuleEvent } from '../lib/types';
import { useRealtimeRefetch, useSpace } from '../providers/SpaceProvider';

/** Невидимый компонент: держит локальные напоминания 2-2-2 в актуальном состоянии */
export function RuleReminderSync() {
  const { space } = useSpace();
  // события вместе с id пространства, к которому они относятся
  const [loaded, setLoaded] = useState<{ spaceId: string | null; events: RuleEvent[] } | null>(null);
  const spaceId = space?.id ?? null;

  const load = useCallback(async () => {
    if (!spaceId || !space?.rule222_enabled) {
      setLoaded({ spaceId, events: [] });
      return;
    }
    const { data, error } = await supabase.from('rule_events').select('*').eq('space_id', spaceId);
    // при ошибке оставляем прежние напоминания, а не пересчитываем их «с нуля»
    if (error) return;
    setLoaded({ spaceId, events: (data ?? []) as RuleEvent[] });
  }, [spaceId, space?.rule222_enabled]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefetch(['rule_events'], load);

  useEffect(() => {
    // ждём событий именно этого пространства, чтобы не посчитать сроки по чужой истории
    if (loaded === null || loaded.spaceId !== spaceId) return;
    syncRuleReminders(space, loaded.events);
  }, [loaded, spaceId, space]);

  return null;
}
