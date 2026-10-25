#!/usr/bin/env python3
"""Deterministic font candidates. Needs Pillow and the named local TTF files.

No AI image generation and no runtime integration. Original glyph rectangles,
advances, atlas dimensions and space advances are retained at an integer scale.
Run: python3 assets-ai/repair-fonts.py [--scale 8]
"""
import argparse
import hashlib
import json
import math
import shutil
import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, __version__ as pillow_version

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets-ai'
SUPERSAMPLE = 4


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def ttf_coverage(path):
    """Read Unicode cmap formats 4/12, rejecting .notdef glyph zero."""
    data = Path(path).read_bytes()
    u16 = lambda p: struct.unpack_from('>H', data, p)[0]
    u32 = lambda p: struct.unpack_from('>I', data, p)[0]
    tables = {data[p:p+4]: u32(p+8) for p in range(12, 12+16*u16(4), 16)}
    base = tables[b'cmap']
    result = set()
    for p in range(base+4, base+4+8*u16(base+2), 8):
        platform, encoding = u16(p), u16(p+2)
        if not (platform == 0 or (platform == 3 and encoding in (1, 10))):
            continue
        sub = base+u32(p+4)
        if u16(sub) == 12:
            for g in range(sub+16, sub+16+12*u32(sub+12), 12):
                first, last, glyph = u32(g), u32(g+4), u32(g+8)
                result.update(range(first+(glyph == 0), last+1))
        elif u16(sub) == 4:
            count = u16(sub+6)//2
            end = sub+14
            start = end+2*count+2
            delta = start+2*count
            offsets = delta+2*count
            for n in range(count):
                for cp in range(u16(start+2*n), u16(end+2*n)+1):
                    off = u16(offsets+2*n)
                    gid = u16(offsets+2*n+off+2*(cp-u16(start+2*n))) if off else cp
                    if not off or gid:
                        gid = (gid+u16(delta+2*n)) & 65535
                    if gid and cp != 65535:
                        result.add(cp)
    return result


