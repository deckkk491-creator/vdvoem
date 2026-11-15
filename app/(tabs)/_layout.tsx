import { Tabs } from 'expo-router';
import React from 'react';
import { FloatingTabBar } from '../../src/components/TabBar';
import { ALL_TABS, TAB_DEFS } from '../../src/lib/tabPrefs';
import { useTheme } from '../../src/theme';

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <Tabs
      // Своя плавающая панель: состав и порядок разделов каждый настраивает сам (Настройки → Нижняя панель)
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Экраны сменяются с лёгким сдвигом, а не рывком
        animation: 'shift',
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      {ALL_TABS.map((k) => (
        <Tabs.Screen key={k} name={k} options={{ title: TAB_DEFS[k].title }} />
      ))}
    </Tabs>
  );
}
