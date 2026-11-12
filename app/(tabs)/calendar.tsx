import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, Switch, Text, View } from 'react-native';
import { useAttachmentsFor } from '../../src/components/Attachments';
import { useCalendarSheets } from '../../src/components/calendar/CalendarSheets';
import { AgendaCard, kindStyle } from '../../src/components/calendar/EntryCards';
import { TasksPanel, openTaskCount } from '../../src/components/calendar/TasksPanel';
import { MonthGrid, dayTitle, type DayMark } from '../../src/components/calendar/MonthGrid';
import { itemMenu } from '../../src/components/ItemCard';
import { SectionHeader } from '../../src/components/SectionHeader';
import { QuickBuySheet } from '../../src/components/QuickBuySheet';
import { useNameOf } from '../../src/components/people';
import { Body, Card, EmptyState, ErrorNote, FabMenu, Label, Loading, Screen, Segmented, type FabAction } from '../../src/components/ui';
import { useWorkDays } from '../../src/hooks/useWorkDays';
import { addDays, expandEntries, useCalendar, type Entry } from '../../src/hooks/useCalendar';
import {
  deviceCalendarSupported,
  isExportEnabled,
  removeExportedEvents,
  requestCalendarAccess,
  setExportEnabled,
  pruneOtherSpaces,
  syncDeviceCalendar,
} from '../../src/lib/deviceCalendar';
import { parseDate, todayISO, toISODate } from '../../src/lib/format';
import { humanError } from '../../src/lib/supabase';
import type { CalendarEvent } from '../../src/lib/types';
import { useSpace } from '../../src/providers/SpaceProvider';
import { sectionStyle, useTheme } from '../../src/theme';

type Mode = 'calendar' | 'tasks';

/** Насколько вперёд смотрим в списке «Скоро» */
const SOON_DAYS = 60;
const SOON_LIMIT = 5;