def render_atlas(meta, source_size, path, scale):
    glyphs = meta['glyphs']
    missing = [c for c in glyphs if ord(c) not in ttf_coverage(path)]
    assert not missing, f'Missing Unicode characters in {path}: {missing}'
    h = meta['height']*scale
    pad = max(1, scale//4)
    # One font size and one baseline per atlas: diacritics and descenders stay aligned.
    size = h*2
    while True:
        font = ImageFont.truetype(str(path), size*SUPERSAMPLE)
        boxes = [font.getbbox(c, anchor='ls') for c in glyphs]
        top, bottom = min(b[1] for b in boxes), max(b[3] for b in boxes)
        if bottom-top <= (h-2*pad)*SUPERSAMPLE:
            break
        size -= 1
    baseline = pad*SUPERSAMPLE-top
    atlas = Image.new('RGBA', (source_size[0]*scale, source_size[1]*scale))
    used = Image.new('L', atlas.size)
    used_draw = ImageDraw.Draw(used)
    records = []
    for ch, rect in glyphs.items():
        width = rect['width']*scale
        left, _, right, _ = font.getbbox(ch, anchor='ls')
        glyph = Image.new('L', (max(1, right-left), h*SUPERSAMPLE))
        ImageDraw.Draw(glyph).text((-left, baseline), ch, fill=255, font=font, anchor='ls')
        # Only horizontal compression, when necessary; punctuation keeps natural size.
        target_width = min(max(1, round(glyph.width/SUPERSAMPLE)), width-2*pad)
        mask = glyph.resize((target_width, h), Image.Resampling.LANCZOS)
        if meta['asset'] == 'fontNum' and ch == '1':
            # Widen the ink optically, not its cell or advance.
            ink = mask.getbbox()
            target_width = min(width-2*pad, round((ink[2]-ink[0])*1.15))
            source_ink = glyph.getbbox()
            glyph = glyph.crop((source_ink[0], 0, source_ink[2], glyph.height))
            mask = glyph.resize((target_width, h), Image.Resampling.LANCZOS)
        cell = Image.new('RGBA', (width, h))
        white = Image.new('RGBA', mask.size, (255, 255, 255, 255))
        white.putalpha(mask)
        cell.alpha_composite(white, ((width-target_width)//2, 0))
        x, y = rect['x']*scale, rect['y']*scale
        atlas.alpha_composite(cell, (x, y))
        used_draw.rectangle((x, y, x+width-1, y+h-1), fill=255)
        assert cell.getchannel('A').getbbox(), f'Empty glyph {ch!r}'
        records.append({'character': ch, 'codepoint': f'U+{ord(ch):04X}',
                        'logical_rect': rect, 'pixel_rect': [x, y, width, h],
                        'pixel_advance': rect['advance']*scale})
    # No accidental pixels in delimiter columns / unused final columns.
    for alpha, allowed in zip(atlas.getchannel('A').tobytes(), used.tobytes()):
        assert not alpha or allowed
    return atlas, records, size, baseline/SUPERSAMPLE


def cell_from(atlas, rect, scale):
    x, y = rect['x']*scale, rect['y']*scale
    return atlas.crop((x, y, x+rect['width']*scale, y+rect['height']*scale))


def draw_atlas_text(canvas, xy, text, atlas, meta, scale):
    x, y = xy
    for c in text:
        if c == ' ':
            x += meta['space']*scale
        else:
            rect = meta['glyphs'][c]
            canvas.alpha_composite(cell_from(atlas, rect, scale), (x, y))
            x += rect['advance']*scale


def make_qa(key, atlas, meta, scale, label_font):
    glyphs = list(meta['glyphs'])
    tw, th, columns = 150, 165, 10
    canvas = Image.new('RGBA', (columns*tw, 75+math.ceil(len(glyphs)/columns)*th), '#203d35')
    d = ImageDraw.Draw(canvas)
    d.text((20, 12), f'{key}: {len(glyphs)} glyphs / deterministic TTF rasterization / {scale}x', font=label_font, fill='white')
    for n, c in enumerate(glyphs):
        x, y = (n % columns)*tw, 75+(n//columns)*th
        d.rectangle((x+2, y+2, x+tw-3, y+th-3), outline='#60766f')
        d.text((x+8, y+8), f'{n+1:03} U+{ord(c):04X}', font=label_font, fill='#abd7c5')
        cell = cell_from(atlas, meta['glyphs'][c], scale)
        canvas.alpha_composite(cell, (x+(tw-cell.width)//2, y+43))
    path = OUT/'qa-fonts'/f'{key}-all-glyphs.png'
    canvas.convert('RGB').save(path)
    return str(path.relative_to(ROOT))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scale', type=int, default=8)
    parser.add_argument('--main-font', type=Path, default=Path('/System/Library/Fonts/Supplemental/Arial Black.ttf'))
    parser.add_argument('--small-font', type=Path, default=Path('/System/Library/Fonts/Supplemental/Comic Sans MS.ttf'))
    args = parser.parse_args()
    assert args.scale == 8, 'This reviewed layout uses scale 8.'
    manifest_path = ROOT/'assets-original/manifest.json'
    manifest = json.loads(manifest_path.read_text())
    (OUT/'qa-fonts').mkdir(exist_ok=True)
    label_font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20)
    report = []
    rendered = {}
    for meta in manifest['fonts'].values():
        key = meta['asset']
        for directory in ('images', 'raw'):
            original = OUT/directory/f'{key}.png'
            backup = OUT/'before-repair'/directory/f'{key}.png'
            backup.parent.mkdir(parents=True, exist_ok=True)
            if not backup.exists():
                shutil.copy2(original, backup)
        source = ROOT/'assets-original'/f'{key}.png'
        path = args.small_font if key == 'fS' else args.main_font
        atlas, records, font_size, baseline = render_atlas(meta, Image.open(source).size, path, args.scale)
        target = OUT/'images'/f'{key}.png'
        atlas.save(target)
        rendered[key] = (atlas, meta)
        qa = make_qa(key, atlas, meta, args.scale, label_font)
        report.append({'key': key, 'source': str(source.relative_to(ROOT)),
                       'origin': 'deterministic_font', 'method': 'Pillow/FreeType TTF rasterization at 4x supersampling; exact original rects/advances at scale 8; per-glyph horizontal fit only',
                       'font_path': str(path), 'font_sha256': sha(path), 'font_size': font_size,
                       'baseline_pixels': baseline, 'pillow_version': pillow_version,
                       'manifest_sha256': sha(manifest_path), 'output': str(target.relative_to(ROOT)),
                       'sha256': sha(target), 'dimensions': list(atlas.size), 'scale': args.scale,
                       'status': 'deterministic_repaired_verified', 'glyph_count': len(records),
                       'glyph_sequence': ''.join(meta['glyphs']), 'space_advance': meta['space'],
                       'glyphs': records, 'qa_image': qa,
                       'qa': 'All required codepoints present in Unicode cmap; every glyph has alpha pixels strictly inside its original rect. Exact original advances retained. See all-glyph and Polish-text QA sheets; intentionally similar local fonts, not original outlines or AI output.'})
    next(r for r in report if r['key'] == 'fontNum')['optical_adjustments'] = {'1': 'Ink widened approximately 15% inside unchanged glyph cell; height, baseline and advance preserved.'}
    # Assemble text only from the emitted atlas rectangles, not from a system font.
    samples = {'FONT': ['ZAŻÓŁĆ GĘŚLĄ JAŹŃ', 'Ź Ż Z Ó O Ć C Ą A Ę E', '!,-./0123456789:;'],
               'fS': ['Zażółć gęślą jaźń.', 'Pchnąć w tę łódź jeża lub ośm skrzyń fig.',
                      'Ź Ż ź ż q g . , - /', 'ĄĆĘŁŃÓŚŹŻ ąćęłńóśźż'],
               'fontNum': ['0123456789', '9876543210']}
    sample = Image.new('RGBA', (1900, 1400), '#203d35')
    draw = ImageDraw.Draw(sample)
    y = 20
    for key, lines in samples.items():
        atlas, meta = rendered[key]
        draw.text((20, y), f'{key} / text composed from repaired atlas and original advances', font=label_font, fill='#abd7c5')
        y += 35
        for line in lines:
            draw_atlas_text(sample, (20, y), line, atlas, meta, args.scale)
            y += meta['height']*args.scale+12
        y += 15
    sample.crop((0, 0, 1900, y)).convert('RGB').save(OUT/'qa-fonts/polish-text.png')
    # Focused regression checks for the previous AI mistakes.
    for key, pairs in [('FONT', [('Ź', 'Ż')]), ('fS', [('Ź', 'Ż'), ('ź', 'ż'), ('q', 'g'), ('.', ',')])]:
        atlas, meta = rendered[key]
        for a, b in pairs:
            aa = cell_from(atlas, meta['glyphs'][a], args.scale).getchannel('A')
            bb = cell_from(atlas, meta['glyphs'][b], args.scale).getchannel('A')
            assert aa.size != bb.size or aa.tobytes() != bb.tobytes(), (key, a, b)
    assert {r['key']: r['glyph_count'] for r in report} == {'FONT': 52, 'fontNum': 10, 'fS': 112}
    (OUT/'reports/zz-font-repairs.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    for r in report:
        print(f"{r['key']}: {r['glyph_count']} glyphs, {r['dimensions']}, Unicode cmap/rects/advances/pair checks PASS")


if __name__ == '__main__':
    main()
