#!/usr/bin/env python3
"""Reproduce alpha cleanup and proportional placement of the repaired skunk."""
import json
import shutil
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'assets-ai'
SCALE = 16


def main():
    raw = ASSETS / 'repair-raw/char_skunk3.png'
    raw.parent.mkdir(exist_ok=True)
    if not raw.exists():
        shutil.copyfile(ASSETS / 'images/char_skunk3.png', raw)
    im = Image.open(raw).convert('RGBA')
    alpha = im.getchannel('A')
    w, h = im.size
    support = bytearray(alpha.point(lambda a: 255 if a > 8 else 0).tobytes())
    kept = bytearray(w * h)
    removed_components = 0
    removed_support_pixels = 0
    component_sizes = []
    for start in range(w * h):
        if not support[start]:
            continue
        support[start] = 0
        queue = deque([start])
        component = []
        while queue:
            i = queue.popleft()
            component.append(i)
            x, y = i % w, i // w
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    if (dx or dy) and 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if support[j]:
                            support[j] = 0
                            queue.append(j)
        component_sizes.append(len(component))
        if len(component) > 64:
            for i in component:
                kept[i] = 255
        else:
            removed_components += 1
            removed_support_pixels += len(component)
    # Preserve the original antialiasing around every substantial component.
    # Only alpha is multiplied: RGB and internal silhouette stay unchanged.
    mask = Image.frombytes('L', (w, h), bytes(kept)).filter(ImageFilter.MaxFilter(7))
    clean_alpha = ImageChops.multiply(alpha, mask)
    im.putalpha(clean_alpha)
    source_bbox = clean_alpha.getbbox()
    crop = im.crop(source_bbox)
    original = Image.open(ROOT / 'assets-original/char_skunk3.png').convert('RGBA')
    original_bbox = original.getchannel('A').getbbox()
    target_bbox = tuple(v * SCALE for v in original_bbox)
    tw, th = target_bbox[2] - target_bbox[0], target_bbox[3] - target_bbox[1]
    factor = min(tw / crop.width, th / crop.height)
    size = (round(crop.width * factor), round(crop.height * factor))
    # Pillow premultiplied-alpha resizing prevents color fringes.
    resized = crop.convert('RGBa').resize(size, Image.Resampling.LANCZOS).convert('RGBA')
    output = Image.new('RGBA', (original.width * SCALE, original.height * SCALE))
    offset = (target_bbox[0] + (tw - size[0]) // 2,
              target_bbox[1] + (th - size[1]) // 2)
    output.alpha_composite(resized, offset)
    output.save(ASSETS / 'images/char_skunk3.png')
    preview = Image.new('RGB', (864 * 3, 910), '#355447')
    draw = ImageDraw.Draw(preview)
    originals = [original.resize((864, 864), Image.Resampling.NEAREST),
                 Image.open(ASSETS / 'before-repair/char_skunk3.png').convert('RGBA'),
                 output]
    for index, (pic, label) in enumerate(zip(originals, ['Original x16', 'Before repair', 'AI + alpha + contain'])):
        pic.thumbnail((864, 864), Image.Resampling.LANCZOS)
        bg = Image.new('RGBA', (864, 864), '#355447')
        bg.alpha_composite(pic, ((864 - pic.width) // 2, (864 - pic.height) // 2))
        preview.paste(bg.convert('RGB'), (index * 864, 40))
        draw.text((index * 864 + 16, 12), label, fill='white')
    preview_path = ASSETS / 'qa-characters/char_skunk3-geometry-comparison.png'
    preview.save(preview_path)
    report_path = ASSETS / 'reports/zz-character-repairs.json'
    reports = json.loads(report_path.read_text())
    entry = next(item for item in reports if item['key'] == 'char_skunk3')
    entry.update({
        'origin': 'ai_repaired',
        'repair_raw': str(raw.relative_to(ROOT)),
        'method': 'built-in image_gen edit; alpha connected components >64 px at alpha>8; 7x7 dilated mask multiplied with original alpha; proportional contain in original bbox at scale16',
        'dimensions': list(output.size),
        'source_bbox': list(source_bbox),
        'original_bbox': list(original_bbox),
        'target_bbox': list(target_bbox),
        'placed_bbox': list(output.getchannel('A').getbbox()),
        'removed_components': removed_components,
        'removed_support_pixels': removed_support_pixels,
        'support_component_sizes': sorted(component_sizes, reverse=True),
        'alpha_preview': str(preview_path.relative_to(ROOT)),
        'status': 'repaired_with_limitations',
        'qa': 'Zaokrąglony tułów i zwarta poza. Izolowane drobne składniki alfa usunięte; zachowano oryginalny antyalias przez rozszerzoną maskę mnożoną z alfa. Sylwetka dopasowana proporcjonalnie wewnątrz bbox oryginału na płótnie 864x864. Ograniczenie: ogon nadal większy i wyższy niż w źródle; contain nie zmienia wewnętrznych proporcji postaci.'
    })
    report_path.write_text(json.dumps(reports, ensure_ascii=False, indent=2))
    print(json.dumps({k: entry[k] for k in ['dimensions', 'source_bbox', 'target_bbox', 'placed_bbox', 'removed_components', 'removed_support_pixels']}))


if __name__ == '__main__':
    main()
