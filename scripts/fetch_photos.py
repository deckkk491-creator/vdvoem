#!/usr/bin/env python3
"""Собирает свободные фото (Wikimedia Commons) для блюд и идей 2-2-2.

Для каждого id берёт главную картинку статьи Википедии (первый подходящий кандидат),
проверяет на Commons лицензию и автора и пишет src/data/mealPhotos.json и ideaPhotos.json.
Запуск: python3 scripts/fetch_photos.py  (нужен доступ к *.wikipedia.org и commons.wikimedia.org)
"""
import json, re, sys, time, urllib.parse, urllib.request, os

FREE = re.compile(r'^(CC0|CC BY(-SA)? [0-9.]+( [a-z]+)?|Public domain|PD.*)$', re.I)
UA = {'User-Agent': 'vdvoem-app-photo-collector/1.0 (deckkk491@gmail.com)'}

MEALS = {
  'b1': ['Syrniki'], 'b2': ['Shakshouka'], 'b3': ['Oatmeal', 'Porridge'], 'b4': ['Avocado toast'], 'b5': ['Blini'],
  'b6': ['Waffle'], 'b7': ['Omelette'], 'b8': ['Granola'], 'b9': ['Cheese on toast', 'Open sandwich'], 'b10': ['Pancake'],
  'b11': ['Eggs Benedict'], 'b12': ['Khachapuri'], 'b13': ['Açaí na tigela', 'Smoothie'], 'b14': ['ru:Рисовая каша', 'Rice pudding'],
  'b15': ['ru:Творожная запеканка', 'Quark (dairy product)'], 'b16': ['Breakfast burrito'], 'b17': ['French toast'], 'b18': ['Scrambled eggs'],
  'l1': ['Borscht'], 'l2': ['Chicken soup', 'Chicken noodle soup'], 'l3': ['Caesar salad'], 'l4': ['Plov', 'Pilaf'], 'l5': ['Shawarma'],
  'l6': ['Carbonara'], 'l7': ['Cream of mushroom soup'], 'l8': ['Pelmeni'], 'l9': ['Poke (dish)', 'Poke (Hawaiian dish)'], 'l10': ['Tomato soup'],
  'l11': ['Lentil soup'], 'l12': ['Taco'], 'l13': ['Ramen'], 'l14': ['Greek salad'], 'l15': ['Teriyaki'],
  'l16': ['Draniki', 'Potato pancake'], 'l17': ['Solyanka'], 'l18': ['Club sandwich'],
  'd1': ['Shrimp scampi', 'Spaghetti aglio e olio'], 'd2': ['Steak'], 'd3': ['Salmon as food'], 'd4': ['Pizza'], 'd5': ['Chicken curry'],
  'd6': ['Risotto'], 'd7': ['Hamburger'], 'd8': ['Stuffed peppers'], 'd9': ['Khinkali'], 'd10': ['Stir frying', 'Chow mein'],
  'd11': ['Moussaka'], 'd12': ['Roast chicken'], 'd13': ['Nam tok (food)', 'Thai salads'], 'd14': ['Fondue'], 'd15': ['Makizushi', 'Sushi'],
  'd16': ['Acqua pazza (food)', 'Acqua pazza'], 'd17': ['Lasagna'], 'd18': ['ru:Жаркое', 'Pot roast'],
}

