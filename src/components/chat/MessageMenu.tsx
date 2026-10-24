import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MORE_REACTIONS, QUICK_REACTIONS } from '../../hooks/useReactions';
import { radius, useTheme } from '../../theme';

export type MenuAction = { text: string; icon: React.ComponentProps<typeof Ionicons>['name']; destructive?: boolean; onPress: () => void };

/**
 * Меню сообщения как в Telegram: панель реакций над сообщением и список действий под ним.
 * Фон затемнён, нажатие мимо — закрыть.
 */
export function MessageMenu({
  visible,
  mine,
  preview,
  current,
  actions,
  onReact,
  onClose,
}: {
  visible: boolean;
  mine: boolean;
  /** Текст сообщения или «Фото» / «Файл …» */
  preview: string;
  /** Моя текущая реакция на это сообщение */
  current: string | null;
  actions: MenuAction[];
  onReact: (emoji: string) => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [more, setMore] = useState(false);
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (!visible) return;
    setMore(false);
    scale.setValue(0.9);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 120 }).start();
  }, [visible, scale]);

  const pick = (e: string) => {
    onClose();
    onReact(e);
  };

  const side = mine ? 'flex-end' : 'flex-start';
  const maxW = Math.min(width - 32, 380);

  const emojiButton = (e: string, size: number) => {
    const active = current === e;
    return (
      <Pressable
        key={e}
        onPress={() => pick(e)}
        accessibilityRole="button"
        accessibilityLabel={active ? `Убрать реакцию ${e}` : `Реакция ${e}`}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? c.accentSoft : 'transparent',
          transform: [{ scale: pressed ? 1.25 : 1 }],
        })}
      >
        <Text style={{ fontSize: size * 0.62 }}>{e}</Text>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} accessibilityLabel="Закрыть меню" accessibilityRole="button">
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}>
          <Animated.View style={{ alignItems: side, transform: [{ scale }] }} onStartShouldSetResponder={() => true}>
            {/* Реакции */}
            {more ? (
              <View style={{ width: maxW, backgroundColor: c.card, borderRadius: radius.lg, padding: 8, marginBottom: 10, maxHeight: 260 }}>
                <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {MORE_REACTIONS.map((e) => emojiButton(e, 44))}
                </ScrollView>
              </View>
            ) : (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: c.card,
                  borderRadius: radius.pill,
                  paddingHorizontal: 6,
                  paddingVertical: 4,
                  marginBottom: 10,
                  maxWidth: maxW,
                  shadowColor: '#000',
                  shadowOpacity: 0.25,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 4 },
                }}
              >
                {QUICK_REACTIONS.map((e) => emojiButton(e, Math.min(42, (maxW - 56) / QUICK_REACTIONS.length)))}
                <Pressable
                  onPress={() => setMore(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Ещё реакции"
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.bgAlt, alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}
                >
                  <Ionicons name="chevron-down" size={18} color={c.textMuted} />
                </Pressable>
              </View>
            )}

            {/* Само сообщение */}
            {preview ? (
              <View
                style={{
                  maxWidth: maxW * 0.85,
                  backgroundColor: mine ? c.accent : c.card,
                  borderRadius: radius.lg,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: mine ? c.onAccent : c.text, fontSize: 16, lineHeight: 21 }} numberOfLines={8}>
                  {preview}
                </Text>
              </View>
            ) : null}

            {/* Действия */}
            {actions.length ? (
              <View style={{ width: Math.min(maxW, 280), backgroundColor: c.card, borderRadius: radius.lg, overflow: 'hidden' }}>
                {actions.map((a, i) => (
                  <Pressable
                    key={a.text}
                    onPress={() => {
                      onClose();
                      // Даём меню закрыться, прежде чем показать подтверждение или открыть почту
                      setTimeout(a.onPress, 250);
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      paddingHorizontal: 16,
                      minHeight: 48,
                      backgroundColor: pressed ? c.cardPressed : 'transparent',
                      borderTopWidth: i ? 1 : 0,
                      borderColor: c.border,
                    })}
                  >
                    <Ionicons name={a.icon} size={21} color={a.destructive ? c.danger : c.text} />
                    <Text style={{ fontSize: 16, color: a.destructive ? c.danger : c.text }}>{a.text}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Animated.View>
        </View>
      </Pressable>
    </Modal>
  );
}

/** Реакции под пузырём: «❤️ 2», моя подсвечена; нажатие — поставить или убрать свою */
export function ReactionChips({
  reactions,
  mine,
  onToggle,
}: {
  reactions: { emoji: string; count: number; mine: boolean }[];
  /** Сообщение моё — выравниваем вправо */
  mine: boolean;
  onToggle: (emoji: string) => void;
}) {
  const { c } = useTheme();
  if (!reactions.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      {reactions.map((r) => (
        <Pressable
          key={r.emoji}
          onPress={() => onToggle(r.emoji)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`${r.emoji} ${r.count}${r.mine ? ', твоя реакция' : ''}`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            paddingHorizontal: 8,
            height: 28,
            borderRadius: 14,
            backgroundColor: r.mine ? c.accentSoft : c.card,
            borderWidth: 1,
            borderColor: r.mine ? c.accent : c.border,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontSize: 15 }}>{r.emoji}</Text>
          {r.count > 1 ? <Text style={{ fontSize: 13, fontWeight: '700', color: r.mine ? c.accent : c.textMuted }}>{r.count}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}
