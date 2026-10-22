import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, space, TAB_BAR_HEIGHT, TAP, useTheme } from '../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ------------------------------ Typography ------------------------------ */

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return <Text style={[{ fontFamily: fonts.display, fontSize: 30, fontWeight: '700', color: c.text, letterSpacing: -0.3 }, style]}>{children}</Text>;
}

export function H2({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return <Text style={[{ fontFamily: fonts.display, fontSize: 20, fontWeight: '700', color: c.text }, style]}>{children}</Text>;
}

export function Body({
  children,
  muted,
  faint,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  muted?: boolean;
  faint?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const { c } = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontSize: 15, lineHeight: 21, color: faint ? c.textFaint : muted ? c.textMuted : c.text }, style]}>
      {children}
    </Text>
  );
}

export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return (
    <Text style={[{ fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: c.textMuted, marginBottom: 6 }, style]}>
      {children}
    </Text>
  );
}

/* ------------------------------ Layout ------------------------------ */

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const inner = [{ paddingHorizontal: padded ? space.lg : 0, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + 120 }, style];
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: c.bg }, ...inner]}>{children}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={inner} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
  onPress,
  onLongPress,
  tint,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  tint?: string;
}) {
  const { c } = useTheme();
  const base: ViewStyle = {
    backgroundColor: tint ?? c.card,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  };
  if (!onPress && !onLongPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [base, pressed && { backgroundColor: c.cardPressed, transform: [{ scale: 0.99 }] }, style]}
    >
      {children}
    </Pressable>
  );
}

export function Row({ children, style, gap = space.sm }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Spacer({ h = space.lg }: { h?: number }) {
  return <View style={{ height: h }} />;
}

/* ------------------------------ Controls ------------------------------ */

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  small,
  color,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  color?: string;
}) {
  const { c } = useTheme();
  const accent = color ?? c.accent;
  const bg =
    variant === 'primary' ? accent : variant === 'secondary' ? c.bgAlt : variant === 'danger' ? c.dangerSoft : 'transparent';
  const fg = variant === 'primary' ? c.onAccent : variant === 'danger' ? c.danger : variant === 'ghost' ? accent : c.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      hitSlop={small ? 4 : undefined}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.pill,
          minHeight: small ? 36 : TAP + 4,
          paddingVertical: small ? 8 : 14,
          paddingHorizontal: small ? 14 : 22,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 19} color={fg} /> : null}
          <Text style={{ color: fg, fontSize: small ? 14 : 16, fontWeight: '700' }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  color,
  size = 22,
  bg,
  label,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  size?: number;
  bg?: string;
  label?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={Math.max(4, (TAP - (size + 18)) / 2 + 4)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: size + 18,
        height: size + 18,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg ?? 'transparent',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={size} color={color ?? c.text} />
    </Pressable>
  );
}

