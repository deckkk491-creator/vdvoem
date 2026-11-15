import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, Tabs } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LOCKED_TAB, TAB_DEFS, useTabBarTabs } from '../lib/tabPrefs';
import { TAB_BAR_HEIGHT, tabBarOffset, useTheme } from '../theme';

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Поля панели: от края экрана и от края панели до кнопок */
const SIDE = 8;
const PAD = 5;
/** На раскрытом iPhone Duo и в широких окнах панель не растягивается на всю ширину */
const MAX_WIDTH = 520;

/**
 * Плавающая нижняя панель: «таблетка» с подсветкой, которая плавно переезжает к выбранному разделу.
 * По панели можно вести пальцем — подсветка идёт за ним, раздел открывается, когда палец отпущен.
 * Состав и порядок разделов — из настроек (`tabPrefs`), скрытые разделы открываются из «Мы».
 */
export function FloatingTabBar({ state }: TabBarProps) {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const keys = useTabBarTabs();

  const tabs = useMemo(() => keys.map((k) => TAB_DEFS[k]).filter((t) => state.routes.some((r) => r.name === t.key)), [keys, state.routes]);
  const count = Math.max(tabs.length, 1);
  const activeName = state.routes[state.index]?.name;
  // Раздел скрыт с панели и открыт из «Мы» — подсвечиваем «Мы»
  const found = tabs.findIndex((t) => t.key === activeName);
  const activeIdx = Math.max(found >= 0 ? found : tabs.findIndex((t) => t.key === LOCKED_TAB), 0);

  const free = winW - insets.left - insets.right;
  const barW = Math.min(free - SIDE * 2, MAX_WIDTH);
  const barLeft = insets.left + (free - barW) / 2;
  const tabW = (barW - PAD * 2) / count;
  const fontSize = tabW >= 66 ? 11 : tabW >= 58 ? 10 : 9;

  const x = useRef(new Animated.Value(activeIdx * tabW)).current;
  const squash = useRef(new Animated.Value(0)).current;
  const dragging = useRef(false);
  const [hover, setHover] = useState<number | null>(null);

  const settle = (idx: number) => {
    Animated.spring(x, { toValue: idx * tabW, useNativeDriver: true, damping: 17, stiffness: 210, mass: 0.8 }).start();
  };

  useEffect(() => {
    if (dragging.current) return;
    settle(activeIdx);
    // Лёгкое «растяжение» подсветки, пока она едет
    squash.setValue(1);
    Animated.timing(squash, { toValue: 0, duration: 320, useNativeDriver: true }).start();
    // settle зависит только от tabW и x
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, tabW]);

  const go = (idx: number) => {
    const tab = tabs[idx];
    if (!tab || activeName === tab.key) return;
    Haptics.selectionAsync().catch(() => undefined);
    router.navigate(`/(tabs)/${tab.key}`);
  };

  // PanResponder создаётся один раз, поэтому свежие размеры и обработчики берёт отсюда
  const live = useRef({ barLeft, tabW, count, activeIdx, go, settle });
  live.current = { barLeft, tabW, count, activeIdx, go, settle };
  const hoverRef = useRef<number | null>(null);

  const pan = useMemo(() => {
    const indexAt = (pageX: number) => {
      const g = live.current;
      const pos = Math.min(Math.max(pageX - g.barLeft - PAD - g.tabW / 2, 0), (g.count - 1) * g.tabW);
      return { pos, idx: Math.round(pos / g.tabW) };
    };
    const horizontal = (dx: number, dy: number) => Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5;
    const finish = (select: boolean) => {
      dragging.current = false;
      const idx = hoverRef.current;
      hoverRef.current = null;
      setHover(null);
      const g = live.current;
      if (select && idx !== null && idx !== g.activeIdx) {
        g.settle(idx);
        g.go(idx);
      } else g.settle(g.activeIdx);
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => horizontal(g.dx, g.dy),
      onMoveShouldSetPanResponderCapture: (_, g) => horizontal(g.dx, g.dy),
      onPanResponderGrant: (e) => {
        dragging.current = true;
        x.stopAnimation();
        const { pos, idx } = indexAt(e.nativeEvent.pageX);
        x.setValue(pos);
        hoverRef.current = idx;
        setHover(idx);
      },
      onPanResponderMove: (e) => {
        const { pos, idx } = indexAt(e.nativeEvent.pageX);
        x.setValue(pos);
        if (idx !== hoverRef.current) {
          hoverRef.current = idx;
          setHover(idx);
          Haptics.selectionAsync().catch(() => undefined);
        }
      },
      onPanResponderRelease: () => finish(true),
      onPanResponderTerminate: () => finish(false),
    });
  }, [x]);

  const lit = hover ?? activeIdx;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: barLeft, bottom: tabBarOffset(insets.bottom), width: barW }}>
      <View
        {...pan.panHandlers}
        accessibilityRole="tablist"
        style={{
          height: TAB_BAR_HEIGHT,
          borderRadius: TAB_BAR_HEIGHT / 2,
          padding: PAD,
          flexDirection: 'row',
          backgroundColor: c.card,
          borderWidth: dark ? 1 : StyleSheet.hairlineWidth,
          borderColor: c.border,
          shadowColor: '#000',
          shadowOpacity: dark ? 0.5 : 0.14,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: PAD,
            top: PAD,
            bottom: PAD,
            width: tabW,
            borderRadius: (TAB_BAR_HEIGHT - PAD * 2) / 2,
            backgroundColor: c.accentSoft,
            borderWidth: 1,
            borderColor: c.accent + '40',
            transform: [
              { translateX: x },
              { scaleX: squash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] }) },
              { scaleY: squash.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) },
            ],
          }}
        />
        {tabs.map((t, i) => {
          const on = i === lit;
          const color = on ? c.accent : c.textFaint;
          return (
            <Pressable
              key={t.key}
              onPress={() => go(i)}
              accessibilityRole="tab"
              accessibilityLabel={t.title}
              accessibilityState={{ selected: i === activeIdx }}
              android_ripple={Platform.OS === 'android' ? { color: c.accent + '22', borderless: true, radius: tabW / 2 } : undefined}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }}
            >
              <Ionicons name={on ? t.iconActive : t.icon} size={22} color={color} />
              {/* Размер подписи подобран под ширину кнопки, поэтому системное увеличение шрифта здесь выключено */}
              <Text numberOfLines={1} allowFontScaling={false} style={{ fontSize, fontWeight: '700', color, includeFontPadding: false }}>
                {t.short}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
