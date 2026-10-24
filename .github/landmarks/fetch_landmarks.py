import json, re, sys, urllib.parse, urllib.request
UA = {"User-Agent": "VdvoemApp/1.0 (deckkk491@gmail.com)"}
def get(params):
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({**params, "format": "json", "formatversion": 2})
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.load(r)
def strip(html):
    return re.sub(r"<[^>]+>", "", html or "").strip()
OK = re.compile(r"^(CC0|CC BY(-SA)?( \d\.\d)?|Public domain|PD.*)$", re.I)
src = json.load(open(sys.argv[1]))
out, report = {}, []
for cid, titles in src.items():
    photos = []
    for t in titles:
        try:
            q = get({"action": "query", "titles": t, "prop": "pageimages", "piprop": "name", "redirects": 1})
            page = q["query"]["pages"][0]
            name = page.get("pageimage")
            if not name:
                report.append(f"{cid} {t}: no image"); continue
            ii = get({"action": "query", "titles": "File:" + name, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 960})
            info = ii["query"]["pages"][0]["imageinfo"][0]
            md = info.get("extmetadata", {})
            lic = strip(md.get("LicenseShortName", {}).get("value"))
            if not OK.match(lic):
                report.append(f"{cid} {t}: skip license {lic!r}"); continue
            artist = strip(md.get("Artist", {}).get("value"))[:80] or "Wikimedia Commons"
            photos.append({"title": page["title"], "url": info["thumburl"], "author": artist, "license": lic, "source": info["descriptionurl"]})
            report.append(f"{cid} {t}: OK {lic}")
        except Exception as e:
            report.append(f"{cid} {t}: ERROR {e}")
    out[cid] = photos
json.dump(out, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
print("\n".join(report))
