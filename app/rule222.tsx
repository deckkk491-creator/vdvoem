import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AttachmentEditor, AttachmentStrip, useAttachmentsFor } from '../src/components/Attachments';
import { AppBackground } from '../src/components/AppBackground';
import { DateField } from '../src/components/DateField';
import { Avatar } from '../src/components/people';
import { Body, Button, Card, Chip, EmptyState, ErrorNote, H2, Input, Loading, ProgressBar, Row, Segmented, Sheet } from '../src/components/ui';
import { countryPhotos } from '../src/data/countryPhotos';
import { ideaPhoto } from '../src/data/photos';
import { COUNTRY_CARDS, COUNTRY_IDEAS, DATE_IDEAS, PLACE_IDEAS, type CountryCard, type CountryIdea, type DateIdea, type PlaceIdea } from '../src/data/ideas';
import { commitAttachments, deleteWithFiles, emptyDraft, type AttachmentDraft } from '../src/lib/files';
import { formatDate, normalizeUrl, relativeDays, todayISO } from '../src/lib/format';
import { openMapSearch } from '../src/lib/maps';
import { ensurePermission } from '../src/lib/notifications';
import {
  RHYTHM_LIMITS,
  RHYTHM_PRESETS,
  RULE_META,
  everyText,
  isDefaultRhythm,
  nextDue,
  progressTo,
  rhythmLabel,
  rhythmOf,
  type RuleRhythm,
} from '../src/lib/rule222';
import { humanError, supabase } from '../src/lib/supabase';
import type { Attachment, ItemKind, RuleEvent, RuleKind } from '../src/lib/types';
import { useAuth } from '../src/providers/AuthProvider';
import { useRealtimeRefetch, useSpace } from '../src/providers/SpaceProvider';
import { fonts, radius, sectionStyle, useTheme } from '../src/theme';

const KINDS: RuleKind[] = ['date', 'place', 'country'];
const IDEAS_SHOWN = 3;

type MarkState = { kind: RuleKind; title?: string; event?: RuleEvent };

