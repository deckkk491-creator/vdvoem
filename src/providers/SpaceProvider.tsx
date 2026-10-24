import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { removeFiles } from '../lib/files';
import { humanError, supabase } from '../lib/supabase';
import type { Member, Profile, RealtimeTable, Space } from '../lib/types';
import { useAuth } from './AuthProvider';

type Listener = (table: RealtimeTable) => void;

type SpaceState = {
  loaded: boolean;
  spaces: Space[];
  space: Space | null;
  members: Member[];
  /** Профили участников текущего пространства, по user_id */
  people: Record<string, Profile>;
  selectSpace: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  createSpace: (name: string) => Promise<string>;
  joinSpace: (code: string) => Promise<void>;
  leaveSpace: () => Promise<void>;
  updateSpace: (
    patch: Partial<Pick<Space, 'name' | 'city' | 'rule222_enabled' | 'rule222_start' | 'rule_date_weeks' | 'rule_place_months' | 'rule_country_years'>>,
  ) => Promise<void>;
  subscribe: (fn: Listener) => () => void;
  live: boolean;
  /** Не удалось загрузить список пространств (например, нет сети) */
  loadError: string | null;
};

const Ctx = createContext<SpaceState | null>(null);
const STORAGE_KEY = 'vdvoem.currentSpace';

const TABLES: RealtimeTable[] = [
  'spaces',
  'space_members',
  'profiles',
  'items',
  'item_likes',
  'savings_goals',
  'savings_contributions',
  'wishlist_items',
  'wishlist_claims',
  'rule_events',
  'calendar_events',
  'messages',
  'message_reads',
  'attachments',
];

