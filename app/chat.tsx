/*
 * Чат пространства: личные сообщения партнёру (или всей семье) с историей,
 * фото и документами. Данные — в useMessages.
 *
 * Push-уведомления о новых сообщениях пока не сделаны (нужна development-сборка + APNs);
 * в приложении непрочитанные видны по значку (useUnreadCount).
 */
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, Stack, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Linking, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhotoViewer, openStoredFile } from '../src/components/Attachments';
import { AppBackground } from '../src/components/AppBackground';
import { ChatEmpty } from '../src/components/chat/ChatEmpty';
import { Composer, type ComposerHandle } from '../src/components/chat/Composer';
import { DaySeparator, MessageBubble } from '../src/components/chat/MessageBubble';
import { useNameOf } from '../src/components/people';
import { EmptyState, ErrorNote, Loading } from '../src/components/ui';
import { isImageMessage, timeOf, useMessages, type ChatItem } from '../src/hooks/useMessages';
import { useReactions } from '../src/hooks/useReactions';
import { MessageMenu, type MenuAction } from '../src/components/chat/MessageMenu';
import { formatClock, isVoiceMessage, voiceDurationMs } from '../src/components/chat/Voice';
import { markChatRead } from '../src/hooks/useUnread';
import { useSignedUrls, type LocalFile } from '../src/lib/files';
import { formatDate, toISODate } from '../src/lib/format';
import { humanError } from '../src/lib/supabase';
import type { Profile } from '../src/lib/types';
import { useAuth } from '../src/providers/AuthProvider';
import { useSpace } from '../src/providers/SpaceProvider';
import { useTheme } from '../src/theme';

/** Куда уходят жалобы на сообщения */
const SUPPORT_EMAIL = 'deckkk491@gmail.com';

/** Сообщения одного человека с паузой меньше 5 минут собираются в группу */
const GROUP_GAP_MS = 5 * 60 * 1000;

type Row =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'msg';
      key: string;
      item: ChatItem;
      mine: boolean;
      firstInGroup: boolean;
      lastInGroup: boolean;
      sender: Profile | null;
      senderName: string | null;
      imageUrl: string | null;
      receipt: 'read' | 'delivered' | null;
    };

const dayKey = (iso: string) => toISODate(new Date(iso));

function dayLabel(key: string): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (key === toISODate(today)) return 'Сегодня';
  if (key === toISODate(yesterday)) return 'Вчера';
  return formatDate(key);
}

function sameGroup(a: ChatItem, b: ChatItem | undefined): boolean {
  return (
    !!b &&
    a.sender_id === b.sender_id &&
    dayKey(a.created_at) === dayKey(b.created_at) &&
    Math.abs(timeOf(a.created_at) - timeOf(b.created_at)) < GROUP_GAP_MS
  );
}

/** Клавиатура открыта? (нижний отступ под «чёлкой» нужен только без неё) */
function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEv, () => setShown(true));
    const b = Keyboard.addListener(hideEv, () => setShown(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return shown;
}

/** Меню действий: ActionSheet на iOS, Alert на Android (там не больше трёх кнопок) */
function showActions(title: string | undefined, actions: { text: string; destructive?: boolean; onPress: () => void }[]) {
  if (!actions.length) return;
  if (Platform.OS === 'ios') {
    const destructive = actions.findIndex((a) => a.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...actions.map((a) => a.text), 'Отмена'],
        cancelButtonIndex: actions.length,
        destructiveButtonIndex: destructive >= 0 ? destructive : undefined,
      },
      (i) => {
        if (i < actions.length) actions[i].onPress();
      },
    );
  } else {
    Alert.alert(
      title ?? 'Сообщение',
      undefined,
      [...actions.slice(0, 2).map((a) => ({ text: a.text, style: a.destructive ? ('destructive' as const) : ('default' as const), onPress: a.onPress })), { text: 'Отмена', style: 'cancel' as const }],
      { cancelable: true },
    );
  }
}

