import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { DateField } from '../src/components/DateField';
import { MONTHS } from '../src/components/calendar/MonthGrid';
import { confirmDelete } from '../src/components/ItemCard';
import { Avatar, useNameOf } from '../src/components/people';
import { SectionHeader } from '../src/components/SectionHeader';
import { Body, Button, Card, Chip, EmptyState, ErrorNote, Fab, IconButton, Input, Label, Loading, ProgressBar, Row, Screen, Segmented, Sheet } from '../src/components/ui';
import { formatDate, parseAmount, rub, todayISO, toISODate } from '../src/lib/format';
import { humanError, supabase } from '../src/lib/supabase';
import type { BudgetEntry, BudgetKind } from '../src/lib/types';
import { useAuth } from '../src/providers/AuthProvider';
import { useRealtimeRefetch, useSpace } from '../src/providers/SpaceProvider';
import { fonts, radius, sectionStyle, useTheme } from '../src/theme';

const CATEGORIES: Record<BudgetKind, string[]> = {
  expense: ['Продукты', 'Коммуналка', 'Транспорт', 'Кафе', 'Здоровье', 'Одежда', 'Дом', 'Развлечения', 'Подписки и связь', 'Подарки', 'Дети', 'Питомцы', 'Другое'],
  income: ['Зарплата', 'Подработка', 'Подарки', 'Другое'],
};
const CAT_EMOJI: Record<string, string> = {
  Продукты: '🛒',
  Коммуналка: '🧾',
  Транспорт: '🚗',
  Кафе: '🍽️',
  Здоровье: '💊',
  Одежда: '👕',
  Дом: '🏠',
  Развлечения: '🎭',
  'Подписки и связь': '📱',
  Подарки: '🎁',
  Дети: '🧸',
  Питомцы: '🐾',
  Зарплата: '💼',
  Подработка: '💵',
  Другое: '✨',
};
const emojiOf = (cat: string) => CAT_EMOJI[cat] ?? '🏷️';

type Filter = 'all' | BudgetKind;

