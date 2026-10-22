import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
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
}: {
  title: string;
  subtitle?: string;
  emoji: string;
  color: string;
  right?: React.ReactNode;
}) {
  const { c } = useTheme();
  const { profile } = useAuth();
  const { space, live } = useSpace();
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Pressable onPress={() => router.push('/settings')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} hitSlop={8}>
          <Text style={{ fontSize: 13, color: c.textMuted, fontWeight: '600' }} numberOfLines={1}>
            {space?.name ?? ''}
          </Text>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: live ? c.sage : c.textFaint }} />
        </Pressable>
        <Pressable onPress={() => router.push('/settings')} hitSlop={8} accessibilityLabel="Настройки">
          <Avatar profile={profile} size={34} />
        </Pressable>
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