IDEAS = {
  'd1': ['Tagliatelle', 'Fresh pasta'], 'd2': ['Home cinema'], 'd3': ['Candle'], 'd4': ['Theatre'], 'd5': ['Karaoke box', 'Karaoke'],
  'd6': ['Ten-pin bowling'], 'd7': ['Art exhibition'], 'd8': ['Sunrise'], 'd9': ['Picnic'], 'd10': ['Restaurant'],
  'd11': ['Pottery'], 'd12': ['Ice rink'], 'd13': ['Board game'], 'd14': ['Street photography'], 'd15': ['Planetarium'],
  'd16': ['Banya (sauna)', 'Sauna'], 'd17': ['Wine tasting'], 'd18': ['Jazz club'], 'd19': ['Utility cycling', 'Cycling'], 'd20': ['Bookselling', 'Bookstore'],
  'd21': ['Brunch'], 'd22': ['Climbing wall'], 'd23': ['Outdoor cinema'], 'd24': ['Letter (message)'], 'd25': ['Dessert'],
  'd26': ['River cruise'], 'd27': ['Escape room'], 'd28': ['Salsa (dance)'], 'd29': ['Paper lantern'], 'd30': ['World map'],
  'p1': ['Museum'], 'p2': ['Kuskovo', 'Arkhangelskoye Estate'], 'p3': ['Observation deck'], 'p4': ['Rostov Kremlin'], 'p5': ['Lake Seliger', 'Lake'],
  'p6': ['Thermal bath', 'Hot spring'], 'p7': ['Winery'], 'p8': ['Trail riding'], 'p9': ['Botanical garden'], 'p10': ['Flea market'],
  'p11': ['Coffee roasting'], 'p12': ['Boardwalk', 'Trail'], 'p13': ['Suzdal'], 'p14': ['Railway museum'], 'p15': ['Circus'],
  'p16': ['Water park'], 'p17': ['Archery'], 'p18': ['Trinity Lavra of St. Sergius'], 'p19': ['Petting zoo'], 'p20': ['Glamping'],
  'p21': ['Winzavod', 'Arts centre'], 'p22': ['Food hall'], 'p23': ['Ski resort'], 'p24': ['Stand up paddle boarding'], 'p25': ['Valensole', 'Lavandula'],
  'p26': ['Concert hall'], 'p27': ['Hot air balloon'], 'p28': ['Local museum', 'Museum'], 'p29': ['Urban hiking', 'Walking'], 'p30': ['Beekeeping'],
}

def get(url):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except Exception as e:
            if i == 2: raise
            time.sleep(2)

def lead_file(title):
    lang = 'en'
    if title.startswith('ru:'):
        lang, title = 'ru', title[3:]
    q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'redirects': 1, 'prop': 'pageimages', 'piprop': 'name', 'titles': title})
    data = get(f'https://{lang}.wikipedia.org/w/api.php?{q}')
    for p in data.get('query', {}).get('pages', {}).values():
        if p.get('pageimage'):
            return p['pageimage']
    return None

def strip(html):
    t = re.sub(r'<[^>]+>', '', html or '')
    t = re.sub(r'\s+', ' ', t).strip()
    return t[:80]

def commons(file):
    q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': 960, 'titles': f'File:{file}'})
    data = get(f'https://commons.wikimedia.org/w/api.php?{q}')
    for p in data.get('query', {}).get('pages', {}).values():
        ii = (p.get('imageinfo') or [None])[0]
        if not ii:
            return None
        md = ii.get('extmetadata', {})
        lic = (md.get('LicenseShortName', {}) or {}).get('value', '')
        if not FREE.match(lic.strip()):
            return None
        author = strip((md.get('Artist', {}) or {}).get('value', '')) or 'Wikimedia Commons'
        return {'url': ii.get('thumburl') or ii['url'], 'author': author, 'license': lic.strip(), 'source': ii.get('descriptionurl')}
    return None

def collect(spec):
    out, missing = {}, []
    for key, titles in spec.items():
        got = None
        for t in titles:
            try:
                f = lead_file(t)
                got = commons(f) if f else None
            except Exception as e:
                print('ERR', key, t, e, file=sys.stderr)
            if got:
                got['title'] = t.replace('ru:', '')
                break
        if got: out[key] = got
        else: missing.append(key)
        time.sleep(0.2)
    return out, missing

if __name__ == '__main__':
    root = os.path.join(os.path.dirname(__file__), '..', 'src', 'data')
    meals, m1 = collect(MEALS)
    ideas, m2 = collect(IDEAS)
    json.dump(meals, open(os.path.join(root, 'mealPhotos.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(ideas, open(os.path.join(root, 'ideaPhotos.json'), 'w'), ensure_ascii=False, indent=1)
    print('meals', len(meals), 'missing', m1)
    print('ideas', len(ideas), 'missing', m2)