export default function CalendarScreen() {
  const { c } = useTheme();
  const st = sectionStyle(c, 'calendar');
  const { space, people } = useSpace();
  const nameOf = useNameOf();
  const work = useWorkDays();
  const [buyOpen, setBuyOpen] = useState(false);
  const cal = useCalendar();
  const { events, weekend, loading, error, loadedSpace, retry, setDone } = cal;

  const today = todayISO();
  const [mode, setMode] = useState<Mode>('calendar');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(today);

  const spaceId = space?.id ?? null;

  /* ---------------- Календарь ---------------- */

  const monthStart = toISODate(new Date(month.getFullYear(), month.getMonth(), 1));
  const monthEnd = toISODate(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  const marks = useMemo(() => {
    const byDay = expandEntries(events, weekend, monthStart, monthEnd);
    const out: Record<string, DayMark> = {};
    for (const [iso, list] of Object.entries(byDay)) {
      const colors: string[] = [];
      for (const e of list) {
        const col = kindStyle(c, e.type === 'weekend' ? 'weekend' : e.event.kind).fg;
        if (!colors.includes(col)) colors.push(col);
      }
      out[iso] = { colors, count: list.length };
    }
    // Рабочие дни участников — полосками цвета аватара
    for (const [iso, users] of Object.entries(work.byDay)) {
      if (iso < monthStart || iso > monthEnd) continue;
      const mark = (out[iso] ??= { colors: [], count: 0 });
      mark.bars = users.map((u) => people[u]?.avatar_color ?? c.textFaint);
      mark.barsLabel = `работают: ${users.length}`;
    }
    return out;
  }, [events, weekend, monthStart, monthEnd, c, work.byDay, people]);

  const workingToday = work.byDay[selected] ?? [];
  const hasWorkDays = Object.keys(work.byDay).length > 0;

  const agenda = useMemo(() => expandEntries(events, weekend, selected, selected)[selected] ?? [], [events, weekend, selected]);

  const soon = useMemo(() => {
    if (agenda.length) return [];
    const byDay = expandEntries(events, weekend, today, addDays(today, SOON_DAYS));
    const out: Entry[] = [];
    for (const iso of Object.keys(byDay).sort()) {
      for (const e of byDay[iso]) {
        if (e.type === 'event' && e.event.done) continue;
        if (e.type === 'weekend' && e.item.done) continue;
        out.push(e);
        if (out.length >= SOON_LIMIT) return out;
      }
    }
    return out;
  }, [agenda.length, events, weekend, today]);

  const openTasks = useMemo(() => openTaskCount(events), [events]);

  /* ---------------- Вложения видимых записей ---------------- */

  const visibleIds = useMemo(() => {
    const ids = new Set<string>();
    if (mode === 'calendar') for (const e of [...agenda, ...soon]) if (e.type === 'event') ids.add(e.event.id);
    return Array.from(ids);
  }, [mode, agenda, soon]);
  const { byParent, reload: reloadAttachments } = useAttachmentsFor(visibleIds);

  /* ---------------- Действия ---------------- */

  const sheets = useCalendarSheets(cal, { onSaved: reloadAttachments, spaceId });
  // Меню по кнопке «+»: сразу выбор, что добавить
  const fabActions: FabAction[] = [
    { icon: 'pin-outline', label: 'Событие', onPress: () => sheets.openNew('event', selected) },
    { icon: 'checkbox-outline', label: 'Задача', onPress: () => sheets.openNew('task', mode === 'tasks' ? null : selected) },
    { icon: 'heart-outline', label: 'Важная дата', onPress: () => sheets.openNew('date', selected) },
    { icon: 'basket-outline', label: 'Покупка', onPress: () => setBuyOpen(true) },
    { icon: 'wallet-outline', label: 'Расход или доход', onPress: () => router.push('/budget?add=1') },
    { icon: 'briefcase-outline', label: 'Рабочие дни', onPress: () => router.push('/workdays') },
  ];
  const menuFor = (ev: CalendarEvent) => itemMenu(ev.title, () => sheets.editEvent(ev), () => sheets.deleteEvent(ev));

  const changeMonth = (first: Date, selectToday?: boolean) => {
    setMonth(first);
    if (selectToday) setSelected(todayISO());
  };

  const selectDay = (iso: string) => {
    setSelected(iso);
    const d = parseDate(iso);
    if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  /* ---------------- Календарь iPhone ---------------- */

  const [deviceOn, setDeviceOn] = useState(false);
  useEffect(() => {
    let alive = true;
    isExportEnabled().then((v) => alive && setDeviceOn(v));
    return () => {
      alive = false;
    };
  }, []);

  // События пространств, из которых пользователь вышел, убираем с телефона
  const { spaces: allSpaces, loaded: spacesLoaded, loadError: spacesError } = useSpace();
  const spaceIdsKey = allSpaces.map((x) => x.id).join(',');
  useEffect(() => {
    if (!deviceOn || !spacesLoaded || spacesError) return;
    pruneOtherSpaces(spaceIdsKey ? spaceIdsKey.split(',') : []);
  }, [deviceOn, spacesLoaded, spacesError, spaceIdsKey]);

  // Выгружаем, только когда данные пространства загружены полностью — иначе можно стереть события на телефоне
  const ready = !!spaceId && loadedSpace === spaceId && !loading;
  const calColor = st.fg;
  useEffect(() => {
    if (!deviceOn || !ready || !spaceId) return;
    let alive = true;
    const t = setTimeout(() => {
      syncDeviceCalendar(spaceId, events, calColor).then((r) => {
        if (alive && r === 'denied') {
          setDeviceOn(false);
          setExportEnabled(false);
        }
      });
    }, 800);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [deviceOn, ready, spaceId, events, calColor]);

  const toggleDevice = useCallback(async (on: boolean) => {
    if (on) {
      // Включаем только после разрешения: иначе синхронизация увидит «нет доступа» и выключит переключатель
      const ok = await requestCalendarAccess();
      if (!ok) {
        Alert.alert('Нет доступа к календарю', 'Разреши «Вместе» доступ к календарю в настройках iPhone.', [
          { text: 'Не сейчас', style: 'cancel' },
          { text: 'Открыть настройки', onPress: () => Linking.openSettings().catch(() => undefined) },
        ]);
        return;
      }
      await setExportEnabled(true);
      setDeviceOn(true);
      return;
    }
    setDeviceOn(false);
    await setExportEnabled(false);
    Alert.alert('Убрать события из календаря iPhone?', 'Календарь «Вместе» на этом телефоне можно оставить как есть или удалить вместе со всеми событиями.', [
      { text: 'Оставить', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          removeExportedEvents().then((ok) => {
            if (!ok) Alert.alert('Не получилось', 'Удали календарь «Вместе» вручную в приложении «Календарь».');
          });
        },
      },
    ]);
  }, []);

  /* ---------------- Разметка ---------------- */

  if (!space) {
    return (
      <Screen>
        <SectionHeader title="Календарь" subtitle="Планы, задачи и важные даты" emoji={st.emoji} color={st.fg} />
        <EmptyState emoji="📅" title="Нет пространства" text="Создай пространство или присоединись по коду — и календарь станет общим." />
      </Screen>
    );
  }

  const datesSt = sectionStyle(c, 'dates');
  const workSt = sectionStyle(c, 'work');

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <SectionHeader title="Календарь" subtitle="Планы, задачи и важные даты" emoji={st.emoji} color={st.fg} />
        <Segmented
          options={[
            { value: 'calendar', label: 'Календарь' },
            { value: 'tasks', label: openTasks ? `Задачи · ${openTasks}` : 'Задачи' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <View style={{ height: 14 }} />
        <ErrorNote text={error} onRetry={retry} />

        {mode === 'calendar' ? (
          <>
            <MonthGrid month={month} selected={selected} today={today} marks={marks} onSelect={selectDay} onMonthChange={changeMonth} accent={st.fg} />
            <Legend workDays={hasWorkDays} />
            <Pressable
              onPress={() => router.push('/dates')}
              accessibilityRole="button"
              accessibilityLabel="Важные даты"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: datesSt.bg,
                borderRadius: 16,
                paddingHorizontal: 14,
                minHeight: 48,
                marginBottom: 8,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ fontSize: 20 }}>{datesSt.emoji}</Text>
              <Text style={{ flex: 1, color: datesSt.fg, fontWeight: '700', fontSize: 15 }}>Важные даты</Text>
              <Ionicons name="chevron-forward" size={18} color={datesSt.fg} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/workdays')}
              accessibilityRole="button"
              accessibilityLabel="Рабочие дни"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: workSt.bg,
                borderRadius: 16,
                paddingHorizontal: 14,
                minHeight: 48,
                marginBottom: 18,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ fontSize: 20 }}>{workSt.emoji}</Text>
              <Text style={{ flex: 1, color: workSt.fg, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
                {workingToday.length ? `Работают: ${workingToday.map((u) => nameOf(u)).join(', ')}` : 'Рабочие дни'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={workSt.fg} />
            </Pressable>

            <Label>{selected === today ? `Сегодня · ${dayTitle(selected)}` : dayTitle(selected)}</Label>
            {loading && !events.length ? (
              <Loading />
            ) : agenda.length ? (
              agenda.map((e) => (
                <AgendaCard
                  key={e.key}
                  entry={e}
                  today={today}
                  attachments={e.type === 'event' ? byParent[e.event.id] : undefined}
                  onPress={() => sheets.openEntry(e)}
                  onLongPress={e.type === 'event' ? () => menuFor(e.event) : undefined}
                  onToggleDone={e.type === 'event' && e.event.kind === 'task' ? () => setDone(e.event, !e.event.done) : undefined}
                />
              ))
            ) : (
              <>
                <Card tint={c.bgAlt} style={{ marginBottom: 16, borderColor: 'transparent', padding: 14 }}>
                  <Body muted style={{ fontSize: 14 }}>
                    В этот день ничего нет. Нажми «+», чтобы добавить событие, задачу или важную дату.
                  </Body>
                </Card>
                {soon.length ? (
                  <>
                    <Label>Скоро</Label>
                    {soon.map((e) => (
                      <AgendaCard
                        key={`soon-${e.key}`}
                        entry={e}
                        today={today}
                        showDate
                        attachments={e.type === 'event' ? byParent[e.event.id] : undefined}
                        onPress={() => sheets.openEntry(e)}
                        onLongPress={e.type === 'event' ? () => menuFor(e.event) : undefined}
                      />
                    ))}
                  </>
                ) : null}
              </>
            )}

            {deviceCalendarSupported ? <DeviceCalendarCard on={deviceOn} onChange={toggleDevice} color={st.fg} /> : null}
          </>
        ) : (
          <TasksPanel cal={cal} onOpen={(t) => sheets.openEvent(t)} onLongPress={menuFor} onNew={() => sheets.openNew('task', null)} />
        )}
      </Screen>
      <FabMenu actions={fabActions} color={st.fg} />
      {sheets.sheets}
      <QuickBuySheet visible={buyOpen} onClose={() => setBuyOpen(false)} />
    </View>
  );
}

function Legend({ workDays }: { workDays: boolean }) {
  const { c } = useTheme();
  const items: { kind: 'event' | 'task' | 'date' | 'weekend'; label: string }[] = [
    { kind: 'event', label: 'События' },
    { kind: 'task', label: 'Задачи' },
    { kind: 'date', label: 'Даты' },
    { kind: 'weekend', label: 'Выходные' },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, marginBottom: 14, paddingHorizontal: 4 }} accessible={false}>
      {items.map((i) => (
        <View key={i.kind} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: kindStyle(c, i.kind).fg }} />
          <Text style={{ fontSize: 12, color: c.textMuted }}>{i.label}</Text>
        </View>
      ))}
      {workDays ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 10, height: 3, borderRadius: 1.5, backgroundColor: c.textMuted }} />
          <Text style={{ fontSize: 12, color: c.textMuted }}>Рабочие дни</Text>
        </View>
      ) : null}
    </View>
  );
}

function DeviceCalendarCard({ on, onChange, color }: { on: boolean; onChange: (v: boolean) => void; color: string }) {
  const { c } = useTheme();
  return (
    <Card style={{ marginTop: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ionicons name="phone-portrait-outline" size={22} color={color} />
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: c.text }}>Добавлять в календарь iPhone</Text>
        <Switch
          value={on}
          onValueChange={onChange}
          trackColor={{ true: color, false: c.border }}
          ios_backgroundColor={c.border}
          accessibilityLabel="Добавлять в календарь iPhone"
        />
      </View>
      <Body muted style={{ fontSize: 13, marginTop: 8 }}>
        События, задачи со сроком и важные даты появятся в отдельном календаре «Вместе» на iPhone (а если календари
        синхронизируются через iCloud — и на других твоих устройствах Apple). Изменения в «Календаре» iPhone обратно в
        приложение не попадают. Включается отдельно на каждом телефоне.
      </Body>
    </Card>
  );
}
