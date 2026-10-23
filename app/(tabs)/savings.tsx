import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { confirmDelete } from '../../src/components/ItemCard';
import { Avatar, useNameOf } from '../../src/components/people';
import { SectionHeader } from '../../src/components/SectionHeader';
import { Body, Button, Card, EmptyState, ErrorNote, Fab, Input, Label, Loading, ProgressBar, Row, Screen, Sheet } from '../../src/components/ui';
import { formatDate, isoToRu, normalizeDateInput, parseAmount, plural, rub, todayISO } from '../../src/lib/format';
import { humanError, supabase } from '../../src/lib/supabase';
import type { Contribution, GoalWithProgress, SavingsGoal } from '../../src/lib/types';
import { useAuth } from '../../src/providers/AuthProvider';
import { useRealtimeRefetch, useSpace } from '../../src/providers/SpaceProvider';
import { fonts, sectionStyle, useTheme } from '../../src/theme';

const GOAL_EMOJI = ['🐷', '✈️', '🏖️', '🏠', '🚗', '💍', '🎁', '🛋️', '📱', '🎓', '👶', '🐶'];

export default function SavingsScreen() {
  const { c } = useTheme();
  const st = sectionStyle(c, 'savings');
  const { space, people } = useSpace();
  const { userId } = useAuth();
  const nameOf = useNameOf();
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [goalSheet, setGoalSheet] = useState<SavingsGoal | 'new' | null>(null);
  const [contribFor, setContribFor] = useState<GoalWithProgress | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!space) return;
    const [g, cs] = await Promise.all([
      supabase.from('savings_goals').select('*').eq('space_id', space.id).order('created_at'),
      supabase.from('savings_contributions').select('*').eq('space_id', space.id).order('contributed_on', { ascending: false }),
    ]);
    if (g.error || cs.error) {
      setError(humanError(g.error ?? cs.error));
      setLoading(false);
      return;
    }
    const contribs = (cs.data ?? []) as Contribution[];
    setGoals(
      ((g.data ?? []) as SavingsGoal[]).map((goal) => {
        const list = contribs.filter((x) => x.goal_id === goal.id).map((x) => ({ ...x, amount: Number(x.amount) }));
        return { ...goal, target_amount: Number(goal.target_amount), contributions: list, saved: list.reduce((s, x) => s + x.amount, 0) };
      }),
    );
    setError(null);
    setLoading(false);
  }, [space]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefetch(['savings_goals', 'savings_contributions'], load);

  const totals = useMemo(() => {
    const byUser = new Map<string, number>();
    goals.forEach((g) => g.contributions.forEach((x) => x.user_id && byUser.set(x.user_id, (byUser.get(x.user_id) ?? 0) + x.amount)));
    return { saved: goals.reduce((s, g) => s + g.saved, 0), byUser: Array.from(byUser.entries()).sort((a, b) => b[1] - a[1]) };
  }, [goals]);

  async function deleteGoal(g: SavingsGoal) {
    confirmDelete(g.title, async () => {
      const { error: e } = await supabase.from('savings_goals').delete().eq('id', g.id);
      if (e) Alert.alert('Ошибка', humanError(e));
      else load();
    });
  }

  async function deleteContribution(x: Contribution) {
    Alert.alert('Удалить взнос?', rub(x.amount), [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          const { error: e } = await supabase.from('savings_contributions').delete().eq('id', x.id);
          if (e) Alert.alert('Ошибка', humanError(e));
          else load();
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <SectionHeader title="Копилка" subtitle="Копим на мечты вместе" emoji={st.emoji} color={st.fg} />
        {goals.length > 0 ? (
          <Card tint={st.bg} style={{ marginBottom: 16, borderColor: 'transparent' }}>
            <Label style={{ color: st.fg }}>Всего отложено</Label>
            <Text style={{ fontFamily: fonts.display, fontSize: 34, fontWeight: '700', color: c.text }}>{rub(totals.saved)}</Text>
            {totals.byUser.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
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
        ) : null}
        <ErrorNote text={error} />
        {loading ? (
          <Loading />
        ) : goals.length === 0 ? (
          <EmptyState
            emoji="🐷"
            title="Копилка пока пуста"
            text="Отпуск, ремонт или подарок родителям — создай цель и вноси суммы. Прогресс видят все участники."
            action="Создать цель"
            onAction={() => setGoalSheet('new')}
            color={st.fg}
          />
        ) : (
          goals.map((g) => {
            const pct = g.target_amount > 0 ? g.saved / g.target_amount : 0;
            const done = pct >= 1;
            const open = openId === g.id;
            return (
              <Card key={g.id} style={{ marginBottom: 12 }} onPress={() => setOpenId(open ? null : g.id)} onLongPress={() => setGoalSheet(g)}>
                <Row gap={12} style={{ alignItems: 'flex-start' }}>
                  <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: st.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 26 }}>{g.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>{g.title}</Text>
                    <Text style={{ color: c.textMuted, marginTop: 2 }}>
                      <Text style={{ color: c.text, fontWeight: '700' }}>{rub(g.saved)}</Text> из {rub(g.target_amount)}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: fonts.display, fontSize: 20, fontWeight: '700', color: done ? c.sage : st.fg }}>
                    {Math.min(999, Math.round(pct * 100))}%
                  </Text>
                </Row>
                <View style={{ marginTop: 14 }}>
                  <ProgressBar value={pct} color={done ? c.sage : st.fg} height={12} />
                </View>
                <Row style={{ justifyContent: 'space-between', marginTop: 12 }}>
                  <Body muted style={{ fontSize: 13 }}>
                    {done ? '🎉 Цель достигнута!' : `Осталось ${rub(Math.max(0, g.target_amount - g.saved))}`}
                  </Body>
                  <Button title="Внести" small icon="add" color={st.fg} onPress={() => setContribFor(g)} />
                </Row>
                {open ? (
                  <View style={{ marginTop: 14, borderTopWidth: 1, borderColor: c.bgAlt, paddingTop: 10 }}>
                    {g.contributions.length === 0 ? (
                      <Body faint style={{ fontSize: 14 }}>Взносов пока нет.</Body>
                    ) : (
                      g.contributions.map((x) => (
                        <Pressable key={x.id} onLongPress={() => x.user_id === userId && deleteContribution(x)}>
                          <Row style={{ paddingVertical: 7 }} gap={10}>
                            <Avatar profile={x.user_id ? people[x.user_id] : null} size={24} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: c.text, fontSize: 14 }}>
                                {nameOf(x.user_id, { you: 'Ты' })}
                                {x.note ? <Text style={{ color: c.textMuted }}> · {x.note}</Text> : null}
                              </Text>
                              <Text style={{ color: c.textFaint, fontSize: 12 }}>{formatDate(x.contributed_on)}</Text>
                            </View>
                            <Text style={{ fontWeight: '700', color: x.amount < 0 ? c.danger : c.sage }}>
                              {x.amount > 0 ? '+' : ''}
                              {rub(x.amount)}
                            </Text>
                          </Row>
                        </Pressable>
                      ))
                    )}
                    <Row style={{ justifyContent: 'flex-end', marginTop: 6 }}>
                      <Button title="Изменить цель" small variant="ghost" color={st.fg} onPress={() => setGoalSheet(g)} />
                      <Button title="Удалить" small variant="ghost" color={c.danger} onPress={() => deleteGoal(g)} />
                    </Row>
                  </View>
                ) : (
                  <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 8 }}>
                    {g.contributions.length === 0
                      ? 'Взносов пока нет'
                      : `${g.contributions.length} ${plural(g.contributions.length, 'взнос', 'взноса', 'взносов')} · нажми, чтобы посмотреть`}
                  </Text>
                )}
              </Card>
            );
          })
        )}
      </Screen>
      {goals.length > 0 ? <Fab onPress={() => setGoalSheet('new')} color={st.fg} /> : null}
      <GoalSheet
        goal={goalSheet === 'new' ? null : goalSheet}
        visible={goalSheet !== null}
        onClose={() => setGoalSheet(null)}
        onSaved={() => {
          setGoalSheet(null);
          load();
        }}
      />
      <ContributionSheet goal={contribFor} onClose={() => setContribFor(null)} onSaved={() => { setContribFor(null); load(); }} />
    </View>
  );
}

