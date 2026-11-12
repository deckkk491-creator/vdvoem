import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Celebration } from '../lib/types';
import { fonts, useTheme } from '../theme';
import { Button } from './ui';

const COLORS = ['#F5CB8E', '#F07A52', '#9CC79F', '#8DBAD6', '#D29AB6', '#FF6B6F', '#B9A2EE', '#F2B84B'];

/** Конфетти: цветные кусочки падают сверху вниз, покачиваясь и вращаясь */
function Confetti({ w, h }: { w: number; h: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.timing(t, { toValue: 1, duration: 4200, easing: Easing.linear, useNativeDriver: true }), { iterations: 5 });
    anim.start();
    return () => anim.stop();
  }, [t]);
  const parts = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        x: Math.random() * w,
        drift: (Math.random() - 0.5) * 140,
        delay: 0.02 + Math.random() * 0.5,
        size: 7 + Math.random() * 7,
        color: COLORS[i % COLORS.length],
        turns: (Math.random() > 0.5 ? 1 : -1) * (2 + Math.round(Math.random() * 4)),
        round: Math.random() > 0.7,
      })),
    [w],
  );
  return (
    <>
      {parts.map((p, i) => {
        const end = p.delay + 0.46;
        const range = [0, p.delay, end, 1];
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: p.x,
              top: 0,
              width: p.size,
              height: p.round ? p.size : p.size * 1.7,
              borderRadius: p.round ? p.size / 2 : 2,
              backgroundColor: p.color,
              transform: [
                { translateY: t.interpolate({ inputRange: range, outputRange: [-40, -40, h + 40, h + 40] }) },
                { translateX: t.interpolate({ inputRange: range, outputRange: [0, 0, p.drift, p.drift] }) },
                { rotate: t.interpolate({ inputRange: range, outputRange: ['0deg', '0deg', `${p.turns * 360}deg`, `${p.turns * 360}deg`] }) },
              ],
            }}
          />
        );
      })}
    </>
  );
}

/** Фейерверк: несколько залпов, искры разлетаются из центра и гаснут */
function Fireworks({ w, h }: { w: number; h: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.timing(t, { toValue: 1, duration: 3800, easing: Easing.linear, useNativeDriver: true }), { iterations: 5 });
    anim.start();
    return () => anim.stop();
  }, [t]);
  const sparks = useMemo(() => {
    const out: { cx: number; cy: number; dx: number; dy: number; t0: number; color: string; size: number }[] = [];
    const bursts = 6;
    const perBurst = 14;
    for (let b = 0; b < bursts; b++) {
      const cx = w * (0.15 + Math.random() * 0.7);
      const cy = h * (0.12 + Math.random() * 0.4);
      const radius = 70 + Math.random() * 70;
      const t0 = 0.03 + b * 0.15;
      const color = COLORS[b % COLORS.length];
      for (let i = 0; i < perBurst; i++) {
        const a = (i / perBurst) * Math.PI * 2;
        const r = radius * (0.75 + Math.random() * 0.35);
        out.push({ cx, cy, dx: Math.cos(a) * r, dy: Math.sin(a) * r + 24, t0, color, size: 5 + Math.random() * 3 });
      }
    }
    return out;
  }, [w, h]);
  return (
    <>
      {sparks.map((s, i) => {
        const range = [0, s.t0, s.t0 + 0.14, s.t0 + 0.2, 1];
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: s.cx,
              top: s.cy,
              width: s.size,
              height: s.size,
              borderRadius: s.size / 2,
              backgroundColor: s.color,
              opacity: t.interpolate({ inputRange: range, outputRange: [0, 1, 1, 0, 0] }),
              transform: [
                { translateX: t.interpolate({ inputRange: range, outputRange: [0, 0, s.dx * 0.85, s.dx, s.dx] }) },
                { translateY: t.interpolate({ inputRange: range, outputRange: [0, 0, s.dy * 0.85, s.dy, s.dy] }) },
              ],
            }}
          />
        );
      })}
    </>
  );
}

/** Поздравление на весь экран в день события: фейерверк или конфетти, значок, название и подпись */
export function CelebrationScreen({
  kind,
  emoji,
  title,
  subtitle,
  onClose,
}: {
  kind: Celebration;
  emoji: string;
  title: string;
  subtitle: string | null;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 9, stiffness: 120 }).start();
  }, [pop]);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable onPress={onClose} accessibilityLabel="Закрыть поздравление" style={{ flex: 1, backgroundColor: 'rgba(8, 6, 5, 0.88)' }}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {kind === 'confetti' ? <Confetti w={width} h={height} /> : <Fireworks w={width} h={height} />}
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <Animated.Text style={{ fontSize: 88, transform: [{ scale: pop }] }}>{emoji}</Animated.Text>
          <Text style={{ color: '#F5CB8E', fontSize: 14, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 18 }}>Сегодня</Text>
          <Text style={{ color: '#FFFFFF', fontFamily: fonts.display, fontSize: 32, fontWeight: '700', textAlign: 'center', marginTop: 6 }}>{title}</Text>
          {subtitle ? <Text style={{ color: '#E9DCCF', fontSize: 17, textAlign: 'center', marginTop: 8 }}>{subtitle}</Text> : null}
          <Button title="Ура! 🎉" onPress={onClose} color={c.accent} style={{ marginTop: 32, minWidth: 180 }} />
        </View>
      </Pressable>
    </Modal>
  );
}
