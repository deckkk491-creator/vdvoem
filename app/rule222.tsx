import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../src/components/people';
import { Body, Button, Card, EmptyState, ErrorNote, H2, Input, ProgressBar, Row, Segmented, Sheet } from '../src/components/ui';
import { COUNTRY_IDEAS, DATE_IDEAS, PLACE_IDEAS, pickRandom, type CountryIdea, type DateIdea, type PlaceIdea } from '../src/data/ideas';
import { formatDate, isoToRu, normalizeDateInput, relativeDays, todayISO } from '../src/lib/format';
import { openMapSearch } from '../src/lib/maps';
import { RULE_META, nextDue, progressTo } from '../src/lib/rule222';
import { humanError, supabase } from '../src/lib/supabase';
import type { ItemKind, RuleEvent, RuleKind } from '../src/lib/types';
import { useAuth } from '../src/providers/AuthProvider';
import { useRealtimeRefetch, useSpace } from '../src/providers/SpaceProvider';
import { fonts, sectionStyle, useTheme } from '../src/theme';

const KINDS: RuleKind[] = ['date', 'place', 'country'];

export default function Rule222() {
  const { c } = useTheme();
  const st = sectionStyle(c, 'rule');
  const insets = useSafeAreaInsets();
  const { space, updateSpace, people } = useSpace();
  const { userId } = useAuth();
  const [events, setEvents] = useState<RuleEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ideaKind, setIdeaKind] = useState<RuleKind>('date');
  const [markKind, setMarkKind] = useState<{ kind: RuleKind; title?: string } | null>(null);
  const [startOpen, setStartOpen] = useState(false);

  const load = useCallback(async () => {
    if (!space) return;
    const { data, error: e } = await supabase.from('rule_events').select('*').eq('space_id', space.id).order('done_on', { ascending: false });
    if (e) setError(humanError(e));
    setEvents((data ?? []) as RuleEvent[]);
  }, [space]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefetch(['rule_events'], load);

  if (!space) return null;
  const enabled = space.rule222_enabled;

  async function toggle(v: boolean) {
    try {
      await updateSpace({ rule222_enabled: v });
    } catch (e) {
      Alert.alert('Ошибка', humanError(e));
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
      <Card tint={st.bg} style={{ borderColor: 'transparent', marginBottom: 16 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 26, fontWeight: '700', color: c.text }}>2 · 2 · 2</Text>
            <Body muted style={{ marginTop: 4, fontSize: 14 }}>
              Каждые 2 недели — свидание, каждые 2 месяца — новое место, каждые 2 года — новая страна.
            </Body>
          </View>
          <Switch
            value={enabled}
            onValueChange={toggle}
            trackColor={{ true: st.fg, false: c.border }}
            accessibilityLabel="Правило 2-2-2"
          />
        </Row>
        {enabled ? (
          <Pressable onPress={() => setStartOpen(true)} hitSlop={12} accessibilityRole="button" style={{ marginTop: 10, alignSelf: 'flex-start' }}>
            <Text style={{ color: st.fg, fontWeight: '600', fontSize: 13 }}>
              Отсчёт с {formatDate(space.rule222_start)} · изменить
            </Text>
          </Pressable>
        ) : null}
      </Card>

      {!enabled ? (
        <EmptyState
          emoji="✨"
          title="Правило выключено"
          text="Включи — и мы напомним о свиданиях и путешествиях. А идеи можно посмотреть и так, они ниже."
        />
      ) : (
        KINDS.map((kind) => {
          const meta = RULE_META[kind];
          const { due, last } = nextDue(kind, space.rule222_start, events);
          const overdue = due.getTime() < new Date().setHours(0, 0, 0, 0);
          return (
            <Card key={kind} style={{ marginBottom: 12 }}>
              <Row gap={12}>
                <Text style={{ fontSize: 30 }}>{meta.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: c.text }}>{meta.title}</Text>
                  <Text style={{ color: c.textMuted, fontSize: 13 }}>{meta.short}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: overdue ? c.danger : st.fg, fontWeight: '700' }}>{relativeDays(due)}</Text>
                  <Text style={{ color: c.textFaint, fontSize: 12 }}>{formatDate(due)}</Text>
                </View>
              </Row>
              <View style={{ marginTop: 12 }}>
                <ProgressBar value={progressTo(kind, due)} color={overdue ? c.danger : st.fg} height={6} />
              </View>
              <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
                <Text style={{ color: c.textFaint, fontSize: 12 }}>{last ? `В последний раз: ${formatDate(last)}` : 'Пока не отмечали'}</Text>
                <Row gap={4}>
                  <Button title="Идеи" small variant="ghost" color={st.fg} onPress={() => setIdeaKind(kind)} />
                  <Button title="Было" small icon="checkmark" color={st.fg} onPress={() => setMarkKind({ kind })} />
                </Row>
              </Row>
            </Card>
          );
        })
      )}

      <H2 style={{ marginTop: 18, marginBottom: 10 }}>Генератор идей</H2>
      <Segmented
        options={[
          { value: 'date', label: '🕯️ Свидание' },
          { value: 'place', label: '🧭 Место' },
          { value: 'country', label: '✈️ Страна' },
        ]}
        value={ideaKind}
        onChange={setIdeaKind}
      />
      <View style={{ height: 12 }} />
      <IdeaGenerator kind={ideaKind} onDone={(title) => setMarkKind({ kind: ideaKind, title })} />

      <H2 style={{ marginTop: 24, marginBottom: 10 }}>История</H2>
      <ErrorNote text={error} />
      {events.length === 0 ? (
        <Body muted>Здесь появятся отмеченные свидания, места и страны.</Body>
      ) : (
        <Card style={{ padding: 0 }}>
          {events.map((e, i) => (
            <Pressable
              key={e.id}
              onLongPress={() =>
                Alert.alert('Удалить запись?', e.title, [
                  { text: 'Отмена', style: 'cancel' },
                  {
                    text: 'Удалить',
                    style: 'destructive',
                    onPress: async () => {
                      await supabase.from('rule_events').delete().eq('id', e.id);
                      load();
                    },
                  },
                ])
              }
              style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderTopWidth: i === 0 ? 0 : 1, borderColor: c.bgAlt }}
            >
              <Text style={{ fontSize: 22 }}>{RULE_META[e.kind].emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: '600' }}>{e.title}</Text>
                <Text style={{ color: c.textFaint, fontSize: 12 }}>
                  {RULE_META[e.kind].title} · {formatDate(e.done_on)}
                  {e.note ? ` · ${e.note}` : ''}
                </Text>
              </View>
              <Avatar profile={e.created_by ? people[e.created_by] : null} size={22} />
            </Pressable>
          ))}
        </Card>
      )}

      <MarkDoneSheet
        state={markKind}
        onClose={() => setMarkKind(null)}
        onSaved={() => {
          setMarkKind(null);
          load();
        }}
        spaceId={space.id}
        userId={userId}
      />
      <StartDateSheet
        visible={startOpen}
        initial={space.rule222_start}
        onClose={() => setStartOpen(false)}
        onSave={async (d) => {
          await updateSpace({ rule222_start: d });
          setStartOpen(false);
        }}
      />
    </ScrollView>
  );
}