function GoalSheet({ goal, visible, onClose, onSaved }: { goal: SavingsGoal | null; visible: boolean; onClose: () => void; onSaved: () => void }) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'savings');
  const { space } = useSpace();
  const { userId } = useAuth();
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('🐷');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle(goal?.title ?? '');
    setEmoji(goal?.emoji ?? '🐷');
    setTarget(goal ? String(goal.target_amount) : '');
    setError(null);
  }, [visible, goal]);

  async function save() {
    const amount = parseAmount(target);
    if (!amount || amount <= 0) return setError('Укажи сумму цели');
    if (!space || !userId) return;
    setBusy(true);
    const res = goal
      ? await supabase.from('savings_goals').update({ title: title.trim(), emoji, target_amount: amount }).eq('id', goal.id)
      : await supabase.from('savings_goals').insert({ space_id: space.id, title: title.trim(), emoji, target_amount: amount, created_by: userId });
    setBusy(false);
    if (res.error) return setError(humanError(res.error));
    onSaved();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={goal ? 'Изменить цель' : 'Новая цель'}
      footer={<Button title={goal ? 'Сохранить' : 'Создать'} onPress={save} loading={busy} disabled={!title.trim()} color={st.fg} />}
    >
      <Label>Иконка</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {GOAL_EMOJI.map((e) => (
          <Pressable
            key={e}
            onPress={() => setEmoji(e)}
            style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: emoji === e ? st.bg : c.bgAlt, borderWidth: 2, borderColor: emoji === e ? st.fg : 'transparent' }}
          >
            <Text style={{ fontSize: 22 }}>{e}</Text>
          </Pressable>
        ))}
      </View>
      <Input label="На что копим" value={title} onChangeText={setTitle} placeholder="Отпуск в Грузии" maxLength={100} />
      <Input label="Сколько нужно, ₽" value={target} onChangeText={setTarget} placeholder="150 000" keyboardType="decimal-pad" />
      <ErrorNote text={error} />
    </Sheet>
  );
}

