"""Generate a minimalist crescent-moon icon. Mature, non-cartoon, no anime.
Deep charcoal square + soft cream crescent. Pure stdlib.
"""
import struct, zlib, math, os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")
os.makedirs(OUT_DIR, exist_ok=True)


def png_chunk(tag, data):
    return (
        struct.pack(">I", len(data)) + tag + data +
        struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def smooth_edge(d, thickness=1.0):
    if d <= -thickness: return 1.0
    if d >=  thickness: return 0.0
    return 0.5 - (d / thickness) * 0.5


def draw(size, path):
    pixels = bytearray()
    corner = size * 0.22
    thin = max(1.0, size / 64.0)

    # 深炭底 · 奶油月牙
    BG   = (26, 22, 32)         # deep warm charcoal
    MOON = (240, 226, 199)      # cream / soft moon

    # Crescent = 大圆 减去 偏右上的中等圆
    moon_cx = size * 0.44
    moon_cy = size * 0.50
    moon_r  = size * 0.30

    cut_cx  = size * 0.60
    cut_cy  = size * 0.42
    cut_r   = size * 0.28

    for y in range(size):
        pixels.append(0)                                    # PNG filter byte
        for x in range(size):
            # ---- Rounded square mask (背景圆角矩形) ----
            dx = min(x - corner, size - 1 - x - corner)
            dy = min(y - corner, size - 1 - y - corner)
            if dx < 0 and dy < 0:
                bd = corner - math.hypot(dx, dy)
            else:
                bd = min(x, size - 1 - x, y, size - 1 - y)
            bg_a = smooth_edge(-bd, thin)
            if bg_a == 0:
                pixels.extend([0, 0, 0, 0])
                continue

            # ---- Moon shape ----
            in_big = math.hypot(x - moon_cx, y - moon_cy) < moon_r
            in_cut = math.hypot(x - cut_cx, y - cut_cy) < cut_r
            on_moon = in_big and not in_cut

            # Small anti-alias by evaluating sub-pixel edge distance for the moon
            d_big = math.hypot(x - moon_cx, y - moon_cy) - moon_r
            d_cut = cut_r - math.hypot(x - cut_cx, y - cut_cy)
            # Moon boundary distance: outer edge = -d_big (positive inside), inner cut edge = -d_cut (positive outside cut)
            moon_signed = max(d_big, d_cut)                 # >0 = outside crescent, <0 = inside
            moon_a = smooth_edge(moon_signed, thin)

            r = BG[0] * (1 - moon_a) + MOON[0] * moon_a
            g = BG[1] * (1 - moon_a) + MOON[1] * moon_a
            b = BG[2] * (1 - moon_a) + MOON[2] * moon_a

            pixels.extend([int(r), int(g), int(b), int(bg_a * 255)])

    sig  = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(pixels), 9)
    png  = sig + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", idat) + png_chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print(f"wrote {path} ({len(png)} bytes)")


for s in (16, 48, 128):
    draw(s, os.path.join(OUT_DIR, f"icon-{s}.png"))
