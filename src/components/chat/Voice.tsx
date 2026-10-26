import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  type AudioPlayer,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Linking, Pressable, Text, View } from 'react-native';
import { randomId, type LocalFile } from '../../lib/files';
import { radius, TAP, useTheme } from '../../theme';

/** Самое длинное голосовое — 5 минут, дальше отправляется само */
export const MAX_VOICE_MS = 5 * 60 * 1000;
const MIN_VOICE_MS = 700;

/* ------------------------- Имя файла и длительность ------------------------- */

/** Длительность хранится в имени файла: voice-12345.m4a — 12,3 секунды */
export function voiceFileName(durationMs: number): string {
  return `voice-${Math.max(0, Math.round(durationMs))}.m4a`;
}

export function voiceDurationMs(name: string | null | undefined): number | null {
  const m = name ? /^voice-(\d+)\.m4a$/i.exec(name) : null;
  return m ? Number(m[1]) : null;
}

export function isVoiceMessage(m: { attachment_mime: string | null; attachment_name: string | null }): boolean {
  return !!m.attachment_mime?.startsWith('audio/') || voiceDurationMs(m.attachment_name) !== null;
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ------------------------- Запись ------------------------- */

/**
 * Запись голосового: start() спрашивает микрофон и начинает запись,
 * finish() останавливает и отдаёт файл для отправки, cancel() — выбрасывает запись.
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 200);
  const [active, setActive] = useState(false);
  const busy = useRef(false);

  const start = async (): Promise<boolean> => {
    if (busy.current || active) return false;
    busy.current = true;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Нет доступа к микрофону', 'Разреши «Вдвоём» доступ к микрофону в настройках iPhone, чтобы записывать голосовые.', [
          { text: 'Не сейчас', style: 'cancel' },
          { text: 'Открыть настройки', onPress: () => Linking.openSettings().catch(() => undefined) },
        ]);
        return false;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setActive(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      return true;
    } catch (e) {
      Alert.alert('Не получилось начать запись', e instanceof Error ? e.message : 'Попробуй ещё раз.');
      return false;
    } finally {
      busy.current = false;
    }
  };

  const stop = async (): Promise<{ uri: string | null; ms: number }> => {
    const ms = state.durationMillis ?? 0;
    try {
      await recorder.stop();
    } catch {
      // уже остановлена
    }
    setActive(false);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    return { uri: recorder.uri ?? null, ms };
  };

  /** Останавливает запись и возвращает файл для отправки (или null, если запись слишком короткая) */
  const finish = async (): Promise<LocalFile | null> => {
    if (!active) return null;
    const { uri, ms } = await stop();
    if (!uri || ms < MIN_VOICE_MS) {
      if (uri) Alert.alert('Слишком коротко', 'Нажми на микрофон и говори — потом нажми «Отправить».');
      return null;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    return { key: randomId(), uri, name: voiceFileName(ms), mime: 'audio/mp4', size: null, width: null, height: null, kind: 'file' };
  };

  const cancel = async () => {
    if (!active) return;
    await stop();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  };

  return { active, durationMs: state.durationMillis ?? 0, start, finish, cancel };
}

/** Полоса записи вместо поля ввода: красная точка, время, «Отмена» и «Отправить» */
export function RecordingBar({ durationMs, onCancel, onSend }: { durationMs: number; onCancel: () => void; onSend: () => void }) {
  const { c } = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, gap: 4 }} accessibilityLiveRegion="polite">
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Отменить запись"
        style={({ pressed }) => ({ width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
      >
        <Ionicons name="trash-outline" size={26} color={c.danger} />
      </Pressable>
      <View
        style={{
          flex: 1,
          minHeight: TAP - 4,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: c.bgAlt,
          borderRadius: 20,
          paddingHorizontal: 14,
        }}
      >
        <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#E5484D', opacity: pulse }} />
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatClock(durationMs)}</Text>
        <Text style={{ color: c.textMuted, fontSize: 14, flex: 1 }} numberOfLines={1}>
          Идёт запись…
        </Text>
      </View>
      <Pressable
        onPress={onSend}
        accessibilityRole="button"
        accessibilityLabel="Отправить голосовое"
        style={({ pressed }) => ({ width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
      >
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-up" size={20} color={c.onAccent} />
        </View>
      </Pressable>
    </View>
  );
}

/* ------------------------- Проигрывание ------------------------- */

// Одновременно играет только одно голосовое
let playing: AudioPlayer | null = null;

/** Полоски «волны»: одинаковые для одного сообщения, разные у разных */
function bars(seed: string, n: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    out.push(0.25 + ((h >>> 0) % 1000) / 1333);
  }
  return out;
}

const BARS = 26;

/** Голосовое в пузыре: кнопка ▶︎/❚❚, «волна» с прогрессом и время */
export function VoiceBubbleContent({ id, url, durationMs, mine, sending }: { id: string; url: string | null; durationMs: number | null; mine: boolean; sending: boolean }) {
  const { c } = useTheme();
  const fg = mine ? c.onAccent : c.text;
  const sub = mine ? c.onAccent : c.textMuted;
  const shape = useMemo(() => bars(id, BARS), [id]);

  if (!url || sending) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8, minWidth: 210 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: mine ? c.onAccent + '33' : c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={mine ? c.onAccent : c.accent} />
        </View>
        <Wave shape={shape} progress={0} color={fg} />
        <Text style={{ color: sub, fontSize: 12, opacity: 0.85, fontVariant: ['tabular-nums'] }}>{durationMs ? formatClock(durationMs) : ''}</Text>
      </View>
    );
  }
  return <VoicePlayer url={url} shape={shape} durationMs={durationMs} mine={mine} />;
}

