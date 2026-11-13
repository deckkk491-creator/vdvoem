import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { CameraView, scanFromURLAsync, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseReceipt, type ReceiptData } from '../lib/receipt';
import { radius, useTheme } from '../theme';

const NOT_A_RECEIPT = 'Это не похоже на QR-код кассового чека. Нужен квадратный код внизу чека — в нём сумма и дата покупки.';

/**
 * Кнопки «Сканировать чек»: камера, скриншот электронного чека или ссылка из письма.
 * Из QR-кода берутся сумма, дата и время (список товаров в нём не хранится).
 */
export function ReceiptScanButtons({ color, onResult }: { color: string; onResult: (r: ReceiptData) => void }) {
  const { c } = useTheme();
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);

  const done = (r: ReceiptData) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    onResult(r);
  };

  async function fromImage() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    setBusy(true);
    try {
      const codes = await scanFromURLAsync(res.assets[0].uri, ['qr']);
      const r = codes.map((x) => parseReceipt(x.data)).find((x): x is ReceiptData => !!x);
      if (r) done(r);
      else Alert.alert('Не нашли чек', codes.length ? NOT_A_RECEIPT : 'На картинке не видно QR-кода. Сделай скриншот так, чтобы код был целиком и крупно.');
    } catch {
      Alert.alert('Не получилось прочитать картинку', 'Попробуй другой скриншот или наведи камеру на экран с чеком.');
    } finally {
      setBusy(false);
    }
  }

  async function fromClipboard() {
    const text = (await Clipboard.getStringAsync().catch(() => '')).trim();
    const r = parseReceipt(text);
    if (r) done(r);
    else
      Alert.alert(
        'В буфере нет чека',
        'Открой письмо или СМС с электронным чеком, скопируй ссылку на чек и нажми эту кнопку снова. Подойдёт ссылка, в которой есть «t=» и «s=».',
      );
  }

  const btn = (icon: React.ComponentProps<typeof Ionicons>['name'], label: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 64,
        borderRadius: radius.md,
        backgroundColor: c.bgAlt,
        borderWidth: 1,
        borderColor: c.border,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingHorizontal: 6,
        opacity: pressed || busy ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={{ color: c.text, fontSize: 12, fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Заполнить по чеку</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {btn('qr-code-outline', 'Камерой', () => setCamera(true))}
        {btn('image-outline', 'Со скриншота', fromImage)}
        {btn('link-outline', 'Ссылка из письма', fromClipboard)}
      </View>
      {busy ? <ActivityIndicator color={color} style={{ marginTop: 8 }} /> : null}
      <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 6 }}>Из QR-кода подставятся сумма и дата. Категорию выбери вручную.</Text>
      <ReceiptCamera
        visible={camera}
        onClose={() => setCamera(false)}
        onResult={(r) => {
          setCamera(false);
          done(r);
        }}
      />
    </View>
  );
}

/** Полноэкранная камера, которая ищет QR-код чека */
function ReceiptCamera({ visible, onClose, onResult }: { visible: boolean; onClose: () => void; onResult: (r: ReceiptData) => void }) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [hint, setHint] = useState<string | null>(null);
  const handled = useRef(false);
  const lastBad = useRef('');

  useEffect(() => {
    if (!visible) return;
    handled.current = false;
    lastBad.current = '';
    setHint(null);
    if (permission && !permission.granted && permission.canAskAgain) requestPermission().catch(() => undefined);
    // разрешение спрашиваем только при открытии камеры
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const onScanned = ({ data }: BarcodeScanningResult) => {
    if (handled.current) return;
    const r = parseReceipt(data);
    if (r) {
      handled.current = true;
      onResult(r);
    } else if (data !== lastBad.current) {
      lastBad.current = data;
      setHint(NOT_A_RECEIPT);
    }
  };

  const denied = permission && !permission.granted;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {permission?.granted ? (
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScanned} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
            <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center' }}>
              {denied ? 'Нет доступа к камере. Разреши его в настройках телефона, чтобы сканировать чеки.' : 'Открываем камеру…'}
            </Text>
            {denied ? (
              <Pressable
                onPress={() => (permission?.canAskAgain ? requestPermission() : Linking.openSettings())}
                accessibilityRole="button"
                style={{ backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 }}
              >
                <Text style={{ color: '#000', fontWeight: '700' }}>{permission?.canAskAgain ? 'Разрешить' : 'Открыть настройки'}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
        {/* Рамка-подсказка по центру */}
        {permission?.granted ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 240, height: 240, borderRadius: 24, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' }} />
          </View>
        ) : null}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom + 24, paddingHorizontal: 24, alignItems: 'center', gap: 14 }}>
          <View style={{ backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ color: '#fff', fontSize: 15, textAlign: 'center' }}>{hint ?? 'Наведи камеру на QR-код внизу чека'}</Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Закрыть камеру"
            style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={28} color="#000" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
