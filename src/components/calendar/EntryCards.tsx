import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { anniversaryLabel, timeLabel, type Entry } from '../../hooks/useCalendar';
import { formatDate, hostOf, parseDate, relativeDays } from '../../lib/format';
import type { Attachment, CalendarEvent, CalendarKind } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { useSpace } from '../../providers/SpaceProvider';
import { type Palette, useTheme } from '../../theme';
import { AttachmentStrip, useAttachmentSummary } from '../Attachments';
import { Badge, openLink } from '../ItemCard';
import { Avatar, useNameOf } from '../people';
import { Button, Card } from '../ui';

export type EntryKind = CalendarKind | 'weekend';

/** Цвет, подпись и эмодзи по умолчанию для каждого вида записей */
export function kindStyle(c: Palette, kind: EntryKind): { fg: string; bg: string; label: string; emoji: string } {
  switch (kind) {
    case 'event':
      return { fg: c.sky, bg: c.skySoft, label: 'Событие', emoji: '📌' };
    case 'task':
      return { fg: c.honey, bg: c.honeySoft, label: 'Задача', emoji: '✅' };
    case 'date':
      return { fg: c.plum, bg: c.plumSoft, label: 'Важная дата', emoji: '💞' };
    case 'weekend':
      return { fg: c.sage, bg: c.sageSoft, label: 'Выходные', emoji: '🌿' };
  }
}

function EmojiBubble({ emoji, bg }: { emoji: string; bg: string }) {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
    </View>
  );
}