/** Бюджет: расходы и доходы пространства по месяцам и категориям */
export default function BudgetScreen() {
  const { c } = useTheme();
  const st = sectionStyle(c, 'budget');
  const { space, people } = useSpace();
  const nameOf = useNameOf();
  const params = useLocalSearchParams<{ add?: string }>();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<BudgetEntry | 'new' | null>(null);

  const y = month.getFullYear();
  const m = month.getMonth();
  const from = toISODate(new Date(y, m, 1));
  const to = toISODate(new Date(y, m + 1, 0));
  const spaceId = space?.id ?? null;

  const req = useRef(0);
  const load = useCallback(async () => {
    const id = ++req.current;
    if (!spaceId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    const { data, error: e } = await supabase
      .from('budget_entries')
      .select('*')
      .eq('space_id', spaceId)
      .gte('spent_on', from)
      .lte('spent_on', to)
      .order('spent_on', { ascending: false })
      .order('created_at', { ascending: false });
    // ответ для другого месяца или пространства не применяем
    if (id !== req.current) return;
    setLoading(false);
    if (e) {
      setError(humanError(e));
      return;
    }
    setError(null);
    setEntries(((data ?? []) as BudgetEntry[]).map((x) => ({ ...x, amount: Number(x.amount) })));
  }, [spaceId, from, to]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);
  useRealtimeRefetch(['budget_entries'], load);

  // Пришли из меню «+» в календаре — сразу открываем форму
  const openedFromMenu = useRef(false);
  useEffect(() => {
    if (params.add && !openedFromMenu.current) {
      openedFromMenu.current = true;
      setEditing('new');
    }
  }, [params.add]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    const byCat = new Map<string, number>();
    const byUser = new Map<string, number>();
    for (const e of entries) {
      if (e.kind === 'income') {
        income += e.amount;
        continue;
      }
      expense += e.amount;
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
      if (e.created_by) byUser.set(e.created_by, (byUser.get(e.created_by) ?? 0) + e.amount);
    }
    return {
      income,
      expense,
      byCat: Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]),
      byUser: Array.from(byUser.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [entries]);

  const shown = filter === 'all' ? entries : entries.filter((e) => e.kind === filter);
  const byDay = useMemo(() => {
    const map = new Map<string, BudgetEntry[]>();
    for (const e of shown) map.set(e.spent_on, [...(map.get(e.spent_on) ?? []), e]);
    return Array.from(map.entries());
  }, [shown]);

  const balance = totals.income - totals.expense;
  const isCurrentMonth = from.slice(0, 7) === todayISO().slice(0, 7);
  const knownCategories = useMemo(() => Array.from(new Set(entries.map((e) => e.category))), [entries]);

  async function remove(e: BudgetEntry) {
    setEntries((list) => list.filter((x) => x.id !== e.id));
    const { error: err } = await supabase.from('budget_entries').delete().eq('id', e.id);
    if (err) {
      Alert.alert('Не получилось удалить', humanError(err));
      load();
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <SectionHeader
          title="Бюджет"
          subtitle="Расходы и доходы вместе"
          emoji={st.emoji}
          color={st.fg}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/us'))}
        />

        <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <IconButton icon="chevron-back" size={20} bg={c.bgAlt} label="Предыдущий месяц" onPress={() => setMonth(new Date(y, m - 1, 1))} />
          <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 20, fontWeight: '700', color: c.text }}>
            {MONTHS[m]} {y}
          </Text>
          <IconButton icon="chevron-forward" size={20} bg={c.bgAlt} label="Следующий месяц" onPress={() => setMonth(new Date(y, m + 1, 1))} />
        </Row>

        <Card tint={st.bg} style={{ marginBottom: 16, borderColor: 'transparent' }}>
          <Label style={{ color: st.fg }}>{isCurrentMonth ? 'Остаток за месяц' : 'Итог месяца'}</Label>
          <Text style={{ fontFamily: fonts.display, fontSize: 34, fontWeight: '700', color: c.text }} numberOfLines={1} adjustsFontSizeToFit>
            {rub(balance)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1, backgroundColor: c.card, borderRadius: radius.md, padding: 12 }}>
              <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: '700' }}>ДОХОДЫ</Text>
              <Text style={{ color: c.sage, fontSize: 18, fontWeight: '800', marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>
                {rub(totals.income)}
              </Text>
            </View>
            <View style={{ flex: 1, backgroundColor: c.card, borderRadius: radius.md, padding: 12 }}>
              <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: '700' }}>РАСХОДЫ</Text>
              <Text style={{ color: c.danger, fontSize: 18, fontWeight: '800', marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>
                {rub(totals.expense)}
              </Text>
            </View>
          </View>
          {totals.byUser.length > 1 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
              {totals.byUser.map(([uid, sum]) => (
                <Row key={uid} gap={6}>
                  <Avatar profile={people[uid]} size={22} />
                  <Text style={{ color: c.textMuted, fontSize: 13 }}>
                    {nameOf(uid, { you: 'Ты' })}: <Text style={{ color: c.text, fontWeight: '700' }}>{rub(sum)}</Text>
                  </Text>
                </Row>
              ))}
            </View>
          ) : null}
        </Card>

        <ErrorNote text={error} onRetry={load} />

        {loading && !entries.length ? (
          <Loading />
        ) : entries.length === 0 ? (
          <EmptyState
            emoji="💰"
            title={isCurrentMonth ? 'Записей пока нет' : 'В этом месяце записей нет'}
            text="Записывай расходы и доходы — увидите, куда уходят деньги и сколько остаётся. Записи видят все участники."
            action="Добавить запись"
            onAction={() => setEditing('new')}
            color={st.fg}
          />
        ) : (
          <>
            {totals.byCat.length ? (
              <>
                <Label>Куда ушли деньги</Label>
                <Card style={{ marginBottom: 16 }}>
                  {totals.byCat.map(([cat, sum], i) => (
                    <View key={cat} style={{ marginTop: i ? 12 : 0 }}>
                      <Row style={{ justifyContent: 'space-between', marginBottom: 5 }}>
                        <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
                          {emojiOf(cat)} {cat}
                        </Text>
                        <Text style={{ color: c.textMuted, fontSize: 14, fontVariant: ['tabular-nums'] }}>
                          {rub(sum)} · {Math.round((sum / totals.expense) * 100)}%
                        </Text>
                      </Row>
                      <ProgressBar value={sum / totals.expense} color={st.fg} height={6} />
                    </View>
                  ))}
                </Card>
              </>
            ) : null}

            <Segmented
              options={[
                { value: 'all', label: 'Все' },
                { value: 'expense', label: 'Расходы' },
                { value: 'income', label: 'Доходы' },
              ]}
              value={filter}
              onChange={setFilter}
            />
            <View style={{ height: 14 }} />
            {byDay.length === 0 ? (
              <Body muted style={{ textAlign: 'center', paddingVertical: 20 }}>
                Таких записей в этом месяце нет.
              </Body>
            ) : null}
            {byDay.map(([day, list]) => (
              <View key={day} style={{ marginBottom: 14 }}>
                <Label>{day === todayISO() ? 'Сегодня' : formatDate(day)}</Label>
                <Card style={{ padding: 0 }}>
                  {list.map((e, i) => (
                    <Pressable
                      key={e.id}
                      onPress={() => setEditing(e)}
                      onLongPress={() => confirmDelete(`${e.category} · ${rub(e.amount)}`, () => remove(e))}
                      accessibilityRole="button"
                      accessibilityLabel={`${e.kind === 'income' ? 'Доход' : 'Расход'}: ${e.category}, ${rub(e.amount)}${e.note ? `, ${e.note}` : ''}`}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        minHeight: 56,
                        paddingVertical: 8,
                        paddingHorizontal: 14,
                        borderTopWidth: i ? 1 : 0,
                        borderColor: c.bgAlt,
                        backgroundColor: pressed ? c.cardPressed : 'transparent',
                      })}
                    >
                      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.bgAlt, alignItems: 'center', justifyContent: 'center' }}>
                        <Text allowFontScaling={false} style={{ fontSize: 18 }}>
                          {emojiOf(e.category)}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
                          {e.category}
                        </Text>
                        {e.note ? (
                          <Text style={{ color: c.textMuted, fontSize: 13 }} numberOfLines={1}>
                            {e.note}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={{ color: e.kind === 'income' ? c.sage : c.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                        {e.kind === 'income' ? '+' : '−'}
                        {rub(e.amount)}
                      </Text>
                      <Avatar profile={e.created_by ? people[e.created_by] : null} size={22} />
                    </Pressable>
                  ))}
                </Card>
              </View>
            ))}
            <Text style={{ textAlign: 'center', color: c.textFaint, fontSize: 12 }}>Нажми — изменить, удерживай — удалить</Text>
          </>
        )}
      </Screen>
      {entries.length > 0 ? <Fab onPress={() => setEditing('new')} color={st.fg} overTabBar={false} /> : null}
      <BudgetSheet
        visible={editing !== null}
        entry={editing === 'new' ? null : editing}
        defaultDate={isCurrentMonth ? todayISO() : from}
        knownCategories={knownCategories}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
        onDelete={editing && editing !== 'new' ? () => { remove(editing); setEditing(null); } : undefined}
      />
    </View>
  );
}

