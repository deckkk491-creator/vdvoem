import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAttachmentsFor } from '../src/components/Attachments';
import { useCalendarSheets } from '../src/components/calendar/CalendarSheets';
import { AgendaCard } from '../src/components/calendar/EntryCards';
import { itemMenu } from '../src/components/ItemCard';
import { Body, Card, EmptyState, ErrorNote, Fab, Label, Loading, pageStyle, Segmented } from '../src/components/ui';
import { useCalendar, type Entry } from '../src/hooks/useCalendar';
import { todayISO } from '../src/lib/format';
import type { CalendarEvent } from '../src/lib/types';
import { useSpace } from '../src/providers/SpaceProvider';
import { sectionStyle, useTheme } from '../src/theme';
import { AppBackground } from '../src/components/AppBackground';

type Mode = 'upcoming' | 'past';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function monthTitle(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  return y === new Date().getFullYear() ? MONTHS[m] : `${MONTHS[m]} ${y}`;
}

/** Все события пространства списком: ближайшие и прошедшие, по месяцам */
export default function EventsScreen() {
  const { c } = useTheme();
  const st = sectionStyle(c, 'calendar');
  const insets = useSafeAreaInsets();
  const { space } = useSpace();
  const cal = useCalendar();
  const { events, loading, error, retry } = cal;
  const [mode, setMode] = useState<Mode>('upcoming');
  const today = todayISO();

  const all = useMemo(() => events.filter((e) => e.kind === 'event' && e.starts_on), [events]);
  const list = useMemo(() => {
    const upcoming = mode === 'upcoming';
    return all
      .filter((e) => (upcoming ? e.starts_on! >= today : e.starts_on! < today))
      .sort((a, b) => {
        const d = a.starts_on!.localeCompare(b.starts_on!);
        const t = (a.start_time ?? '').localeCompare(b.start_time ?? '');
        return upcoming ? d || t : -d || -t;
      });
  }, [all, mode, today]);

  const groups = useMemo(() => {
    const out: { title: string; items: CalendarEvent[] }[] = [];
    for (const ev of list) {
      const title = monthTitle(ev.starts_on!);
      const last = out[out.length - 1];
      if (last && last.title === title) last.items.push(ev);
      else out.push({ title, items: [ev] });
    }
    return out;
  }, [list]);

  const ids = useMemo(() => list.map((e) => e.id), [list]);
  const { byParent, reload } = useAttachmentsFor(ids);
  const sheets = useCalendarSheets(cal, { onSaved: reload, spaceId: space?.id ?? null });

  const entryOf = (ev: CalendarEvent): Entry => ({ type: 'event', key: ev.id, date: ev.starts_on!, event: ev });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <AppBackground />
      <ScrollView contentContainerStyle={pageStyle(insets, insets.bottom + 110)}>
        {!space ? (
          <EmptyState emoji="📌" title="Нет пространства" text="Создай пространство или присоединись по коду, чтобы планировать вместе." />
        ) : (
          <>
            <Segmented
              options={[
                { value: 'upcoming', label: 'Предстоящие' },
                { value: 'past', label: 'Прошедшие' },
              ]}
              value={mode}
              onChange={setMode}
            />
            <View style={{ height: 14 }} />
            <ErrorNote text={error} onRetry={retry} />
            {loading && !events.length ? (
              <Loading />
            ) : all.length === 0 ? (
              <EmptyState
                emoji="📌"
                title="Событий пока нет"
                text="Кино, поездка, запись к врачу — добавь событие, и оно появится в общем календаре у вас обоих."
                action="Добавить событие"
                onAction={() => sheets.openNew('event', today)}
                color={st.fg}
              />
            ) : list.length === 0 ? (
              <Card tint={c.bgAlt} style={{ borderColor: 'transparent', padding: 14 }}>
                <Body muted style={{ fontSize: 14 }}>
                  {mode === 'upcoming' ? 'Впереди пока ничего не запланировано.' : 'Прошедших событий нет.'}
                </Body>
              </Card>
            ) : (
              groups.map((g) => (
                <View key={g.title}>
                  <Label style={{ marginTop: 6 }}>{g.title}</Label>
                  {g.items.map((ev) => (
                    <AgendaCard
                      key={ev.id}
                      entry={entryOf(ev)}
                      today={today}
                      showDate
                      attachments={byParent[ev.id]}
                      onPress={() => sheets.openEvent(ev)}
                      onLongPress={() => itemMenu(ev.title, () => sheets.editEvent(ev), () => sheets.deleteEvent(ev))}
                    />
                  ))}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
      {space ? <Fab onPress={() => sheets.openNew('event', today)} color={st.fg} overTabBar={false} /> : null}
      {sheets.sheets}
    </View>
  );
}