/* --------------------------- Генератор --------------------------- */

function IdeaGenerator({ kind, onDone }: { kind: RuleKind; onDone: (title: string) => void }) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'rule');
  const { space } = useSpace();
  const { profile, userId } = useAuth();
  const city = (space?.city || profile?.city || '').trim();
  const [dateIdea, setDateIdea] = useState<DateIdea>(() => pickRandom(DATE_IDEAS));
  const [placeIdea, setPlaceIdea] = useState<PlaceIdea>(() => pickRandom(PLACE_IDEAS));
  const [country, setCountry] = useState<CountryIdea>(() => pickRandom(COUNTRY_IDEAS));
  const [saving, setSaving] = useState(false);

  const next = () => {
    Haptics.selectionAsync().catch(() => undefined);
    if (kind === 'date') setDateIdea((x) => pickRandom(DATE_IDEAS, x));
    else if (kind === 'place') setPlaceIdea((x) => pickRandom(PLACE_IDEAS, x));
    else setCountry((x) => pickRandom(COUNTRY_IDEAS, x));
  };

  const card = useMemo(() => {
    if (kind === 'date') return { emoji: dateIdea.emoji, title: dateIdea.title, text: dateIdea.description, tag: dateIdea.athome ? 'дома' : dateIdea.category ?? '' };
    if (kind === 'place')
      return {
        emoji: placeIdea.emoji,
        title: placeIdea.title,
        text: placeIdea.description,
        tag: placeIdea.nearby ? `рядом с городом${city ? ` · ${city}` : ''}` : city || 'в городе',
      };
    return { emoji: country.flag, title: country.name, text: country.description, tag: `${country.vibe} · сезон: ${country.bestSeason}` };
  }, [kind, dateIdea, placeIdea, country, city]);

  async function saveToSection() {
    if (!space || !userId) return;
    let kindTo: ItemKind = 'weekend';
    let payload: Record<string, unknown> = {};
    if (kind === 'date') {
      kindTo = dateIdea.section;
      payload = {
        title: dateIdea.title,
        note: dateIdea.description,
        category: dateIdea.section === 'weekend' ? dateIdea.category ?? 'другое' : null,
        media_type: dateIdea.section === 'watch' ? 'movie' : null,
        status: dateIdea.section === 'watch' ? 'want' : null,
        tags: dateIdea.section === 'recipe' ? ['свидание'] : [],
      };
    } else if (kind === 'place') {
      payload = { title: placeIdea.title, note: placeIdea.description, category: placeIdea.category, place: city || null };
    } else {
      payload = { title: `Поездка: ${country.name} ${country.flag}`, note: `${country.description} Лучшее время: ${country.bestSeason}.`, category: 'другое' };
    }
    setSaving(true);
    const { error } = await supabase.from('items').insert({ ...payload, kind: kindTo, space_id: space.id, created_by: userId });
    setSaving(false);
    if (error) return Alert.alert('Ошибка', humanError(error));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    const where: Record<ItemKind, string> = { weekend: '«На выходные»', recipe: '«Что приготовить»', watch: '«Смотрим вместе»', shopping: '«Покупки»' };
    Alert.alert('Сохранили', `Идея добавлена в раздел ${where[kindTo]}.`);
  }

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ backgroundColor: st.bg, paddingVertical: 26, alignItems: 'center' }}>
        <Text style={{ fontSize: 64 }}>{card.emoji}</Text>
      </View>
      <View style={{ padding: 16 }}>
        {card.tag ? <Text style={{ color: st.fg, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>{card.tag}</Text> : null}
        <Text style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: '700', color: c.text, marginTop: 4 }}>{card.title}</Text>
        <Body muted style={{ marginTop: 6 }}>{card.text}</Body>
        {kind === 'place' ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <Button title="Яндекс Карты" small variant="secondary" icon="map-outline" onPress={() => openMapSearch(`${placeIdea.query} ${city}`)} />
            <Button title="Apple Maps" small variant="secondary" icon="navigate-outline" onPress={() => openMapSearch(`${placeIdea.query} ${city}`, 'apple')} />
          </View>
        ) : null}
        {kind === 'place' && !city ? (
          <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 8 }}>Укажи город в настройках пространства — поиск станет точнее.</Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          <Button title="Ещё идею" icon="shuffle" variant="secondary" onPress={next} style={{ flex: 1 }} />
          <Button title="Сохранить" icon="bookmark-outline" onPress={saveToSection} loading={saving} color={st.fg} style={{ flex: 1 }} />
        </View>
        <Button title="Мы это сделали — отметить" small variant="ghost" color={st.fg} onPress={() => onDone(card.title)} style={{ marginTop: 6 }} />
      </View>
    </Card>
  );
}

