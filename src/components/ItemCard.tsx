import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Image as ExpoImage } from 'expo-image';
import { ActionSheetIOS, Alert, Platform, Pressable, Text, View } from 'react-native';
import { formatDate, hostOf } from '../lib/format';
import type { ItemWithLikes } from '../lib/types';
import { radius, useTheme } from '../theme';
import { AddedBy, DislikeButton, LikeButton } from './people';
import { Card } from './ui';

export function openLink(url: string | null | undefined) {
  if (!url) return;
  WebBrowser.openBrowserAsync(url).catch(() => undefined);
}

export function confirmDelete(what: string, onConfirm: () => void) {
  Alert.alert('Удалить?', `«${what}» пропадёт у всех участников.`, [
    { text: 'Отмена', style: 'cancel' },
    { text: 'Удалить', style: 'destructive', onPress: onConfirm },
  ]);
}

export function itemMenu(title: string, onEdit: () => void, onDelete: () => void) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: ['Изменить', 'Удалить', 'Отмена'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
      (i) => {
        if (i === 0) onEdit();
        if (i === 1) confirmDelete(title, onDelete);
      },
    );
  } else {
    Alert.alert(title, undefined, [
      { text: 'Изменить', onPress: onEdit },
      { text: 'Удалить', style: 'destructive', onPress: () => confirmDelete(title, onDelete) },
      { text: 'Отмена', style: 'cancel' },
    ]);
  }
}

/**
 * Карточка записи в списках (Кино, Еда, Выходные) — в одном виде с вариантами «Что приготовить сегодня?»:
 * квадратное фото 72×72 слева (или эмодзи на цветном фоне), справа название, описание, метки и ссылка,
 * внизу автор и лайки. Габариты у всех списков одинаковые.
 */
export function ItemCard({
  item,
  onLike,
  onDislike,
  onPress,
  onLongPress,
  accent,
  accentBg,
  emoji,
  badge,
  meta,
  footerExtra,
  extra,
  image,
}: {
  /** Картинка вместо image_url (например, своё фото из вложений) */
  image?: { uri: string; cacheKey?: string } | null;
  /** Эмодзи на месте фото, если картинки нет */
  emoji: string;
  /** Фон под эмодзи */
  accentBg: string;
  /** Дополнительный блок под текстом карточки (например, вложения) */
  extra?: React.ReactNode;
  item: ItemWithLikes;
  onLike: () => void;
  onDislike?: () => void;
  onPress?: () => void;
  onLongPress?: () => void;
  accent: string;
  /** Метки (тип, статус, категория) — строкой под описанием */
  badge?: React.ReactNode;
  /** Строка под названием (место, время готовки) */
  meta?: React.ReactNode;
  footerExtra?: React.ReactNode;
}) {
  const { c } = useTheme();
  const src = image ?? (item.image_url ? { uri: item.image_url } : null);
  const host = item.url ? hostOf(item.url) || 'Ссылка' : '';
  return (
    <Card onPress={onPress} onLongPress={onLongPress} style={{ marginBottom: 10, padding: 12 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        {src ? (
          <ExpoImage source={src} style={{ width: 72, height: 72, borderRadius: radius.sm, backgroundColor: c.bgAlt }} contentFit="cover" transition={150} />
        ) : (
          <View style={{ width: 72, height: 72, borderRadius: radius.sm, backgroundColor: accentBg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 34 }}>{emoji}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{item.title}</Text>
          {meta}
          {item.note ? (
            <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 2 }} numberOfLines={3}>
              {item.note}
            </Text>
          ) : null}
          {badge || host ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 }}>
              {badge}
              {host ? (
                <Pressable
                  onPress={() => openLink(item.url)}
                  hitSlop={8}
                  accessibilityRole="link"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 }}
                >
                  <Ionicons name="link-outline" size={14} color={accent} />
                  <Text style={{ color: accent, fontSize: 13, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
                    {host}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {extra}
        </View>
      </View>
      {/* Если кнопкам не хватает места рядом с автором, они переносятся на строку ниже, а не наезжают на имя */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', rowGap: 10, columnGap: 8, marginTop: 12 }}>
        <AddedBy userId={item.created_by} date={formatDate(item.created_at)} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {footerExtra}
          {onDislike ? <DislikeButton dislikes={item.dislikes} onPress={onDislike} /> : null}
          <LikeButton likes={item.likes} onPress={onLike} />
        </View>
      </View>
    </Card>
  );
}

export function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: bg }}>
      <Text style={{ fontSize: 11.5, fontWeight: '700', color, letterSpacing: 0.2 }}>{label}</Text>
    </View>
  );
}
