/*
 * Личный чат пространства: история с подгрузкой, realtime, оптимистичная отправка
 * текста и вложений (фото, документы), отметки о прочтении.
 *
 * Push-уведомления о новых сообщениях пока НЕ сделаны: для них нужна development-сборка
 * (EAS) с APNs-ключом и серверная отправка (например, Edge Function по вебхуку на insert).
 * Внутри приложения непрочитанные уже видны по значку (useUnreadCount в useUnread.ts).
 */
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { removeFiles, uploadFile, MAX_FILE_BYTES, randomId, type LocalFile } from '../lib/files';
import { humanError, supabase } from '../lib/supabase';
import type { Message, MessageRead } from '../lib/types';
import { useAuth } from '../providers/AuthProvider';
import { useRealtimeRefetch, useSpace } from '../providers/SpaceProvider';

export const PAGE_SIZE = 50;
export const MAX_MESSAGE_LENGTH = 4000;

/** Состояние сообщения, которое ещё не дошло до сервера */
export type LocalState = {
  status: 'sending' | 'failed';
  /** Локальный файл (для превью фото до загрузки) */
  uri: string | null;
  error: string | null;
};

/** Сообщение в ленте: с сервера или ещё отправляется (тогда есть local) */
export type ChatItem = Message & { local?: LocalState };

type Pending = {
  localId: string;
  spaceId: string;
  body: string;
  file: LocalFile | null;
  /** Файл уже загружен, но запись не создана — при повторе не грузим заново */
  uploadedPath: string | null;
  created_at: string;
  status: 'sending' | 'failed';
  error: string | null;
};

