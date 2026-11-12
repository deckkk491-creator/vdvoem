import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBackground } from '../src/components/AppBackground';
import { MonthGrid, MONTHS, type DayMark } from '../src/components/calendar/MonthGrid';
import { Avatar, useNameOf } from '../src/components/people';
import { Body, Button, Card, ErrorNote, Label, pageStyle, Row } from '../src/components/ui';
import { useWorkDays } from '../src/hooks/useWorkDays';
import { plural, todayISO, toISODate } from '../src/lib/format';
import { humanError } from '../src/lib/supabase';
import { useAuth } from '../src/providers/AuthProvider';
import { useSpace } from '../src/providers/SpaceProvider';
import { sectionStyle, useTheme } from '../src/theme';

/** Рабочие дни: отмечаешь свои смены — остальные участники видят их в календаре */
export default function WorkDaysScreen() {
  const { c } = useTheme();
  const st = sectionStyle(c, 'work');
  const insets = useSafeAreaInsets();
  const { userId, profile } = useAuth();
  const { members, people } = useSpace();
  const nameOf = useNameOf();
  const { byDay, mine, error, reload, setDays } = useWorkDays();
  const today = todayISO();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const myColor = profile?.avatar_color ?? st.fg;
  const y = month.getFullYear();
  const m = month.getMonth();

  const monthDays = useMemo(() => {
    const n = new Date(y, m + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => new Date(y, m, i + 1));
  }, [y, m]);

  // Полоски — рабочие дни остальных участников
  const marks = useMemo(() => {
    const out: Record<string, DayMark> = {};
    for (const d of monthDays) {
      const iso = toISODate(d);
      const others = (byDay[iso] ?? []).filter((u) => u !== userId);
      if (others.length) out[iso] = { colors: [], count: 0, bars: others.map((u) => people[u]?.avatar_color ?? c.textFaint), barsLabel: `работают: ${others.map((u) => nameOf(u)).join(', ')}` };
    }
    return out;
  }, [monthDays, byDay, userId, people, c.textFaint, nameOf]);

  const mineThisMonth = monthDays.filter((d) => mine.has(toISODate(d))).length;
  const fail = (e: unknown) => Alert.alert('Не получилось сохранить', humanError(e));

  const toggle = (iso: string) => setDays([iso], !mine.has(iso)).catch(fail);
  const fillWeekdays = () => {
    const days = monthDays.filter((d) => d.getDay() >= 1 && d.getDay() <= 5).map(toISODate);
    setDays(days, true).catch(fail);
  };
  const clearMonth = () => setDays(monthDays.map(toISODate).filter((iso) => mine.has(iso)), false).catch(fail);

  const others = members.filter((mem) => mem.user_id !== userId);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <AppBackground />
      <ScrollView contentContainerStyle={pageStyle(insets, insets.bottom + 40)}>
        <Body muted style={{ marginBottom: 14 }}>
          Нажимай на дни, когда работаешь. Остальные участники увидят их в календаре полоской твоего цвета — и наоборот.
        </Body>
        <ErrorNote text={error} onRetry={reload} />
        <MonthGrid
          month={month}
          selected={null}
          today={today}
          marks={marks}
          filled={mine}
          fillColor={myColor}
          onSelect={toggle}
          onMonthChange={(first) => setMonth(first)}
          accent={st.fg}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12, marginBottom: 6, paddingHorizontal: 4 }}>
          <Row gap={6}>
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: myColor + '40', borderWidth: 1.5, borderColor: myColor }} />
            <Text style={{ color: c.textMuted, fontSize: 13 }}>Мой рабочий день</Text>
          </Row>
          {others.map((mem) => (
            <Row key={mem.user_id} gap={6}>
              <View style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: people[mem.user_id]?.avatar_color ?? c.textFaint }} />
              <Text style={{ color: c.textMuted, fontSize: 13 }}>{nameOf(mem.user_id)}</Text>
            </Row>
          ))}
        </View>
        <Body muted style={{ fontSize: 14, marginBottom: 14, paddingHorizontal: 4 }}>
          {MONTHS[m]}: {mineThisMonth} {plural(mineThisMonth, 'рабочий день', 'рабочих дня', 'рабочих дней')}
        </Body>
        <Row style={{ flexWrap: 'wrap', marginBottom: 20 }}>
          <Button title="Пн–Пт" small variant="secondary" icon="briefcase-outline" onPress={fillWeekdays} />
          <Button title="Очистить месяц" small variant="ghost" icon="close-circle-outline" color={c.textMuted} disabled={!mineThisMonth} onPress={clearMonth} />
        </Row>
        {others.length ? (
          <Card>
            <Label>Сегодня</Label>
            {members.map((mem) => {
              const works = (byDay[today] ?? []).includes(mem.user_id);
              return (
                <Row key={mem.user_id} gap={10} style={{ minHeight: 40 }}>
                  <Avatar profile={people[mem.user_id]} size={28} />
                  <Text style={{ flex: 1, color: c.text, fontSize: 15 }}>{nameOf(mem.user_id, { you: 'Ты' })}</Text>
                  <Text style={{ color: works ? st.fg : c.textMuted, fontSize: 14, fontWeight: '600' }}>{works ? 'работает' : 'выходной'}</Text>
                </Row>
              );
            })}
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}
