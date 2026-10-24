import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { supabase } from './supabase';
import type { Attachment, AttachmentParent } from './types';

export const BUCKET = 'space-files';
/** Максимальный размер файла — как лимит бакета в Supabase */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Файл, выбранный на телефоне, но ещё не загруженный */
export type LocalFile = {
  key: string;
  uri: string;
  name: string;
  mime: string;
  size: number | null;
  width: number | null;
  height: number | null;
  kind: 'photo' | 'file';
};

export function randomId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function extOf(name: string, mime: string): string {
  const m = /\.([a-z0-9]{1,6})$/i.exec(name);
  if (m) return m[1].toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('pdf')) return 'pdf';
  return mime.startsWith('image/') ? 'jpg' : 'bin';
}

/** Безопасное имя файла для пути в хранилище (кириллица и пробелы заменяются) */
function safeName(name: string, mime: string): string {
  const ext = extOf(name, mime);
  const base = name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${base || 'file'}.${ext}`;
}

function permissionAlert(what: string) {
  Alert.alert(`Нет доступа к ${what}`, `Разреши доступ к ${what} для «Вдвоём» в настройках телефона.`, [
    { text: 'Не сейчас', style: 'cancel' },
    { text: 'Открыть настройки', onPress: () => Linking.openSettings().catch(() => undefined) },
  ]);
}

/** Выбор фото из галереи (по умолчанию — несколько) */
export async function pickPhotos(limit = 10): Promise<LocalFile[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted && perm.accessPrivileges !== 'limited') {
    permissionAlert('фото');
    return [];
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 0.7,
  });
  if (res.canceled) return [];
  return res.assets.map((a) => ({
    key: randomId(),
    uri: a.uri,
    name: a.fileName ?? `photo-${Date.now()}.jpg`,
    mime: a.mimeType ?? 'image/jpeg',
    size: a.fileSize ?? null,
    width: a.width ?? null,
    height: a.height ?? null,
    kind: 'photo' as const,
  }));
}

/** Снимок камерой */
export async function takePhoto(): Promise<LocalFile[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    permissionAlert('камере');
    return [];
  }
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (res.canceled) return [];
  const a = res.assets[0];
  return [
    {
      key: randomId(),
      uri: a.uri,
      name: a.fileName ?? `photo-${Date.now()}.jpg`,
      mime: a.mimeType ?? 'image/jpeg',
      size: a.fileSize ?? null,
      width: a.width ?? null,
      height: a.height ?? null,
      kind: 'photo',
    },
  ];
}

/** Выбор документа (билет, PDF, таблица…) */
export async function pickDocument(): Promise<LocalFile[]> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (res.canceled) return [];
  return res.assets.map((a) => {
    const mime = a.mimeType ?? 'application/octet-stream';
    return {
      key: randomId(),
      uri: a.uri,
      name: a.name,
      mime,
      size: a.size ?? null,
      width: null,
      height: null,
      kind: mime.startsWith('image/') ? ('photo' as const) : ('file' as const),
    };
  });
}

/**
 * Загружает файл в приватное хранилище пространства.
 * Путь: <space_id>/<папка>/<случайный id>-<имя>. Возвращает путь.
 */
export async function uploadFile(spaceId: string, folder: string, f: LocalFile): Promise<string> {
  const file = new File(f.uri);
  const size = f.size ?? file.size ?? 0;
  if (size > MAX_FILE_BYTES) throw new Error('Файл больше 25 МБ — выбери файл поменьше');
  const bytes = await file.bytes();
  const path = `${spaceId}/${folder}/${randomId()}-${safeName(f.name, f.mime)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: f.mime, upsert: false });
  if (error) throw error;
  return path;
}

export async function removeFiles(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(list);
  if (error) console.warn('removeFiles', error.message);
}

/* ------------------------- Ссылки на файлы ------------------------- */

const urlCache = new Map<string, { url: string; exp: number }>();
const TTL = 60 * 60; // секунд