function BudgetSheet({
  visible,
  entry,
  defaultDate,
  knownCategories,
  onClose,
  onSaved,
  onDelete,
}: {
  visible: boolean;
  entry: BudgetEntry | null;
  defaultDate: string;
  knownCategories: string[];
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'budget');
  const { space } = useSpace();
  const { userId } = useAuth();
  const [kind, setKind] = useState<BudgetKind>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Продукты');
  const [custom, setCustom] = useState('');
  const [extra, setExtra] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setKind(entry?.kind ?? 'expense');
    setAmount(entry ? String(entry.amount).replace('.', ',') : '');
    setCategory(entry?.category ?? 'Продукты');
    setCustom('');
    setExtra([]);
    setDate(entry?.spent_on ?? defaultDate);
    setNote(entry?.note ?? '');
    setError(null);
    setBusy(false);
  }, [visible, entry, defaultDate]);

  const options = useMemo(() => {
    const base = CATEGORIES[kind];
    // свои категории — из уже записанного в этом месяце и только что добавленные
    const mine = [...knownCategories, ...extra, category].filter((x) => !CATEGORIES.expense.includes(x) && !CATEGORIES.income.includes(x));
    return Array.from(new Set([...base, ...mine]));
  }, [kind, knownCategories, extra, category]);

  const changeKind = (k: BudgetKind) => {
    setKind(k);
    if (!CATEGORIES[k].includes(category) && (CATEGORIES.expense.includes(category) || CATEGORIES.income.includes(category))) setCategory(CATEGORIES[k][0]);
  };

  const addCustom = () => {
    const t = custom.trim();
    if (!t) return;
    setExtra((x) => [...x, t]);
    setCategory(t);
    setCustom('');
  };

  async function save() {
    const sum = parseAmount(amount);
    if (sum === null || sum <= 0) return setError('Впиши сумму больше нуля, например 1 250 или 499,90');
    if (sum >= 1_000_000_000) return setError('Слишком большая сумма');
    if (!date) return setError('Выбери дату');
    if (!space || !userId) return setError('Нет пространства');
    setBusy(true);
    setError(null);
    const row = { kind, amount: sum, category, note: note.trim(), spent_on: date };
    const { error: e } = entry
      ? await supabase.from('budget_entries').update(row).eq('id', entry.id)
      : await supabase.from('budget_entries').insert({ ...row, space_id: space.id, created_by: userId });
    setBusy(false);
    if (e) return setError(humanError(e));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    onSaved();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={entry ? 'Запись' : 'Новая запись'}
      footer={<Button title={entry ? 'Сохранить' : 'Добавить'} onPress={save} loading={busy} disabled={!amount.trim()} color={st.fg} />}
    >
      <Segmented
        options={[
          { value: 'expense', label: 'Расход' },
          { value: 'income', label: 'Доход' },
        ]}
        value={kind}
        onChange={changeKind}
      />
      <View style={{ height: 16 }} />
      <Input
        label="Сумма, ₽"
        value={amount}
        onChangeText={setAmount}
        placeholder="0"
        keyboardType="decimal-pad"
        maxLength={14}
        autoFocus={!entry}
        style={{ fontSize: 28, fontWeight: '700', paddingVertical: 12 }}
      />
      <Label>Категория</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {options.map((k) => (
          <Chip key={k} label={`${emojiOf(k)} ${k}`} active={category === k} onPress={() => setCategory(k)} color={st.fg} />
        ))}
      </View>
      <Row style={{ marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Input value={custom} onChangeText={setCustom} placeholder="Своя категория" maxLength={40} containerStyle={{ marginBottom: 0 }} onSubmitEditing={addCustom} returnKeyType="done" />
        </View>
        <Button title="Добавить" small variant="secondary" disabled={!custom.trim()} onPress={addCustom} />
      </Row>
      <DateField label="Дата" value={date} onChange={setDate} />
      <Input label="Заметка (необязательно)" value={note} onChangeText={setNote} placeholder="Магазин, за что, кому" maxLength={500} />
      <ErrorNote text={error} />
      {onDelete && entry ? (
        <Button title="Удалить" variant="danger" icon="trash-outline" onPress={() => confirmDelete(`${entry.category} · ${rub(entry.amount)}`, onDelete)} />
      ) : null}
      <Row gap={6} style={{ marginTop: 12, justifyContent: 'center' }}>
        <Ionicons name="people-outline" size={14} color={c.textFaint} />
        <Text style={{ fontSize: 12, color: c.textFaint }}>Запись увидят все участники пространства</Text>
      </Row>
    </Sheet>
  );
}
