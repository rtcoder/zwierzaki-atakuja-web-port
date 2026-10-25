"""User-authorized alpha-only cleanup of AI output; always preserve raw PNGs."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parent


def component_mask(alpha, keep_largest=False, minimum=64):
    width, height = alpha.size
    pixels = bytearray(alpha.point(lambda value: 255 if value >= 24 else 0).tobytes())
    retained = bytearray(len(pixels))
    biggest = []
    removed = 0
    for index in range(len(pixels)):
        if not pixels[index]:
            continue
        stack, region = [index], []
        pixels[index] = 0
        while stack:
            p = stack.pop()
            region.append(p)
            x = p % width
            for q in ((p-1 if x else -1), (p+1 if x+1<width else -1), p-width, p+width):
                if 0 <= q < len(pixels) and pixels[q]:
                    pixels[q] = 0
                    stack.append(q)
        if keep_largest:
            if len(region) > len(biggest):
                removed += bool(biggest)
                biggest = region
            else:
                removed += 1
        elif len(region) >= minimum:
            for p in region:
                retained[p] = 255
        else:
            removed += 1
    if keep_largest:
        for p in biggest:
            retained[p] = 255
    return Image.frombytes('L', alpha.size, bytes(retained)).filter(ImageFilter.MaxFilter(3)), removed


def clean(key, opening, keep_largest, fill_box=None):
    original = ROOT / 'raw' / f'{key}.png'
    output = ROOT / 'images' / f'{key}.png'
    original.parent.mkdir(exist_ok=True)
    if not original.exists():
        shutil.copy2(output, original)
    with Image.open(original) as source:
        image = source.convert('RGBA')
    alpha = image.getchannel('A')
    if fill_box:
        x0, y0, x1, y1 = fill_box
        if not (0 <= x0 < x1 <= image.width and 0 <= y0 < y1 <= image.height):
            raise ValueError('Fill box must be inside image')
        cleaned_alpha = alpha.copy()
        cleaned_alpha.paste(255, fill_box)
        removed = 0
    else:
        filtered = alpha.filter(ImageFilter.MinFilter(opening)).filter(ImageFilter.MaxFilter(opening))
        mask, removed = component_mask(filtered, keep_largest, max(32, image.width*image.height//20000))
        cleaned_alpha = ImageChops.multiply(filtered, mask)
    if not cleaned_alpha.getbbox():
        raise ValueError(f'Cleanup would remove all artwork: {key}')
    image.putalpha(cleaned_alpha)
    image.save(output, optimize=True)
    report = {'key': key, 'raw': str(original.relative_to(ROOT)), 'output': str(output.relative_to(ROOT)),
              'method': 'fill inspected interior alpha region' if fill_box else 'alpha-only morphological opening and isolated-component removal',
              'fill_box': fill_box,
              'opening': opening, 'keep_largest': keep_largest, 'removed_components': removed,
              'dimensions': list(image.size), 'raw_sha256': hashlib.sha256(original.read_bytes()).hexdigest(),
              'output_sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
              'qa': 'Requires visual inspection after cleanup; RGB channels and canvas unchanged.'}
    reports = ROOT / 'reports' / 'alpha-cleanup.json'
    records = json.loads(reports.read_text()) if reports.exists() else []
    records = [r for r in records if r['key'] != key] + [report]
    reports.write_text(json.dumps(records, ensure_ascii=False, indent=2)+'\n')
    print(key, 'removed components:', removed)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('keys', nargs='+')
    parser.add_argument('--opening', type=int, default=3)
    parser.add_argument('--keep-largest', action='store_true')
    parser.add_argument('--fill-box', nargs=4, type=int, metavar=('LEFT', 'TOP', 'RIGHT', 'BOTTOM'), help='Restore opacity only in an inspected interior rectangle; skips filtering')
    args = parser.parse_args()
    if args.opening < 3 or args.opening % 2 != 1:
        parser.error('opening must be an odd integer >= 3')
    for key in args.keys:
        clean(key, args.opening, args.keep_largest, args.fill_box)