/** Временные ссылки на приватные файлы (кэшируются почти на час) */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of paths) {
    const hit = urlCache.get(p);
    if (hit && hit.exp > now) out[p] = hit.url;
    else missing.push(p);
  }
  if (missing.length) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing, TTL);
    if (!error && data) {
      for (const row of data) {
        if (row.path && row.signedUrl) {
          out[row.path] = row.signedUrl;
          urlCache.set(row.path, { url: row.signedUrl, exp: now + (TTL - 120) * 1000 });
        }
      }
    }
  }
  return out;
}

export function useSignedUrls(paths: (string | null | undefined)[]): Record<string, string> {
  const key = paths.filter(Boolean).join('|');
  const list = useMemo(() => (key ? key.split('|') : []), [key]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    if (!list.length) {
      setUrls({});
      return;
    }
    signedUrls(list).then((u) => alive && setUrls(u)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [list]);
  return urls;
}

export function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}

/* ------------------------- Вложения к записям ------------------------- */

/** Черновик вложений в форме: что уже есть, что удалить, что добавить */
export type AttachmentDraft = {
  existing: Attachment[];
  removed: string[]; // id
  added: LocalFile[];
  links: { key: string; url: string; name: string }[];
};

export const emptyDraft = (existing: Attachment[] = []): AttachmentDraft => ({ existing, removed: [], added: [], links: [] });

export function draftIsDirty(d: AttachmentDraft): boolean {
  return d.removed.length > 0 || d.added.length > 0 || d.links.length > 0;
}

export async function loadAttachments(parentIds: string[]): Promise<Attachment[]> {
  if (!parentIds.length) return [];
  const { data, error } = await supabase.from('attachments').select('*').in('parent_id', parentIds).order('created_at');
  if (error) throw error;
  return (data ?? []) as Attachment[];
}

/**
 * Сохраняет изменения вложений после того, как сама запись сохранена (нужен её id).
 * Ошибки загрузки отдельных файлов собираются и возвращаются текстом.
 */
export async function commitAttachments(
  spaceId: string,
  userId: string,
  parentType: AttachmentParent,
  parentId: string,
  d: AttachmentDraft,
): Promise<string | null> {
  const problems: string[] = [];
  const toRemove = d.existing.filter((a) => d.removed.includes(a.id));
  if (toRemove.length) {
    const { error } = await supabase.from('attachments').delete().in('id', toRemove.map((a) => a.id));
    if (error) problems.push('не удалось убрать часть вложений');
    else await removeFiles(toRemove.map((a) => a.storage_path));
  }
  for (const f of d.added) {
    try {
      const path = await uploadFile(spaceId, parentType, f);
      const { error } = await supabase.from('attachments').insert({
        space_id: spaceId,
        parent_type: parentType,
        parent_id: parentId,
        kind: f.kind,
        storage_path: path,
        name: f.name.slice(0, 200),
        mime: f.mime,
        size: f.size,
        width: f.width,
        height: f.height,
        created_by: userId,
      });
      if (error) {
        await removeFiles([path]);
        throw error;
      }
    } catch (e) {
      problems.push(`«${f.name}»: ${e instanceof Error ? e.message : 'ошибка загрузки'}`);
    }
  }
  if (d.links.length) {
    const { error } = await supabase.from('attachments').insert(
      d.links.map((l) => ({
        space_id: spaceId,
        parent_type: parentType,
        parent_id: parentId,
        kind: 'link',
        url: l.url,
        name: l.name.slice(0, 200),
        created_by: userId,
      })),
    );
    if (error) problems.push('не удалось сохранить ссылки');
  }
  return problems.length ? `Не всё сохранилось: ${problems.join('; ')}` : null;
}

/** Удаляет файлы вложений записи из хранилища (записи о вложениях удалит база вместе с родителем) */
export async function removeAttachmentFilesOf(parentId: string): Promise<void> {
  try {
    const list = await loadAttachments([parentId]);
    await removeFiles(list.map((a) => a.storage_path));
  } catch {
    // не критично: останется осиротевший файл
  }
}
