import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { memo, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { formatSize } from '../../lib/files';
import type { Profile } from '../../lib/types';
import { isImageMessage, type ChatItem } from '../../hooks/useMessages';
import { radius, useTheme } from '../../theme';
import { Avatar } from '../people';
import { ReactionChips } from './MessageMenu';
import type { ReactionSummary } from '../../hooks/useReactions';

const AVATAR = 28;
const MAX_IMAGE_HEIGHT = 320;
const MIN_IMAGE_SIDE = 110;

/** «09:05» */
export function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Размер картинки в пузыре: по пропорциям фото, не шире ~65% экрана и не выше 320 */
function imageSize(w: number | null, h: number | null, maxW: number): { width: number; height: number } {
  if (!w || !h || w <= 0 || h <= 0) return { width: maxW, height: Math.round(maxW * 0.75) };
  const s = Math.min(maxW / w, MAX_IMAGE_HEIGHT / h);
  return {
    width: Math.round(Math.max(MIN_IMAGE_SIDE, Math.min(maxW, w * s))),
    height: Math.round(Math.max(MIN_IMAGE_SIDE, Math.min(MAX_IMAGE_HEIGHT, h * s))),
  };
}

export type BubbleProps = {
  item: ChatItem;
  mine: boolean;
  /** Первое (верхнее) сообщение группы подряд от одного человека */
  firstInGroup: boolean;
  /** Последнее (нижнее) сообщение группы: здесь время и аватар */
  lastInGroup: boolean;
  sender: Profile | null;
  /** Имя над группой (в пространствах на 3+ человек) */
  senderName: string | null;
  /** Подписанная ссылка на фото, если уже получена */
  imageUrl: string | null;
  /** «Прочитано» / «Доставлено» под самым свежим своим сообщением */
  receipt: 'read' | 'delivered' | null;
  onPress: (item: ChatItem) => void;
  onLongPress: (item: ChatItem) => void;
  /** Реакции на сообщение */
  reactions?: ReactionSummary[];
  /** Поставить или убрать свою реакцию (двойное нажатие — ❤️) */
  onReact?: (item: ChatItem, emoji: string) => void;
};

function BubbleBase({ item, mine, firstInGroup, lastInGroup, sender, senderName, imageUrl, receipt, onPress, onLongPress, reactions, onReact }: BubbleProps) {
  const lastTap = useRef(0);
  const { c } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const local = item.local;
  const failed = local?.status === 'failed';
  const sending = local?.status === 'sending';
  const isImage = isImageMessage(item);
  const isDoc = !isImage && !!(item.attachment_path || item.attachment_name);
  const hasText = item.body.trim().length > 0;

  const maxBubble = Math.round(screenW * 0.75);
  const maxImage = Math.round(screenW * 0.65);
  const img = isImage ? imageSize(item.image_width, item.image_height, maxImage) : null;
  // cacheKey = путь в хранилище: временная ссылка меняется каждый час, а кэш картинки — нет
  const imageSource = local?.uri ? { uri: local.uri } : imageUrl ? { uri: imageUrl, cacheKey: item.attachment_path ?? undefined } : undefined;

  const fg = mine ? c.onAccent : c.text;
  const subFg = mine ? c.onAccent : c.textMuted;
  // Скругления: «хвостик» у последнего сообщения группы
  const big = radius.lg;
  const small = 6;
  const corners = mine
    ? { borderTopLeftRadius: big, borderBottomLeftRadius: big, borderTopRightRadius: firstInGroup ? big : small, borderBottomRightRadius: lastInGroup ? big : small }
    : { borderTopRightRadius: big, borderBottomRightRadius: big, borderTopLeftRadius: firstInGroup ? big : small, borderBottomLeftRadius: lastInGroup ? big : small };

  const time = timeLabel(item.created_at);
  const what = isImage ? 'Фото' : isDoc ? `Файл ${item.attachment_name ?? ''}` : '';
  const a11y = [mine ? 'Ты' : senderName ?? sender?.display_name ?? 'Партнёр', what, hasText ? item.body : '', time, sending ? 'отправляется' : '', failed ? 'не отправлено' : '', receipt === 'read' ? 'прочитано' : receipt === 'delivered' ? 'доставлено' : '']
    .filter(Boolean)
    .join(', ');

  return (
    <View style={{ paddingHorizontal: 12, marginTop: firstInGroup ? 10 : 2 }}>
      {senderName && firstInGroup && !mine ? (
        <Text style={{ marginLeft: AVATAR + 8 + 6, marginBottom: 3, fontSize: 12, fontWeight: '600', color: c.textMuted }} numberOfLines={1}>
          {senderName}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
        {!mine ? (
          <View style={{ width: AVATAR, marginRight: 8 }}>{lastInGroup ? <Avatar profile={sender} size={AVATAR} /> : null}</View>
        ) : null}
        {mine && (failed || (sending && !isImage && !isDoc)) ? (
          <View style={{ marginRight: 6, marginBottom: 6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {sending ? <ActivityIndicator size="small" color={c.textFaint} /> : <Ionicons name="alert-circle" size={20} color={c.danger} />}
          </View>
        ) : null}
        <Pressable
          onPress={() => {
            // Двойное нажатие на текст — ❤️, как в Telegram
            const now = Date.now();
            if (!local && !isImage && !isDoc && onReact && now - lastTap.current < 300) {
              lastTap.current = 0;
              onReact(item, '❤️');
              return;
            }
            lastTap.current = now;
            onPress(item);
          }}
          onLongPress={() => onLongPress(item)}
          delayLongPress={300}
          accessibilityRole={isImage ? 'imagebutton' : isDoc || failed ? 'button' : undefined}
          accessibilityLabel={a11y}
          accessibilityHint={failed ? 'Нажми, чтобы отправить ещё раз. Удерживай, чтобы удалить' : 'Удерживай, чтобы открыть действия'}
          style={({ pressed }) => [
            {
              maxWidth: maxBubble,
              backgroundColor: mine ? c.accent : c.card,
              borderWidth: mine ? 0 : StyleSheet.hairlineWidth,
              borderColor: c.border,
              overflow: 'hidden',
              opacity: pressed ? 0.85 : sending ? 0.75 : 1,
              minHeight: 36,
            },
            corners,
          ]}
        >
          {isImage && img ? (
            <View style={{ padding: 3 }}>
              <Image
                source={imageSource}
                style={{ width: img.width, height: img.height, borderRadius: big - 4, backgroundColor: mine ? c.accentSoft : c.bgAlt }}
                contentFit="cover"
                transition={150}
                recyclingKey={item.id}
                accessibilityIgnoresInvertColors
              />
              {sending ? (
                <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.card + 'D9', alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color={c.accent} />
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
          {isDoc ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 10, paddingBottom: hasText ? 2 : 10, minWidth: 180 }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: mine ? c.onAccent + '33' : c.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {sending ? <ActivityIndicator size="small" color={mine ? c.onAccent : c.accent} /> : <Ionicons name="document-text-outline" size={22} color={mine ? c.onAccent : c.accent} />}
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text style={{ color: fg, fontSize: 15, fontWeight: '600' }} numberOfLines={2}>
                  {item.attachment_name || 'Файл'}
                </Text>
                {item.attachment_size ? <Text style={{ color: subFg, opacity: mine ? 0.85 : 1, fontSize: 12, marginTop: 2 }}>{formatSize(item.attachment_size)}</Text> : null}
              </View>
            </View>
          ) : null}
          {hasText ? (
            <Text selectable={false} style={{ color: fg, fontSize: 16, lineHeight: 21, paddingHorizontal: 12, paddingTop: isImage || isDoc ? 6 : 8, paddingBottom: 8 }}>
              {item.body}
            </Text>
          ) : null}
        </Pressable>
      </View>
      {reactions?.length && onReact ? (
        <View style={{ marginLeft: mine ? 0 : AVATAR + 8 }}>
          <ReactionChips reactions={reactions} mine={mine} onToggle={(e) => onReact(item, e)} />
        </View>
      ) : null}
      {failed ? (
        <Pressable
          onPress={() => onPress(item)}
          onLongPress={() => onLongPress(item)}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Не отправлено. Повторить отправку"
          style={{ alignSelf: 'flex-end', marginTop: 3 }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: c.danger }}>Не отправлено · повторить</Text>
        </Pressable>
      ) : lastInGroup || receipt ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, alignSelf: mine ? 'flex-end' : 'flex-start', marginLeft: mine ? 0 : AVATAR + 8 + 4 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={{ fontSize: 11, color: c.textFaint }}>{sending ? 'Отправляется…' : time}</Text>
          {receipt && !sending ? (
            <>
              <Ionicons name={receipt === 'read' ? 'checkmark-done' : 'checkmark'} size={13} color={receipt === 'read' ? c.accent : c.textFaint} />
              <Text style={{ fontSize: 11, color: c.textFaint }}>{receipt === 'read' ? 'Прочитано' : 'Доставлено'}</Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export const MessageBubble = memo(BubbleBase);

export function DaySeparator({ label }: { label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 4 }} accessibilityRole="header">
      <Text style={{ fontSize: 12, fontWeight: '700', color: c.textMuted, backgroundColor: c.bgAlt, paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden' }}>
        {label}
      </Text>
    </View>
  );
}
