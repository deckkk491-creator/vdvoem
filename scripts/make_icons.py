"""Генерирует иконку и сплэш «Вместе»: два пересекающихся круга-сердца на тёплом фоне.
Запуск: python3 scripts/make_icons.py  (нужен Pillow)."""
from PIL import Image, ImageDraw, ImageFilter
import math
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "assets")
TERRACOTTA = (224, 98, 58)
CREAM = (251, 244, 236)
PLUM = (122, 63, 92)
HONEY = (242, 180, 92)


def heart(draw, cx, cy, s, fill):
    # классическая параметрическая кривая сердца
    pts = []
    for i in range(720):
        t = 2 * math.pi * i / 720
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * s / 34, cy - y * s / 34))
    draw.polygon(pts, fill=fill)


def mark(size, bg):
    sc = 4
    S = size * sc
    img = Image.new("RGBA", (S, S), bg)
    d = ImageDraw.Draw(img)
    # мягкий свет
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([S * 0.10, -S * 0.30, S * 0.90, S * 0.40], fill=(255, 236, 214, 22))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(S * 0.12)))
    d = ImageDraw.Draw(img)
    hs = S * 0.50
    layer1 = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    heart(ImageDraw.Draw(layer1), S * 0.43, S * 0.47, hs, CREAM + (255,))
    layer2 = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    heart(ImageDraw.Draw(layer2), S * 0.59, S * 0.55, hs, HONEY + (235,))
    img = Image.alpha_composite(img, layer2)
    img = Image.alpha_composite(img, layer1)
    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    icon = mark(1024, TERRACOTTA + (255,)).convert("RGB")  # iOS: без прозрачности
    icon.save(os.path.join(OUT, "icon.png"))
    adaptive = mark(1024, (0, 0, 0, 0))
    adaptive.save(os.path.join(OUT, "adaptive-icon.png"))
    # сплэш: иконка со скруглёнными углами на прозрачном фоне
    sp = mark(1024, TERRACOTTA + (255,))
    m = Image.new("L", (1024, 1024), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, 1023, 1023], radius=230, fill=255)
    splash = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    splash.paste(sp, (0, 0), m)
    splash.save(os.path.join(OUT, "splash-icon.png"))
    mark(48, TERRACOTTA + (255,)).save(os.path.join(OUT, "favicon.png"))
    print("ok")


def _silhouette(size, gap):
    """Два сердца одним цветом (альфа-маска); у переднего сердца — прозрачный зазор, чтобы они не слились."""
    S = size * 4
    hs = S * 0.50
    back = Image.new("L", (S, S), 0)
    heart(ImageDraw.Draw(back), S * 0.59, S * 0.55, hs, 255)
    front = Image.new("L", (S, S), 0)
    heart(ImageDraw.Draw(front), S * 0.43, S * 0.47, hs, 255)
    # «раздутая» форма переднего сердца: размытие + порог (MaxFilter на таком холсте считался бы минутами)
    cut = front.filter(ImageFilter.GaussianBlur(S * gap)).point(lambda v: 255 if v > 24 else 0)
    back = Image.composite(Image.new("L", (S, S), 0), back, cut)
    out = Image.new("L", (S, S), 0)
    out.paste(255, (0, 0), back)
    out.paste(255, (0, 0), front)
    return out.resize((size, size), Image.LANCZOS)


def _fit(mask, size, fill):
    """Сердца по центру холста, не шире доли fill от стороны."""
    box = mask.getbbox()
    crop = mask.crop(box)
    k = size * fill / max(crop.size)
    crop = crop.resize((max(1, round(crop.width * k)), max(1, round(crop.height * k))), Image.LANCZOS)
    out = Image.new("L", (size, size), 0)
    out.paste(crop, ((size - crop.width) // 2, (size - crop.height) // 2))
    return out


def android():
    """Android: adaptive-icon (в безопасной зоне), монохромная иконка для тем Android 13+ и значок уведомлений.
    Запуск: python3 scripts/make_icons.py --android"""
    os.makedirs(OUT, exist_ok=True)
    # Передний слой адаптивной иконки: те же два сердца, но целиком в «безопасном круге» (≈ 61 % стороны)
    full = mark(1024, (0, 0, 0, 0))
    box = full.getchannel("A").point(lambda v: 255 if v > 200 else 0).getbbox()
    crop = full.crop(box)
    k = 1024 * 0.53 / max(crop.size)
    crop = crop.resize((round(crop.width * k), round(crop.height * k)), Image.LANCZOS)
    adaptive = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    adaptive.paste(crop, ((1024 - crop.width) // 2, (1024 - crop.height) // 2), crop)
    adaptive.save(os.path.join(OUT, "adaptive-icon.png"))
    # Монохромная: цвет не важен, Android берёт только форму
    mono = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    mono.putalpha(_fit(_silhouette(1024, 0.012), 1024, 0.53))
    mono.save(os.path.join(OUT, "adaptive-icon-monochrome.png"))
    # Значок уведомления: белая форма на прозрачном фоне, 96 × 96
    note = Image.new("RGBA", (96, 96), (255, 255, 255, 0))
    note.putalpha(_fit(_silhouette(384, 0.02), 96, 0.88))
    note.save(os.path.join(OUT, "notification-icon.png"))
    print("android ok")


if __name__ == "__main__":
    import sys

    if "--android" in sys.argv:
        android()
    else:
        main()
