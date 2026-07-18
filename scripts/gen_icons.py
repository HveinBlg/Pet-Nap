"""Generate cute sleeping-cat PNG icons for Pet Nap. Uses only stdlib."""
import struct, zlib, math, os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")
os.makedirs(OUT_DIR, exist_ok=True)


def png_chunk(tag, data):
    return (
        struct.pack(">I", len(data)) + tag + data +
        struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def blend(top, bot):
    """Simple alpha blend of two (r,g,b,a) tuples with a on 0..1."""
    r1, g1, b1, a1 = top
    r2, g2, b2, a2 = bot
    out_a = a1 + a2 * (1 - a1)
    if out_a == 0:
        return (0, 0, 0, 0)
    out_r = (r1 * a1 + r2 * a2 * (1 - a1)) / out_a
    out_g = (g1 * a1 + g2 * a2 * (1 - a1)) / out_a
    out_b = (b1 * a1 + b2 * a2 * (1 - a1)) / out_a
    return (out_r, out_g, out_b, out_a)


def smooth_edge(d, thickness=1.0):
    """Return alpha (0..1) for a distance d (>0 outside)."""
    if d <= -thickness:
        return 1.0
    if d >= thickness:
        return 0.0
    return 0.5 - (d / thickness) * 0.5


def draw(size, path):
    pixels = bytearray()
    cx = cy = size / 2
    face_rx = size * 0.42
    face_ry = size * 0.36
    face_offset_y = size * 0.05

    thin = max(1.0, size / 64.0)

    for y in range(size):
        pixels.append(0)  # PNG filter byte
        for x in range(size):
            # Rounded rectangle background
            corner = size * 0.22
            dx = min(x - corner, size - 1 - x - corner)
            dy = min(y - corner, size - 1 - y - corner)
            if dx < 0 and dy < 0:
                bd = corner - math.hypot(dx, dy)
            else:
                bd = min(x, size - 1 - x, y, size - 1 - y)
            bg_alpha = smooth_edge(-bd, thin)

            if bg_alpha == 0:
                pixels.extend([0, 0, 0, 0])
                continue

            # Background gradient (peach → soft pink)
            t = (x + y) / (2 * size)
            r = int(255 * (1 - t) + 250 * t)
            g = int(200 * (1 - t) + 175 * t)
            b = int(170 * (1 - t) + 200 * t)
            bg = (r, g, b, bg_alpha)

            # Cat face (ellipse)
            face_d = ((x - cx) ** 2) / (face_rx ** 2) + ((y - cy - face_offset_y) ** 2) / (face_ry ** 2) - 1
            face_signed = face_d * min(face_rx, face_ry)
            face_alpha = smooth_edge(face_signed, thin) * bg_alpha
            face_color = (255, 245, 235, face_alpha)

            # Ears
            ear_alpha = 0.0
            for ex_offset in (-1, 1):
                # Triangle points
                ex = cx + ex_offset * face_rx * 0.62
                ey = cy - face_ry * 0.72
                # Simple round-cap triangle via three circles
                for tx, ty, tr in (
                    (ex - ex_offset * face_rx * 0.15, ey + face_ry * 0.15, size * 0.05),
                    (ex + ex_offset * face_rx * 0.08, ey - face_ry * 0.18, size * 0.045),
                    (ex + ex_offset * face_rx * 0.22, ey + face_ry * 0.10, size * 0.05),
                ):
                    d = math.hypot(x - tx, y - ty) - tr
                    ear_alpha = max(ear_alpha, smooth_edge(d, thin))
            ear_color = (255, 245, 235, ear_alpha * bg_alpha)

            # Sleeping closed eyes (two arcs)
            eye_alpha = 0.0
            for ex_offset in (-1, 1):
                ex = cx + ex_offset * face_rx * 0.32
                ey = cy - face_ry * 0.05
                # closed eye = a small curve; approximate by a shallow ellipse ring segment
                dx2 = x - ex
                dy2 = y - ey
                # Half moon: within ellipse and dy2 close to zero
                ell = (dx2 * dx2) / ((face_rx * 0.18) ** 2) + (dy2 * dy2) / ((face_ry * 0.05) ** 2)
                if 0.85 < ell < 1.05 and dy2 > -face_ry * 0.05:
                    eye_alpha = max(eye_alpha, 1.0)
            eye_color = (60, 40, 55, eye_alpha * bg_alpha)

            # Blush cheeks
            blush_alpha = 0.0
            for ex_offset in (-1, 1):
                ex = cx + ex_offset * face_rx * 0.55
                ey = cy + face_ry * 0.18
                d = math.hypot(x - ex, y - ey) / (size * 0.08)
                if d < 1:
                    blush_alpha = max(blush_alpha, (1 - d) * 0.6)
            blush_color = (255, 130, 150, blush_alpha * bg_alpha)

            # Small mouth (w-shape) — just a tiny dot for icon simplicity
            mouth_d = math.hypot(x - cx, y - (cy + face_ry * 0.32)) - size * 0.03
            mouth_alpha = smooth_edge(mouth_d, thin) if mouth_d < 0 else 0
            mouth_color = (100, 60, 70, mouth_alpha * bg_alpha)

            # "Z" symbol for sleep at top-right (only for 48+ sizes for legibility)
            zzz_alpha = 0.0
            if size >= 40:
                zx0 = size * 0.72
                zy0 = size * 0.20
                zsize = size * 0.15
                # Draw a stylised 'Z': three thick strokes
                for (x1, y1, x2, y2, w) in [
                    (zx0, zy0, zx0 + zsize, zy0, size * 0.045),
                    (zx0 + zsize, zy0, zx0, zy0 + zsize, size * 0.045),
                    (zx0, zy0 + zsize, zx0 + zsize, zy0 + zsize, size * 0.045),
                ]:
                    # distance from point to segment
                    px, py = x - x1, y - y1
                    vx, vy = x2 - x1, y2 - y1
                    seg_len2 = vx * vx + vy * vy
                    if seg_len2 == 0:
                        continue
                    t2 = max(0, min(1, (px * vx + py * vy) / seg_len2))
                    projx = x1 + t2 * vx
                    projy = y1 + t2 * vy
                    d = math.hypot(x - projx, y - projy) - w
                    zzz_alpha = max(zzz_alpha, smooth_edge(d, thin))
            zzz_color = (255, 240, 200, zzz_alpha * bg_alpha)

            # Composite in order: bg → face → ears → blush → eyes → mouth → zzz
            out = bg
            out = blend(face_color, out) if face_alpha > 0 else out
            out = blend(ear_color, out) if ear_alpha > 0 else out
            out = blend(blush_color, out) if blush_alpha > 0 else out
            out = blend(eye_color, out) if eye_alpha > 0 else out
            out = blend(mouth_color, out) if mouth_alpha > 0 else out
            out = blend(zzz_color, out) if zzz_alpha > 0 else out

            pixels.extend([
                int(out[0]),
                int(out[1]),
                int(out[2]),
                int(out[3] * 255),
            ])

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(pixels), 9)
    png = sig + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", idat) + png_chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print(f"wrote {path} ({len(png)} bytes)")


for s in (16, 48, 128):
    draw(s, os.path.join(OUT_DIR, f"icon-{s}.png"))
