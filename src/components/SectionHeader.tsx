import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useUnreadCount } from '../hooks/useUnread';
import { useAuth } from '../providers/AuthProvider';
import { useSpace } from '../providers/SpaceProvider';
import { fonts, useTheme } from '../theme';
import { Avatar } from './people';

export function SectionHeader({
  title,
  subtitle,
  emoji,
  color,
  right,
  onBack,
}: {
  /** Кнопка «назад» слева от названия пространства (для экранов вне вкладок) */
  onBack?: () => void;
  title: string;
  subtitle?: string;
  emoji: string;
  color: string;
  right?: React.ReactNode;
}) {
  const { c } = useTheme();
  const { profile } = useAuth();
  const { space, live } = useSpace();
  const unread = useUnreadCount();
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Назад"
              style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: c.bgAlt, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
            >
              <Ionicons name="chevron-back" size={20} color={c.text} />
            </Pressable>
          ) : null}
          {/* Название пространства — плашкой со стрелкой, чтобы было видно, что оно нажимается */}
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Пространство «${space?.name ?? ''}»${live ? ', синхронизировано' : ''}. Открыть настройки и сменить пространство`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              flexShrink: 1,
              paddingLeft: 12,
              paddingRight: 10,
              height: 36,
              borderRadius: 18,
              backgroundColor: c.accentSoft,
              borderWidth: 1,
              borderColor: c.accent + '55',
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: live ? c.sage : c.textFaint }} />
            <Text style={{ fontSize: 14, color: c.accent, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>
              {space?.name ?? ''}
            </Text>
            <Ionicons name="chevron-down" size={15} color={c.accent} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            onPress={() => router.push('/chat')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={unread ? `Чат, непрочитанных: ${unread}` : 'Чат'}
            style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, backgroundColor: c.bgAlt, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={c.text} />
            {unread ? (
              <View style={{ position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: c.heart, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.bg }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable onPress={() => router.push('/settings')} hitSlop={8} accessibilityLabel="Настройки">
            <Avatar profile={profile} size={34} />
          </Pressable>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 32, fontWeight: '700', color: c.text, letterSpacing: -0.5 }}>
            {title} <Text style={{ fontSize: 28 }}>{emoji}</Text>
          </Text>
          {subtitle ? <Text style={{ fontSize: 15, color: c.textMuted, marginTop: 2 }}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      <View style={{ height: 3, width: 40, borderRadius: 2, backgroundColor: color, marginTop: 12 }} />
    </View>
  );
}

export function SortToggle({ value, onChange }: { value: 'likes' | 'new'; onChange: (v: 'likes' | 'new') => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={() => onChange(value === 'likes' ? 'new' : 'likes')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={value === 'likes' ? 'Сортировка: по лайкам. Нажми, чтобы показать новые' : 'Сортировка: новые. Нажми, чтобы сортировать по лайкам'}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: c.bgAlt,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={value === 'likes' ? 'heart' : 'time-outline'} size={14} color={c.textMuted} />
      <Text style={{ fontSize: 13, fontWeight: '600', color: c.textMuted }}>{value === 'likes' ? 'По лайкам' : 'Новые'}</Text>
    </Pressable>
  );
}