function ContributionSheet({ goal, onClose, onSaved }: { goal: GoalWithProgress | null; onClose: () => void; onSaved: () => void }) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'savings');
  const { userId } = useAuth();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [withdraw, setWithdraw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!goal) return;
    setAmount('');
    setNote('');
    setDate(isoToRu(todayISO()));
    setWithdraw(false);
    setError(null);
  }, [goal]);

  async function save() {
    if (!goal || !userId) return;
    const n = parseAmount(amount);
    if (!n || n <= 0) return setError('Введи сумму');
    const d = normalizeDateInput(date) ?? todayISO();
    setBusy(true);
    const { error: e } = await supabase.from('savings_contributions').insert({
      goal_id: goal.id,
      space_id: goal.space_id,
      user_id: userId,
      amount: withdraw ? -n : n,
      note: note.trim(),
      contributed_on: d,
    });
    setBusy(false);
    if (e) return setError(humanError(e));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    onSaved();
  }

  const quick = [500, 1000, 5000, 10000];

  return (
    <Sheet
      visible={!!goal}
      onClose={onClose}
      title={goal ? `${goal.emoji} ${goal.title}` : ''}
      footer={<Button title={withdraw ? 'Снять' : 'Внести'} onPress={save} loading={busy} color={withdraw ? c.danger : st.fg} />}
    >
      <Input
        label={withdraw ? 'Сколько берёшь, ₽' : 'Сколько вносишь, ₽'}
        value={amount}
        onChangeText={setAmount}
        placeholder="0"
        keyboardType="decimal-pad"
        autoFocus
        style={{ fontSize: 30, fontFamily: fonts.display, fontWeight: '700' }}
      />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {quick.map((q) => (
          <Button key={q} title={rub(q)} small variant="secondary" onPress={() => setAmount(String(q))} />
        ))}
      </View>
      <Input label="Дата" value={date} onChangeText={setDate} placeholder="ДД.ММ.ГГГГ" keyboardType="numbers-and-punctuation" maxLength={10} />
      <Input label="Комментарий" value={note} onChangeText={setNote} placeholder="Премия, кэшбэк…" maxLength={200} />
      <Button
        title={withdraw ? 'Это снятие из копилки' : 'Нужно взять из копилки?'}
        small
        variant="ghost"
        color={withdraw ? c.danger : c.textMuted}
        icon={withdraw ? 'remove-circle' : 'remove-circle-outline'}
        onPress={() => setWithdraw(!withdraw)}
      />
      <ErrorNote text={error} />
    </Sheet>
  );
}
