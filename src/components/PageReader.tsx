import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { PAGE_READER_SCRIPT } from '../lib/pageReaderScript';

/** Что удалось прочитать со страницы в браузере телефона */
export type PageData = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  price: number | null;
  siteName: string | null;
  blocked?: boolean;
};

type Job = { id: number; url: string; resolve: (d: PageData | null) => void };

/** Сколько ждём страницу целиком (маркетплейсы бывают медленными) */
const JOB_TIMEOUT_MS = 22_000;

let enqueue: ((url: string) => Promise<PageData | null>) | null = null;

/**
 * Читает страницу в скрытом браузере на телефоне. Работает, только когда в дереве есть <PageReaderHost />.
 * Возвращает null, если страница не открылась или не успела за отведённое время.
 */
export function readPageInBrowser(url: string): Promise<PageData | null> {
  return enqueue && isPublicWebUrl(url) ? enqueue(url) : Promise.resolve(null);
}

/**
 * Только обычные сайты в интернете: http(s), стандартный порт, не локальная сеть.
 * Иначе ссылка из чата могла бы заставить телефон открыть роутер или другое устройство дома.
 */
export function isPublicWebUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== '80' && u.port !== '443') return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h.includes('.') || /\.(local|localhost|internal|lan|home|arpa)$/.test(h) || h === 'localhost') return false;
  // IP-адреса: пускаем только публичные IPv4, IPv6 не пускаем вовсе (сайты отдаются по имени)
  if (h.includes(':')) return false;
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return false;
  return true;
}

/** Невидимый браузер для чтения страниц. Ставится один раз в корне приложения. */
export function PageReaderHost() {
  const [job, setJob] = useState<Job | null>(null);
  const queue = useRef<Job[]>([]);
  const current = useRef<Job | null>(null);
  const nextId = useRef(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startNext = useCallback(() => {
    if (current.current) return;
    const j = queue.current.shift() ?? null;
    current.current = j;
    setJob(j);
    if (j) {
      timer.current = setTimeout(() => finish(j.id, null), JOB_TIMEOUT_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(
    (id: number, data: PageData | null) => {
      const j = current.current;
      if (!j || j.id !== id) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      current.current = null;
      j.resolve(data);
      setJob(null);
      // даём WebView размонтироваться, потом следующая страница
      setTimeout(startNext, 50);
    },
    [startNext],
  );

  useEffect(() => {
    enqueue = (url: string) =>
      new Promise<PageData | null>((resolve) => {
        queue.current.push({ id: nextId.current++, url, resolve });
        startNext();
      });
    return () => {
      enqueue = null;
      if (timer.current) clearTimeout(timer.current);
      current.current?.resolve(null);
      queue.current.forEach((j) => j.resolve(null));
      queue.current = [];
    };
  }, [startNext]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const j = current.current;
      if (!j) return;
      try {
        const d = JSON.parse(e.nativeEvent.data) as PageData;
        finish(j.id, d);
      } catch {
        finish(j.id, null);
      }
    },
    [finish],
  );

  if (!job) return null;
  return (
    <View style={styles.host} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <WebView
        key={job.id}
        source={{ uri: job.url }}
        style={styles.web}
        injectedJavaScript={PAGE_READER_SCRIPT}
        onMessage={onMessage}
        onError={() => finish(job.id, null)}
        onHttpError={(ev) => {
          // 4xx/5xx у главной страницы — дальше ждать бессмысленно (кроме защитных страниц, которые перезагружаются сами)
          if (ev.nativeEvent.statusCode >= 500) finish(job.id, null);
        }}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        incognito={false}
        mediaPlaybackRequiresUserAction
        allowsInlineMediaPlayback={false}
        setSupportMultipleWindows={false}
        // Не открываем приложения маркетплейсов (ozon://, wildberries://) и не уходим в локальную сеть при редиректе
        onShouldStartLoadWithRequest={(req) => req.url === 'about:blank' || (req.isTopFrame === false ? /^https?:/i.test(req.url) : isPublicWebUrl(req.url))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Вне экрана, но с нормальным размером: так сайты рисуют мобильную версию и подгружают данные
  host: { position: 'absolute', left: -2000, top: 0, width: 390, height: 844, opacity: 0 },
  web: { width: 390, height: 844, backgroundColor: 'transparent' },
});
