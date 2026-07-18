"""Generate a minimalist curled sleeping cat silhouette icon. Pure stdlib."""
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
    """Barycentric point-in-triangle test."""
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

    # 极简配色：奶油底 + 深咖色猫
    BG   = (246, 236, 218)      # 奶油
    CAT  = (58, 42, 45)         # 深咖啡

    # 猫的几何（相对尺寸）—— 侧躺睡姿：头在左，尾在右
    body_cx  = size * 0.55
    body_cy  = size * 0.68
    body_rx  = size * 0.36
    body_ry  = size * 0.16

    head_cx  = size * 0.26
    head_cy  = size * 0.58
    head_r   = size * 0.14

    ear_L    = [(size*0.19, size*0.38),
                (size*0.16, size*0.50),
                (size*0.28, size*0.49)]
    ear_R    = [(size*0.32, size*0.36),
                (size*0.30, size*0.48),
                (size*0.39, size*0.48)]

    # 尾巴：从身体右端向上翘起再回卷，用两个椭圆+一个矩形近似
    tail_cx  = size * 0.85
    tail_cy  = size * 0.58
    tail_rx  = size * 0.06
    tail_ry  = size * 0.16

    for y in range(size):
        pixels.append(0)                                    # PNG filter byte
        for x in range(size):
            # ---- 圆角矩形背景遮罩 ----
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

            # ---- 判断像素是否属于猫 ----
            in_body = ((x - body_cx) / body_rx) ** 2 + ((y - body_cy) / body_ry) ** 2 < 1
            in_head = math.hypot(x - head_cx, y - head_cy) < head_r
            in_earL = in_triangle(x, y, *ear_L)
            in_earR = in_triangle(x, y, *ear_R)
            # 尾巴（右侧一个竖椭圆 + 顶端一段小弧）
            in_tail = (((x - tail_cx) / tail_rx) ** 2 + ((y - tail_cy) / tail_ry) ** 2 < 1
                       and y < body_cy + body_ry * 0.3)

            on_cat = in_body or in_head or in_earL or in_earR or in_tail
            r, g, b = (CAT if on_cat else BG)

            pixels.extend([r, g, b, int(bg_a * 255)])

    sig  = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(pixels), 9)
    png  = sig + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", idat) + png_chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print(f"wrote {path} ({len(png)} bytes)")


for s in (16, 48, 128):
    draw(s, os.path.join(OUT_DIR, f"icon-{s}.png"))