function VoicePlayer({ url, shape, durationMs, mine }: { url: string; shape: number[]; durationMs: number | null; mine: boolean }) {
  const { c } = useTheme();
  const player = useAudioPlayer({ uri: url });
  const st = useAudioPlayerStatus(player);
  const fg = mine ? c.onAccent : c.text;
  const sub = mine ? c.onAccent : c.textMuted;

  const total = st.duration > 0 ? st.duration * 1000 : durationMs ?? 0;
  const pos = (st.currentTime ?? 0) * 1000;
  const progress = total > 0 ? Math.min(1, pos / total) : 0;
  const atEnd = st.didJustFinish || (total > 0 && pos >= total - 50);

  useEffect(
    () => () => {
      if (playing === player) playing = null;
    },
    [player],
  );

  const toggle = async () => {
    try {
      if (st.playing) {
        player.pause();
        return;
      }
      if (playing && playing !== player) {
        try {
          playing.pause();
        } catch {
          // плеер уже закрыт
        }
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => undefined);
      if (atEnd) await player.seekTo(0);
      player.play();
      playing = player;
    } catch {
      Alert.alert('Не получилось воспроизвести', 'Проверь интернет и попробуй ещё раз.');
    }
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8, minWidth: 210 }}>
      <Pressable
        onPress={toggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={st.playing ? 'Пауза' : 'Слушать голосовое'}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: mine ? c.onAccent : c.accent,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
        })}
      >
        {st.isBuffering && st.playing ? (
          <ActivityIndicator size="small" color={mine ? c.accent : c.onAccent} />
        ) : (
          <Ionicons name={st.playing ? 'pause' : 'play'} size={20} color={mine ? c.accent : c.onAccent} style={{ marginLeft: st.playing ? 0 : 2 }} />
        )}
      </Pressable>
      <Wave shape={shape} progress={atEnd && !st.playing ? 0 : progress} color={fg} />
      <Text style={{ color: sub, fontSize: 12, opacity: 0.85, fontVariant: ['tabular-nums'], minWidth: 32 }}>
        {formatClock(st.playing || (pos > 0 && !atEnd) ? pos : total)}
      </Text>
    </View>
  );
}

function Wave({ shape, progress, color }: { shape: number[]; progress: number; color: string }) {
  const played = Math.round(progress * shape.length);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 28, flex: 1 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {shape.map((h, i) => (
        <View key={i} style={{ width: 3, height: Math.max(4, h * 26), borderRadius: radius.pill, backgroundColor: color, opacity: i < played ? 1 : 0.35 }} />
      ))}
    </View>
  );
}
