/*
 * Скрипт, который выполняется внутри скрытого WebView на странице товара.
 * Маркетплейсы (Ozon, Wildberries, Яндекс Маркет, Авито, AliExpress) часто не отдают данные
 * серверу из-за защиты от ботов, но в настоящем браузере на телефоне страница открывается.
 * Скрипт ждёт, пока страница дорисуется, собирает название, описание, фото и цену
 * (JSON-LD → Open Graph → разметка страницы) и отправляет в приложение через postMessage.
 */
export const PAGE_READER_SCRIPT = `
(function () {
  if (window.__vdvoemReader) return true;
  window.__vdvoemReader = true;
  var SEO = /(покупайте|купить|заказать|по выгодн|по низк|в интернет[‑-]?магазине|быстрая и бесплатная доставка|отзывы покупателей)/i;
  var DESC_SEL = ['#section-description', '[data-widget="webDescription"]', '[data-marker="item-view/item-description"]',
    '[itemprop="description"]', '.product-page__description', 'section[class*="description"] p', '[class*="Description"] [class*="text"]',
    '[data-auto="product-description"]', '.product-description', '#product-description'];
  var PRICE_SEL = ['[data-widget="webPrice"]', '.price-block__final-price', 'ins.price-block__final-price', '[class*="priceBlockFinalPrice"]',
    '[data-auto="snippet-price-current"]', '[data-auto="price-value"]', '[data-marker="item-view/item-price"]', '[itemprop="price"]',
    '[class*="snow-price_SnowPrice__mainM"]', '.product-price-current', '[class*="Price_price"]'];
  function meta(names) {
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      var el = document.querySelector('meta[property="' + n + '"],meta[name="' + n + '"],meta[itemprop="' + n + '"]');
      if (el && el.getAttribute('content')) return el.getAttribute('content').trim();
    }
    return null;
  }
  function abs(u) { try { return u ? new URL(u, location.href).href : null; } catch (e) { return null; } }
  function num(v) {
    if (v == null) return null;
    var s = String(v).replace(/[\\u2009\\u202f\\u00a0\\s]/g, '').replace(',', '.').replace(/[^0-9.]/g, '');
    var n = parseFloat(s);
    return isFinite(n) && n > 0 && n < 100000000 ? Math.round(n) : null;
  }
  function text(el) { return el ? (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim() : ''; }
  function read() {
    var out = { title: null, description: null, image: null, price: null, siteName: null, url: location.href };
    var lds = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < lds.length; i++) {
      try {
        var data = JSON.parse(lds[i].textContent);
        var list = [].concat(data && data['@graph'] ? data['@graph'] : data);
        for (var j = 0; j < list.length; j++) {
          var d = list[j];
          if (!d) continue;
          var t = d['@type'];
          if (t !== 'Product' && !(Array.isArray(t) && t.indexOf('Product') >= 0)) continue;
          out.title = out.title || d.name || null;
          if (d.description && !out.description) out.description = String(d.description);
          var img = Array.isArray(d.image) ? d.image[0] : d.image;
          if (img && typeof img === 'object') img = img.url || img.contentUrl;
          out.image = out.image || abs(img);
          var off = Array.isArray(d.offers) ? d.offers[0] : d.offers;
          if (off) out.price = out.price || num(off.price || off.lowPrice);
        }
      } catch (e) {}
    }
    out.title = out.title || meta(['og:title', 'twitter:title']) || text(document.querySelector('h1')) || document.title || null;
    var ogDesc = meta(['og:description', 'description', 'twitter:description']);
    if (!out.description || SEO.test(out.description)) {
      for (var k = 0; k < DESC_SEL.length; k++) {
        var t2 = text(document.querySelector(DESC_SEL[k]));
        if (t2.length > 30 && !SEO.test(t2.slice(0, 120))) { out.description = t2; break; }
      }
    }
    out.description = out.description || ogDesc;
    out.image = out.image || abs(meta(['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'image']));
    if (!out.image) {
      var imgs = Array.prototype.slice.call(document.images).filter(function (im) { return im.naturalWidth >= 300 && im.naturalHeight >= 300; });
      if (imgs.length) out.image = abs(imgs[0].currentSrc || imgs[0].src);
    }
    out.price = out.price || num(meta(['product:price:amount', 'og:price:amount', 'price']));
    for (var p = 0; p < PRICE_SEL.length && !out.price; p++) {
      var pe = document.querySelector(PRICE_SEL[p]);
      if (pe) out.price = num(pe.getAttribute('content') || text(pe).split('₽')[0]);
    }
    if (!out.price && ogDesc) {
      var m = ogDesc.match(/(?:за|цена)\\s*([0-9][0-9\\s\\u00a0\\u2009\\u202f]*)\\s*(?:₽|руб)/i);
      if (m) out.price = num(m[1]);
    }
    out.siteName = meta(['og:site_name']) || location.hostname.replace(/^www\\./, '');
    var body = document.body ? text(document.body).slice(0, 400) : '';
    out.blocked = /доступ ограничен|подтвердите, что|не робот|captcha|проверка браузера|access denied|too many requests/i.test(document.title + ' ' + body);
    return out;
  }
  var tries = 0;
  var sent = false;
  function tick() {
    if (sent) return;
    tries++;
    var r = read();
    var seoDesc = !r.description || SEO.test(r.description.slice(0, 160));
    // Описание часто подгружается при прокрутке — листаем вниз, пока ищем
    if (seoDesc && tries % 2 === 0) { try { window.scrollBy(0, Math.round(window.innerHeight * 1.5)); } catch (e) {} }
    var good = r.title && r.image && !r.blocked;
    if ((good && !seoDesc && (r.price || tries >= 6)) || (good && tries >= 12) || tries >= 24) {
      sent = true;
      window.ReactNativeWebView.postMessage(JSON.stringify(r));
      return;
    }
    setTimeout(tick, 700);
  }
  setTimeout(tick, 600);
  return true;
})();
`;
