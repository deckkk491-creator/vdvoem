import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, Text, View } from 'react-native';
import { radius, useTheme } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** На сколько нужно сдвинуть карточку влево, чтобы действие сработало */
const TRIGGER = 110;

/**
 * Карточка, которую можно смахнуть влево: под ней проступает подпись действия,
 * и если отпустить дальше порога — действие выполняется.
 * Вертикальную прокрутку не перехватывает: срабатывает только явное движение вбок.
 */
export function SwipeAction({
  children,
  label,
  icon,
  color,
  onAction,
  enabled = true,
}: {
  children: React.ReactNode;
  label: string;
  icon: IconName;
  color: string;
  onAction: () => void;
  enabled?: boolean;
}) {
  const { c } = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const passed = useRef(false);
  const live = useRef({ onAction, enabled });
  live.current = { onAction, enabled };

  const pan = useMemo(() => {
    const back = () => Animated.spring(x, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220 }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => live.current.enabled && g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onMoveShouldSetPanResponderCapture: (_, g) => live.current.enabled && g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        passed.current = false;
      },
      onPanResponderMove: (_, g) => {
        const dx = Math.min(0, g.dx);
        x.setValue(dx);
        const over = dx < -TRIGGER;
        if (over !== passed.current) {
          passed.current = over;
          Haptics.selectionAsync().catch(() => undefined);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -TRIGGER) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
          // Карточка уезжает за край, потом действие убирает её из списка
          Animated.timing(x, { toValue: -600, duration: 180, useNativeDriver: true }).start(() => {
            live.current.onAction();
            x.setValue(0);
          });
        } else back();
      },
      onPanResponderTerminate: back,
    });
  }, [x]);

  const reveal = x.interpolate({ inputRange: [-TRIGGER, -20, 0], outputRange: [1, 0.3, 0], extrapolate: 'clamp' });

  return (
    <View>
      {/* Карточка внутри сама держит отступ снизу 12 — фон действия его не закрывает */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 12,
          left: 0,
          right: 0,
          borderRadius: radius.lg,
          backgroundColor: color + '33',
          borderWidth: 1,
          borderColor: color + '55',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 22,
          gap: 8,
          opacity: reveal,
        }}
      >
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{label}</Text>
        <Ionicons name={icon} size={22} color={color} />
      </Animated.View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }] }}>
        {children}
      </Animated.View>
    </View>
  );
}
