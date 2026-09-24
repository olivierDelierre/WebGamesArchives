#!/usr/bin/env python3
"""
Extract the bitmaps and sounds embedded in mb2.fla (Flash MX 2004) for the
HTML5 port of MotionBall 2.

The .fla is an OLE compound document. Its "Media N" streams hold:
  - JPEG files (verbatim)
  - lossless bitmaps: magic 0x0503 (ARGB, premultiplied) or 0x0303 (palette),
    followed by zlib data split in <u16 length><bytes> chunks
  - raw PCM sounds (the format lives in the "Contents" stream)

Vector symbols (balls, bumpers, bosses...) are not extracted: the port redraws
them procedurally in js/gfx.js.

Usage: pip install olefile pillow && python3 tools/extract_fla.py
(run from the html5/ directory, or pass the .fla path as first argument)
"""
import os
import struct
import sys
import wave
import zlib

import olefile
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FLA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "mb2.fla")
IMG = os.path.join(ROOT, "assets", "img")
SND = os.path.join(ROOT, "assets", "snd")

# media stream -> output name
BITMAPS = {
    28: "menu_challenge", 29: "menu_course", 30: "menu_aventure",
    31: "menu_classique", 32: "menu_options", 33: "menu_aide",
    27: "roue",
    51: "circle",
    55: "normal_base", 56: "normal_top",
    58: "time_needle", 59: "time_base", 60: "time_tip",
    62: "death_base",
    63: "magnet_base", 64: "magnet_top", 65: "magnet_plus", 66: "magnet_minus",
    67: "inter_low_blue", 68: "inter_low_pink", 69: "inter_high_blue", 70: "inter_high_pink",
    71: "snake_head_dark", 72: "snake_body_dark", 73: "snake_tail_dark",
    74: "snake_head", 76: "snake_body", 77: "snake_tail",
    89: "help_bleue", 90: "help_jaune", 91: "help_metal", 92: "help_orange",
    93: "help_rouge", 94: "help_verte", 95: "help_violette",
    104: "donjon_eau", 105: "donjon_feu", 106: "donjon_terre", 107: "donjon_vent",
    108: "logo_vent", 109: "logo_feu", 110: "logo_terre", 112: "logo_eau",
    39: "bg01", 40: "bg02", 41: "bg03", 53: "bg04", 43: "bgHole",
    44: "map",
}

# media stream -> (output name, rate, channels) for sounds missing from ../sounds
SOUNDS = {
    26: ("loop1", 44100, 1), 23: ("loop2", 44100, 1), 24: ("loop3", 44100, 1),
    25: ("loop4", 44100, 1), 22: ("loop5", 44100, 1),
    35: ("menu", 44100, 2), 36: ("boss", 44100, 1),
    38: ("oeil", 22050, 1), 37: ("oeilnew", 22050, 1),
}


def read_chunks(d, p):
    raw = b""
    while True:
        n = struct.unpack("<H", d[p:p + 2])[0]
        p += 2
        if n == 0:
            return zlib.decompress(raw)
        raw += d[p:p + n]
        p += n


def decode_bitmap(d):
    magic = d[:2]
    rb, w, h = struct.unpack("<HHH", d[2:8])
    img = Image.new("RGBA", (w, h))
    px = []
    if magic == b"\x03\x05":
        alpha = d[24]
        raw = read_chunks(d, 26) if d[25] else d[26:]
        for y in range(h):
            row = raw[y * rb:y * rb + w * 4]
            for x in range(w):
                a, r, g, b = row[x * 4:x * 4 + 4]
                if 0 < a < 255:
                    r, g, b = [min(255, c * 255 // a) for c in (r, g, b)]
                px.append((r, g, b, a if alpha else 255))
    elif magic == b"\x03\x03":
        n = struct.unpack("<H", d[25:27])[0]
        pal = [d[27 + 4 * i:31 + 4 * i] for i in range(n)]
        raw = read_chunks(d, 27 + 4 * n + 1)
        for y in range(h):
            for x in range(w):
                a, r, g, b = pal[raw[y * rb + x]]
                px.append((r, g, b, a))
    else:
        raise ValueError("unknown bitmap format %r" % magic)
    img.putdata(px)
    return img


def main():
    os.makedirs(IMG, exist_ok=True)
    os.makedirs(SND, exist_ok=True)
    ole = olefile.OleFileIO(FLA)
    for n, name in BITMAPS.items():
        d = ole.openstream("Media %d" % n).read()
        if d[:3] == b"\xff\xd8\xff":
            out = os.path.join(IMG, name + ".jpg")
            open(out, "wb").write(d)
        else:
            out = os.path.join(IMG, name + ".png")
            img = decode_bitmap(d)
            if name == "roue":
                img = img.resize((351, 351), Image.LANCZOS)
            img.save(out, optimize=True)
        print(out)
    for n, (name, rate, chans) in SOUNDS.items():
        d = ole.openstream("Media %d" % n).read()
        out = os.path.join(SND, name + ".wav")
        w = wave.open(out, "wb")
        w.setnchannels(chans)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(d[:len(d) - len(d) % (2 * chans)])
        w.close()
        print(out)


if __name__ == "__main__":
    main()
