import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { humanError } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { useAuth } from '../providers/AuthProvider';
import { radius, useTheme } from '../theme';
import { AVATAR_COLORS, AVATAR_EMOJI, Avatar } from './people';
import { Button, ErrorNote, Input, Label } from './ui';

export function ProfileForm({ onDone, submitTitle = 'Сохранить' }: { onDone?: () => void; submitTitle?: string }) {
  const { c } = useTheme();
  const { profile, saveProfile } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [emoji, setEmoji] = useState(profile?.avatar_emoji ?? '🦊');
  const [color, setColor] = useState(profile?.avatar_color ?? AVATAR_COLORS[0]);
  const [city, setCity] = useState(profile?.city ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview: Profile = { id: '', display_name: name, avatar_emoji: emoji, avatar_color: color, city };

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await saveProfile({ display_name: name.trim(), avatar_emoji: emoji, avatar_color: color, city: city.trim() });
      onDone?.();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        <Avatar profile={preview} size={88} />
        <Text style={{ marginTop: 10, fontSize: 18, fontWeight: '700', color: c.text }}>{name.trim() || 'Ваше имя'}</Text>
      </View>
      <Input label="Как вас зовут" value={name} onChangeText={setName} placeholder="Например, Аня" maxLength={40} />
      <Label>Аватар</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {AVATAR_EMOJI.map((e) => (
          <Pressable
            key={e}
            onPress={() => setEmoji(e)}
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: emoji === e ? color + '33' : c.bgAlt,
              borderWidth: 2,
              borderColor: emoji === e ? color : 'transparent',
            }}
          >
            <Text style={{ fontSize: 22 }}>{e}</Text>
          </Pressable>
        ))}
      </View>
      <Label>Цвет</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {AVATAR_COLORS.map((col) => (
          <Pressable
            key={col}
            onPress={() => setColor(col)}
            accessibilityLabel={`Цвет ${col}`}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: col,
              borderWidth: 3,
              borderColor: color === col ? c.text : 'transparent',
            }}
          />
        ))}
      </View>
      <Input label="Город" value={city} onChangeText={setCity} placeholder="Москва" maxLength={60} />
      <ErrorNote text={error} />
      <Button title={submitTitle} onPress={submit} loading={busy} disabled={!name.trim()} />
    </View>
  );
}