function LinkRow({ url, color }: { url: string; color: string }) {
  return (
    <Pressable
      onPress={() => openLink(url)}
      hitSlop={10}
      accessibilityRole="link"
      accessibilityLabel={`Открыть ссылку ${hostOf(url)}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-start', minHeight: 28 }}
    >
      <Ionicons name="link-outline" size={15} color={color} />
      <Text style={{ color, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
        {hostOf(url) || 'Ссылка'}
      </Text>
    </Pressable>
  );
}

/** Круглая галочка задачи (44×44 по области нажатия) */
function DoneToggle({ done, color, onPress }: { done: boolean; color: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={done ? 'Вернуть задачу в работу' : 'Отметить задачу сделанной'}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={28} color={done ? c.sage : color} />
    </Pressable>
  );
}

/** Карточка записи в списке дня и в «Скоро» */
export function AgendaCard({
  entry,
  attachments,
  today,
  showDate,
  onPress,
  onLongPress,
  onToggleDone,
}: {
  entry: Entry;
  attachments?: Attachment[];
  today: string;
  /** Показать дату (для списка «Скоро») */
  showDate?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onToggleDone?: () => void;
}) {
  const { c } = useTheme();
  const { people } = useSpace();
  const summary = useAttachmentSummary(attachments);

  if (entry.type === 'weekend') {
    const k = kindStyle(c, 'weekend');
    return (
      <Card onPress={onPress} style={{ marginBottom: 10, padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <EmojiBubble emoji={k.emoji} bg={k.bg} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: k.fg }} numberOfLines={1}>
              {showDate ? `${formatDate(entry.date)} · ` : ''}Из «Выходных»{entry.item.done ? ' · сходили' : ''}
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.text, marginTop: 2 }} numberOfLines={2}>
              {entry.item.title}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
        </View>
      </Card>
    );
  }

  const ev = entry.event;
  const k = kindStyle(c, ev.kind);
  const isTask = ev.kind === 'task';
  const caption = [
    showDate ? formatDate(entry.date) : '',
    ev.kind === 'event' ? timeLabel(ev) : k.label,
    ev.kind === 'date' ? anniversaryLabel(ev, entry.date, today) ?? '' : '',
    summary ? `📎 ${summary}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card onPress={onPress} onLongPress={onLongPress} style={{ marginBottom: 10, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <EmojiBubble emoji={ev.emoji || k.emoji} bg={k.bg} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: k.fg }} numberOfLines={2}>
            {caption}
          </Text>
          <Text
            style={{
              fontSize: 16,
              fontWeight: '700',
              color: ev.done ? c.textMuted : c.text,
              marginTop: 2,
              textDecorationLine: ev.done ? 'line-through' : 'none',
            }}
            numberOfLines={3}
          >
            {ev.title}
          </Text>
          {ev.note ? (
            <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4, lineHeight: 19 }} numberOfLines={2}>
              {ev.note}
            </Text>
          ) : null}
          {ev.url ? <LinkRow url={ev.url} color={k.fg} /> : null}
          {attachments?.length ? (
            <View style={{ marginTop: 8 }}>
              <AttachmentStrip attachments={attachments} size={56} interactive={false} />
            </View>
          ) : null}
        </View>
        {isTask ? (
          <View style={{ alignItems: 'center' }}>
            {onToggleDone ? <DoneToggle done={ev.done} color={k.fg} onPress={onToggleDone} /> : null}
            {ev.assignee && !ev.done ? <Avatar profile={people[ev.assignee]} size={24} /> : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

/** Карточка задачи: кто берёт, «Я сделаю», «Сделано», «Отказаться» */
export function TaskCard({
  task,
  attachments,
  onPress,
  onLongPress,
  onTake,
  onRelease,
  onDone,
}: {
  task: CalendarEvent;
  attachments?: Attachment[];
  onPress: () => void;
  onLongPress: () => void;
  onTake: () => void;
  onRelease: () => void;
  onDone: (done: boolean) => void;
}) {
  const { c } = useTheme();
  const { userId } = useAuth();
  const { people } = useSpace();
  const nameOf = useNameOf();
  const k = kindStyle(c, 'task');
  const mine = !!userId && task.assignee === userId;
  const partner = task.assignee && !mine ? task.assignee : null;

  let status: React.ReactNode;
  let actions: React.ReactNode;
  if (task.done) {
    status = (
      <Row2>
        <Ionicons name="checkmark-circle" size={18} color={c.sage} />
        <Text style={{ color: c.sage, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
          Сделано · {nameOf(task.done_by, { you: 'ты' })}
        </Text>
      </Row2>
    );
    actions = <Button title="Вернуть" small variant="secondary" icon="arrow-undo-outline" onPress={() => onDone(false)} />;
  } else if (mine) {
    status = (
      <Row2>
        <Avatar profile={userId ? people[userId] : null} size={22} />
        <Text style={{ color: k.fg, fontWeight: '700', fontSize: 14 }}>Ты берёшь</Text>
      </Row2>
    );
    actions = (
      <>
        <Button title="Сделано" small icon="checkmark" color={c.sage} onPress={() => onDone(true)} />
        <Button title="Отказаться" small variant="secondary" onPress={onRelease} />
      </>
    );
  } else if (partner) {
    status = (
      <Row2>
        <Avatar profile={people[partner]} size={22} />
        <Text style={{ color: k.fg, fontWeight: '700', fontSize: 14, flexShrink: 1 }} numberOfLines={1}>
          {nameOf(partner)} сделает
        </Text>
      </Row2>
    );
    actions = <Button title="Сделано" small variant="secondary" icon="checkmark" onPress={() => onDone(true)} />;
  } else {
    status = (
      <Row2>
        <Ionicons name="people-outline" size={18} color={c.textMuted} />
        <Text style={{ color: c.textMuted, fontWeight: '600', fontSize: 14 }}>Общая · никто не взял</Text>
      </Row2>
    );
    actions = (
      <>
        <Button title="Я сделаю" small icon="hand-right-outline" color={k.fg} onPress={onTake} />
        <Button title="Сделано" small variant="secondary" icon="checkmark" onPress={() => onDone(true)} />
      </>
    );
  }

  const overdue = !task.done && !!task.starts_on && parseDate(task.starts_on).getTime() < new Date().setHours(0, 0, 0, 0);

  return (
    <Card onPress={onPress} onLongPress={onLongPress} style={{ marginBottom: 12, padding: 14, opacity: task.done ? 0.8 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <EmojiBubble emoji={task.emoji || k.emoji} bg={k.bg} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {task.starts_on ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
              <Badge
                label={`📅 ${formatDate(task.starts_on)} · ${relativeDays(parseDate(task.starts_on))}`}
                color={overdue ? c.danger : c.textMuted}
                bg={overdue ? c.dangerSoft : c.bgAlt}
              />
            </View>
          ) : null}
          <Text
            style={{
              fontSize: 17,
              fontWeight: '700',
              lineHeight: 22,
              color: task.done ? c.textMuted : c.text,
              textDecorationLine: task.done ? 'line-through' : 'none',
            }}
          >
            {task.title}
          </Text>
          {task.note ? (
            <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4, lineHeight: 19 }} numberOfLines={4}>
              {task.note}
            </Text>
          ) : null}
          {task.url ? <LinkRow url={task.url} color={k.fg} /> : null}
          {attachments?.length ? (
            <View style={{ marginTop: 8 }}>
              <AttachmentStrip attachments={attachments} size={56} interactive={false} />
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderColor: c.border, gap: 8 }}>
        {status}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{actions}</View>
      </View>
    </Card>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 }}>{children}</View>;
}
