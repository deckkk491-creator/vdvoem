import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { closeTour, showTourOnce, useTourVisible } from '../lib/tour';
import { fonts, MAX_CONTENT_WIDTH, radius, TAB_BAR_HEIGHT, tabBarOffset, useTheme } from '../theme';
import { Button } from './ui';

type Step = { emoji: string; title: string; text: string; points?: string[] };

const STEPS: Step[] = [
  {
    emoji: '👋',
    title: 'Добро пожаловать во «Вместе»',
    text: 'Это общее пространство для пары, семьи или друзей. Всё, что ты добавляешь, сразу видят остальные участники.',
  },
  {
    emoji: '👇',
    title: 'Разделы — внизу',
    text: 'Нижняя панель переключает разделы. По ней можно вести пальцем — подсветка пойдёт следом.',
    points: ['Календарь — планы, задачи и важные даты', 'Кино, Еда, Выходные — идеи с лайками', 'Покупки — общий список', 'Мы — бюджет, копилка и остальное'],
  },
  {
    emoji: '📅',
    title: 'Календарь',
    text: 'Всё общее — в одном месте. Нажми «+», чтобы добавить событие, задачу или важную дату и выбрать, когда напомнить.',
  },
  {
    emoji: '💡',
    title: 'Идеи выбираете вместе',
    text: 'В разделах «Кино», «Еда» и «Выходные» сохраняйте идеи и ставьте лайки — то, что нравится большинству, поднимается наверх.',
    points: ['«Что приготовить сегодня?» подскажет три блюда'],
  },
  {
    emoji: '🧺',
    title: 'Покупки',
    text: 'Напиши, что купить, — остальные увидят сразу, даже если кто-то уже в магазине. Отмеченное через пару секунд исчезает само.',
  },
  {
    emoji: '💛',
    title: 'Раздел «Мы»',
    text: 'Здесь всё остальное: бюджет с расходами и доходами, копилка, вишлисты, рабочие дни и правило 2-2-2.',
  },
  {
    emoji: '🎨',
    title: 'Сделай под себя',
    text: 'В настройках (аватар справа вверху) меняются цвета, тема и разделы на нижней панели. Там же код, чтобы пригласить близких.',
  },
];

/** Обучающий тур: несколько карточек о том, что где находится. Показывается один раз, повторно — из настроек. */
export function Tour() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const visible = useTourVisible();
  const [i, setI] = useState(0);

  useEffect(() => {
    showTourOnce();
  }, []);
  useEffect(() => {
    if (visible) setI(0);
  }, [visible]);

  if (!visible) return null;
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={closeTour} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.62)', justifyContent: 'flex-end', paddingHorizontal: 16 + Math.max(insets.left, insets.right), paddingBottom: tabBarOffset(insets.bottom) + TAB_BAR_HEIGHT + 14 }}>
        <View
          accessibilityViewIsModal
          style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', backgroundColor: c.card, borderRadius: radius.xl, borderWidth: 1, borderColor: c.border, padding: 20 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text allowFontScaling={false} style={{ fontSize: 24 }}>
                {step.emoji}
              </Text>
            </View>
            <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.display, fontSize: 21, fontWeight: '700', color: c.text }}>
              {step.title}
            </Text>
          </View>
          <Text style={{ color: c.textMuted, fontSize: 15, lineHeight: 21 }}>{step.text}</Text>
          {step.points?.map((p) => (
            <View key={p} style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Ionicons name="checkmark-circle" size={18} color={c.accent} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, color: c.text, fontSize: 15, lineHeight: 20 }}>{p}</Text>
            </View>
          ))}

          <View style={{ flexDirection: 'row', gap: 6, marginTop: 18, marginBottom: 14 }} accessibilityLabel={`Шаг ${i + 1} из ${STEPS.length}`}>
            {STEPS.map((_, k) => (
              <View key={k} style={{ height: 6, width: k === i ? 22 : 6, borderRadius: 3, backgroundColor: k === i ? c.accent : c.border }} />
            ))}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {!last ? (
              <Pressable onPress={closeTour} hitSlop={10} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', paddingRight: 8 }}>
                <Text style={{ color: c.textMuted, fontSize: 15, fontWeight: '600' }}>Пропустить</Text>
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }} />
            {i > 0 ? <Button title="Назад" small variant="secondary" onPress={() => setI(i - 1)} /> : null}
            <Button title={last ? 'Начать' : 'Далее'} small onPress={() => (last ? closeTour() : setI(i + 1))} style={{ minWidth: 96 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
