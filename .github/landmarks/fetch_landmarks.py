import json, re, sys, time, urllib.parse, urllib.request, urllib.error
UA = {"User-Agent": "VdvoemApp/1.0 (https://github.com/deckkk491-creator/vdvoem; deckkk491@gmail.com)"}
def get(params):
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({**params, "format": "json", "formatversion": 2, "maxlag": 5})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503): time.sleep(5 * (attempt + 1)); continue
            raise
    raise RuntimeError("rate limited")
def strip(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html or "")).strip()
OK = re.compile(r"^(CC0( 1\.0)?|CC BY(-SA)?( \d\.\d)?|Public domain|PD.*)$", re.I)
BAD = re.compile(r"(\.svg|map|flag|location|locator|satellite|landsat|ISS0|ISS\d|view_of_earth)", re.I)
BADAUTH = re.compile(r"(landsat|NASA|Earth Science|Remote Sensing)", re.I)
src = json.load(open(sys.argv[1]))
out, report = {}, []
for cid, titles in src.items():
    photos = []
    for t in titles:
        if len(photos) >= 3: break
        time.sleep(0.6)
        try:
            q = get({"action": "query", "titles": t, "prop": "pageimages", "piprop": "name", "redirects": 1})
            page = q["query"]["pages"][0]
            name = page.get("pageimage")
            if not name or BAD.search(name):
                report.append(f"{cid} {t}: skip image {name}"); continue
            ii = get({"action": "query", "titles": "File:" + name, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 960})
            info = ii["query"]["pages"][0]["imageinfo"][0]
            md = info.get("extmetadata", {})
            lic = strip(md.get("LicenseShortName", {}).get("value"))
            artist = strip(md.get("Artist", {}).get("value"))[:80] or "Wikimedia Commons"
            if not OK.match(lic) or BADAUTH.search(artist):
                report.append(f"{cid} {t}: skip license/author {lic!r} {artist!r}"); continue
            thumb = info["thumburl"].split("?")[0]
            photos.append({"title": page["title"], "url": thumb, "author": artist, "license": lic, "source": info["descriptionurl"]})
            report.append(f"{cid} {t}: OK {lic}")
        except Exception as e:
            report.append(f"{cid} {t}: ERROR {e}")
    out[cid] = photos
json.dump(out, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
print("\n".join(report))
