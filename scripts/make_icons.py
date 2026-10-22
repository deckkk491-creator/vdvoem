"""Генерирует иконку и сплэш «Вдвоём»: два пересекающихся круга-сердца на тёплом фоне.
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


if __name__ == "__main__":
    main()