export function SpaceProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  // для какого пользователя загружен список (чтобы не было «пустого» мгновения после входа)
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const loaded = loadedFor === userId;
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [live, setLive] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const listeners = useRef(new Set<Listener>());
  // актуальный пользователь: ответы, пришедшие после выхода/смены аккаунта, не применяем
  const userRef = useRef(userId);
  userRef.current = userId;

  const space = useMemo(() => spaces.find((s) => s.id === currentId) ?? null, [spaces, currentId]);

  const loadSpaces = useCallback(async () => {
    if (!userId) {
      setSpaces([]);
      setCurrentId(null);
      setLoadError(null);
      setLoadedFor(null);
      return;
    }
    const { data, error } = await supabase.from('spaces').select('*').order('created_at', { ascending: true });
    if (userRef.current !== userId) return;
    if (error) {
      // Список не трогаем: при сбое сети не «теряем» пространства и не отправляем на онбординг молча
      setLoadError(humanError(error));
      setLoadedFor(userId);
      return;
    }
    setLoadError(null);
    const list = (data ?? []) as Space[];
    const stored = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
    if (userRef.current !== userId) return;
    setSpaces(list);
    setCurrentId((prev) => {
      const pick = [prev, stored].find((id) => id && list.some((s) => s.id === id));
      return pick ?? list[0]?.id ?? null;
    });
    setLoadedFor(userId);
  }, [userId]);

  // номер последнего запроса участников: ответ для прошлого пространства не применяем
  const membersReq = useRef(0);
  const loadMembers = useCallback(async () => {
    const req = ++membersReq.current;
    if (!currentId) {
      setMembers([]);
      setPeople({});
      return;
    }
    const { data, error } = await supabase
      .from('space_members')
      .select('user_id, role, joined_at')
      .eq('space_id', currentId)
      .order('joined_at');
    if (req !== membersReq.current) return;
    if (error) {
      console.warn('load members', error.message);
      return;
    }
    const list = (data ?? []) as Member[];
    const map: Record<string, Profile> = {};
    if (list.length) {
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .in(
          'id',
          list.map((m) => m.user_id),
        );
      if (req !== membersReq.current) return;
      if (pErr) console.warn('load profiles', pErr.message);
      for (const p of (profs ?? []) as Profile[]) map[p.id] = p;
    }
    setMembers(list);
    setPeople(map);
  }, [currentId]);

  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);

  // Выход из аккаунта: забываем выбранное пространство и всё, что было загружено для прошлого пользователя
  const prevUser = useRef(userId);
  useEffect(() => {
    if (prevUser.current && prevUser.current !== userId) {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
      setSpaces([]);
      setCurrentId(null);
      setMembers([]);
      setPeople({});
    }
    prevUser.current = userId;
  }, [userId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // Realtime: один канал на пространство, все таблицы. RLS отсекает чужие строки.
  useEffect(() => {
    if (!currentId || !userId) return;
    // Уникальное имя канала: supabase.channel() возвращает уже существующий канал с тем же именем,
    // а старый в этот момент может ещё закрываться (быстрое переключение A → B → A).
    let channel: RealtimeChannel = supabase.channel(`space-${currentId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pending = new Set<RealtimeTable>();

    const flush = () => {
      const tables = Array.from(pending);
      pending.clear();
      for (const t of tables) {
        if (t === 'spaces') loadSpaces();
        if (t === 'space_members' || t === 'profiles') loadMembers();
        listeners.current.forEach((fn) => fn(t));
      }
    };

    for (const table of TABLES) {
      const filter =
        table === 'profiles' ? undefined : table === 'spaces' ? `id=eq.${currentId}` : `space_id=eq.${currentId}`;
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => {
          pending.add(table);
          if (timer) clearTimeout(timer);
          timer = setTimeout(flush, 250);
        },
      );
    }
    // DELETE-события не фильтруются по колонкам — слушаем их отдельно без фильтра
    for (const table of TABLES) {
      if (table === 'profiles') continue;
      channel = channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, () => {
        pending.add(table);
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, 250);
      });
    }
    let subscribedOnce = false;
    channel.subscribe((status) => {
      if (!active) return;
      setLive(status === 'SUBSCRIBED');
      if (status !== 'SUBSCRIBED') return;
      // Переподключились после обрыва: пока канала не было, события могли потеряться — перечитываем всё
      if (subscribedOnce) {
        TABLES.forEach((t) => pending.add(t));
        flush();
      }
      subscribedOnce = true;
    });

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      pending.clear();
      setLive(false);
      supabase.removeChannel(channel).catch(() => undefined);
    };
  }, [currentId, userId, loadSpaces, loadMembers]);

  // Вернулись в приложение из фона: realtime в фоне не работает, поэтому перечитываем пространство
  // и даём всем экранам (в том числе напоминаниям 2-2-2) обновиться — изменения с другого устройства не теряются
  useEffect(() => {
    if (!userId) return;
    let prev = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      const wasAway = prev === 'background' || prev === 'inactive';
      prev = next;
      if (next !== 'active' || !wasAway) return;
      loadSpaces();
      loadMembers();
      for (const t of TABLES) {
        if (t === 'spaces' || t === 'space_members' || t === 'profiles') continue;
        listeners.current.forEach((fn) => fn(t));
      }
    });
    return () => sub.remove();
  }, [userId, loadSpaces, loadMembers]);

  const selectSpace = useCallback(async (id: string) => {
    setCurrentId(id);
    await AsyncStorage.setItem(STORAGE_KEY, id).catch(() => undefined);
  }, []);

  const createSpace = useCallback(
    async (name: string) => {
      const { data, error } = await supabase.rpc('create_space', { p_name: name });
      if (error) throw error;
      const code = data as string;
      const { data: created } = await supabase.from('spaces').select('id').eq('invite_code', code).maybeSingle();
      await loadSpaces();
      if (created?.id) await selectSpace(created.id as string);
      return code;
    },
    [loadSpaces, selectSpace],
  );

  const joinSpace = useCallback(
    async (code: string) => {
      const { data, error } = await supabase.rpc('join_space', { p_code: code });
      if (error) throw error;
      await loadSpaces();
      await selectSpace(data as string);
    },
    [loadSpaces, selectSpace],
  );

  const leaveSpace = useCallback(async () => {
    if (!currentId) return;
    // Если выходит последний участник, пространство удалится — заранее узнаём его файлы, чтобы убрать их из хранилища.
    // Сервер вернёт пустой список, если в пространстве есть кто-то ещё.
    const { data } = await supabase.rpc('space_file_paths', { p_space: currentId });
    const files = ((data ?? []) as string[]).filter(Boolean);
    const { error } = await supabase.rpc('leave_space', { p_space: currentId });
    if (error) throw error;
    if (files.length) await removeFiles(files);
    // Сразу убираем пространство локально и переключаемся на следующее (если есть):
    // без промежуточного «нет пространства», даже если перезагрузка списка не удастся
    const remaining = spaces.filter((s) => s.id !== currentId);
    setSpaces(remaining);
    setCurrentId(remaining[0]?.id ?? null);
    if (remaining[0]) await AsyncStorage.setItem(STORAGE_KEY, remaining[0].id).catch(() => undefined);
    else await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
    await loadSpaces();
  }, [currentId, spaces, loadSpaces]);

  const updateSpace = useCallback<SpaceState['updateSpace']>(
    async (patch) => {
      if (!currentId) return;
      const { data, error } = await supabase.from('spaces').update(patch).eq('id', currentId).select('*').single();
      if (error) throw error;
      setSpaces((list) => list.map((s) => (s.id === currentId ? (data as Space) : s)));
    },
    [currentId],
  );

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadSpaces(), loadMembers()]);
  }, [loadSpaces, loadMembers]);

  const value = useMemo<SpaceState>(
    () => ({
      loaded,
      spaces,
      space,
      members,
      people,
      selectSpace,
      refresh,
      createSpace,
      joinSpace,
      leaveSpace,
      updateSpace,
      subscribe,
      live,
      loadError,
    }),
    [loaded, spaces, space, members, people, selectSpace, refresh, createSpace, joinSpace, leaveSpace, updateSpace, subscribe, live, loadError],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSpace(): SpaceState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSpace outside SpaceProvider');
  return v;
}

/** Перезапускает fn, когда в realtime приходят изменения указанных таблиц */
export function useRealtimeRefetch(tables: RealtimeTable[], fn: () => void) {
  const { subscribe } = useSpace();
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const key = tables.join(',');
  useEffect(() => {
    const set = new Set(key.split(','));
    return subscribe((t) => {
      if (set.has(t)) fnRef.current();
    });
  }, [subscribe, key]);
}
