import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Animated, Dimensions, Modal, PanResponder, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatSize,
  loadAttachments,
  pickDocument,
  pickPhotos,
  randomId,
  signedUrls,
  takePhoto,
  useSignedUrls,
  type AttachmentDraft,
  type LocalFile,
} from '../lib/files';
import { hostOf, normalizeUrl } from '../lib/format';
import type { Attachment } from '../lib/types';
import { useRealtimeRefetch } from '../providers/SpaceProvider';
import { radius, useTheme } from '../theme';
import { Button, Input, Label } from './ui';

/* ------------------------- Загрузка вложений ------------------------- */

/** Вложения для набора записей, сгруппированные по parent_id. Обновляются в реальном времени. */
export function useAttachmentsFor(parentIds: string[]) {
  const key = [...parentIds].sort().join(',');
  const [byParent, setByParent] = useState<Record<string, Attachment[]>>({});
  const req = useRef(0);
  const load = useCallback(async () => {
    const id = ++req.current;
    const ids = key ? key.split(',') : [];
    try {
      const list = await loadAttachments(ids);
      if (id !== req.current) return;
      const map: Record<string, Attachment[]> = {};
      for (const a of list) (map[a.parent_id] ??= []).push(a);
      setByParent(map);
    } catch {
      // оставляем прежние
    }
  }, [key]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefetch(['attachments'], load);
  return { byParent, reload: load };
}

/* ------------------------- Просмотр фото ------------------------- */

export function PhotoViewer({ urls, index, onClose }: { urls: string[]; index: number | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get('window');
  const [page, setPage] = useState(0);
  const dragY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (index !== null) {
      setPage(index);
      dragY.setValue(0);
    }
  }, [index, dragY]);

  // Смахнуть фото вниз или вверх — закрыть. Касания не уходят в карточку под просмотром.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
        onPanResponderTerminationRequest: () => true,
        onPanResponderMove: (_e, g) => dragY.setValue(g.dy),
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dy) > 110 || Math.abs(g.vy) > 1.2) {
            Animated.timing(dragY, { toValue: g.dy > 0 ? height : -height, duration: 160, useNativeDriver: true }).start(() => onClose());
          } else {
            Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
          }
        },
        onPanResponderTerminate: () => Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [dragY, height, onClose],
  );
  // В модальном окне поверх карточки системные отступы иногда приходят нулевыми — берём не меньше привычных
  const topPad = Math.max(insets.top, 50) + 8;
  const bottomPad = Math.max(insets.bottom, 20) + 12;
  const fade = dragY.interpolate({ inputRange: [-height / 2, 0, height / 2], outputRange: [0.4, 1, 0.4], extrapolate: 'clamp' });

  return (
    <Modal
      visible={index !== null}
      animationType="fade"
      onRequestClose={onClose}
      transparent
      presentationStyle="overFullScreen"
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      <Animated.View style={{ flex: 1, backgroundColor: '#000', opacity: fade }} {...pan.panHandlers}>
        {index !== null ? (
          <Animated.View style={{ flex: 1, transform: [{ translateY: dragY }] }}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: index * width, y: 0 }}
              onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            >
              {urls.map((u) => (
                <Image key={u} source={{ uri: u }} style={{ width, height }} contentFit="contain" transition={150} />
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}
        {/* Подписи и кнопки — на тёмных плашках, чтобы читались на любом фото */}
        <View pointerEvents="box-none" style={{ position: 'absolute', top: topPad, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {urls.length > 1 ? (
            <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {page + 1} из {urls.length}
              </Text>
            </View>
          ) : (
            <View />
          )}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Закрыть фото"
            hitSlop={16}
            style={({ pressed }) => ({
              height: 44,
              paddingHorizontal: 16,
              borderRadius: 22,
              backgroundColor: pressed ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.65)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.35)',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
            })}
          >
            <Ionicons name="close" size={22} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Закрыть</Text>
          </Pressable>
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', bottom: bottomPad, left: 0, right: 0, alignItems: 'center' }}>
          <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="chevron-down" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Смахни вниз, чтобы закрыть</Text>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

/* ------------------------- Показ вложений ------------------------- */

export async function openStoredFile(path: string) {
  const urls = await signedUrls([path]);
  const u = urls[path];
  if (u) WebBrowser.openBrowserAsync(u).catch(() => undefined);
  else Alert.alert('Не получилось открыть файл', 'Проверь интернет и попробуй ещё раз.');
}

/** Фото — лентой миниатюр, файлы и ссылки — плашками */
export function AttachmentStrip({
  attachments,
  size = 76,
  interactive = true,
}: {
  attachments: Attachment[] | undefined;
  size?: number;
  /** false — только миниатюры: нажатие уходит в карточку (в списках), просмотр открывается из карточки записи */
  interactive?: boolean;
}) {
  const { c } = useTheme();
  const list = attachments ?? [];
  const photos = list.filter((a) => a.kind === 'photo' && a.storage_path);
  const others = list.filter((a) => a.kind !== 'photo');
  const urls = useSignedUrls(photos.map((p) => p.storage_path));
  const photoUrls = photos.map((p) => urls[p.storage_path!]).filter(Boolean);
  const [viewer, setViewer] = useState<number | null>(null);
  if (!list.length) return null;
  return (
    <View style={{ marginTop: 10, gap: 8 }} pointerEvents={interactive ? 'auto' : 'none'}>
      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {photos.map((p, i) => {
            const u = urls[p.storage_path!];
            return (
              <Pressable key={p.id} onPress={() => u && setViewer(photoUrls.indexOf(u))} accessibilityRole="imagebutton" accessibilityLabel={`Фото ${i + 1}`}>
                <Image
                  source={u ? { uri: u, cacheKey: p.storage_path! } : undefined}
                  style={{ width: size, height: size, borderRadius: radius.sm, backgroundColor: c.bgAlt }}
                  contentFit="cover"
                  transition={150}
                />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {others.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {others.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => (a.kind === 'link' ? a.url && WebBrowser.openBrowserAsync(a.url).catch(() => undefined) : a.storage_path && openStoredFile(a.storage_path))}
              accessibilityRole="button"
              accessibilityLabel={a.kind === 'link' ? `Ссылка ${a.name || hostOf(a.url)}` : `Файл ${a.name}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 7,
                borderRadius: radius.pill,
                backgroundColor: c.bgAlt,
                opacity: pressed ? 0.7 : 1,
                maxWidth: '100%',
              })}
            >
              <Ionicons name={a.kind === 'link' ? 'link-outline' : 'document-attach-outline'} size={15} color={c.accent} />
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
                {a.name || hostOf(a.url) || 'Файл'}
              </Text>
              {a.size ? <Text style={{ color: c.textFaint, fontSize: 12 }}>{formatSize(a.size)}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      {interactive ? <PhotoViewer urls={photoUrls} index={viewer} onClose={() => setViewer(null)} /> : null}
    </View>
  );
}

/* ------------------------- Редактор вложений ------------------------- */

export function AttachmentEditor({
  draft,
  onChange,
  color,
  label = 'Фото и файлы',
  allowFiles = true,
  allowLinks = true,
}: {
  draft: AttachmentDraft;
  onChange: (d: AttachmentDraft) => void;
  color?: string;
  label?: string;
  allowFiles?: boolean;
  allowLinks?: boolean;
}) {
  const { c } = useTheme();
  const accent = color ?? c.accent;
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const kept = draft.existing.filter((a) => !draft.removed.includes(a.id));
  const storedPhotos = kept.filter((a) => a.kind === 'photo');
  const urls = useSignedUrls(storedPhotos.map((a) => a.storage_path));

  const add = (files: LocalFile[]) => files.length && onChange({ ...draft, added: [...draft.added, ...files] });

  const addPhoto = () => {
    const run = (fn: () => Promise<LocalFile[]>) => fn().then(add).catch((e) => Alert.alert('Ошибка', String(e?.message ?? e)));
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: ['Выбрать из галереи', 'Сделать фото', 'Отмена'], cancelButtonIndex: 2 }, (i) => {
        if (i === 0) run(() => pickPhotos(10));
        if (i === 1) run(takePhoto);
      });
    } else run(() => pickPhotos(10));
  };

  const saveLink = () => {
    const u = normalizeUrl(link);
    if (!u) return setLinkErr('Ссылка выглядит неправильно');
    onChange({ ...draft, links: [...draft.links, { key: randomId(), url: u, name: hostOf(u) || u }] });
    setLink('');
    setLinkErr(null);
    setLinkOpen(false);
  };

  const tile = { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: c.bgAlt } as const;
  const removeBadge = (onPress: () => void, label2: string) => (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Убрать ${label2}`}
      style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: c.text, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="close" size={14} color={c.bg} />
    </Pressable>
  );

  const chips: { key: string; icon: 'document-attach-outline' | 'link-outline'; text: string; onRemove: () => void }[] = [
    ...kept
      .filter((a) => a.kind !== 'photo')
      .map((a) => ({
        key: a.id,
        icon: (a.kind === 'link' ? 'link-outline' : 'document-attach-outline') as 'link-outline' | 'document-attach-outline',
        text: a.name || hostOf(a.url) || 'Файл',
        onRemove: () => onChange({ ...draft, removed: [...draft.removed, a.id] }),
      })),
    ...draft.added
      .filter((f) => f.kind === 'file')
      .map((f) => ({
        key: f.key,
        icon: 'document-attach-outline' as const,
        text: f.name,
        onRemove: () => onChange({ ...draft, added: draft.added.filter((x) => x.key !== f.key) }),
      })),
    ...draft.links.map((l) => ({
      key: l.key,
      icon: 'link-outline' as const,
      text: l.name,
      onRemove: () => onChange({ ...draft, links: draft.links.filter((x) => x.key !== l.key) }),
    })),
  ];
  const newPhotos = draft.added.filter((f) => f.kind === 'photo');

  return (
    <View style={{ marginBottom: 12 }}>
      <Label>{label}</Label>
      {storedPhotos.length || newPhotos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 6, paddingRight: 6, paddingBottom: 10 }}>
          {storedPhotos.map((a) => (
            <View key={a.id}>
              <Image source={urls[a.storage_path!] ? { uri: urls[a.storage_path!], cacheKey: a.storage_path! } : undefined} style={tile} contentFit="cover" />
              {removeBadge(() => onChange({ ...draft, removed: [...draft.removed, a.id] }), 'фото')}
            </View>
          ))}
          {newPhotos.map((f) => (
            <View key={f.key}>
              <Image source={{ uri: f.uri }} style={tile} contentFit="cover" />
              {removeBadge(() => onChange({ ...draft, added: draft.added.filter((x) => x.key !== f.key) }), 'фото')}
            </View>
          ))}
        </ScrollView>
      ) : null}
      {chips.length ? (
        <View style={{ gap: 8, marginBottom: 10 }}>
          {chips.map((ch) => (
            <View key={ch.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.bgAlt, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 }}>
              <Ionicons name={ch.icon} size={17} color={accent} />
              <Text style={{ flex: 1, color: c.text, fontSize: 14 }} numberOfLines={1}>
                {ch.text}
              </Text>
              <Pressable onPress={ch.onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Убрать ${ch.text}`}>
                <Ionicons name="close-circle" size={20} color={c.textFaint} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {linkOpen ? (
        <View>
          <Input value={link} onChangeText={setLink} placeholder="https://…" autoCapitalize="none" keyboardType="url" autoFocus onSubmitEditing={saveLink} />
          {linkErr ? <Text style={{ color: c.danger, marginTop: -6, marginBottom: 8 }}>{linkErr}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Добавить ссылку" small color={accent} onPress={saveLink} />
            <Button title="Отмена" small variant="ghost" color={accent} onPress={() => setLinkOpen(false)} />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button title="Фото" small variant="secondary" icon="image-outline" onPress={addPhoto} />
          {allowFiles ? (
            <Button
              title="Файл"
              small
              variant="secondary"
              icon="document-attach-outline"
              onPress={() => pickDocument().then(add).catch((e) => Alert.alert('Ошибка', String(e?.message ?? e)))}
            />
          ) : null}
          {allowLinks ? <Button title="Ссылка" small variant="secondary" icon="link-outline" onPress={() => setLinkOpen(true)} /> : null}
        </View>
      )}
    </View>
  );
}

/** Количество вложений одной строкой: «3 фото · 1 файл» */
export function useAttachmentSummary(list: Attachment[] | undefined): string {
  return useMemo(() => {
    if (!list?.length) return '';
    const p = list.filter((a) => a.kind === 'photo').length;
    const f = list.filter((a) => a.kind === 'file').length;
    const l = list.filter((a) => a.kind === 'link').length;
    return [p ? `${p} фото` : '', f ? `${f} файл.` : '', l ? `${l} ссылк.` : ''].filter(Boolean).join(' · ');
  }, [list]);
}
