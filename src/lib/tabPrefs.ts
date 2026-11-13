import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useSyncExternalStore } from 'react';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Основные разделы — отдельные экраны в app/(tabs) */
export type CoreTabKey = 'calendar' | 'watch' | 'recipes' | 'weekend' | 'shopping' | 'us';
/** Разделы из «Мы», которые тоже можно вынести на панель. Экран — app/(tabs)/tab-<имя>.tsx, он показывает тот же экран, что и app/<имя>.tsx */
export type ExtraTabKey = 'tab-budget' | 'tab-savings' | 'tab-wishlists' | 'tab-rule222' | 'tab-workdays' | 'tab-dates' | 'tab-events' | 'tab-tasks';
export type TabKey = CoreTabKey | ExtraTabKey;

export type TabDef = {
  key: TabKey;
  /** Подпись в редакторе и в «Мы» */
  title: string;
  /** Короткая подпись на самой панели */
  short: string;
  text: string;
  icon: IconName;
  iconActive: IconName;
};

/** Все разделы, которые можно вынести на нижнюю панель. Ключ совпадает с именем файла в app/(tabs). */
export const TAB_DEFS: Record<TabKey, TabDef> = {
  calendar: { key: 'calendar', title: 'Календарь', short: 'Календарь', text: 'Планы, задачи и важные даты по дням', icon: 'calendar-outline', iconActive: 'calendar' },
  watch: { key: 'watch', title: 'Кино', short: 'Кино', text: 'Фильмы и сериалы, которые хочется посмотреть', icon: 'film-outline', iconActive: 'film' },
  recipes: { key: 'recipes', title: 'Еда', short: 'Еда', text: 'Рецепты и идеи, что приготовить', icon: 'restaurant-outline', iconActive: 'restaurant' },
  weekend: { key: 'weekend', title: 'Выходные', short: 'Выходные', text: 'Идеи, куда сходить вместе', icon: 'leaf-outline', iconActive: 'leaf' },
  shopping: { key: 'shopping', title: 'Покупки', short: 'Покупки', text: 'Общий список в магазин', icon: 'basket-outline', iconActive: 'basket' },
  us: { key: 'us', title: 'Мы', short: 'Мы', text: 'Бюджет, копилка, вишлисты и всё остальное', icon: 'heart-outline', iconActive: 'heart' },
  'tab-budget': { key: 'tab-budget', title: 'Бюджет', short: 'Бюджет', text: 'Расходы и доходы по категориям', icon: 'wallet-outline', iconActive: 'wallet' },
  'tab-savings': { key: 'tab-savings', title: 'Копилка', short: 'Копилка', text: 'Цели и накопления', icon: 'cash-outline', iconActive: 'cash' },
  'tab-wishlists': { key: 'tab-wishlists', title: 'Вишлисты', short: 'Вишлисты', text: 'Что подарить друг другу', icon: 'gift-outline', iconActive: 'gift' },
  'tab-rule222': { key: 'tab-rule222', title: 'Правило 2-2-2', short: '2-2-2', text: 'Свидания, новые места и страны', icon: 'sparkles-outline', iconActive: 'sparkles' },
  'tab-workdays': { key: 'tab-workdays', title: 'Рабочие дни', short: 'Работа', text: 'Свои смены и рабочие дни', icon: 'briefcase-outline', iconActive: 'briefcase' },
  'tab-dates': { key: 'tab-dates', title: 'Важные даты', short: 'Даты', text: 'Дни рождения, годовщины и праздники', icon: 'star-outline', iconActive: 'star' },
  'tab-events': { key: 'tab-events', title: 'События', short: 'События', text: 'Все планы списком', icon: 'list-outline', iconActive: 'list' },
  'tab-tasks': { key: 'tab-tasks', title: 'Задачи', short: 'Задачи', text: 'Общие дела и кто за что взялся', icon: 'checkbox-outline', iconActive: 'checkbox' },
};

/** Панель по умолчанию */
export const ALL_TABS: CoreTabKey[] = ['calendar', 'watch', 'recipes', 'weekend', 'shopping', 'us'];
export const EXTRA_TABS: ExtraTabKey[] = ['tab-budget', 'tab-savings', 'tab-wishlists', 'tab-rule222', 'tab-workdays', 'tab-dates', 'tab-events', 'tab-tasks'];
/** Порядок в редакторе: сначала основные, потом из «Мы» */
export const EVERY_TAB: TabKey[] = [...ALL_TABS, ...EXTRA_TABS];
/** «Мы» с панели убрать нельзя: через неё открываются скрытые разделы и настройки */
export const LOCKED_TAB: TabKey = 'us';
export const MIN_TABS = 2;
/** Больше шести кнопок не помещается: подписи становятся нечитаемыми */
export const MAX_TABS = 6;

/** Раздел «Мы», который можно открыть отдельной вкладкой: путь экрана и путь вкладки */
export const EXTRA_HREF: Record<ExtraTabKey, string> = {
  'tab-budget': '/budget',
  'tab-savings': '/savings',
  'tab-wishlists': '/wishlists',
  'tab-rule222': '/rule222',
  'tab-workdays': '/workdays',
  'tab-dates': '/dates',
  'tab-events': '/events',
  'tab-tasks': '/tasks',
};

const KEY = 'vdvoem.tabbar';

function sanitize(raw: unknown): TabKey[] {
  const list = Array.isArray(raw) ? raw.filter((k): k is TabKey => typeof k === 'string' && k in TAB_DEFS) : [];
  let unique = Array.from(new Set(list));
  if (!unique.includes(LOCKED_TAB)) unique.push(LOCKED_TAB);
  // Лишние сверх шести срезаем, «Мы» оставляем
  if (unique.length > MAX_TABS) unique = [...unique.filter((k) => k !== LOCKED_TAB).slice(0, MAX_TABS - 1), LOCKED_TAB];
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
