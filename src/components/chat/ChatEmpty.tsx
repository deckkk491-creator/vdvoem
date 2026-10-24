import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { sectionStyle, useTheme } from '../../theme';
import { Chip } from '../ui';

export const QUICK_REPLIES = ['Люблю тебя ❤️', 'Купить что-нибудь?', 'Во сколько будешь?'];

/** Пустой чат: тёплое приглашение и быстрые ответы, которые вставляются в поле ввода */
export function ChatEmpty({ onPick }: { onPick: (text: string) => void }) {
  const { c } = useTheme();
  const sec = sectionStyle(c, 'chat');
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
      <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: sec.bg, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 44 }} accessibilityElementsHidden importantForAccessibility="no">
          {sec.emoji}
        </Text>
      </View>
      <Text style={{ fontSize: 16, lineHeight: 22, color: c.textMuted, textAlign: 'center', maxWidth: 280, marginBottom: 18 }}>
        Здесь будут ваши сообщения. Напиши что-нибудь приятное 💛
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, maxWidth: 340 }}>
        {QUICK_REPLIES.map((t) => (
          <Chip key={t} label={t} onPress={() => onPick(t)} />
        ))}
      </View>
    </ScrollView>
  );
}
