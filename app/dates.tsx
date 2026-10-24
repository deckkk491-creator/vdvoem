import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventSheet } from '../src/components/calendar/EventSheet';
import { itemMenu } from '../src/components/ItemCard';
import { Body, Card, EmptyState, ErrorNote, Fab, Label, Loading } from '../src/components/ui';
import { anniversaryLabel, daysBetween, daysUntilLabel, nextOccurrence, useCalendar } from '../src/hooks/useCalendar';
import { formatDate, todayISO } from '../src/lib/format';
import { humanError } from '../src/lib/supabase';
import type { CalendarEvent } from '../src/lib/types';
import { useSpace } from '../src/providers/SpaceProvider';
import { radius, sectionStyle, useTheme } from '../src/theme';

type Row = { ev: CalendarEvent; occ: string; days: number };

export default function DatesScreen() {
  const { c } = useTheme();
  const st = sectionStyle(c, 'dates');
  const insets = useSafeAreaInsets();
  const { space } = useSpace();
  const { events, loading, error, retry, save, remove } = useCalendar();
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);
  const today = todayISO();

  // Ближайшие сверху; прошедшие разовые даты — в конце, свежие выше
  const rows = useMemo(() => {
    const list: Row[] = [];
    for (const ev of events) {
      if (ev.kind !== 'date') continue;
      const occ = nextOccurrence(ev, today);
      if (!occ) continue;
      list.push({ ev, occ, days: daysBetween(today, occ) });
    }
    const upcoming = list.filter((r) => r.days >= 0).sort((a, b) => a.days - b.days || a.ev.title.localeCompare(b.ev.title, 'ru'));
    const past = list.filter((r) => r.days < 0).sort((a, b) => b.days - a.days);
    return { upcoming, past };
  }, [events, today]);

  const total = rows.upcoming.length + rows.past.length;
  const deleteDate = (ev: CalendarEvent) => remove(ev).catch((e) => Alert.alert('Ошибка', humanError(e)));

  const renderRow = (r: Row) => {
    const anniversary = anniversaryLabel(r.ev, r.occ, today);
    const isToday = r.days === 0;
    return (
      <Card
        key={r.ev.id}
        tint={isToday ? st.bg : undefined}
        onPress={() => setEditing(r.ev)}
        onLongPress={() => itemMenu(r.ev.title, () => setEditing(r.ev), () => deleteDate(r.ev))}
        style={{ marginBottom: 12, padding: 14 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: st.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 26 }}>{r.ev.emoji || st.emoji}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: c.text }} numberOfLines={2}>
              {r.ev.title}
            </Text>
            <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 2 }} numberOfLines={2}>
              {formatDate(r.occ)}
              {r.ev.yearly ? ' · каждый год' : ''}
              {anniversary ? ` · ${anniversary}` : ''}
            </Text>
          </View>
          <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: isToday ? st.fg : c.bgAlt, maxWidth: 120 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: isToday ? c.onAccent : r.days < 0 ? c.textFaint : st.fg, textAlign: 'center' }}>
              {daysUntilLabel(r.occ, today)}
            </Text>
          </View>
        </View>
        {r.ev.note ? (
          <Body muted style={{ fontSize: 14, marginTop: 8 }} numberOfLines={3}>
            {r.ev.note}
          </Body>
        ) : null}
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 110 }}>
        {!space ? (
          <EmptyState emoji="💞" title="Нет пространства" text="Создай пространство или присоединись по коду, чтобы хранить общие даты." />
        ) : (
          <>
            <Card tint={st.bg} style={{ borderColor: 'transparent', marginBottom: 16 }}>
              <Body style={{ fontSize: 14, color: c.text }}>
                Годовщины, дни рождения и другие дни, которые нельзя забыть. Они сами появляются в общем календаре.
              </Body>
            </Card>
            <ErrorNote text={error} onRetry={retry} />
            {loading && !events.length ? (
              <Loading />
            ) : total === 0 ? (
              <EmptyState
                emoji="💞"
                title="Пока ни одной даты"
                text="Добавь «День знакомства», «Годовщину свадьбы» или «День рождения Кати» — здесь будет видно, сколько осталось до каждой."
                action="Добавить дату"
                onAction={() => setEditing('new')}
                color={st.fg}
              />
            ) : (
              <>
                {rows.upcoming.map(renderRow)}
                {rows.past.length ? (
                  <>
                    <Label style={{ marginTop: 8 }}>Прошедшие</Label>
                    {rows.past.map(renderRow)}
                  </>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
      {space && total > 0 ? <Fab onPress={() => setEditing('new')} color={st.fg} overTabBar={false} /> : null}
      <EventSheet
        visible={editing !== null}
        event={editing === 'new' ? null : editing}
        fixedKind="date"
        onClose={() => setEditing(null)}
        save={save}
        remove={remove}
      />
    </View>
  );
}
