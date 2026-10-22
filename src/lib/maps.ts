import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/** Открыть поиск «<запрос> <город>» в Яндекс Картах (или Apple Maps, если выбрано) */
export async function openMapSearch(query: string, provider: 'yandex' | 'apple' = 'yandex'): Promise<void> {
  const q = encodeURIComponent(query.trim());
  if (provider === 'apple' && Platform.OS === 'ios') {
    await Linking.openURL(`https://maps.apple.com/?q=${q}`);
    return;
  }
  // Универсальная ссылка: откроет приложение Яндекс Карт, если оно установлено, иначе — сайт
  await Linking.openURL(`https://yandex.ru/maps/?text=${q}`);
}