export default function Rule222() {
  const { c } = useTheme();
  const st = sectionStyle(c, 'rule');
  const insets = useSafeAreaInsets();
  const { space, loaded, updateSpace, people } = useSpace();
  const { userId } = useAuth();
  const [events, setEvents] = useState<RuleEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ideaKind, setIdeaKind] = useState<RuleKind>('date');
  const [mark, setMark] = useState<MarkState | null>(null);
  const [rhythmOpen, setRhythmOpen] = useState(false);

  const spaceId = space?.id;
  const req = useRef(0);
  const load = useCallback(async () => {
    if (!spaceId) {
      setEvents([]);
      return;
    }
    const id = ++req.current;
    const { data, error: e } = await supabase.from('rule_events').select('*').eq('space_id', spaceId).order('done_on', { ascending: false });
    if (id !== req.current) return;
    if (e) {
      setError(humanError(e));
      return;
    }
    setError(null);
    setEvents((data ?? []) as RuleEvent[]);
  }, [spaceId]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefetch(['rule_events'], load);

  const { byParent } = useAttachmentsFor(events.map((e) => e.id));

  if (!space) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}>
        {loaded ? <EmptyState emoji="💛" title="Нет пространства" text="Создай общее пространство или присоединись по коду — и правило 2-2-2 заработает." /> : <Loading />}
      </View>
    );
  }
  const enabled = space.rule222_enabled;
  const rhythm = rhythmOf(space);

  async function toggle(v: boolean) {
    try {
      await updateSpace({ rule222_enabled: v });
    } catch (e) {
      Alert.alert('Ошибка', humanError(e));
      return;
    }
    if (v && Platform.OS !== 'web') {
      const granted = await ensurePermission().catch(() => false);
      if (!granted) {
        Alert.alert(
          'Уведомления выключены',
          'Правило работает, но напоминаний не будет, пока ты не разрешишь уведомления для «Вместе» в настройках телефона.',
          [
            { text: 'Не сейчас', style: 'cancel' },
            { text: 'Открыть настройки', onPress: () => Linking.openSettings().catch(() => undefined) },
          ],
        );
      }
    }
  }

  async function removeEvent(e: RuleEvent) {
    const prev = events;
    setEvents((list) => list.filter((x) => x.id !== e.id));
    try {
      await deleteWithFiles(e.id, () => supabase.from('rule_events').delete().eq('id', e.id));
    } catch (delErr) {
      setEvents(prev);
      Alert.alert('Не получилось удалить', humanError(delErr));
    }
    load();
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
    <AppBackground />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
      <Card tint={st.bg} style={{ borderColor: 'transparent', marginBottom: 16 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 26, fontWeight: '700', color: c.text }}>{rhythmLabel(rhythm).replace(/-/g, ' · ')}</Text>
            <Body muted style={{ marginTop: 4, fontSize: 14 }}>
              {`Свидание ${everyText('date', rhythm.date)}, новое место ${everyText('place', rhythm.place)}, новая страна ${everyText('country', rhythm.country)}.`}
            </Body>
          </View>
          <Switch value={enabled} onValueChange={toggle} trackColor={{ true: st.fg, false: c.border }} accessibilityLabel="Правило 2-2-2" />
        </Row>
        <Row gap={14} style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <Pressable onPress={() => setRhythmOpen(true)} hitSlop={10} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="options-outline" size={15} color={st.fg} />
            <Text style={{ color: st.fg, fontWeight: '700', fontSize: 13 }}>{isDefaultRhythm(rhythm) ? 'Настроить свой ритм' : 'Ритм и начало отсчёта'}</Text>
          </Pressable>
          {enabled ? <Text style={{ color: c.textMuted, fontSize: 13 }}>Отсчёт с {formatDate(space.rule222_start)}</Text> : null}
        </Row>
      </Card>

      {!enabled ? (
        <EmptyState emoji="✨" title="Правило выключено" text="Включи — и мы напомним о свиданиях и путешествиях. А идеи можно посмотреть и так, они ниже." />
      ) : (
        KINDS.map((kind) => {
          const meta = RULE_META[kind];
          const { due, last } = nextDue(kind, space.rule222_start, events, rhythm);
          const overdue = due.getTime() < new Date().setHours(0, 0, 0, 0);
          return (
            <Card key={kind} style={{ marginBottom: 12 }}>
              <Row gap={12}>
                <Text style={{ fontSize: 30 }}>{meta.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: c.text }}>{meta.title}</Text>
                  <Text style={{ color: c.textMuted, fontSize: 13 }}>{everyText(kind, rhythm[kind])}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: overdue ? c.danger : st.fg, fontWeight: '700' }}>{relativeDays(due)}</Text>
                  <Text style={{ color: c.textFaint, fontSize: 12 }}>{formatDate(due)}</Text>
                </View>
              </Row>
              <View style={{ marginTop: 12 }}>
                <ProgressBar value={progressTo(kind, due, rhythm)} color={overdue ? c.danger : st.fg} height={6} />
              </View>
              <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
                <Text style={{ color: c.textFaint, fontSize: 12, flexShrink: 1 }}>{last ? `В последний раз: ${formatDate(last)}` : 'Пока не отмечали'}</Text>
                <Row gap={4}>
                  <Button title="Идеи" small variant="ghost" color={st.fg} onPress={() => setIdeaKind(kind)} />
                  <Button title="Было" small icon="checkmark" color={st.fg} onPress={() => setMark({ kind })} />
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
      <IdeaGenerator kind={ideaKind} onDone={(title) => setMark({ kind: ideaKind, title })} />

      <H2 style={{ marginTop: 24, marginBottom: 10 }}>История</H2>
      <ErrorNote text={error} />
      {events.length === 0 ? (
        <Body muted>Здесь появятся отмеченные свидания, места и страны — с впечатлениями и фото.</Body>
      ) : (
        <Card style={{ padding: 0 }}>
          {events.map((e, i) => (
            <Pressable
              key={e.id}
              onPress={() => setMark({ kind: e.kind, event: e })}
              onLongPress={() =>
                Alert.alert('Удалить запись?', e.title, [
                  { text: 'Отмена', style: 'cancel' },
                  { text: 'Удалить', style: 'destructive', onPress: () => removeEvent(e) },
                ])
              }
              accessibilityRole="button"
              accessibilityHint="Открыть, чтобы добавить впечатления и фото"
              style={({ pressed }) => ({ padding: 14, borderTopWidth: i === 0 ? 0 : 1, borderColor: c.bgAlt, backgroundColor: pressed ? c.cardPressed : 'transparent' })}
            >
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 22 }}>{RULE_META[e.kind].emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '600' }}>{e.title}</Text>
                  <Text style={{ color: c.textFaint, fontSize: 12 }}>
                    {RULE_META[e.kind].title} · {formatDate(e.done_on)}
                  </Text>
                </View>
                <Avatar profile={e.created_by ? people[e.created_by] : null} size={22} />
              </View>
              {e.note ? (
                <Text style={{ color: c.textMuted, fontSize: 14, marginTop: 6, marginLeft: 34 }} numberOfLines={3}>
                  {e.note}
                </Text>
              ) : null}
              <View style={{ marginLeft: 34 }}>
                <AttachmentStrip attachments={byParent[e.id]} size={64} />
              </View>
            </Pressable>
          ))}
        </Card>
      )}

      <MarkDoneSheet
        state={mark}
        onClose={() => setMark(null)}
        onSaved={() => {
          setMark(null);
          load();
        }}
        spaceId={space.id}
        userId={userId}
        existing={mark?.event ? byParent[mark.event.id] ?? [] : []}
      />
      <RhythmSheet
        visible={rhythmOpen}
        rhythm={rhythm}
        start={space.rule222_start}
        onClose={() => setRhythmOpen(false)}
        onSave={async (r, start) => {
          await updateSpace({ rule_date_weeks: r.date, rule_place_months: r.place, rule_country_years: r.country, rule222_start: start });
          setRhythmOpen(false);
        }}
      />
    </ScrollView>
    </View>
  );
}