export default function ChatScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { space, members, people, refresh: refreshSpace, leaveSpace } = useSpace();
  const { userId } = useAuth();
  const nameOf = useNameOf();
  const keyboardShown = useKeyboardShown();
  const chat = useMessages();
  const { items, loading, error, retry, hasOlder, loadingOlder, loadOlder, send, retrySend, discard, remove, receipt, latestIncomingId, previewUri } = chat;
  const spaceId = space?.id ?? null;
  const serverIds = useMemo(() => items.filter((m) => !m.local).map((m) => m.id), [items]);
  const { byMessage, myReaction, react } = useReactions(spaceId, serverIds);
  const [menuFor, setMenuFor] = useState<ChatItem | null>(null);

  const list = useRef<FlatList<Row>>(null);
  const composer = useRef<ComposerHandle>(null);
  const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null);

  // Закрываем просмотр фото при смене пространства
  useEffect(() => {
    setViewer(null);
    setMenuFor(null);
  }, [spaceId]);

  /* ------------------------- Заголовок ------------------------- */

  const others = useMemo(() => members.filter((m) => m.user_id !== userId), [members, userId]);
  const title = others.length === 1 ? people[others[0].user_id]?.display_name || 'Чат' : space?.name || 'Чат';
  const groupChat = others.length > 1;

  /* ------------------------- Прочитано ------------------------- */

  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  // Отмечаем прочитанным при открытии экрана и когда приходит новое сообщение от партнёра
  useEffect(() => {
    if (!focused || !spaceId || !userId) return;
    markChatRead(spaceId, userId).catch(() => undefined);
  }, [focused, spaceId, userId, latestIncomingId]);

  /* ------------------------- Фото ------------------------- */

  const photoPaths = useMemo(
    () => items.filter((m) => !m.local && m.attachment_path && isImageMessage(m)).map((m) => m.attachment_path as string),
    [items],
  );
  const voicePaths = useMemo(
    () => items.filter((m) => !m.local && m.attachment_path && isVoiceMessage(m)).map((m) => m.attachment_path as string),
    [items],
  );
  const mediaPaths = useMemo(() => [...photoPaths, ...voicePaths], [photoPaths, voicePaths]);
  const urls = useSignedUrls(mediaPaths);

  /* ------------------------- Строки списка ------------------------- */

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (let i = 0; i < items.length; i++) {
      const m = items[i];
      const newer = i > 0 ? items[i - 1] : undefined;
      const older = items[i + 1];
      const mine = m.sender_id === userId;
      const firstInGroup = !sameGroup(m, older);
      out.push({
        kind: 'msg',
        key: m.id,
        item: m,
        mine,
        firstInGroup,
        lastInGroup: !sameGroup(m, newer),
        sender: people[m.sender_id] ?? null,
        senderName: groupChat && !mine && firstInGroup ? nameOf(m.sender_id) : null,
        // Только что отправленное фото показываем из локального файла — без повторной загрузки и мигания
        imageUrl: previewUri(m.id) ?? (m.attachment_path ? urls[m.attachment_path] ?? null : null),
        receipt: others.length && receipt && receipt.messageId === m.id ? (receipt.read ? 'read' : 'delivered') : null,
      });
      // Список перевёрнут: разделитель дня идёт после сообщения в массиве — значит, над ним на экране
      const key = dayKey(m.created_at);
      if (!older || dayKey(older.created_at) !== key) out.push({ kind: 'day', key: `day-${key}`, label: dayLabel(key) });
    }
    return out;
    // nameOf зависит только от people и userId — они уже в зависимостях
  }, [items, userId, people, groupChat, urls, receipt, others.length, previewUri]);

  /* ------------------------- Действия ------------------------- */

  const openPhoto = useCallback(
    (m: ChatItem) => {
      const u = m.attachment_path ? urls[m.attachment_path] : undefined;
      if (!u) return;
      // Все фото чата по порядку: от старых к новым
      const all = [...photoPaths].reverse().map((p) => urls[p]).filter((x): x is string => !!x);
      const index = all.indexOf(u);
      setViewer(index >= 0 ? { urls: all, index } : { urls: [u], index: 0 });
    },
    [urls, photoPaths],
  );

  const confirmDelete = useCallback(
    (m: ChatItem) => {
      Alert.alert('Удалить сообщение?', 'Оно пропадёт у всех в чате.', [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            remove(m).catch((e: unknown) => Alert.alert('Не получилось удалить', humanError(e)));
          },
        },
      ]);
    },
    [remove],
  );

  const copy = useCallback((m: ChatItem) => {
    Clipboard.setStringAsync(m.body)
      .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
      .catch(() => undefined);
  }, []);

  const report = useCallback(
    (m: ChatItem) => {
      const body = [
        'Жалоба на сообщение в «Вместе»',
        `Пространство: ${spaceId ?? '—'}`,
        `Сообщение: ${m.id}`,
        `Отправитель: ${m.sender_id}`,
        `Время: ${m.created_at}`,
        `Текст: ${m.body || '(вложение)'}`,
        '',
        'Что случилось:',
      ].join('\n');
      const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Жалоба на сообщение')}&body=${encodeURIComponent(body)}`;
      Linking.openURL(url).catch(() =>
        Alert.alert('Не получилось открыть почту', `Напиши на ${SUPPORT_EMAIL} — разберёмся в течение суток. Если общение неприятно, можно выйти из пространства в настройках.`),
      );
    },
    [spaceId],
  );

  const confirmLeave = useCallback(() => {
    Alert.alert(
      'Выйти из пространства?',
      'Ты перестанешь видеть общие записи и чат этого пространства. Вернуться можно только по коду приглашения.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: () => {
            leaveSpace()
              .then(() => router.replace('/(tabs)/calendar'))
              .catch((e: unknown) => Alert.alert('Не получилось выйти', humanError(e)));
          },
        },
      ],
    );
  }, [leaveSpace]);

  const onPress = useCallback(
    (m: ChatItem) => {
      if (m.local) {
        if (m.local.status === 'failed') retrySend(m.id);
        return;
      }
      if (isImageMessage(m)) openPhoto(m);
      // Голосовое играет кнопка в самом пузыре
      else if (m.attachment_path && !isVoiceMessage(m)) openStoredFile(m.attachment_path).catch(() => undefined);
    },
    [retrySend, openPhoto],
  );

  const onLongPress = useCallback(
    (m: ChatItem) => {
      if (m.local) {
        if (m.local.status !== 'failed') return;
        Haptics.selectionAsync().catch(() => undefined);
        showActions('Сообщение не отправлено', [
          { text: 'Отправить ещё раз', onPress: () => retrySend(m.id) },
          { text: 'Удалить', destructive: true, onPress: () => discard(m.id) },
        ]);
        return;
      }
      Haptics.selectionAsync().catch(() => undefined);
      setMenuFor(m);
    },
    [retrySend, discard],
  );

  const menuActions = useMemo<MenuAction[]>(() => {
    const m = menuFor;
    if (!m) return [];
    const out: MenuAction[] = [];
    if (m.body.trim()) out.push({ text: 'Скопировать', icon: 'copy-outline', onPress: () => copy(m) });
    if (m.sender_id === userId) out.push({ text: 'Удалить', icon: 'trash-outline', destructive: true, onPress: () => confirmDelete(m) });
    // Жалоба разработчику и выход из пространства (App Store Guideline 1.2: пожаловаться и заблокировать)
    else {
      out.push({ text: 'Пожаловаться', icon: 'flag-outline', onPress: () => report(m) });
      out.push({ text: 'Выйти из пространства', icon: 'exit-outline', destructive: true, onPress: () => confirmLeave() });
    }
    return out;
  }, [menuFor, userId, copy, confirmDelete, report, confirmLeave]);

  const menuPreview = (m: ChatItem | null): string => {
    if (!m) return '';
    if (m.body.trim()) return m.body;
    if (isImageMessage(m)) return '📷 Фото';
    if (isVoiceMessage(m)) {
      const ms = voiceDurationMs(m.attachment_name);
      return `🎤 Голосовое${ms ? ` · ${formatClock(ms)}` : ''}`;
    }
    return m.attachment_name ? `📎 ${m.attachment_name}` : '';
  };

  const onReact = useCallback((m: ChatItem, emoji: string) => {
    if (m.local) return;
    react(m.id, emoji);
  }, [react]);

  const onSend = useCallback(
    (text: string, files: LocalFile[]) => {
      const ok = send(text, files);
      if (ok) requestAnimationFrame(() => list.current?.scrollToOffset({ offset: 0, animated: true }));
      return ok;
    },
    [send],
  );

  const renderItem = useCallback(
    ({ item: row }: { item: Row }) =>
      row.kind === 'day' ? (
        <DaySeparator label={row.label} />
      ) : (
        <MessageBubble
          item={row.item}
          mine={row.mine}
          firstInGroup={row.firstInGroup}
          lastInGroup={row.lastInGroup}
          sender={row.sender}
          senderName={row.senderName}
          imageUrl={row.imageUrl}
          receipt={row.receipt}
          onPress={onPress}
          onLongPress={onLongPress}
          reactions={byMessage[row.item.id]}
          onReact={onReact}
        />
      ),
    [onPress, onLongPress, byMessage, onReact],
  );

  /* ------------------------- Экран ------------------------- */

  const header = <Stack.Screen options={{ title }} />;

  if (!space) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {header}
        <EmptyState emoji="💬" title="Пока нет пространства" text="Создай пространство или присоединись к партнёру — и здесь появится ваш чат." />
      </View>
    );
  }

  if (!members.length) {
    // Участники ещё грузятся — или загрузка не удалась (тогда даём повторить, а не крутим вечно)
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {header}
        {loading ? (
          <Loading />
        ) : (
          <View style={{ padding: 16 }}>
            <ErrorNote text="Не получилось загрузить участников. Проверь интернет." onRetry={() => refreshSpace()} />
          </View>
        )}
      </View>
    );
  }

  if (members.length === 1 && !items.length && !loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {header}
        <EmptyState
          emoji="💌"
          title="Пока не с кем переписываться"
          text="Сначала пригласи партнёра: отправь ему код приглашения из настроек. Как только он присоединится, здесь появится ваш чат."
          action="Пригласить"
          onAction={() => router.push('/settings')}
        />
      </View>
    );
  }

  let content: React.ReactNode;
  if (loading && !items.length) {
    content = (
      <View style={{ flex: 1 }}>
        <Loading />
      </View>
    );
  } else if (error && !items.length) {
    content = (
      <View style={{ flex: 1, padding: 16 }}>
        <ErrorNote text={error} onRetry={retry} />
      </View>
    );
  } else if (!items.length) {
    content = (
      <View style={{ flex: 1 }}>
        <ChatEmpty onPick={(t) => composer.current?.insert(t)} />
      </View>
    );
  } else {
    content = (
      <View style={{ flex: 1 }}>
        <FlatList
          ref={list}
          data={rows}
          extraData={byMessage}
          keyExtractor={(r) => r.key}
          renderItem={renderItem}
          inverted
          onEndReached={() => {
            if (hasOlder) loadOlder();
          }}
          onEndReachedThreshold={0.4}
          // Новые сообщения не сдвигают экран, если ты листаешь историю; у самого низа — прокручиваем к ним
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 120 }}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
          initialNumToRender={20}
          windowSize={11}
          ListFooterComponent={
            loadingOlder ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator color={c.accent} />
              </View>
            ) : undefined
          }
        />
        {error ? (
          <View style={{ position: 'absolute', top: 8, left: 12, right: 12 }}>
            <ErrorNote text={error} onRetry={retry} />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg, paddingLeft: insets.left, paddingRight: insets.right }}
      behavior="padding"
      // Высота нативного заголовка (44) + статус-бар (на Android экран начинается под заголовком)
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
    >
      <AppBackground />
      {header}
      {content}
      <Composer ref={composer} onSend={onSend} bottomInset={keyboardShown ? 0 : insets.bottom} disabled={!userId} />
      <PhotoViewer urls={viewer?.urls ?? []} index={viewer?.index ?? null} onClose={() => setViewer(null)} />
      <MessageMenu
        visible={menuFor !== null}
        mine={!!menuFor && menuFor.sender_id === userId}
        preview={menuPreview(menuFor)}
        current={menuFor ? myReaction(menuFor.id) : null}
        actions={menuActions}
        onReact={(e) => menuFor && react(menuFor.id, e)}
        onClose={() => setMenuFor(null)}
      />
    </KeyboardAvoidingView>
  );
}
