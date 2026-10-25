#!/usr/bin/env python3
"""Copy the supplied Nokia JAR's original PNG bytes and derive Canvas metadata.

No game image is resized, recolored, or re-encoded. Pillow is used only to read
dimensions and bitmap-font delimiters. Run from any directory with Python 3.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

from PIL import Image


SMALL_WIDTHS = [2,5,8,6,10,8,2,4,4,6,6,3,5,2,4,5,4,5,6,7,5,5,7,5,5,3,3,5,6,5,6,12,7,6,6,7,6,6,7,7,4,7,6,5,9,8,8,5,9,6,7,8,6,6,11,8,7,7,3,4,3,6,7,3,6,5,5,5,5,5,5,5,3,3,5,3,8,5,5,5,5,4,5,4,5,5,8,6,6,5,4,2,4,7,6,5,6,4,5,5,5,5,5,7,6,6,8,8,8,7,7,7]
ANIMALS = [
    {"id": 0, "key": "squirrel", "label": "Wiewióra", "ability": "cone"},
    {"id": 1, "key": "skunk", "label": "Skunks", "ability": None},
    {"id": 2, "key": "turtle", "label": "Żółw", "ability": "boost"},
    {"id": 3, "key": "hedgehog", "label": "Jeż", "ability": "spines", "specialFrame": "char_hedgehog4"},
    {"id": 4, "key": "rabbit", "label": "Królik", "ability": "home"},
]
for animal in ANIMALS:
    animal["frames"] = [f"char_{animal['key']}{i}" for i in range(1, 4)]
    animal["spriteSize"] = [54, 54]
    animal["origin"] = [27, 27]

EFFECTS = {
    "explosion": {"asset": "explosion", "frameWidth": 30, "frameHeight": 30, "frames": 6, "origin": [15, 15], "ticksPerFrame": 3},
    "fire": {"asset": "fire", "frameWidth": 26, "frameHeight": 43, "frames": 6, "origin": [13, 43], "ticksPerFrame": 2},
    "sparkles": {"asset": "sparkles", "frameWidth": 34, "frameHeight": 34, "frames": 5, "origin": [17, 17]},
    "mark": {"asset": "mark", "frameWidth": 14, "frameHeight": 14, "frames": 3, "origin": [7, 7]},
}

TARGETS = {
    "big": {"frames": [f"targetBIG_dmg{i}" for i in range(3)], "eyes": [f"targetBIG_dmg{i}_eyes" for i in range(3)], "size": [40, 40], "origin": [20, 20], "eyesOffset": [11, 12]},
    "small": {"frames": [f"targetSMALL_dmg{i}" for i in range(3)], "eyes": [f"targetSMALL_dmg{i}_eyes" for i in range(3)], "size": [26, 26], "origin": [13, 13], "eyesOffset": [6, 7]},
}

LAUNCHER = {
    "back": "launcher_5", "plunger": "launcher_1", "front": "launcher_4", "stem": "launcher_2",
    "baseElement": "launcherBaseElement", "baseTop": "launcherBaseTop",
    "bufferSize": [86, 87], "bufferOrigin": [43, 43], "layerOffset": [-27, -27],
    "stemOffset": [-4, -2], "baseOffset": [-15, 40], "baseStep": 15,
    "topCenter": [0, 40], "projectileOffset": [20, -8], "pullMin": -40, "pullDefault": -20,
}


def font_from_delimiters(data: bytes, characters: str, asset: str) -> dict:
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    starts = [x for x in range(im.width) if im.getpixel((x, 0)) == (0, 0, 0, 255)]
    bounds = starts + [im.width]
    glyphs = {}
    for i, char in enumerate(characters):
        left = bounds[i] + 1
        width = bounds[i + 1] - left
        glyphs[char] = {"x": left, "y": 0, "width": width, "height": im.height, "advance": width}
    return {"asset": asset, "height": im.height, "space": 5, "glyphs": glyphs}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--jar", type=Path, default=Path("/tmp/zwierzaki-atakuja-Nokia6300.jar"))
    parser.add_argument("--dist", type=Path, default=Path(__file__).resolve().parents[1] / "dist")
    args = parser.parse_args()
    assets_dir = args.dist / "assets"
    js_dir = args.dist / "js"
    assets_dir.mkdir(parents=True, exist_ok=True)
    js_dir.mkdir(parents=True, exist_ok=True)
    manifest = {}
    with zipfile.ZipFile(args.jar) as source:
        for entry in sorted(source.infolist(), key=lambda entry: entry.filename):
            name = entry.filename
            if "/" in name or not name.lower().endswith((".png", ".jpg", ".jpeg")):
                continue
            raw = source.read(entry)
            im = Image.open(io.BytesIO(raw))
            actual_ext = {"PNG": ".png", "JPEG": ".jpg"}.get(im.format)
            if actual_ext is None:
                raise ValueError(f"Unsupported image signature: {name}: {im.format}")
            file_name = Path(name).stem + actual_ext
            (assets_dir / file_name).write_bytes(raw)
            digest = hashlib.sha256(raw).hexdigest()
            if hashlib.sha256((assets_dir / file_name).read_bytes()).hexdigest() != digest:
                raise IOError(f"Asset copy failed integrity check: {name}")
            manifest[Path(name).stem] = {"file": file_name, "width": im.width, "height": im.height, "bytes": len(raw), "sha256": digest}

        main_chars = "!,-./0123456789:;ABCDEFGHIJKLMNOPQRSTUVWXYZĄĆĘŁŃÓŚŹŻ"
        fonts = {
            "main": font_from_delimiters(source.read("FONT.png"), main_chars, "FONT"),
            "numbers": font_from_delimiters(source.read("fontNum.png"), "0123456789", "fontNum"),
        }
        small_chars = "".join(chr(code) for code in range(33, 127)) + "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ"
        if len(small_chars) != len(SMALL_WIDTHS):
            raise ValueError("Small-font character table does not match the original width table")
        glyphs = {}
        x = 0
        for char, width in zip(small_chars, SMALL_WIDTHS):
            glyphs[char] = {"x": x, "y": 0, "width": width, "height": 14, "advance": width}
            x += width
        # Original bh.java advances total 632 pixels; fS.png is 633 pixels wide.
        # Its final transparent column is not part of the glyph table.
        if x > manifest["fS"]["width"]:
            raise ValueError("Small-font widths exceed the original bitmap")
        fonts["small"] = {"asset": "fS", "height": 14, "space": 5, "glyphs": glyphs}

    source_info = {"jar": args.jar.name, "jarSha256": hashlib.sha256(args.jar.read_bytes()).hexdigest(), "pixelPolicy": "Original encoded bytes, unchanged", "assetCount": len(manifest)}
    payload = {"source": source_info, "assets": manifest, "animals": ANIMALS, "targets": TARGETS, "effects": EFFECTS, "launcher": LAUNCHER, "fonts": fonts}
    (assets_dir / "manifest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    sections = ["// Generated by tools/extract-assets.py; original image bytes remain unchanged.", "// Source mappings: c.java, e.java, ae.java, bh.java in the supplied JAR decompilation."]
    for name, obj in [("ASSET_SOURCE", source_info), ("ASSET_META", manifest), ("ANIMALS", ANIMALS), ("TARGETS", TARGETS), ("EFFECTS", EFFECTS), ("LAUNCHER", LAUNCHER), ("FONTS", fonts)]:
        sections.append(f"export const {name} = " + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";")
    sections.append('''
/** Decode originals without altering their pixels. Keys are original basenames. */
export async function loadAssets(baseURL = new URL('../assets/', import.meta.url)) {
  const entries = await Promise.all(Object.entries(ASSET_META).map(async ([key, meta]) => {
    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Cannot load original asset: ${meta.file}`));
    });
    image.src = new URL(meta.file, baseURL).href;
    await loaded;
    return [key, image];
  }));
  return Object.fromEntries(entries);
}

/** Draw the original bitmap letters, retaining proportional advances. */
export function drawBitmapText(ctx, images, text, x, y, {font = 'main', align = 'left', scale = 1} = {}) {
  const spec = FONTS[font] || FONTS.main;
  const measure = value => [...value].reduce((total, ch) => total + (ch === ' ' ? spec.space : (spec.glyphs[ch]?.advance || 0)), 0);
  const width = measure(String(text)) * scale;
  if (align === 'center') x -= width / 2;
  else if (align === 'right') x -= width;
  for (const ch of String(text)) {
    if (ch === ' ') { x += spec.space * scale; continue; }
    const glyph = spec.glyphs[ch];
    if (!glyph) continue;
    ctx.drawImage(images[spec.asset], glyph.x, glyph.y, glyph.width, glyph.height, Math.round(x), Math.round(y), glyph.width * scale, glyph.height * scale);
    x += glyph.advance * scale;
  }
  return width;
}
''')
    (js_dir / "assets.js").write_text("\n\n".join(sections), encoding="utf-8")
    print(f"Copied and SHA-256 verified {len(manifest)} original images; generated assets/manifest.json and js/assets.js")


if __name__ == "__main__":
    main()
