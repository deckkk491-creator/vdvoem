import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { MEAL_META, mealsFor, type Meal, type MealIdea } from '../data/meals';
import type { ItemWithLikes } from '../lib/types';
import { radius, sectionStyle, useTheme } from '../theme';
import { Button, Card, Segmented } from './ui';

const SHOWN = 3;

/** Вариант: идея из встроенного списка или ваш сохранённый рецепт с тегом приёма пищи */
type Option = { key: string; emoji: string; title: string; text: string; minutes?: number; saved?: ItemWithLikes };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function defaultMeal(): Meal {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner';
}

/**
 * Генератор «Что приготовить»: выбираешь завтрак, обед или ужин — и видишь три варианта.
 * Любой можно заменить. Среди вариантов — и ваши сохранённые рецепты с подходящим тегом.
 */
export function MealGenerator({
  recipes,
  onSave,
  onOpenSaved,
}: {
  recipes: ItemWithLikes[];
  onSave: (idea: MealIdea) => Promise<void>;
  onOpenSaved: (item: ItemWithLikes) => void;
}) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'recipe');
  const [open, setOpen] = useState(true);
  const [meal, setMeal] = useState<Meal>(defaultMeal);
  const [shown, setShown] = useState<Option[]>([]);
  const seen = useRef(new Set<string>());

  const pool = useMemo<Option[]>(() => {
    const tag = MEAL_META[meal].tag;
    const mine: Option[] = recipes
      .filter((r) => r.tags.includes(tag))
      .map((r) => ({ key: `mine-${r.id}`, emoji: '⭐️', title: r.title, text: r.note || 'Из вашей книги рецептов', saved: r }));
    const builtIn: Option[] = mealsFor(meal).map((m) => ({ key: m.id, emoji: m.emoji, title: m.title, text: m.description, minutes: m.minutes }));
    return [...mine, ...builtIn];
  }, [meal, recipes]);

  // при смене приёма пищи — три новых варианта
  useEffect(() => {
    seen.current = new Set();
    const first = shuffle(pool).slice(0, SHOWN);
    first.forEach((o) => seen.current.add(o.key));
    setShown(first);
    // пересобираем только при смене приёма пищи, а не при каждом обновлении рецептов
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meal]);

  const replace = (index: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    setShown((list) => {
      const onScreen = new Set(list.map((o) => o.key));
      let free = pool.filter((o) => !seen.current.has(o.key) && !onScreen.has(o.key));
      if (!free.length) {
        // всё посмотрели — начинаем круг заново
        seen.current = new Set(onScreen);
        free = pool.filter((o) => !onScreen.has(o.key));
      }
      const next = free[Math.floor(Math.random() * free.length)];
      if (!next) return list;
      seen.current.add(next.key);
      const copy = [...list];
      copy[index] = next;
      return copy;
    });
  };

  const findRecipe = (title: string) =>
    WebBrowser.openBrowserAsync(`https://yandex.ru/search/?text=${encodeURIComponent(`рецепт ${title}`)}`).catch(() => undefined);

  return (
    <Card style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: st.bg }}
      >
        <Text style={{ fontSize: 24 }}>🎲</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>Что приготовить сегодня?</Text>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>Три варианта — не нравится, крути дальше</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={st.fg} />
      </Pressable>
      {open ? (
        <View style={{ padding: 14 }}>
          <Segmented
            options={(['breakfast', 'lunch', 'dinner'] as Meal[]).map((m) => ({ value: m, label: `${MEAL_META[m].emoji} ${MEAL_META[m].title}` }))}
            value={meal}
            onChange={setMeal}
          />
          <View style={{ height: 12 }} />
          {shown.map((o, i) => (
            <View key={`${o.key}-${i}`} style={{ backgroundColor: c.bgAlt, borderRadius: radius.md, padding: 12, marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 30 }}>{o.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{o.title}</Text>
                  <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 2 }} numberOfLines={3}>
                    {o.saved ? `Ваш рецепт · ${o.text}` : o.text}
                  </Text>
                  {o.minutes ? <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 4 }}>⏱ ~{o.minutes} мин</Text> : null}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Button title="Другое" small variant="secondary" icon="refresh" onPress={() => replace(i)} />
                {o.saved ? (
                  <Button title="Открыть" small variant="ghost" color={st.fg} icon="book-outline" onPress={() => onOpenSaved(o.saved!)} />
                ) : (
                  <>
                    <Button title="Найти рецепт" small variant="ghost" color={st.fg} icon="search" onPress={() => findRecipe(o.title)} />
                    <Button
                      title="В книгу"
                      small
                      variant="ghost"
                      color={st.fg}
                      icon="bookmark-outline"
                      onPress={async () => {
                        const idea = mealsFor(meal).find((m) => m.id === o.key);
                        if (!idea) return;
                        try {
                          await onSave(idea);
                          Alert.alert('Сохранили', `«${idea.title}» — в вашей книге рецептов. Добавь ссылку на рецепт, когда найдёшь.`);
                        } catch (e) {
                          Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуй ещё раз');
                        }
                      }}
                    />
                  </>
                )}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