/** Время в миллисекундах (для сравнений; строки от сервера и клиента бывают в разном формате) */
export function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** Сортировка «новые первыми» — так удобно для перевёрнутого списка */
function byNewest(a: Message, b: Message): number {
  const d = timeOf(b.created_at) - timeOf(a.created_at);
  if (d !== 0) return d;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function dedupe(list: Message[]): Message[] {
  const seen = new Set<string>();
  const out: Message[] = [];
  for (const m of list) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out.sort(byNewest);
}

export function isImageMessage(m: Pick<Message, 'attachment_mime' | 'attachment_path'>): boolean {
  return !!m.attachment_mime?.startsWith('image/');
}

function pendingToItem(p: Pending, userId: string): ChatItem {
  const f = p.file;
  return {
    id: p.localId,
    space_id: p.spaceId,
    sender_id: userId,
    body: p.body,
    attachment_path: p.uploadedPath,
    attachment_name: f ? f.name.slice(0, 200) : null,
    attachment_mime: f ? (f.kind === 'photo' && !f.mime.startsWith('image/') ? 'image/jpeg' : f.mime) : null,
    attachment_size: f?.size ?? null,
    image_width: f?.width ?? null,
    image_height: f?.height ?? null,
    created_at: p.created_at,
    local: { status: p.status, uri: f?.uri ?? null, error: p.error },
  };
}

export function useMessages() {
  const { space, members } = useSpace();
  const { userId } = useAuth();
  const spaceId = space?.id ?? null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [reads, setReads] = useState<MessageRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // Актуальное пространство: ответы для прошлого пространства не применяем
  const spaceRef = useRef(spaceId);
  spaceRef.current = spaceId;
  const newestReq = useRef(0);
  const readsReq = useRef(0);
  const olderBusy = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  const pendingRef = useRef<Pending[]>([]);
  pendingRef.current = pending;
  // Отправка идёт строго по очереди, чтобы порядок сообщений совпадал с порядком нажатий
  const queue = useRef<Promise<void>>(Promise.resolve());
  // Сообщения, которые сейчас в очереди на отправку (защита от двойного «повторить»)
  const inFlight = useRef(new Set<string>());
  // Уже загруженные файлы неотправленных сообщений: localId → путь в хранилище
  const uploaded = useRef(new Map<string, string>());
  // Локальные копии только что отправленных фото: id сообщения → uri (чтобы пузырь не мигал)
  const previews = useRef(new Map<string, string>());

  /* ------------------------- Загрузка ------------------------- */

  /** Перечитывает самую свежую страницу и склеивает её с уже загруженными старыми сообщениями */
  const loadNewest = useCallback(async () => {
    const id = ++newestReq.current;
    if (!spaceId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    let rows: Message[] | null = null;
    let failure: unknown = null;
    try {
      const { data, error: e } = await supabase
        .from('messages')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);
      if (e) failure = e;
      else rows = (data ?? []) as Message[];
    } catch (e) {
      failure = e;
    }
    if (id !== newestReq.current || spaceRef.current !== spaceId) return;
    if (failure || !rows) {
      setError(humanError(failure));
      setLoading(false);
      return;
    }
    const page = rows;
    setError(null);
    setLoading(false);
    if (page.length < PAGE_SIZE) {
      // Вся история поместилась в одну страницу — она и есть полный список (удалённые пропадут)
      setMessages(dedupe(page));
      setHasOlder(false);
      return;
    }
    const boundary = timeOf(page[page.length - 1].created_at);
    const ids = new Set(page.map((m) => m.id));
    const kept = messagesRef.current.filter((m) => !ids.has(m.id) && timeOf(m.created_at) <= boundary);
    setMessages(dedupe([...page, ...kept]));
    // Если старых ещё не подгружали — дальше, возможно, есть история
    if (!kept.length) setHasOlder(true);
  }, [spaceId]);

  const loadOlder = useCallback(async () => {
    if (!spaceId || olderBusy.current || !hasOlder) return;
    const list = messagesRef.current;
    const oldest = list[list.length - 1];
    if (!oldest) return;
    olderBusy.current = true;
    setLoadingOlder(true);
    try {
      // lte + отсев дублей: сообщения с тем же временем, что и самое старое, не потеряются
      const { data, error: e } = await supabase
        .from('messages')
        .select('*')
        .eq('space_id', spaceId)
        .lte('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);
      if (spaceRef.current !== spaceId) return;
      if (e) {
        setError(humanError(e));
        return;
      }
      const rows = (data ?? []) as Message[];
      const known = new Set(messagesRef.current.map((m) => m.id));
      const fresh = rows.filter((m) => !known.has(m.id));
      setMessages((prev) => dedupe([...prev, ...fresh]));
      setHasOlder(rows.length === PAGE_SIZE && fresh.length > 0);
    } catch (e) {
      if (spaceRef.current === spaceId) setError(humanError(e));
    } finally {
      olderBusy.current = false;
      if (spaceRef.current === spaceId) setLoadingOlder(false);
    }
  }, [spaceId, hasOlder]);

  const loadReads = useCallback(async () => {
    const id = ++readsReq.current;
    if (!spaceId) {
      setReads([]);
      return;
    }
    const { data, error: e } = await supabase.from('message_reads').select('space_id, user_id, last_read_at').eq('space_id', spaceId);
    if (id !== readsReq.current || spaceRef.current !== spaceId) return;
    if (e) {
      // не критично: просто не обновим «Прочитано»
      console.warn('load message_reads', e.message);
      return;
    }
    setReads((data ?? []) as MessageRead[]);
  }, [spaceId]);

  // Смена пространства: чистим всё, что относилось к прошлому
  useEffect(() => {
    setMessages([]);
    setPending([]);
    pendingRef.current = [];
    uploaded.current.clear();
    previews.current.clear();
    setReads([]);
    setError(null);
    setHasOlder(false);
    setLoadingOlder(false);
    olderBusy.current = false;
    setLoading(true);
    loadNewest();
    loadReads();
  }, [spaceId, loadNewest, loadReads]);

  // Realtime срабатывает на любое изменение (и при возврате из фона) — перечитываем только свежую страницу
  useRealtimeRefetch(['messages'], loadNewest);
  useRealtimeRefetch(['message_reads'], loadReads);

  const retry = useCallback(() => {
    setError(null);
    if (!messagesRef.current.length) setLoading(true);
    loadReads();
    return loadNewest();
  }, [loadNewest, loadReads]);

  /* ------------------------- Отправка ------------------------- */

  const patchPending = useCallback((localId: string, patch: Partial<Pending>) => {
    setPending((list) => list.map((p) => (p.localId === localId ? { ...p, ...patch } : p)));
  }, []);

  const deliver = useCallback(
    async (localId: string) => {
      const p = pendingRef.current.find((x) => x.localId === localId);
      if (!p || !userId) {
        inFlight.current.delete(localId);
        return;
      }
      let path = uploaded.current.get(localId) ?? null;
      try {
        if (p.file && !path) {
          if (p.file.size && p.file.size > MAX_FILE_BYTES) throw new Error('Файл больше 25 МБ — выбери файл поменьше');
          path = await uploadFile(p.spaceId, 'chat', p.file);
          // Запоминаем сразу: если запись не создастся, при повторе файл заново не грузим
          uploaded.current.set(localId, path);
          patchPending(localId, { uploadedPath: path });
        }
        // Пока грузился файл, сообщение могли убрать
        if (!pendingRef.current.some((x) => x.localId === localId)) {
          uploaded.current.delete(localId);
          if (path) await removeFiles([path]);
          return;
        }
        const f = p.file;
        const { data, error: e } = await supabase
          .from('messages')
          .insert({
            space_id: p.spaceId,
            sender_id: userId,
            body: p.body,
            attachment_path: path,
            attachment_name: f ? f.name.slice(0, 200) : null,
            attachment_mime: f ? (f.kind === 'photo' && !f.mime.startsWith('image/') ? 'image/jpeg' : f.mime).slice(0, 120) : null,
            attachment_size: f?.size ?? null,
            image_width: f?.width ? Math.round(f.width) : null,
            image_height: f?.height ? Math.round(f.height) : null,
          })
          .select('*')
          .single();
        if (e) throw e;
        const row = data as Message;
        uploaded.current.delete(localId);
        if (f?.kind === 'photo') previews.current.set(row.id, f.uri);
        pendingRef.current = pendingRef.current.filter((x) => x.localId !== localId);
        setPending((list) => list.filter((x) => x.localId !== localId));
        if (spaceRef.current === p.spaceId) setMessages((prev) => dedupe([row, ...prev]));
      } catch (e) {
        patchPending(localId, { status: 'failed', error: humanError(e) });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      } finally {
        inFlight.current.delete(localId);
      }
    },
    [userId, patchPending],
  );

  const enqueue = useCallback(
    (localId: string) => {
      inFlight.current.add(localId);
      queue.current = queue.current.then(() => deliver(localId)).catch(() => undefined);
    },
    [deliver],
  );

  /**
   * Отправляет текст и вложения. Каждое вложение — отдельное сообщение, текст идёт с первым.
   * Возвращает false, если отправлять нечего.
   */
  const send = useCallback(
    (text: string, files: LocalFile[]): boolean => {
      if (!spaceId || !userId) return false;
      const body = text.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!body && !files.length) return false;
      const base = Date.now();
      const parts: { body: string; file: LocalFile | null }[] = files.length
        ? files.map((f, i) => ({ body: i === 0 ? body : '', file: f }))
        : [{ body, file: null }];
      const created: Pending[] = parts.map((part, i) => ({
        localId: `local-${randomId()}`,
        spaceId,
        body: part.body,
        file: part.file,
        uploadedPath: null,
        created_at: new Date(base + i).toISOString(),
        status: 'sending',
        error: null,
      }));
      // ref обновляем сразу, чтобы очередь увидела новые сообщения до следующей отрисовки
      pendingRef.current = [...pendingRef.current, ...created];
      setPending((list) => [...list, ...created]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      created.forEach((p) => enqueue(p.localId));
      return true;
    },
    [spaceId, userId, enqueue],
  );

  const retrySend = useCallback(
    (localId: string) => {
      const p = pendingRef.current.find((x) => x.localId === localId);
      if (!p || inFlight.current.has(localId)) return;
      patchPending(localId, { status: 'sending', error: null });
      enqueue(localId);
    },
    [patchPending, enqueue],
  );

  /** Убрать неотправленное сообщение (и уже загруженный файл, если он есть) */
  const discard = useCallback((localId: string) => {
    // Пока сообщение в очереди, его не трогаем: deliver сам уберёт файл, если сообщение пропало
    if (inFlight.current.has(localId)) return;
    const path = uploaded.current.get(localId);
    uploaded.current.delete(localId);
    pendingRef.current = pendingRef.current.filter((x) => x.localId !== localId);
    setPending((list) => list.filter((x) => x.localId !== localId));
    if (path) removeFiles([path]).catch(() => undefined);
  }, []);

  /** Удаляет своё сообщение. Бросает ошибку, если не получилось. */
  const remove = useCallback(
    async (m: Message) => {
      setMessages((prev) => prev.filter((x) => x.id !== m.id));
      try {
        const { data, error: e } = await supabase.from('messages').delete().eq('id', m.id).select('id');
        if (e) throw e;
        if (!data?.length) throw new Error('Не получилось удалить сообщение. Обнови экран.');
      } catch (e) {
        await loadNewest();
        throw e;
      }
      if (m.attachment_path) await removeFiles([m.attachment_path]);
    },
    [loadNewest],
  );

  /* ------------------------- Производные ------------------------- */

  /** Лента для перевёрнутого списка: сначала (внизу) отправляемые, потом история от новых к старым */
  const items = useMemo<ChatItem[]>(() => {
    if (!userId) return messages;
    const local = pending
      .filter((p) => p.spaceId === spaceId)
      .map((p) => pendingToItem(p, userId))
      .sort(byNewest);
    return [...local, ...messages];
  }, [pending, messages, userId, spaceId]);

  /** Самое свежее своё сообщение с сервера и его статус */
  const receipt = useMemo<{ messageId: string; read: boolean } | null>(() => {
    if (!userId) return null;
    const mine = messages.find((m) => m.sender_id === userId);
    if (!mine) return null;
    const others = members.filter((m) => m.user_id !== userId);
    const t = timeOf(mine.created_at);
    const read =
      others.length > 0 &&
      others.every((o) => {
        const r = reads.find((x) => x.user_id === o.user_id);
        return !!r && timeOf(r.last_read_at) >= t;
      });
    return { messageId: mine.id, read };
  }, [messages, members, reads, userId]);

  /** id самого свежего сообщения от других — чтобы отметить чат прочитанным, когда оно меняется */
  const latestIncomingId = useMemo(() => messages.find((m) => m.sender_id !== userId)?.id ?? null, [messages, userId]);

  const previewUri = useCallback((id: string): string | null => previews.current.get(id) ?? null, []);

  return {
    items,
    loading,
    error,
    retry,
    reload: loadNewest,
    hasOlder,
    loadingOlder,
    loadOlder,
    send,
    retrySend,
    discard,
    remove,
    receipt,
    latestIncomingId,
    previewUri,
  };
}