/* --------------------------- Генератор: три идеи сразу --------------------------- */

type AnyIdea = { kind: 'date'; idea: DateIdea } | { kind: 'place'; idea: PlaceIdea } | { kind: 'country'; idea: CountryIdea };

function poolOf(kind: RuleKind): AnyIdea[] {
  if (kind === 'date') return DATE_IDEAS.map((idea) => ({ kind, idea }));
  if (kind === 'place') return PLACE_IDEAS.map((idea) => ({ kind, idea }));
  return COUNTRY_IDEAS.map((idea) => ({ kind, idea }));
}

/** n случайных разных идей, не повторяя уже показанные */
function pickDistinct(pool: AnyIdea[], n: number, exclude: Set<string>): AnyIdea[] {
  const free = pool.filter((x) => !exclude.has(x.idea.id));
  const src = free.length >= n ? free : pool;
  const copy = [...src];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function IdeaGenerator({ kind, onDone }: { kind: RuleKind; onDone: (title: string) => void }) {
  const [shown, setShown] = useState<AnyIdea[]>(() => pickDistinct(poolOf(kind), IDEAS_SHOWN, new Set()));
  const seen = useRef(new Set<string>());
  const [saving, setSaving] = useState<AnyIdea | null>(null);

  useEffect(() => {
    seen.current = new Set();
    const first = pickDistinct(poolOf(kind), IDEAS_SHOWN, new Set());
    first.forEach((x) => seen.current.add(x.idea.id));
    setShown(first);
  }, [kind]);

  const replace = (index: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    setShown((list) => {
      const pool = poolOf(kind);
      // не повторяем показанное, пока идеи не закончатся
      if (seen.current.size >= pool.length - list.length) seen.current = new Set(list.map((x) => x.idea.id));
      const exclude = new Set([...seen.current, ...list.map((x) => x.idea.id)]);
      const [next] = pickDistinct(pool, 1, exclude);
      if (!next) return list;
      seen.current.add(next.idea.id);
      const copy = [...list];
      copy[index] = next;
      return copy;
    });
  };

  const shuffleAll = () => {
    Haptics.selectionAsync().catch(() => undefined);
    const pool = poolOf(kind);
    if (seen.current.size >= pool.length - IDEAS_SHOWN) seen.current = new Set();
    const next = pickDistinct(pool, IDEAS_SHOWN, new Set([...seen.current, ...shown.map((x) => x.idea.id)]));
    next.forEach((x) => seen.current.add(x.idea.id));
    setShown(next);
  };

  return (
    <View>
      {shown.map((x, i) => (
        <IdeaCard key={`${x.idea.id}-${i}`} item={x} onReplace={() => replace(i)} onSave={() => setSaving(x)} onDone={() => onDone(ideaTitle(x))} />
      ))}
      <Button title="Показать три новые" icon="shuffle" variant="secondary" onPress={shuffleAll} />
      <SaveIdeaSheet item={saving} onClose={() => setSaving(null)} />
    </View>
  );
}

function ideaTitle(x: AnyIdea): string {
  return x.kind === 'country' ? x.idea.name : x.idea.title;
}

function IdeaCard({ item, onReplace, onSave, onDone }: { item: AnyIdea; onReplace: () => void; onSave: () => void; onDone: () => void }) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'rule');
  const { space } = useSpace();
  const { profile } = useAuth();
  const city = (space?.city || profile?.city || '').trim();

  let emoji = '';
  let tag = '';
  let text = '';
  if (item.kind === 'date') {
    emoji = item.idea.emoji;
    tag = item.idea.athome ? 'дома' : item.idea.category ?? '';
    text = item.idea.description;
  } else if (item.kind === 'place') {
    emoji = item.idea.emoji;
    tag = item.idea.nearby ? `рядом с городом${city ? ` · ${city}` : ''}` : city || 'в городе';
    text = item.idea.description;
  } else {
    emoji = item.idea.flag;
    tag = `${item.idea.vibe} · сезон: ${item.idea.bestSeason}`;
    text = item.idea.description;
  }

  return (
    <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
      {item.kind === 'country' ? (
        <CountryGallery countryId={item.idea.id} flag={item.idea.flag} />
      ) : (
        <IdeaPhoto id={item.idea.id} emoji={emoji} />
      )}
      <View style={{ padding: 14 }}>
        {tag ? <Text style={{ color: st.fg, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>{tag}</Text> : null}
        <Text style={{ fontFamily: fonts.display, fontSize: 20, fontWeight: '700', color: c.text, marginTop: 4 }}>
          {item.kind === 'country' ? `${item.idea.flag} ${item.idea.name}` : item.idea.title}
        </Text>
        <Body muted style={{ marginTop: 4, fontSize: 14 }}>
          {text}
        </Body>
        {item.kind === 'place' ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Button title="Яндекс Карты" small variant="secondary" icon="map-outline" onPress={() => openMapSearch(`${item.idea.query} ${city}`)} />
            <Button title="Apple Maps" small variant="secondary" icon="navigate-outline" onPress={() => openMapSearch(`${item.idea.query} ${city}`, 'apple')} />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Button title="Другая" icon="refresh" small variant="secondary" onPress={onReplace} style={{ flex: 1 }} />
          <Button title="В планы" icon="bookmark-outline" small onPress={onSave} color={st.fg} style={{ flex: 1 }} />
        </View>
        <Button title="Мы это сделали — отметить" small variant="ghost" color={st.fg} onPress={onDone} style={{ marginTop: 4 }} />
      </View>
    </Card>
  );
}

/** Фото достопримечательностей страны — листаются пальцем. Нажатие на фото — визитка страны. */
function CountryGallery({ countryId, flag }: { countryId: string; flag: string }) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'rule');
  const photos = useMemo(() => countryPhotos(countryId), [countryId]);
  const info = COUNTRY_CARDS[countryId];
  const width = Dimensions.get('window').width - 32; // ширина карточки = экран минус отступы
  const [page, setPage] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  useEffect(() => {
    setShowInfo(false);
    setPage(0);
  }, [countryId]);

  const height = 220;
  const toggle = () => {
    if (!info) return;
    Haptics.selectionAsync().catch(() => undefined);
    setShowInfo((v) => !v);
  };

  if (!photos.length) {
    return (
      <Pressable onPress={toggle} style={{ backgroundColor: st.bg, minHeight: info ? height : 0, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' }}>
        {showInfo && info ? <CountryInfo info={info} /> : <Text style={{ fontSize: 44 }}>{flag}</Text>}
      </Pressable>
    );
  }
  const p = photos[Math.min(page, photos.length - 1)];
  return (
    <View>
      <ScrollView
        key={countryId}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {photos.map((ph) => (
          <Pressable
            key={ph.url}
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={`${ph.caption}. Нажми, чтобы ${showInfo ? 'скрыть' : 'показать'} визитку страны`}
          >
            <Image source={{ uri: ph.url }} style={{ width, height, backgroundColor: st.bg }} contentFit="cover" transition={200} />
          </Pressable>
        ))}
      </ScrollView>
      {showInfo && info ? (
        <Pressable onPress={toggle} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.72)', padding: 14, justifyContent: 'center' }]} accessibilityRole="button" accessibilityLabel="Скрыть визитку страны">
          <CountryInfo info={info} />
        </Pressable>
      ) : (
        <>
          {info ? (
            <View pointerEvents="none" style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Ionicons name="information-circle-outline" size={15} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>О стране</Text>
            </View>
          ) : null}
          <View
            pointerEvents="box-none"
            style={{ position: 'absolute', left: 10, bottom: 10, right: 10, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
          >
            <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4, maxWidth: '80%' }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                {p.caption}
              </Text>
              <Text
                style={{ color: '#fff', fontSize: 10, opacity: 0.85 }}
                numberOfLines={1}
                onPress={() => WebBrowser.openBrowserAsync(p.source).catch(() => undefined)}
                accessibilityRole="link"
              >
                Фото: {p.author} · {p.license}
              </Text>
            </View>
            {photos.length > 1 ? (
              <View pointerEvents="none" style={{ flexDirection: 'row', gap: 4, paddingBottom: 4 }}>
                {photos.map((_, i) => (
                  <View key={i} style={{ width: i === page ? 14 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? '#fff' : 'rgba(255,255,255,0.55)' }} />
                ))}
              </View>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

/** Фото идеи свидания или места с подписью автора; если фото нет — эмодзи */
function IdeaPhoto({ id, emoji }: { id: string; emoji: string }) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'rule');
  const ph = ideaPhoto(id);
  if (!ph) {
    return (
      <View style={{ backgroundColor: st.bg, paddingVertical: 16, alignItems: 'center' }}>
        <Text style={{ fontSize: 44 }}>{emoji}</Text>
      </View>
    );
  }
  return (
    <View>
      <Image source={{ uri: ph.url }} style={{ width: '100%', height: 190, backgroundColor: st.bg }} contentFit="cover" transition={200} />
      <View style={{ position: 'absolute', left: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4, maxWidth: '85%' }}>
        <Text style={{ fontSize: 16 }}>{emoji}</Text>
        <Text
          style={{ color: '#fff', fontSize: 10, opacity: 0.9, flexShrink: 1 }}
          numberOfLines={1}
          onPress={() => WebBrowser.openBrowserAsync(ph.source).catch(() => undefined)}
          accessibilityRole="link"
        >
          Фото: {ph.author} · {ph.license}
        </Text>
      </View>
    </View>
  );
}

/** Визитка страны: четыре коротких строки поверх фото */
function CountryInfo({ info }: { info: CountryCard }) {
  const rows: [string, string, string][] = [
    ['🗓', 'Сезон', info.season],
    ['🏖', 'Отдых', info.rest],
    ['🍽', 'Еда', info.food],
    ['🏛', 'Архитектура', info.architecture],
  ];
  return (
    <View style={{ gap: 7 }}>
      {rows.map(([icon, label, text]) => (
        <View key={label} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 15, width: 20 }}>{icon}</Text>
          <Text style={{ flex: 1, color: '#fff', fontSize: 13, lineHeight: 17 }} numberOfLines={2}>
            <Text style={{ fontWeight: '800' }}>{label}: </Text>
            {text}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* --------------------------- Окно «В планы» --------------------------- */

const WHERE: Record<ItemKind, string> = { weekend: '«На выходные»', recipe: '«Что приготовить»', watch: '«Смотрим вместе»', shopping: '«Покупки»' };

function SaveIdeaSheet({ item, onClose }: { item: AnyIdea | null; onClose: () => void }) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'rule');
  const { space } = useSpace();
  const { userId, profile } = useAuth();
  const city = (space?.city || profile?.city || '').trim();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<AttachmentDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target: ItemKind = item?.kind === 'date' ? item.idea.section : 'weekend';
  const isTrip = item?.kind === 'country';

  useEffect(() => {
    if (!item) return;
    setError(null);
    setDate(null);
    setEndDate(null);
    setUrl('');
    setDraft(emptyDraft());
    if (item.kind === 'country') {
      setTitle(`Поездка: ${item.idea.name} ${item.idea.flag}`);
      const info = COUNTRY_CARDS[item.idea.id];
      setNote(
        info
          ? [item.idea.description, `Сезон: ${info.season}.`, `Отдых: ${info.rest}.`, `Еда: ${info.food}.`, `Архитектура: ${info.architecture}.`].join('\n')
          : `${item.idea.description} Лучшее время: ${item.idea.bestSeason}.`,
      );
      setPlace(item.idea.name);
    } else if (item.kind === 'place') {
      setTitle(item.idea.title);
      setNote(item.idea.description);
      setPlace(item.idea.nearby ? '' : city);
    } else {
      setTitle(item.idea.title);
      setNote(item.idea.description);
      setPlace('');
    }
  }, [item, city]);

  async function save() {
    if (!item || !space || !userId) return;
    const link = url.trim() ? normalizeUrl(url) : null;
    if (url.trim() && !link) return setError('Ссылка выглядит неправильно');
    if (date && endDate && endDate < date) return setError('Дата возвращения раньше даты начала');
    setBusy(true);
    setError(null);
    const payload: Record<string, unknown> = { title: title.trim(), note: note.trim(), url: link, kind: target, space_id: space.id, created_by: userId };
    if (target === 'weekend') {
      payload.category = item.kind === 'date' ? item.idea.category ?? 'другое' : item.kind === 'place' ? item.idea.category : 'другое';
      payload.place = place.trim() || null;
      payload.event_date = date;
      payload.end_date = isTrip ? endDate : null;
      if (item.kind === 'country') payload.image_url = countryPhotos(item.idea.id)[0]?.url ?? null;
      else payload.image_url = ideaPhoto(item.idea.id)?.url ?? null;
    } else if (target === 'watch') {
      payload.media_type = 'movie';
      payload.status = 'want';
    } else if (target === 'recipe') {
      payload.tags = ['свидание'];
    }
    const { data, error: e } = await supabase.from('items').insert(payload).select('id').single();
    if (e || !data) {
      setBusy(false);
      return setError(humanError(e));
    }
    const problem = await commitAttachments(space.id, userId, 'item', (data as { id: string }).id, draft);
    setBusy(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    onClose();
    Alert.alert('Сохранили', `Идея добавлена в раздел ${WHERE[target]}.${problem ? `\n\n${problem}` : ''}`);
  }

  return (
    <Sheet
      visible={!!item}
      onClose={onClose}
      title={isTrip ? 'Планируем поездку' : 'В планы'}
      footer={<Button title={`Сохранить в ${WHERE[target]}`} onPress={save} loading={busy} disabled={!title.trim()} color={st.fg} />}
    >
      <Input label="Название" value={title} onChangeText={setTitle} maxLength={200} />
      {target === 'weekend' ? (
        <>
          <DateField label={isTrip ? 'Когда едем (необязательно)' : 'Дата (необязательно)'} value={date} onChange={setDate} optional />
          {isTrip ? <DateField label="Возвращаемся (необязательно)" value={endDate} onChange={setEndDate} optional /> : null}
          <Input label={isTrip ? 'Город или регион' : 'Место'} value={place} onChangeText={setPlace} placeholder={isTrip ? 'Тбилиси, Казбеги' : 'Адрес, парк, город'} maxLength={200} />
        </>
      ) : null}
      <Input
        label={isTrip ? 'Ссылка на отель или билеты' : 'Ссылка (необязательно)'}
        value={url}
        onChangeText={setUrl}
        placeholder={isTrip ? 'booking.com, авиабилеты…' : 'Афиша, билеты, бронь…'}
        autoCapitalize="none"
        keyboardType="url"
      />
      <Input label="Заметка" value={note} onChangeText={setNote} multiline maxLength={2000} />
      <AttachmentEditor draft={draft} onChange={setDraft} color={st.fg} label="Билеты, брони, фото" />
      <ErrorNote text={error} />
    </Sheet>
  );
}

/* --------------------------- Отметки --------------------------- */

function MarkDoneSheet({
  state,
  onClose,
  onSaved,
  spaceId,
  userId,
  existing,
}: {
  state: MarkState | null;
  onClose: () => void;
  onSaved: () => void;
  spaceId: string;
  userId: string | null;
  existing: Attachment[];
}) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'rule');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<string | null>(todayISO());
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<AttachmentDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = state?.event ?? null;

  useEffect(() => {
    if (!state) return;
    setTitle(state.event?.title ?? state.title ?? '');
    setDate(state.event?.done_on ?? todayISO());
    setNote(state.event?.note ?? '');
    setError(null);
    // вложения подгружаются отдельно — при открытии берём то, что уже есть
    setDraft(emptyDraft(existing));
  }, [state]);

  async function save() {
    if (!state || !userId) return;
    if (!date) return setError('Укажи дату');
    setBusy(true);
    setError(null);
    let id = editing?.id ?? null;
    if (editing) {
      const { error: e } = await supabase.from('rule_events').update({ title: title.trim(), note: note.trim(), done_on: date }).eq('id', editing.id);
      if (e) {
        setBusy(false);
        return setError(humanError(e));
      }
    } else {
      const { data, error: e } = await supabase
        .from('rule_events')
        .insert({ space_id: spaceId, kind: state.kind, title: title.trim(), note: note.trim(), done_on: date, created_by: userId })
        .select('id')
        .single();
      if (e || !data) {
        setBusy(false);
        return setError(humanError(e));
      }
      id = (data as { id: string }).id;
    }
    const problem = id ? await commitAttachments(spaceId, userId, 'rule_event', id, draft) : null;
    setBusy(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    if (problem) Alert.alert('Сохранили, но…', problem);
    onSaved();
  }

  const meta = state ? RULE_META[state.kind] : null;
  return (
    <Sheet
      visible={!!state}
      onClose={onClose}
      title={meta ? (editing ? `${meta.emoji} ${editing.title}` : `${meta.emoji} ${meta.title}: было!`) : ''}
      footer={<Button title={editing ? 'Сохранить' : 'Отметить'} onPress={save} loading={busy} disabled={!title.trim()} color={st.fg} />}
    >
      {meta && !editing ? <Body muted style={{ marginBottom: 14 }}>{meta.hint}</Body> : null}
      <Input label="Что это было" value={title} onChangeText={setTitle} placeholder="Ужин в грузинском ресторане" maxLength={200} />
      <DateField label="Когда" value={date} onChange={setDate} />
      <Input label="Впечатления" value={note} onChangeText={setNote} placeholder="Что запомнилось" multiline maxLength={1000} />
      <AttachmentEditor draft={draft} onChange={setDraft} color={st.fg} label="Фото на память" allowFiles={false} allowLinks={false} />
      <Text style={{ color: c.textFaint, fontSize: 12, marginTop: -4, marginBottom: 12 }}>
        Фото хранятся в вашем общем пространстве — их видят только его участники.
      </Text>
      <ErrorNote text={error} />
    </Sheet>
  );
}

/* --------------------------- Свой ритм --------------------------- */

function RhythmSheet({
  visible,
  rhythm,
  start,
  onClose,
  onSave,
}: {
  visible: boolean;
  rhythm: RuleRhythm;
  start: string;
  onClose: () => void;
  onSave: (r: RuleRhythm, start: string) => Promise<void>;
}) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'rule');
  const [r, setR] = useState<RuleRhythm>(rhythm);
  const [startDate, setStartDate] = useState<string | null>(start);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setR(rhythm);
      setStartDate(start);
      setError(null);
    }
  }, [visible, rhythm, start]);

  const step = (kind: RuleKind, d: number) => {
    const lim = RHYTHM_LIMITS[kind];
    setR((x) => ({ ...x, [kind]: Math.max(lim.min, Math.min(lim.max, x[kind] + d)) }));
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Ваш ритм"
      footer={
        <Button
          title="Сохранить"
          color={st.fg}
          onPress={() => {
            if (!startDate) return setError('Укажи дату начала отсчёта');
            return onSave(r, startDate).catch((e) => setError(humanError(e)));
          }}
        />
      }
    >
      <Body muted style={{ marginBottom: 14 }}>
        2-2-2 — рекомендация психологов: свидание раз в 2 недели, новое место раз в 2 месяца, новая страна раз в 2 года. Подстройте под себя.
      </Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {RHYTHM_PRESETS.map((p) => (
          <Chip
            key={p.label}
            label={p.label === '2-2-2' ? '2-2-2 · рекомендуем' : p.label}
            active={rhythmLabel(r) === p.label}
            onPress={() => setR(p.rhythm)}
            color={st.fg}
          />
        ))}
      </View>
      {KINDS.map((kind) => (
        <Row key={kind} style={{ justifyContent: 'space-between', backgroundColor: c.bgAlt, borderRadius: radius.md, padding: 12, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>
              {RULE_META[kind].emoji} {RULE_META[kind].title}
            </Text>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{everyText(kind, r[kind])}</Text>
          </View>
          <Row gap={6}>
            <Stepper icon="remove" label={`Реже: ${RULE_META[kind].title}`} onPress={() => step(kind, -1)} disabled={r[kind] <= RHYTHM_LIMITS[kind].min} />
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 18, minWidth: 28, textAlign: 'center' }} accessibilityLabel={`${r[kind]} ${RULE_META[kind].unit(r[kind])}`}>
              {r[kind]}
            </Text>
            <Stepper icon="add" label={`Чаще: ${RULE_META[kind].title}`} onPress={() => step(kind, 1)} disabled={r[kind] >= RHYTHM_LIMITS[kind].max} />
          </Row>
        </Row>
      ))}
      <View style={{ height: 6 }} />
      <DateField label="Начало отсчёта" value={startDate} onChange={setStartDate} />
      <Text style={{ color: c.textFaint, fontSize: 12, marginTop: -4, marginBottom: 12 }}>
        Пока вы ничего не отметили, сроки считаются от этой даты. Потом — от последней отметки.
      </Text>
      <ErrorNote text={error} />
    </Sheet>
  );
}

function Stepper({ icon, label, onPress, disabled }: { icon: 'add' | 'remove'; label: string; onPress: () => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={c.text} />
    </Pressable>
  );
}
