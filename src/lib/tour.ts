import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

// Номер в ключе меняем, когда тур стоит показать заново (появились новые разделы)
const KEY = 'vdvoem.tour.v1';

let visible = false;
const listeners = new Set<() => void>();
const emit = (v: boolean) => {
  visible = v;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const get = () => visible;

export function useTourVisible(): boolean {
  return useSyncExternalStore(subscribe, get, get);
}

/** Показать тур, если его ещё не видели на этом телефоне */
export function showTourOnce() {
  AsyncStorage.getItem(KEY)
    .then((seen) => {
      if (!seen) emit(true);
    })
    .catch(() => undefined);
}

/** Показать тур ещё раз (из настроек) */
export function openTour() {
  emit(true);
}

export function closeTour() {
  emit(false);
  AsyncStorage.setItem(KEY, '1').catch(() => undefined);
}
