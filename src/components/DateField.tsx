import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { formatDate, parseDate, toISODate } from '../lib/format';
import { radius, useTheme } from '../theme';
import { Label } from './ui';

/**
 * Поле даты с системным календарём. value — 'YYYY-MM-DD' или null.
 * На iOS — компактный выбор прямо в строке; на Android — диалог по нажатию.
 */
export function DateField({
  label,
  value,
  onChange,
  optional,
  placeholder = 'Выбрать дату',
  minimumDate,
}: {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  optional?: boolean;
  placeholder?: string;
  minimumDate?: Date;
}) {
  const { c, dark } = useTheme();
  const [open, setOpen] = useState(false);
  const date = value ? parseDate(value) : new Date();

  const handle = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS !== 'ios') setOpen(false);
    if (e.type === 'set' && d) onChange(toISODate(d));
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <Label>{label}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.bgAlt, borderRadius: radius.md, paddingHorizontal: 12, minHeight: 50 }}>
        <Ionicons name="calendar-outline" size={18} color={c.textMuted} />
        {value || open ? (
          Platform.OS === 'ios' ? (
            <DateTimePicker
              value={date}
              mode="date"
              display="compact"
              locale="ru-RU"
              themeVariant={dark ? 'dark' : 'light'}
              accentColor={c.accent}
              minimumDate={minimumDate}
              onChange={handle}
              style={{ flex: 1, alignItems: 'flex-start' }}
            />
          ) : (
            <Pressable onPress={() => setOpen(true)} style={{ flex: 1, paddingVertical: 14 }}>
              <Text style={{ color: c.text, fontSize: 16 }}>{value ? formatDate(value) : placeholder}</Text>
            </Pressable>
          )
        ) : (
          <Pressable
            onPress={() => {
              onChange(toISODate(new Date()));
              setOpen(true);
            }}
            accessibilityRole="button"
            style={{ flex: 1, paddingVertical: 14 }}
          >
            <Text style={{ color: c.textFaint, fontSize: 16 }}>{placeholder}</Text>
          </Pressable>
        )}
        {optional && value ? (
          <Pressable
            onPress={() => {
              onChange(null);
              setOpen(false);
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Убрать: ${label}`}
          >
            <Ionicons name="close-circle" size={20} color={c.textFaint} />
          </Pressable>
        ) : null}
      </View>
      {Platform.OS === 'android' && open ? <DateTimePicker value={date} mode="date" onChange={handle} minimumDate={minimumDate} /> : null}
    </View>
  );
}

/** Поле времени. value — 'HH:MM' или null (весь день). */
export function TimeField({
  label,
  value,
  onChange,
  placeholder = 'Весь день',
}: {
  label: string;
  value: string | null;
  onChange: (hhmm: string | null) => void;
  placeholder?: string;
}) {
  const { c, dark } = useTheme();
  const [open, setOpen] = useState(false);
  const d = new Date();
  if (value) {
    const [h, m] = value.split(':').map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
  } else d.setHours(19, 0, 0, 0);
  const toHHMM = (x: Date) => `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
  const handle = (e: DateTimePickerEvent, x?: Date) => {
    if (Platform.OS !== 'ios') setOpen(false);
    if (e.type === 'set' && x) onChange(toHHMM(x));
  };
  return (
    <View style={{ marginBottom: 12 }}>
      <Label>{label}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.bgAlt, borderRadius: radius.md, paddingHorizontal: 12, minHeight: 50 }}>
        <Ionicons name="time-outline" size={18} color={c.textMuted} />
        {value ? (
          Platform.OS === 'ios' ? (
            <DateTimePicker
              value={d}
              mode="time"
              display="compact"
              locale="ru-RU"
              minuteInterval={5}
              themeVariant={dark ? 'dark' : 'light'}
              accentColor={c.accent}
              onChange={handle}
              style={{ flex: 1, alignItems: 'flex-start' }}
            />
          ) : (
            <Pressable onPress={() => setOpen(true)} style={{ flex: 1, paddingVertical: 14 }}>
              <Text style={{ color: c.text, fontSize: 16 }}>{value}</Text>
            </Pressable>
          )
        ) : (
          <Pressable
            onPress={() => {
              onChange(toHHMM(d));
              if (Platform.OS !== 'ios') setOpen(true);
            }}
            accessibilityRole="button"
            style={{ flex: 1, paddingVertical: 14 }}
          >
            <Text style={{ color: c.textFaint, fontSize: 16 }}>{placeholder}</Text>
          </Pressable>
        )}
        {value ? (
          <Pressable onPress={() => onChange(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Убрать время: ${label}`}>
            <Ionicons name="close-circle" size={20} color={c.textFaint} />
          </Pressable>
        ) : null}
      </View>
      {Platform.OS === 'android' && open ? <DateTimePicker value={d} mode="time" is24Hour onChange={handle} /> : null}
    </View>
  );
}