/* --------------------------- Отметки --------------------------- */

function MarkDoneSheet({
  state,
  onClose,
  onSaved,
  spaceId,
  userId,
}: {
  state: { kind: RuleKind; title?: string } | null;
  onClose: () => void;
  onSaved: () => void;
  spaceId: string;
  userId: string | null;
}) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'rule');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    setTitle(state.title ?? '');
    setDate(isoToRu(todayISO()));
    setNote('');
    setError(null);
  }, [state]);

  async function save() {
    if (!state || !userId) return;
    const d = normalizeDateInput(date);
    if (!d) return setError('Укажи дату в формате ДД.ММ.ГГГГ');
    setBusy(true);
    const { error: e } = await supabase.from('rule_events').insert({
      space_id: spaceId,
      kind: state.kind,
      title: title.trim(),
      note: note.trim(),
      done_on: d,
      created_by: userId,
    });
    setBusy(false);
    if (e) return setError(humanError(e));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    onSaved();
  }

  const meta = state ? RULE_META[state.kind] : null;
  return (
    <Sheet
      visible={!!state}
      onClose={onClose}
      title={meta ? `${meta.emoji} ${meta.title}: было!` : ''}
      footer={<Button title="Отметить" onPress={save} loading={busy} disabled={!title.trim()} color={st.fg} />}
    >
      {meta ? <Body muted style={{ marginBottom: 14 }}>{meta.hint}</Body> : null}
      <Input label="Что это было" value={title} onChangeText={setTitle} placeholder="Ужин в грузинском ресторане" maxLength={200} />
      <Input label="Когда" value={date} onChangeText={setDate} placeholder="ДД.ММ.ГГГГ" keyboardType="numbers-and-punctuation" maxLength={10} />
      <Input label="Впечатления" value={note} onChangeText={setNote} placeholder="Что запомнилось" multiline maxLength={1000} />
      <ErrorNote text={error} />
    </Sheet>
  );
}

function StartDateSheet({
  visible,
  initial,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial: string;
  onClose: () => void;
  onSave: (iso: string) => Promise<void>;
}) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'rule');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setDate(isoToRu(initial));
      setError(null);
    }
  }, [visible, initial]);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Начало отсчёта"
      footer={
        <Button
          title="Сохранить"
          color={st.fg}
          onPress={() => {
            const d = normalizeDateInput(date);
            if (!d) return setError('Укажи дату в формате ДД.ММ.ГГГГ');
            onSave(d).catch((e) => setError(humanError(e)));
          }}
        />
      }
    >
      <Body muted style={{ marginBottom: 14 }}>
        Пока вы ничего не отметили, сроки считаются от этой даты. Потом — от последней отметки.
      </Body>
      <Input label="Дата" value={date} onChangeText={setDate} placeholder="ДД.ММ.ГГГГ" keyboardType="numbers-and-punctuation" maxLength={10} />
      <ErrorNote text={error} />
    </Sheet>
  );
}

