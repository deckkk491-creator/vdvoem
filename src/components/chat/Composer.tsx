import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useImperativeHandle, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatSize, MAX_FILE_BYTES, pickDocument, pickPhotos, takePhoto, type LocalFile } from '../../lib/files';
import { MAX_MESSAGE_LENGTH } from '../../hooks/useMessages';
import { radius, TAP, useTheme } from '../../theme';

/** Сколько вложений можно приложить к одной отправке */
const MAX_FILES = 10;
const LINE = 21;
const MAX_LINES = 5;

export type ComposerHandle = {
  /** Вставить текст (быстрые ответы) и поставить курсор в поле */
  insert: (text: string) => void;
};

type Props = {
  /** Возвращает true, если сообщение ушло в очередь отправки */
  onSend: (text: string, files: LocalFile[]) => boolean;
  bottomInset: number;
  disabled?: boolean;
  /** React 19: ref передаётся обычным пропом */
  ref?: React.Ref<ComposerHandle>;
};

export function Composer({ onSend, bottomInset, disabled, ref }: Props) {
  const { c } = useTheme();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<LocalFile[]>([]);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  // Файлы выбираются асинхронно (после закрытия галереи) — берём актуальный список из ref
  const filesRef = useRef<LocalFile[]>([]);
  filesRef.current = files;

  useImperativeHandle(ref, () => ({
    insert: (t: string) => {
      setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${t}` : t).slice(0, MAX_MESSAGE_LENGTH));
      input.current?.focus();
    },
  }));

  const add = (picked: LocalFile[]) => {
    if (!picked.length) return;
    const tooBig = picked.filter((f) => (f.size ?? 0) > MAX_FILE_BYTES);
    const ok = picked.filter((f) => (f.size ?? 0) <= MAX_FILE_BYTES);
    if (tooBig.length) {
      Alert.alert(
        'Слишком большой файл',
        `${tooBig.map((f) => `«${f.name}»`).join(', ')} — больше 25 МБ. Выбери файл поменьше или сожми фото.`,
      );
    }
    const next = [...filesRef.current, ...ok];
    if (next.length > MAX_FILES) Alert.alert('Многовато за раз', `За один раз можно отправить до ${MAX_FILES} вложений.`);
    const limited = next.slice(0, MAX_FILES);
    filesRef.current = limited;
    setFiles(limited);
  };

  const run = (fn: () => Promise<LocalFile[]>) =>
    fn()
      .then(add)
      .catch((e: unknown) => Alert.alert('Не получилось', e instanceof Error ? e.message : 'Попробуй ещё раз.'));

  const openAttach = () => {
    const left = Math.max(1, MAX_FILES - files.length);
    const actions = [() => run(() => pickPhotos(left)), () => run(takePhoto), () => run(pickDocument)];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Фото из галереи', 'Сделать фото', 'Документ', 'Отмена'], cancelButtonIndex: 3, title: 'Прикрепить' },
        (i) => actions[i]?.(),
      );
    } else {
      // На Android в Alert не больше трёх кнопок — «Отмена» заменяет нажатие мимо окна
      Alert.alert(
        'Прикрепить',
        undefined,
        [
          { text: 'Фото из галереи', onPress: actions[0] },
          { text: 'Сделать фото', onPress: actions[1] },
          { text: 'Документ', onPress: actions[2] },
        ],
        { cancelable: true },
      );
    }
  };

  const canSend = !disabled && (text.trim().length > 0 || files.length > 0);

  const submit = () => {
    if (!canSend) return;
    if (onSend(text, files)) {
      setText('');
      setFiles([]);
    }
  };

  return (
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border, backgroundColor: c.bg, paddingTop: 8, paddingBottom: 8 + bottomInset }}>
      {files.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8 }}>
          {files.map((f) => (
            <View key={f.key}>
              {f.kind === 'photo' ? (
                <Image source={{ uri: f.uri }} style={{ width: 64, height: 64, borderRadius: radius.sm, backgroundColor: c.bgAlt }} contentFit="cover" accessibilityLabel={`Фото ${f.name}`} />
              ) : (
                <View
                  style={{ height: 64, maxWidth: 220, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: radius.sm, backgroundColor: c.bgAlt }}
                  accessible
                  accessibilityLabel={`Документ ${f.name}`}
                >
                  <Ionicons name="document-text-outline" size={22} color={c.accent} />
                  <View style={{ flexShrink: 1 }}>
                    <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }} numberOfLines={2}>
                      {f.name}
                    </Text>
                    {f.size ? <Text style={{ color: c.textMuted, fontSize: 11 }}>{formatSize(f.size)}</Text> : null}
                  </View>
                </View>
              )}
              <Pressable
                onPress={() => setFiles((prev) => prev.filter((x) => x.key !== f.key))}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Убрать ${f.kind === 'photo' ? 'фото' : f.name}`}
                style={{ position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: c.text, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={15} color={c.bg} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 6, gap: 4 }}>
        <Pressable
          onPress={openAttach}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Прикрепить фото или документ"
          style={({ pressed }) => ({ width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}
        >
          <Ionicons name="add-circle-outline" size={30} color={c.accent} />
        </Pressable>
        <TextInput
          ref={input}
          value={text}
          onChangeText={setText}
          placeholder="Сообщение"
          placeholderTextColor={c.textFaint}
          selectionColor={c.accent}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          editable={!disabled}
          accessibilityLabel="Текст сообщения"
          style={{
            flex: 1,
            minHeight: TAP - 4,
            maxHeight: LINE * MAX_LINES + 18,
            marginVertical: 2,
            backgroundColor: c.bgAlt,
            borderRadius: 20,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.border,
            paddingHorizontal: 14,
            paddingTop: 9,
            paddingBottom: 9,
            fontSize: 16,
            lineHeight: LINE,
            color: c.text,
            textAlignVertical: 'center',
          }}
        />
        <Pressable
          onPress={submit}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Отправить"
          accessibilityState={{ disabled: !canSend }}
          style={({ pressed }) => ({ width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: canSend ? c.accent : c.bgAlt,
              borderWidth: canSend ? 0 : StyleSheet.hairlineWidth,
              borderColor: c.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="arrow-up" size={20} color={canSend ? c.onAccent : c.textFaint} />
          </View>
        </Pressable>
      </View>
      {text.length > MAX_MESSAGE_LENGTH - 200 ? (
        <Text style={{ alignSelf: 'flex-end', marginRight: 16, marginTop: 2, fontSize: 11, color: c.textMuted }}>
          {text.length} / {MAX_MESSAGE_LENGTH}
        </Text>
      ) : null}
    </View>
  );
}