export function Input({
  label,
  style,
  containerStyle,
  ...props
}: TextInputProps & { label?: string; containerStyle?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ marginBottom: space.md }, containerStyle]}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        placeholderTextColor={c.textFaint}
        selectionColor={c.accent}
        {...props}
        style={[
          {
            backgroundColor: c.bgAlt,
            borderRadius: radius.md,
            paddingHorizontal: 16,
            paddingVertical: props.multiline ? 12 : 13,
            fontSize: 16,
            color: c.text,
            minHeight: props.multiline ? 88 : undefined,
            textAlignVertical: props.multiline ? 'top' : 'center',
          },
          style,
        ]}
      />
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  color,
  small,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
  small?: boolean;
  icon?: IconName;
}) {
  const { c } = useTheme();
  const accent = color ?? c.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={small ? { top: 10, bottom: 10, left: 2, right: 2 } : { top: 5, bottom: 5 }}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => ({
        paddingHorizontal: small ? 10 : 14,
        paddingVertical: small ? 4 : 8,
        borderRadius: radius.pill,
        backgroundColor: active ? accent : c.bgAlt,
        borderWidth: 1,
        borderColor: active ? accent : c.border,
        opacity: pressed ? 0.75 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      })}
    >
      {icon ? <Ionicons name={icon} size={small ? 12 : 14} color={active ? c.onAccent : c.textMuted} /> : null}
      <Text style={{ fontSize: small ? 12 : 14, fontWeight: '600', color: active ? c.onAccent : c.textMuted }}>{label}</Text>
    </Pressable>
  );
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  color,
  labels,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  color?: string;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.md }}>
      {options.map((o) => (
        <Chip key={o} label={labels?.[o] ?? o} active={value === o} onPress={() => onChange(o)} color={color} />
      ))}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.bgAlt, borderRadius: radius.pill, padding: 3 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              minHeight: 38,
              justifyContent: 'center',
              paddingVertical: 7,
              paddingHorizontal: 10,
              borderRadius: radius.pill,
              backgroundColor: active ? c.card : 'transparent',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOpacity: active ? 0.08 : 0,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 1 },
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: active ? c.text : c.textMuted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ value, color, height = 10 }: { value: number; color?: string; height?: number }) {
  const { c } = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.bgAlt, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(pct * 1000) / 10}%` as `${number}%`, height: '100%', borderRadius: height, backgroundColor: color ?? c.accent }} />
    </View>
  );
}

/* ------------------------------ Feedback ------------------------------ */

export function EmptyState({
  emoji,
  title,
  text,
  action,
  onAction,
  color,
}: {
  emoji: string;
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
  color?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
      <View
        style={{
          width: 108,
          height: 108,
          borderRadius: 54,
          backgroundColor: c.bgAlt,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
          borderWidth: 2,
          borderColor: c.border,
          borderStyle: 'dashed',
        }}
      >
        <Text style={{ fontSize: 48 }}>{emoji}</Text>
      </View>
      <H2 style={{ textAlign: 'center', marginBottom: 6 }}>{title}</H2>
      <Body muted style={{ textAlign: 'center', maxWidth: 300 }}>
        {text}
      </Body>
      {action && onAction ? <Button title={action} onPress={onAction} icon="add" style={{ marginTop: 20 }} color={color} /> : null}
    </View>
  );
}

export function Loading() {
  const { c } = useTheme();
  return (
    <View style={{ paddingVertical: 60, alignItems: 'center' }}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

export function ErrorNote({ text }: { text: string | null }) {
  const { c } = useTheme();
  if (!text) return null;
  return (
    <View style={{ backgroundColor: c.dangerSoft, borderRadius: radius.md, padding: 12, marginBottom: space.md }}>
      <Text style={{ color: c.danger, fontSize: 14 }}>{text}</Text>
    </View>
  );
}

/* ------------------------------ Sheet ------------------------------ */

export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm }}>
          <H2 style={{ flex: 1 }}>{title}</H2>
          <IconButton icon="close" onPress={onClose} bg={c.bgAlt} size={20} label="Закрыть" />
        </View>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ? (
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.lg), borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border, backgroundColor: c.bg }}>
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ------------------------------ FAB ------------------------------ */

export function Fab({
  onPress,
  color,
  icon = 'add',
  label,
  overTabBar = true,
}: {
  onPress: () => void;
  color?: string;
  icon?: IconName;
  label?: string;
  /** Кнопка над нижним таб-баром (по умолчанию) или на экране без него */
  overTabBar?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = overTabBar ? TAB_BAR_HEIGHT + Math.max(insets.bottom, space.sm) + space.lg : Math.max(insets.bottom, space.lg) + space.sm;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label ?? 'Добавить'}
      style={({ pressed }) => ({
        position: 'absolute',
        right: 20,
        bottom,
        height: 58,
        minWidth: 58,
        paddingHorizontal: label ? 20 : 0,
        borderRadius: 29,
        backgroundColor: color ?? c.accent,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
        shadowColor: color ?? c.accent,
        shadowOpacity: 0.4,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}
    >
      <Ionicons name={icon} size={28} color={c.onAccent} />
      {label ? <Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 16 }}>{label}</Text> : null}
    </Pressable>
  );
}
