import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { plural, toISODate } from '../../lib/format';
import { fonts, radius, useTheme } from '../../theme';
import { Button, IconButton } from '../ui';

export type DayMark = { colors: string[]; count: number };

export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const WEEKDAYS_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

/**
 * Сетка месяца: неделя с понедельника, сегодня обведено, выбранный день закрашен,
 * под днями с записями — цветные точки (до трёх).
 */
export function MonthGrid({
  month,
  selected,
  today,
  marks,
  onSelect,
  onMonthChange,
  accent,
}: {
  /** Любой день отображаемого месяца */
  month: Date;
  selected: string;
  today: string;
  /** По дням 'YYYY-MM-DD': цвета точек и число записей */
  marks: Record<string, DayMark>;
  onSelect: (iso: string) => void;
  onMonthChange: (firstDay: Date, selectToday?: boolean) => void;
  accent: string;
}) {
  const { c } = useTheme();
  const y = month.getFullYear();
  const m = month.getMonth();

  const weeks = useMemo(() => {
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    const daysIn = new Date(y, m + 1, 0).getDate();
    const rows = Math.ceil((offset + daysIn) / 7);
    const out: (string | null)[][] = [];
    for (let r = 0; r < rows; r++) {
      const week: (string | null)[] = [];
      for (let i = 0; i < 7; i++) {
        const d = r * 7 + i - offset + 1;
        week.push(d >= 1 && d <= daysIn ? toISODate(new Date(y, m, d)) : null);
      }
      out.push(week);
    }
    return out;
  }, [y, m]);

  const isCurrentMonth = today.slice(0, 7) === toISODate(new Date(y, m, 1)).slice(0, 7);
  const showToday = !isCurrentMonth || selected !== today;

  return (
    <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, paddingVertical: 8, paddingHorizontal: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginBottom: 4 }}>
        <IconButton icon="chevron-back" size={20} label="Предыдущий месяц" onPress={() => onMonthChange(new Date(y, m - 1, 1))} />
        <Text
          accessibilityRole="header"
          style={{ flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 18, fontWeight: '700', color: c.text }}
          numberOfLines={1}
        >
          {MONTHS[m]} {y}
        </Text>
        <IconButton icon="chevron-forward" size={20} label="Следующий месяц" onPress={() => onMonthChange(new Date(y, m + 1, 1))} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((w, i) => (
          <Text
            key={w}
            importantForAccessibility="no"
            style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: i >= 5 ? accent : c.textMuted, paddingVertical: 4 }}
          >
            {w}
          </Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row' }}>
          {week.map((iso, di) =>
            iso ? (
              <DayCell
                key={iso}
                iso={iso}
                isToday={iso === today}
                isSelected={iso === selected}
                mark={marks[iso]}
                accent={accent}
                onPress={() => onSelect(iso)}
              />
            ) : (
              <View key={`e${di}`} style={{ flex: 1, height: 48 }} />
            ),
          )}
        </View>
      ))}
      {showToday ? (
        <Button
          title="Сегодня"
          small
          variant="ghost"
          icon="today-outline"
          color={accent}
          onPress={() => {
            const now = new Date();
            onMonthChange(new Date(now.getFullYear(), now.getMonth(), 1), true);
          }}
          style={{ alignSelf: 'center', marginTop: 2 }}
        />
      ) : null}
    </View>
  );
}

function DayCell({
  iso,
  isToday,
  isSelected,
  mark,
  accent,
  onPress,
}: {
  iso: string;
  isToday: boolean;
  isSelected: boolean;
  mark: DayMark | undefined;
  accent: string;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const day = Number(iso.slice(8, 10));
  const month = Number(iso.slice(5, 7)) - 1;
  const a11y = [
    `${day} ${MONTHS_GEN[month]}`,
    isToday ? 'сегодня' : '',
    mark?.count ? `${mark.count} ${plural(mark.count, 'запись', 'записи', 'записей')}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: isSelected }}
      style={({ pressed }) => ({ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isSelected ? accent : 'transparent',
          borderWidth: isToday && !isSelected ? 1.5 : 0,
          borderColor: accent,
        }}
      >
        <Text
          style={{
            fontSize: 15,
            fontWeight: isToday || isSelected ? '800' : '500',
            color: isSelected ? c.onAccent : isToday ? accent : c.text,
            fontVariant: ['tabular-nums'],
          }}
        >
          {day}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 3, height: 5, marginTop: 2 }}>
        {(mark?.colors ?? []).slice(0, 3).map((col, i) => (
          <View key={i} style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: col }} />
        ))}
      </View>
    </Pressable>
  );
}

/** «Суббота, 24 октября» */
export function dayTitle(iso: string): string {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return `${WEEKDAYS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${thisYear ? '' : ` ${d.getFullYear()}`}`;
}
