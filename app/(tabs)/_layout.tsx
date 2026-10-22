import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT, space, useTheme } from '../../src/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: { name: string; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'watch', title: 'Кино', icon: 'film-outline', iconActive: 'film' },
  { name: 'recipes', title: 'Еда', icon: 'restaurant-outline', iconActive: 'restaurant' },
  { name: 'weekend', title: 'Выходные', icon: 'leaf-outline', iconActive: 'leaf' },
  { name: 'savings', title: 'Копилка', icon: 'wallet-outline', iconActive: 'wallet' },
  { name: 'shopping', title: 'Покупки', icon: 'basket-outline', iconActive: 'basket' },
  { name: 'us', title: 'Мы', icon: 'heart-outline', iconActive: 'heart' },
];

export default function TabsLayout() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  // На iPhone с «чёлкой» — системный отступ, на iPhone SE и Android — свой небольшой
  const bottomPad = Math.max(insets.bottom, space.sm);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textFaint,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700' },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: c.card,
          borderTopColor: c.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: TAB_BAR_HEIGHT + bottomPad,
          paddingTop: 6,
          paddingBottom: bottomPad,
        },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color, focused, size }) => <Ionicons name={focused ? t.iconActive : t.icon} size={size - 2} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
