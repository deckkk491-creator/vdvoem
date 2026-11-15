import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useSyncExternalStore } from 'react';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type TabKey = 'calendar' | 'watch' | 'recipes' | 'weekend' | 'shopping' | 'us';

export type TabDef = { key: TabKey; title: string; text: string; icon: IconName; iconActive: IconName };

/** Все разделы, которые можно вынести на нижнюю панель. Ключ совпадает с именем файла в app/(tabs). */
export const TAB_DEFS: Record<TabKey, TabDef> = {
  calendar: { key: 'calendar', title: 'Календарь', text: 'Планы, задачи и важные даты по дням', icon: 'calendar-outline', iconActive: 'calendar' },
  watch: { key: 'watch', title: 'Кино', text: 'Что посмотреть вместе', icon: 'film-outline', iconActive: 'film' },
  recipes: { key: 'recipes', title: 'Еда', text: 'Рецепты и идеи, что приготовить', icon: 'restaurant-outline', iconActive: 'restaurant' },
  weekend: { key: 'weekend', title: 'Выходные', text: 'Идеи, куда сходить вместе', icon: 'leaf-outline', iconActive: 'leaf' },
  shopping: { key: 'shopping', title: 'Покупки', text: 'Общий список в магазин', icon: 'basket-outline', iconActive: 'basket' },
  us: { key: 'us', title: 'Мы', text: 'Чат, копилка, вишлисты и всё остальное', icon: 'heart-outline', iconActive: 'heart' },
};

export const ALL_TABS: TabKey[] = ['calendar', 'watch', 'recipes', 'weekend', 'shopping', 'us'];
/** «Мы» с панели убрать нельзя: через неё открываются скрытые разделы и настройки */
export const LOCKED_TAB: TabKey = 'us';
export const MIN_TABS = 2;

const KEY = 'vdvoem.tabbar';

function sanitize(raw: unknown): TabKey[] {
  const list = Array.isArray(raw) ? raw.filter((k): k is TabKey => typeof k === 'string' && k in TAB_DEFS) : [];
  const unique = Array.from(new Set(list));
  if (!unique.includes(LOCKED_TAB)) unique.push(LOCKED_TAB);
  return unique.length >= MIN_TABS ? unique : ALL_TABS;
}

let current: TabKey[] = ALL_TABS;
const listeners = new Set<() => void>();

function emit(next: TabKey[]) {
  current = next;
  listeners.forEach((l) => l());
}

// Настройка хранится на этом телефоне: у каждого своя панель
AsyncStorage.getItem(KEY)
  .then((raw) => {
    if (raw) emit(sanitize(JSON.parse(raw)));
  })
  .catch(() => undefined);

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const get = () => current;

/** Разделы на нижней панели — в том порядке, как их расставил пользователь */
export function useTabBarTabs(): TabKey[] {
  return useSyncExternalStore(subscribe, get, get);
}

export function setTabBarTabs(next: TabKey[]) {
  const clean = sanitize(next);
  emit(clean);
  AsyncStorage.setItem(KEY, JSON.stringify(clean)).catch(() => undefined);
}

export function resetTabBarTabs() {
  setTabBarTabs(ALL_TABS);
}
