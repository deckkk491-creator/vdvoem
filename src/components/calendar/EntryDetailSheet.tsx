import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { anniversaryLabel, daysUntilLabel, nextOccurrence, timeLabel, type Entry } from '../../hooks/useCalendar';
import { formatDate, hostOf, parseDate } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import type { Attachment, CalendarEvent, Item } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { useSpace } from '../../providers/SpaceProvider';
import { radius, useTheme } from '../../theme';
import { AttachmentStrip, useAttachmentsFor } from '../Attachments';
import { confirmDelete, openLink } from '../ItemCard';
import { AddedBy, Avatar, useNameOf } from '../people';
import { Body, Button, Label, Sheet } from '../ui';
import { kindStyle } from './EntryCards';

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

function longDate(iso: string): string {
  return `${formatDate(iso)}, ${WEEKDAYS[parseDate(iso).getDay()]}`;
}

/**
 * Карточка записи календаря: всё, что известно о событии, задаче, важной дате
 * или идее из «Выходных». Изменить или удалить — отсюда, по кнопке.
 */
export function EntryDetailSheet({
  entry,
  today,
  onClose,
  onEdit,
  onDelete,
  onTake,
  onRelease,
  onDone,
  onOpenWeekend,
}: {
  entry: Entry | null;
  today: string;
  onClose: () => void;
  onEdit: (ev: CalendarEvent) => void;
  onDelete: (ev: CalendarEvent) => void;
  onTake: (ev: CalendarEvent) => void;
  onRelease: (ev: CalendarEvent) => void;
  onDone: (ev: CalendarEvent, done: boolean) => void;
  onOpenWeekend?: () => void;
}) {
  const { c } = useTheme();
  const parentId = entry ? (entry.type === 'event' ? entry.event.id : entry.item.id) : null;
  const { byParent } = useAttachmentsFor(parentId ? [parentId] : []);
  const attachments = parentId ? byParent[parentId] : undefined;

  const title = !entry ? '' : entry.type === 'weekend' ? 'Из «Выходных»' : kindStyle(c, entry.event.kind).label;

  let footer: React.ReactNode = null;
  if (entry?.type === 'event') {
    const ev = entry.event;
    footer = (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Изменить" icon="create-outline" variant="secondary" onPress={() => onEdit(ev)} style={{ flex: 1 }} />
        <Button
          title="Удалить"
          icon="trash-outline"
          variant="danger"
          onPress={() => confirmDelete(ev.title, () => onDelete(ev))}
          style={{ flex: 1 }}
        />
      </View>
    );
  } else if (entry?.type === 'weekend' && onOpenWeekend) {
    footer = <Button title="Изменить в «Выходных»" icon="create-outline" variant="secondary" onPress={onOpenWeekend} />;
  }

  return (
    <Sheet visible={entry !== null} onClose={onClose} title={title} footer={footer}>
      {entry?.type === 'event' ? (
        <EventBody entry={entry} today={today} attachments={attachments} onTake={onTake} onRelease={onRelease} onDone={onDone} />
      ) : entry?.type === 'weekend' ? (
        <WeekendBody entry={entry} attachments={attachments} />
      ) : null}
    </Sheet>
  );
}

function Hero({ emoji, bg, caption, captionColor, title, done }: { emoji: string; bg: string; caption: string; captionColor: string; title: string; done?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
      <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 30 }}>{emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: captionColor }}>{caption}</Text>
        <Text
          style={{ fontSize: 22, fontWeight: '800', color: done ? c.textMuted : c.text, marginTop: 2, textDecorationLine: done ? 'line-through' : 'none' }}
          selectable
        >
          {title}
        </Text>
      </View>
    </View>
  );
}

function InfoRow({ icon, text, sub, color }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string; sub?: string; color?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 }}>
      <Ionicons name={icon} size={20} color={color ?? c.textMuted} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, color: c.text }}>{text}</Text>
        {sub ? <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 2 }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function LinkButton({ url, color }: { url: string; color: string }) {
  return <Button title={hostOf(url) || 'Открыть ссылку'} icon="link-outline" small variant="secondary" color={color} onPress={() => openLink(url)} style={{ alignSelf: 'flex-start', marginTop: 4 }} />;
}

