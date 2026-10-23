import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { ActionSheetIOS, Alert, Image, Platform, Pressable, Text, View } from 'react-native';
import { formatDate, hostOf } from '../lib/format';
import type { ItemWithLikes } from '../lib/types';
import { radius, useTheme } from '../theme';
import { AddedBy, LikeButton } from './people';
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

export function ItemCard({
  item,
  onLike,
  onPress,
  onLongPress,
  accent,
  badge,
  meta,
  footerExtra,
  showImage = true,
}: {
  item: ItemWithLikes;
  onLike: () => void;
  onPress?: () => void;
  onLongPress?: () => void;
  accent: string;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  footerExtra?: React.ReactNode;
  showImage?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Card onPress={onPress} onLongPress={onLongPress} style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
      {showImage && item.image_url ? (
        <Image source={{ uri: item.image_url }} style={{ width: '100%', height: 170, backgroundColor: c.bgAlt }} resizeMode="cover" />
      ) : null}
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: accent, opacity: 0.8 }} />
          <View style={{ flex: 1 }}>
            {badge ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>{badge}</View> : null}
            <Text style={{ fontSize: 18, fontWeight: '700', color: c.text, lineHeight: 23 }}>{item.title}</Text>
            {meta}
            {item.note ? (
              <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 6, lineHeight: 20 }} numberOfLines={4}>
                {item.note}
              </Text>
            ) : null}
            {item.url ? (
              <Pressable
                onPress={() => openLink(item.url)}
                hitSlop={10}
                accessibilityRole="link"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' }}
              >
                <Ionicons name="link-outline" size={15} color={accent} />
                <Text style={{ color: accent, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                  {hostOf(item.url) || 'Ссылка'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <AddedBy userId={item.created_by} date={formatDate(item.created_at)} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {footerExtra}
            <LikeButton likes={item.likes} onPress={onLike} />
          </View>
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
