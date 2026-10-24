import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Profile } from '../lib/types';
import { useAuth } from '../providers/AuthProvider';
import { useSpace } from '../providers/SpaceProvider';
import { useTheme } from '../theme';

export const AVATAR_EMOJI = ['🙂', '😊', '🦊', '🐻', '🐱', '🐶', '🐼', '🦁', '🐸', '🐧', '🦉', '🌸', '🌻', '🍓', '🍀', '⭐️', '🌙', '🔥', '🎧', '☕️'];
export const AVATAR_COLORS = ['#E0623A', '#C98618', '#4F7A55', '#3B6E8F', '#7A3F5C', '#B5523B', '#6B5CA5', '#2F8C84'];

export function Avatar({ profile, size = 32, ring }: { profile?: Profile | null; size?: number; ring?: string }) {
  const { c } = useTheme();
  const color = profile?.avatar_color ?? c.textFaint;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color + '33',
        borderWidth: ring ? 2 : 1.5,
        borderColor: ring ?? color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.52 }}>{profile?.avatar_emoji ?? '🙂'}</Text>
    </View>
  );
}

export function AvatarStack({ ids, size = 22 }: { ids: string[]; size?: number }) {
  const { people } = useSpace();
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row' }}>
      {ids.slice(0, 4).map((id, i) => (
        <View key={id} style={{ marginLeft: i === 0 ? 0 : -size * 0.35 }}>
          <Avatar profile={people[id]} size={size} ring={c.card} />
        </View>
      ))}
    </View>
  );
}

/** Имя участника; для текущего пользователя — «ты» */
export function useNameOf() {
  const { people } = useSpace();
  const { userId } = useAuth();
  return (id: string | null | undefined, opts?: { you?: string }) => {
    if (!id) return 'кто-то';
    if (id === userId) return opts?.you ?? 'ты';
    return people[id]?.display_name || 'партнёр';
  };
}

export function AddedBy({ userId, date }: { userId: string | null; date?: string }) {
  const { people } = useSpace();
  const nameOf = useNameOf();
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Avatar profile={userId ? people[userId] : null} size={20} />
      <Text style={{ fontSize: 13, color: c.textMuted }}>
        {nameOf(userId, { you: 'Ты' })}
        {date ? ` · ${date}` : ''}
      </Text>
    </View>
  );
}

export function LikeButton({ likes, onPress }: { likes: string[]; onPress: () => void }) {
  const { c } = useTheme();
  const { userId } = useAuth();
  const nameOf = useNameOf();
  const liked = !!userId && likes.includes(userId);
  const who = likes.map((id) => nameOf(id)).join(', ');
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: liked }}
      accessibilityLabel={liked ? `Убрать лайк${who ? `. Нравится: ${who}` : ''}` : `Нравится${who ? `. Уже нравится: ${who}` : ''}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: liked ? c.heart + '1F' : c.bgAlt,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? c.heart : c.textMuted} />
      {likes.length > 0 ? (
        <>
          <AvatarStack ids={likes} size={18} />
          <Text style={{ fontSize: 12, color: c.textMuted, maxWidth: 120 }} numberOfLines={1}>
            {who}
          </Text>
        </>
      ) : null}
    </Pressable>
  );
}

/** «Не нравится»: палец вниз и число голосов; кто именно — в подписи для VoiceOver */
export function DislikeButton({ dislikes, onPress }: { dislikes: string[]; onPress: () => void }) {
  const { c } = useTheme();
  const { userId } = useAuth();
  const nameOf = useNameOf();
  const disliked = !!userId && dislikes.includes(userId);
  const who = dislikes.map((id) => nameOf(id)).join(', ');
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: disliked }}
      accessibilityLabel={disliked ? 'Убрать «не нравится»' : `Не нравится${who ? `. Уже не нравится: ${who}` : ''}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: disliked ? c.textMuted + '26' : c.bgAlt,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={disliked ? 'thumbs-down' : 'thumbs-down-outline'} size={16} color={disliked ? c.text : c.textMuted} />
      {dislikes.length > 0 ? <Text style={{ fontSize: 12, color: c.textMuted, fontWeight: '600' }}>{dislikes.length}</Text> : null}
    </Pressable>
  );
}