function EventBody({
  entry,
  today,
  attachments,
  onTake,
  onRelease,
  onDone,
}: {
  entry: Extract<Entry, { type: 'event' }>;
  today: string;
  attachments?: Attachment[];
  onTake: (ev: CalendarEvent) => void;
  onRelease: (ev: CalendarEvent) => void;
  onDone: (ev: CalendarEvent, done: boolean) => void;
}) {
  const { c } = useTheme();
  const { userId } = useAuth();
  const { people } = useSpace();
  const nameOf = useNameOf();
  const ev = entry.event;
  const k = kindStyle(c, ev.kind);

  // Для ежегодной даты показываем день, который выбран в календаре, или ближайший
  const occ = ev.yearly ? entry.date || nextOccurrence(ev, today) : ev.starts_on;
  const anniv = occ ? anniversaryLabel(ev, occ, today) : null;

  return (
    <View>
      <Hero emoji={ev.emoji || k.emoji} bg={k.bg} caption={k.label} captionColor={k.fg} title={ev.title} done={ev.done} />

      <View style={{ backgroundColor: c.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: c.border, marginBottom: 14 }}>
        {occ ? (
          <InfoRow
            icon="calendar-outline"
            color={k.fg}
            text={longDate(occ)}
            sub={[daysUntilLabel(occ, today), ev.yearly ? 'каждый год' : '', anniv ?? ''].filter(Boolean).join(' · ')}
          />
        ) : ev.kind === 'task' ? (
          <InfoRow icon="calendar-outline" text="Без срока" />
        ) : null}
        {ev.kind === 'event' ? <InfoRow icon="time-outline" color={k.fg} text={timeLabel(ev)} /> : null}
        {ev.kind === 'task' ? (
          <InfoRow
            icon={ev.done ? 'checkmark-circle' : ev.assignee ? 'person-outline' : 'people-outline'}
            color={ev.done ? c.sage : k.fg}
            text={
              ev.done
                ? `Сделано · ${nameOf(ev.done_by, { you: 'ты' })}`
                : ev.assignee
                  ? ev.assignee === userId
                    ? 'Ты берёшь'
                    : `${nameOf(ev.assignee)} сделает`
                  : 'Общая · никто не взял'
            }
            sub={ev.done && ev.done_at ? formatDate(ev.done_at) : undefined}
          />
        ) : null}
      </View>

      {ev.kind === 'task' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {ev.done ? (
            <Button title="Вернуть в работу" small variant="secondary" icon="arrow-undo-outline" onPress={() => onDone(ev, false)} />
          ) : (
            <>
              <Button title="Сделано" small icon="checkmark" color={c.sage} onPress={() => onDone(ev, true)} />
              {!ev.assignee ? <Button title="Я сделаю" small icon="hand-right-outline" color={k.fg} onPress={() => onTake(ev)} /> : null}
              {ev.assignee === userId ? <Button title="Отказаться" small variant="secondary" onPress={() => onRelease(ev)} /> : null}
            </>
          )}
          {ev.assignee && !ev.done ? <Avatar profile={people[ev.assignee]} size={32} /> : null}
        </View>
      ) : null}

      {ev.note ? (
        <View style={{ marginBottom: 14 }}>
          <Label>Заметка</Label>
          <Body selectable>{ev.note}</Body>
        </View>
      ) : null}

      {ev.url ? (
        <View style={{ marginBottom: 14 }}>
          <Label>Ссылка</Label>
          <LinkButton url={ev.url} color={k.fg} />
        </View>
      ) : null}

      {attachments?.length ? (
        <View style={{ marginBottom: 14 }}>
          <Label>Фото и файлы</Label>
          <AttachmentStrip attachments={attachments} size={96} />
        </View>
      ) : null}

      <View style={{ marginTop: 6 }}>
        <AddedBy userId={ev.created_by} date={`добавлено ${formatDate(ev.created_at)}`} />
      </View>
    </View>
  );
}

type WeekendFull = Pick<Item, 'id' | 'title' | 'note' | 'url' | 'image_url' | 'place' | 'category' | 'event_date' | 'end_date' | 'done' | 'created_by' | 'created_at'>;

function WeekendBody({ entry, attachments }: { entry: Extract<Entry, { type: 'weekend' }>; attachments?: Attachment[] }) {
  const { c } = useTheme();
  const k = kindStyle(c, 'weekend');
  const [full, setFull] = useState<WeekendFull | null>(null);
  const id = entry.item.id;

  useEffect(() => {
    let alive = true;
    setFull(null);
    supabase
      .from('items')
      .select('id, title, note, url, image_url, place, category, event_date, end_date, done, created_by, created_at')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data) setFull(data as WeekendFull);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const it = full ?? { ...entry.item, note: '', url: null, image_url: null, place: null, created_by: null, created_at: '' };
  const start = it.event_date?.slice(0, 10) ?? null;
  const end = it.end_date?.slice(0, 10) ?? null;

  return (
    <View>
      {it.image_url ? (
        <Image source={{ uri: it.image_url }} style={{ width: '100%', height: 190, borderRadius: radius.md, backgroundColor: c.bgAlt, marginBottom: 14 }} contentFit="cover" transition={150} />
      ) : null}
      <Hero emoji={k.emoji} bg={k.bg} caption={[it.category, it.done ? 'сходили' : ''].filter(Boolean).join(' · ') || 'Идея на выходные'} captionColor={k.fg} title={it.title} />
      <View style={{ backgroundColor: c.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: c.border, marginBottom: 14 }}>
        {start ? <InfoRow icon="calendar-outline" color={k.fg} text={end && end !== start ? `${formatDate(start)} — ${formatDate(end)}` : longDate(start)} /> : null}
        {it.place ? <InfoRow icon="location-outline" color={k.fg} text={it.place} /> : null}
      </View>
      {it.note ? (
        <View style={{ marginBottom: 14 }}>
          <Label>Заметка</Label>
          <Body selectable>{it.note}</Body>
        </View>
      ) : null}
      {it.url ? (
        <View style={{ marginBottom: 14 }}>
          <Label>Ссылка</Label>
          <LinkButton url={it.url} color={k.fg} />
        </View>
      ) : null}
      {attachments?.length ? (
        <View style={{ marginBottom: 14 }}>
          <Label>Фото и файлы</Label>
          <AttachmentStrip attachments={attachments} size={96} />
        </View>
      ) : null}
      {full?.created_by ? <AddedBy userId={full.created_by} date={`добавлено ${formatDate(full.created_at)}`} /> : null}
    </View>
  );
}
