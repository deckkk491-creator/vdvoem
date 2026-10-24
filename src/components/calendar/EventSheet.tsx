import React, { useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { hhmm, type EventInput } from '../../hooks/useCalendar';
import { commitAttachments, draftIsDirty, emptyDraft, loadAttachments, type AttachmentDraft } from '../../lib/files';
import { normalizeUrl, todayISO } from '../../lib/format';
import { humanError } from '../../lib/supabase';
import type { CalendarEvent, CalendarKind } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { useSpace } from '../../providers/SpaceProvider';
import { useTheme } from '../../theme';
import { AttachmentEditor } from '../Attachments';
import { DateField, TimeField } from '../DateField';
import { confirmDelete } from '../ItemCard';
import { Avatar } from '../people';
import { Body, Button, Chip, ErrorNote, Input, Label, Row, Segmented, Sheet } from '../ui';
import { kindStyle } from './EntryCards';

const EMOJI: Record<CalendarKind, string[]> = {
  event: ['🎬', '✈️', '🍽️', '🎉', '🎟️', '🚆', '🏥', '💼'],
  task: ['🐱', '🛒', '🧹', '💊', '📦', '🔧', '💳', '📞'],
  date: ['💞', '💍', '🎂', '🌹', '🏠', '🐾', '🎓', '✨'],
};

const KIND_OPTIONS: { value: CalendarKind; label: string }[] = [
  { value: 'event', label: 'Событие' },
  { value: 'task', label: 'Задача' },
  { value: 'date', label: 'Важная дата' },
];

const PLACEHOLDER: Record<CalendarKind, string> = {
  event: 'Кино «Дюна», рейс в Казань…',
  task: 'Отнести кошку к ветеринару',
  date: 'День знакомства',
};

/**
 * Форма события, задачи или важной даты. Сама сохраняет вложения после записи.
 * event = null — новая запись.
 */
export function EventSheet({
  visible,
  event,
  initialKind = 'event',
  initialDate = null,
  fixedKind,
  onClose,
  save,
  remove,
  onSaved,
}: {
  visible: boolean;
  event: CalendarEvent | null;
  initialKind?: CalendarKind;
  initialDate?: string | null;
  /** Тип нельзя переключить (экран «Важные даты») */
  fixedKind?: CalendarKind;
  onClose: () => void;
  save: (input: EventInput, id?: string) => Promise<string>;
  remove: (ev: CalendarEvent) => Promise<void>;
  onSaved?: () => void;
}) {
  const { c } = useTheme();
  const { space, members, people } = useSpace();
  const { userId } = useAuth();

  const [kind, setKind] = useState<CalendarKind>('event');
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [yearly, setYearly] = useState(true);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [url, setUrl] = useState('');
  const [draft, setDraft] = useState<AttachmentDraft>(emptyDraft());
  const [attLoading, setAttLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Заполняем форму при каждом открытии
  useEffect(() => {
    if (!visible) return;
    const k = fixedKind ?? event?.kind ?? initialKind;
    setKind(k);
    setTitle(event?.title ?? '');
    setEmoji(event?.emoji ?? null);
    setDate(event ? event.starts_on : initialDate ?? (k === 'task' ? null : todayISO()));
    setStart(hhmm(event?.start_time));
    setEnd(hhmm(event?.end_time));
    setYearly(event ? event.yearly : true);
    setAssignee(event?.assignee ?? null);
    setNote(event?.note ?? '');
    setUrl(event?.url ?? '');
    setDraft(emptyDraft());
    setError(null);
    setBusy(false);
  }, [visible, event, fixedKind, initialKind, initialDate]);

  // Уже прикреплённые фото, файлы и ссылки
  const eventId = visible ? event?.id ?? null : null;
  useEffect(() => {
    if (!eventId) {
      setAttLoading(false);
      return;
    }
    let alive = true;
    setAttLoading(true);
    loadAttachments([eventId])
      .then((list) => {
        // добавленное за время загрузки не теряем
        if (alive) setDraft((d) => ({ ...d, existing: list }));
      })
      .catch((e) => alive && setError(humanError(e)))
      .finally(() => alive && setAttLoading(false));
    return () => {
      alive = false;
    };
  }, [eventId]);

  const st = kindStyle(c, kind);
  const others = members.filter((m) => m.user_id !== userId);
  const quick = EMOJI[kind];
  const emojiChoices = emoji && !quick.includes(emoji) ? [emoji, ...quick] : quick;

  const changeKind = (k: CalendarKind) => {
    setKind(k);
    // у события и важной даты дата обязательна
    if (k !== 'task' && !date) setDate(todayISO());
  };

  async function submit() {
    const t = title.trim();
    if (!t) return setError('Напиши название');
    const link = url.trim() ? normalizeUrl(url) : null;
    if (url.trim() && !link) return setError('Ссылка выглядит неправильно');
    if (kind !== 'task' && !date) return setError('Выбери дату');
    const s = kind === 'event' ? start : null;
    const e = kind === 'event' && start ? end : null;
    if (s && e && e <= s) return setError('Конец должен быть позже начала');
    if (!space || !userId) return setError('Нет пространства');

    const input: EventInput = {
      kind,
      title: t,
      note: note.trim(),
      url: link,
      emoji: emoji || null,
      starts_on: date,
      start_time: s,
      end_time: e,
      yearly: kind === 'date' ? yearly : false,
      assignee: kind === 'task' ? assignee : null,
    };
    setBusy(true);
    setError(null);
    try {
      const id = await save(input, event?.id);
      if (draftIsDirty(draft)) {
        const problem = await commitAttachments(space.id, userId, 'event', id, draft);
        if (problem) Alert.alert('Вложения', problem);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(humanError(err));
    } finally {
      setBusy(false);
    }
  }

  function askDelete() {
    if (!event) return;
    confirmDelete(event.title, () => {
      setBusy(true);
      remove(event)
        .then(() => onClose())
        .catch((err) => setError(humanError(err)))
        .finally(() => setBusy(false));
    });
  }

  const titleText = event
    ? kind === 'task'
      ? 'Задача'
      : kind === 'date'
        ? 'Важная дата'
        : 'Событие'
    : kind === 'task'
      ? 'Новая задача'
      : kind === 'date'
        ? 'Новая важная дата'
        : 'Новое событие';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={titleText}
      footer={<Button title={event ? 'Сохранить' : 'Добавить'} onPress={submit} loading={busy} disabled={!title.trim()} color={st.fg} />}
    >
      {fixedKind ? null : (
        <View style={{ marginBottom: 16 }}>
          <Segmented options={KIND_OPTIONS} value={kind} onChange={changeKind} />
        </View>
      )}

      <Input
        label={kind === 'task' ? 'Что сделать' : 'Название'}
        value={title}
        onChangeText={setTitle}
        placeholder={PLACEHOLDER[kind]}
        maxLength={200}
        returnKeyType="done"
      />

      <Label>Значок</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <Chip label="Без значка" active={!emoji} onPress={() => setEmoji(null)} color={st.fg} />
        {emojiChoices.map((e) => (
          <Chip key={e} label={e} active={emoji === e} onPress={() => setEmoji(emoji === e ? null : e)} color={st.fg} />
        ))}
      </View>

      <DateField
        label={kind === 'task' ? 'Срок (необязательно)' : 'Дата'}
        value={date}
        onChange={setDate}
        optional={kind === 'task'}
        placeholder={kind === 'task' ? 'Без срока' : 'Выбрать дату'}
      />

      {kind === 'event' ? (
        <>
          <TimeField
            label="Начало"
            value={start}
            onChange={(v) => {
              setStart(v);
              if (!v) setEnd(null);
            }}
          />
          {start ? <TimeField label="Конец (необязательно)" value={end} onChange={setEnd} placeholder="Не указан" /> : null}
        </>
      ) : null}

      {kind === 'date' ? (
        <Row style={{ justifyContent: 'space-between', marginBottom: 16, minHeight: 44 }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: c.text }}>Повторять каждый год</Text>
            <Body muted style={{ fontSize: 13, marginTop: 2 }}>
              Укажи настоящий год — покажем, какая это годовщина
            </Body>
          </View>
          <Switch
            value={yearly}
            onValueChange={setYearly}
            trackColor={{ true: st.fg, false: c.border }}
            ios_backgroundColor={c.border}
            accessibilityLabel="Повторять каждый год"
          />
        </Row>
      ) : null}

      {kind === 'task' ? (
        <>
          <Label>Кто сделает</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
            <Chip label="Общая" icon="people-outline" active={!assignee} onPress={() => setAssignee(null)} color={st.fg} />
            {userId ? <Chip label="Я" active={assignee === userId} onPress={() => setAssignee(userId)} color={st.fg} /> : null}
            {others.map((m) => (
              <Chip
                key={m.user_id}
                label={people[m.user_id]?.display_name || 'Партнёр'}
                active={assignee === m.user_id}
                onPress={() => setAssignee(m.user_id)}
                color={st.fg}
              />
            ))}
          </View>
          {assignee && assignee !== userId ? (
            <Row style={{ marginBottom: 6 }}>
              <Avatar profile={people[assignee]} size={20} />
              <Body muted style={{ fontSize: 13, flex: 1 }}>
                Задача сразу будет на {people[assignee]?.display_name || 'партнёре'} — отказаться можно в любой момент
              </Body>
            </Row>
          ) : null}
          <Body muted style={{ fontSize: 13, marginBottom: 16 }}>
            Общую задачу видят все — кто сможет, нажмёт «Я сделаю».
          </Body>
        </>
      ) : null}

      <Input
        label="Заметка"
        value={note}
        onChangeText={setNote}
        multiline
        placeholder={kind === 'event' ? 'Адрес, места, номер брони…' : 'Детали'}
        maxLength={2000}
      />
      <Input
        label="Ссылка (необязательно)"
        value={url}
        onChangeText={setUrl}
        placeholder="Билеты, бронь, страница события"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        maxLength={2000}
      />

      <AttachmentEditor draft={draft} onChange={setDraft} color={st.fg} label="Фото, файлы и ссылки" />
      {attLoading ? (
        <Body faint style={{ fontSize: 13, marginTop: 4 }}>
          Загружаю вложения…
        </Body>
      ) : null}
      <Body faint style={{ fontSize: 13, marginTop: 4, marginBottom: 12 }}>
        Например, билеты в кино или посадочный на самолёт — PDF или фото.
      </Body>

      <ErrorNote text={error} />
      {event ? <Button title="Удалить" variant="danger" icon="trash-outline" onPress={askDelete} disabled={busy} /> : null}
    </Sheet>
  );
}
