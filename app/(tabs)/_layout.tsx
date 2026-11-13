import { Tabs } from 'expo-router';
import React from 'react';
import { FloatingTabBar } from '../../src/components/TabBar';
import { Tour } from '../../src/components/Tour';
import { EVERY_TAB, TAB_DEFS, type TabKey } from '../../src/lib/tabPrefs';
import { useTheme } from '../../src/theme';

/** Эти экраны рассчитаны на системный заголовок сверху (когда открыты из «Мы» — это шапка со стрелкой «Назад») */
const WITH_HEADER: TabKey[] = ['tab-wishlists', 'tab-rule222', 'tab-workdays', 'tab-dates', 'tab-events', 'tab-tasks'];

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <>
      <Tabs
        // Своя плавающая панель: состав и порядок разделов каждый настраивает сам (Настройки → Нижняя панель)
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          // Экраны сменяются с лёгким сдвигом, а не рывком
          animation: 'shift',
          sceneStyle: { backgroundColor: c.bg },
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.accent,
          headerTitleStyle: { color: c.text, fontWeight: '700' },
          headerShadowVisible: false,
        }}
      >
        {/* Все разделы, которые можно вынести на панель; на самой панели видны только выбранные */}
        {EVERY_TAB.map((k) => (
          <Tabs.Screen key={k} name={k} options={{ title: TAB_DEFS[k].title, headerShown: WITH_HEADER.includes(k) }} />
        ))}
      </Tabs>
      {/* Обучающий тур: один раз после первого входа, повторно — из настроек */}
      <Tour />
    </>
  );
}
