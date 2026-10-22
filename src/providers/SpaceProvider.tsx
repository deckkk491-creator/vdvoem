import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
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
  updateSpace: (patch: Partial<Pick<Space, 'name' | 'city' | 'rule222_enabled' | 'rule222_start'>>) => Promise<void>;
  subscribe: (fn: Listener) => () => void;
  live: boolean;
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
  const listeners = useRef(new Set<Listener>());

  const space = useMemo(() => spaces.find((s) => s.id === currentId) ?? null, [spaces, currentId]);

  const loadSpaces = useCallback(async () => {
    if (!userId) {
      setSpaces([]);
      setCurrentId(null);
      setLoadedFor(null);
      return;
    }
    const { data, error } = await supabase.from('spaces').select('*').order('created_at', { ascending: true });
    if (error) {
      console.warn('load spaces', error.message);
      setLoadedFor(userId);
      return;
    }
    const list = (data ?? []) as Space[];
    setSpaces(list);
    const stored = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
    setCurrentId((prev) => {
      const pick = [prev, stored].find((id) => id && list.some((s) => s.id === id));
      return pick ?? list[0]?.id ?? null;
    });
    setLoadedFor(userId);
  }, [userId]);

  const loadMembers = useCallback(async () => {
    if (!currentId) {
      setMembers([]);
      setPeople({});
      return;
    }
    const { data } = await supabase
      .from('space_members')
      .select('user_id, role, joined_at')
      .eq('space_id', currentId)
      .order('joined_at');
    const list = (data ?? []) as Member[];
    setMembers(list);
    if (list.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('*')
        .in(
          'id',
          list.map((m) => m.user_id),
        );
      const map: Record<string, Profile> = {};
      for (const p of (profs ?? []) as Profile[]) map[p.id] = p;
      setPeople(map);
    }
  }, [currentId]);

  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // Realtime: один канал на пространство, все таблицы. RLS отсекает чужие строки.
  useEffect(() => {
    if (!currentId || !userId) return;
    let channel: RealtimeChannel = supabase.channel(`space-${currentId}`);
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
    channel.subscribe((status) => setLive(status === 'SUBSCRIBED'));

    return () => {
      if (timer) clearTimeout(timer);
      setLive(false);
      supabase.removeChannel(channel);
    };
  }, [currentId, userId, loadSpaces, loadMembers]);

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
    const { error } = await supabase.rpc('leave_space', { p_space: currentId });
    if (error) throw error;
    setCurrentId(null);
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
    await loadSpaces();
  }, [currentId, loadSpaces]);

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
    }),
    [loaded, spaces, space, members, people, selectSpace, refresh, createSpace, joinSpace, leaveSpace, updateSpace, subscribe, live],
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
