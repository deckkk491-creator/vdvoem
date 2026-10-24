import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import type { useCalendar } from '../../hooks/useCalendar';
import type { CalendarEvent } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { useSpace } from '../../providers/SpaceProvider';
import { sectionStyle, useTheme } from '../../theme';
import { useAttachmentsFor } from '../Attachments';
import { Body, Card, Chip, EmptyState, Loading } from '../ui';
import { TaskCard } from './EntryCards';

type Cal = ReturnType<typeof useCalendar>;
type TaskFilter = 'all' | 'shared' | 'mine' | 'done' | `user:${string}`;

export function openTaskCount(events: CalendarEvent[]): number {
  return events.filter((e) => e.kind === 'task' && !e.done).length;
}

/** Список задач с фильтрами: все, общие, мои, партнёра, сделанные */
export function TasksPanel({
  cal,
  onOpen,
  onLongPress,
  onNew,
}: {
  cal: Cal;
  onOpen: (t: CalendarEvent) => void;
  onLongPress: (t: CalendarEvent) => void;
  onNew: () => void;
}) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'calendar');
  const { space, members, people } = useSpace();
  const { userId } = useAuth();
  const { events, loading, take, release, setDone } = cal;
  const [filter, setFilter] = useState<TaskFilter>('all');

  const spaceId = space?.id ?? null;
  useEffect(() => setFilter('all'), [spaceId]);

  const others = useMemo(() => members.filter((m) => m.user_id !== userId), [members, userId]);
  const allTasks = useMemo(() => events.filter((e) => e.kind === 'task'), [events]);

  const tasks = useMemo(() => {
    if (filter === 'done') return allTasks.filter((t) => t.done).sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''));
    const open = allTasks.filter((t) => !t.done);
    let list: CalendarEvent[];
    if (filter === 'shared') list = open.filter((t) => !t.assignee);
    else if (filter === 'mine') list = open.filter((t) => !!userId && t.assignee === userId);
    else if (filter.startsWith('user:')) {
      const id = filter.slice(5);
      list = open.filter((t) => t.assignee === id);
    } else list = open;
    // Сначала задачи со сроком (ближайшие выше), потом без срока — новые выше
    return [...list].sort((a, b) => {
      if (a.starts_on && b.starts_on) return a.starts_on.localeCompare(b.starts_on);
      if (a.starts_on) return -1;
      if (b.starts_on) return 1;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [allTasks, filter, userId]);

  const counts = useMemo(() => {
    const open = allTasks.filter((t) => !t.done);
    return {
      all: open.length,
      shared: open.filter((t) => !t.assignee).length,
      mine: open.filter((t) => !!userId && t.assignee === userId).length,
      done: allTasks.length - open.length,
    };
  }, [allTasks, userId]);

  const { byParent } = useAttachmentsFor(useMemo(() => tasks.map((t) => t.id), [tasks]));

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
        <Chip label={`Все${counts.all ? ` · ${counts.all}` : ''}`} active={filter === 'all'} onPress={() => setFilter('all')} color={st.fg} />
        <Chip label={`Общие${counts.shared ? ` · ${counts.shared}` : ''}`} active={filter === 'shared'} onPress={() => setFilter('shared')} color={st.fg} />
        <Chip label={`Мои${counts.mine ? ` · ${counts.mine}` : ''}`} active={filter === 'mine'} onPress={() => setFilter('mine')} color={st.fg} />
        {others.map((m) => (
          <Chip
            key={m.user_id}
            label={people[m.user_id]?.display_name || 'Партнёр'}
            active={filter === `user:${m.user_id}`}
            onPress={() => setFilter(`user:${m.user_id}`)}
            color={st.fg}
          />
        ))}
        <Chip label={`Сделано${counts.done ? ` · ${counts.done}` : ''}`} active={filter === 'done'} onPress={() => setFilter('done')} color={c.sage} />
      </ScrollView>
      {loading && !events.length ? (
        <Loading />
      ) : allTasks.length === 0 ? (
        <EmptyState
          emoji="✅"
          title="Задач пока нет"
          text="Поставь задачу вроде «Отнести кошку к ветеринару» — партнёр увидит её и сможет нажать «Я сделаю»."
          action="Поставить задачу"
          onAction={onNew}
          color={st.fg}
        />
      ) : tasks.length === 0 ? (
        <Card tint={c.bgAlt} style={{ borderColor: 'transparent', padding: 14 }}>
          <Body muted style={{ fontSize: 14 }}>
            {filter === 'done' ? 'Сделанных задач пока нет.' : 'Здесь пусто — всё разобрано 🎉'}
          </Body>
        </Card>
      ) : (
        tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            attachments={byParent[t.id]}
            onPress={() => onOpen(t)}
            onLongPress={() => onLongPress(t)}
            onTake={() => take(t)}
            onRelease={() => release(t)}
            onDone={(d) => setDone(t, d)}
          />
        ))
      )}
    </>
  );
}
