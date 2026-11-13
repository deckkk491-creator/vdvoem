import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { ALL_TABS, EVERY_TAB, LOCKED_TAB, MAX_TABS, MIN_TABS, TAB_DEFS, resetTabBarTabs, setTabBarTabs, useTabBarTabs, type TabKey } from '../lib/tabPrefs';
import { useTheme } from '../theme';
import { Button } from './ui';

/** Редактор нижней панели: какие разделы на ней и в каком порядке. Хранится на этом телефоне. */
export function TabBarEditor() {
  const { c } = useTheme();
  const shown = useTabBarTabs();
  const hidden = EVERY_TAB.filter((k) => !shown.includes(k));
  const full = shown.length >= MAX_TABS;
  const isDefault = shown.length === ALL_TABS.length && shown.every((k, i) => k === ALL_TABS[i]);

  const change = (next: TabKey[]) => {
    Haptics.selectionAsync().catch(() => undefined);
    setTabBarTabs(next);
  };
  // Новый раздел встаёт перед «Мы», если «Мы» стоит последним
  const add = (k: TabKey) => {
    const at = shown[shown.length - 1] === LOCKED_TAB ? shown.length - 1 : shown.length;
    change([...shown.slice(0, at), k, ...shown.slice(at)]);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= shown.length) return;
    const next = [...shown];
    [next[i], next[j]] = [next[j], next[i]];
    change(next);
  };

  const arrow = (icon: 'chevron-up' | 'chevron-down', label: string, enabled: boolean, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bgAlt, opacity: !enabled ? 0.35 : pressed ? 0.6 : 1 })}
    >
      <Ionicons name={icon} size={18} color={c.text} />
    </Pressable>
  );

  const row = (k: TabKey, i: number, on: boolean, first: boolean) => {
    const t = TAB_DEFS[k];
    const locked = k === LOCKED_TAB;
    return (
      <View key={k} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: first ? 0 : 1, borderColor: c.border, paddingVertical: 6 }}>
        <Ionicons name={on ? t.iconActive : t.icon} size={22} color={on ? c.accent : c.textFaint} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: on ? c.text : c.textMuted, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
            {t.title}
          </Text>
          {locked ? (
            <Text style={{ color: c.textFaint, fontSize: 12 }}>Всегда на панели</Text>
          ) : !on ? (
            <Text style={{ color: c.textFaint, fontSize: 12 }} numberOfLines={1}>
              {t.text}
            </Text>
          ) : null}
        </View>
        {on ? (
          <>
            {arrow('chevron-up', `${t.title}: левее`, i > 0, () => move(i, -1))}
            {arrow('chevron-down', `${t.title}: правее`, i < shown.length - 1, () => move(i, 1))}
          </>
        ) : null}
        <Switch
          value={on}
          disabled={locked || (on && shown.length <= MIN_TABS) || (!on && full)}
          onValueChange={(v) => (v ? add(k) : change(shown.filter((x) => x !== k)))}
          trackColor={{ true: c.accent, false: c.border }}
          accessibilityLabel={`${t.title}: показывать на панели`}
        />
      </View>
    );
  };

  return (
    <View>
      <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 2 }}>
        На панели · {shown.length} из {MAX_TABS}
      </Text>
      {shown.map((k, i) => row(k, i, true, i === 0))}
      {hidden.length ? (
        <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 2 }}>
          {full ? `Можно добавить — сначала убери что-то с панели (больше ${MAX_TABS} не помещается)` : 'Можно добавить'}
        </Text>
      ) : null}
      {hidden.map((k, i) => row(k, i, false, i === 0))}
      <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 10 }}>
        Стрелки меняют порядок слева направо. Всё, чего нет на панели, открывается из «Мы». Настройка хранится на этом телефоне.
      </Text>
      {!isDefault ? <Button title="Вернуть как было" small variant="ghost" icon="refresh" onPress={resetTabBarTabs} style={{ alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 0 }} /> : null}
    </View>
  );
}
