"""Generate a minimalist cat-head silhouette icon.
Warm peach rounded-square background + dark cat silhouette.
No facial features — just the shape (head + 2 pointed ears).
Pure Python stdlib.
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


def in_triangle(px, py, p1, p2, p3):
    def sign(a, b, c):
        return (a[0]-c[0])*(b[1]-c[1]) - (b[0]-c[0])*(a[1]-c[1])
    d1 = sign((px, py), p1, p2)
    d2 = sign((px, py), p2, p3)
    d3 = sign((px, py), p3, p1)
    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (has_neg and has_pos)


def draw(size, path):
    pixels = bytearray()
    corner = size * 0.22
    thin = max(1.0, size / 64.0)

    # 暖桃色底 · 深棕猫头
    BG  = (255, 214, 190)
    CAT = (56, 40, 44)

    # 猫头（略微椭圆，避免完全圆脸看着像 emoji）
    head_cx = size * 0.5
    head_cy = size * 0.58
    head_rx = size * 0.28
    head_ry = size * 0.26

    # 左右耳（尖三角，微微向外倾）
    # 每个耳朵是一个三角形，底部贴在头顶两侧
    ear_L = [
        (size * 0.29, size * 0.42),   # 内侧底
        (size * 0.19, size * 0.15),   # 顶
        (size * 0.42, size * 0.36),   # 外侧底
    ]
    ear_R = [
        (size * 0.71, size * 0.42),
        (size * 0.81, size * 0.15),
        (size * 0.58, size * 0.36),
    ]

    for y in range(size):
        pixels.append(0)   # PNG filter byte
        for x in range(size):
            # 圆角矩形背景遮罩
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

            # 猫头 · 椭圆
            head_signed = (((x - head_cx) / head_rx) ** 2 +
                           ((y - head_cy) / head_ry) ** 2) - 1
            head_signed *= min(head_rx, head_ry)   # 近似有符号距离
            head_a = smooth_edge(head_signed, thin)

            # 两只耳朵
            in_earL = in_triangle(x, y, *ear_L)
            in_earR = in_triangle(x, y, *ear_R)
            ear_a = 1.0 if (in_earL or in_earR) else 0.0

            # 合并：猫的 alpha = max(head, ear)
            cat_a = max(head_a, ear_a)

            r = BG[0] * (1 - cat_a) + CAT[0] * cat_a
            g = BG[1] * (1 - cat_a) + CAT[1] * cat_a
            b = BG[2] * (1 - cat_a) + CAT[2] * cat_a

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
