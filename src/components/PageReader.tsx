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
  return enqueue ? enqueue(url) : Promise.resolve(null);
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
        // Не открываем приложения маркетплейсов (ozon://, wildberries://) — остаёмся в вебе
        onShouldStartLoadWithRequest={(req) => /^https?:/i.test(req.url) || req.url === 'about:blank'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Вне экрана, но с нормальным размером: так сайты рисуют мобильную версию и подгружают данные
  host: { position: 'absolute', left: -2000, top: 0, width: 390, height: 844, opacity: 0 },
  web: { width: 390, height: 844, backgroundColor: 'transparent' },
});
