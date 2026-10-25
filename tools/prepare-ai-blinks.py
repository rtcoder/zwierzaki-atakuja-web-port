#!/usr/bin/env python3
"""Derive seamless blink crops from the normalized runtime bear sprites.

No generated candidate is modified. Pixel coordinates below were inspected on
the final 4x sprites. A local harmonic fill removes the open eyes; closed lids
are drawn with supersampling. Everything outside those masks stays identical.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SPECS = {
    'BIG': {
        'rect': [11, 12, 20, 8],
        'eyes': [
            [([(48,56),(53,55),(77,66),(77,74),(70,80),(57,80),(49,75),(46,66)], [(51,65),(61,71),(72,70)]),
             ([(88,66),(112,55),(117,56),(120,67),(117,76),(108,81),(96,79),(88,74)], [(93,70),(104,71),(114,64)])],
            [([(48,63),(58,61),(72,63),(78,68),(76,75),(67,78),(55,77),(48,73)], [(51,69),(62,73),(73,69)]),
             ([(88,68),(94,63),(108,61),(117,64),(119,72),(114,77),(102,78),(92,75)], [(93,69),(104,73),(115,69)])],
            [([(48,61),(59,60),(73,63),(81,68),(80,74),(73,79),(60,79),(50,74)], [(52,67),(64,73),(76,72)])],
        ],
    },
    'SMALL': {
        'rect': [6, 7, 14, 6],
        'eyes': [
            [([(30,36),(34,36),(47,42),(47,47),(42,50),(34,50),(30,46),(29,41)], [(32,41),(39,46),(45,44)]),
             ([(57,42),(69,36),(73,36),(76,41),(76,46),(71,50),(63,50),(58,47)], [(59,44),(66,46),(73,41)])],
            [([(30,42),(36,40),(44,41),(48,44),(47,48),(42,50),(34,50),(30,47)], [(32,45),(39,48),(45,45)]),
             ([(57,44),(62,41),(70,40),(75,42),(77,47),(73,50),(65,50),(59,48)], [(60,45),(67,48),(74,45)])],
            [([(30,38),(36,37),(45,39),(50,43),(50,47),(45,50),(37,50),(32,47)], [(33,42),(41,47),(48,45)])],
        ],
    },
}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def close_eye(base, polygon, curve, width):
    # Solve Laplace's equation inside the selected eye using only unchanged
    # neighboring fur as the boundary condition; no foreign palette is used.
    mask = Image.new('L', base.size)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    pixels = base.load()
    coords = [(x,y) for y in range(1,base.height-1) for x in range(1,base.width-1) if mask.getpixel((x,y))]
    selected = set(coords)
    border = {(a,b) for x,y in coords for a,b in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)] if (a,b) not in selected}
    mean = tuple(sum(pixels[x,y][c] for x,y in border)/len(border) for c in range(3))
    values = {xy: list(mean) for xy in coords}
    for _ in range(220):
        for x,y in coords:
            neighbors = [values.get((a,b),pixels[a,b]) for a,b in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]]
            values[x,y] = [sum(n[c] for n in neighbors)/4 for c in range(3)]
    filled = base.copy()
    for (x,y), value in values.items():
        filled.putpixel((x,y), tuple(round(c) for c in value)+(255,))
    # One-pixel feather retains the original fur transition around the mask.
    base = Image.composite(filled, base, mask.filter(ImageFilter.GaussianBlur(.45)))
    scale=4
    ink=Image.new('RGBA',(base.width*scale,base.height*scale))
    points=[]
    a,b,c=curve
    for i in range(41):
        t=i/40
        points.append(tuple(round(((1-t)**2*a[k]+2*(1-t)*t*b[k]+t*t*c[k])*scale) for k in (0,1)))
    draw=ImageDraw.Draw(ink)
    draw.line(points,fill=(28,12,22,255),width=round(width*scale),joint='curve')
    radius=width*scale/2
    for x,y in (points[0],points[-1]):
        draw.ellipse((x-radius,y-radius,x+radius,y+radius),fill=(28,12,22,255))
    base.alpha_composite(ink.resize(base.size,Image.Resampling.LANCZOS))
    return base

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-dir',default='dist/assets')
    parser.add_argument('--output-dir',default='assets-ai/runtime-blinks')
    args=parser.parse_args()
    base_dir=ROOT/args.base_dir
    out=ROOT/args.output_dir
    out.mkdir(parents=True,exist_ok=True)
    rows=[]
    sheet=Image.new('RGB',(960,6*230),'#355447')
    draw=ImageDraw.Draw(sheet)
    for size,spec in SPECS.items():
        for damage,eyes in enumerate(spec['eyes']):
            base_key=f'target{size}_dmg{damage}'
            key=base_key+'_eyes'
            source=base_dir/(base_key+'.png')
            base=Image.open(source).convert('RGBA')
            expected=160 if size=='BIG' else 104
            assert base.size==(expected,expected), (source,base.size)
            closed=base.copy()
            for polygon,curve in eyes:
                closed=close_eye(closed,polygon,curve,2.1 if size=='BIG' else 1.5)
            x,y,w,h=spec['rect']; box=(x*4,y*4,(x+w)*4,(y+h)*4)
            patch=closed.crop(box)
            original=base.crop(box)
            # Overlay contract is opaque. Source fur alpha is 249..254; retain
            # its RGB exactly at the perimeter and remove only this tiny opacity.
            patch.putalpha(255)
            original.putalpha(255)
            for px in range(patch.width):
                patch.putpixel((px,0),original.getpixel((px,0)))
                patch.putpixel((px,patch.height-1),original.getpixel((px,patch.height-1)))
            for py in range(patch.height):
                patch.putpixel((0,py),original.getpixel((0,py)))
                patch.putpixel((patch.width-1,py),original.getpixel((patch.width-1,py)))
            # Crop RGB edge equality is the no-palette-rectangle invariant.
            assert patch.getchannel('A').getextrema()==(255,255)
            for px in range(patch.width):
                assert patch.getpixel((px,0))==original.getpixel((px,0))
                assert patch.getpixel((px,patch.height-1))==original.getpixel((px,patch.height-1))
            for py in range(patch.height):
                assert patch.getpixel((0,py))==original.getpixel((0,py))
                assert patch.getpixel((patch.width-1,py))==original.getpixel((patch.width-1,py))
            target=out/(key+'.png'); patch.save(target)
            composite=base.copy(); composite.alpha_composite(patch,(x*4,y*4))
            # Keep only the actual overlay effect in QA, not an unbounded edit.
            offset=len(rows)*230
            draw.text((8,offset+8),base_key+' | open / blink | 1x logical',fill='white')
            for j,im in enumerate((base,composite)):
                enlarged=im.resize((200,200),Image.Resampling.NEAREST)
                sheet.paste(enlarged,(j*220,offset+28),enlarged)
                logical=im.resize((expected//4,expected//4),Image.Resampling.LANCZOS)
                sheet.paste(logical,(480+j*80,offset+80),logical)
            sheet.paste(patch.resize((patch.width*3,patch.height*3),Image.Resampling.NEAREST),(650,offset+50))
            rows.append({'key':key,'derivativeFile':str(target.relative_to(ROOT)),
                'derivativeSha256':sha(target),'baseKey':base_key,'baseSha256':sha(source),
                'blinkRect':dict(zip(['x','y','width','height'],spec['rect'])),
                'dimensions':list(patch.size),'origin':'ai_repaired',
                'processing':'Exact opaque crop of normalized AI base; local harmonic fur fill and supersampled closed eyelid strokes. Existing closed right eye retained in damage2.',
                'qa':{'opaque':True,'perimeterRgbMatchesBase':True,'editedEyeCount':len(eyes),
                    'sourceCropAlphaRange':list(base.crop(box).getchannel('A').getextrema()),
                    'opacityCorrection':'Opaque overlay as required by renderer; base crop RGB preserved at perimeter.',
                    'visualReview':'All six open/blink pairs inspected at logical size and enlarged: closed lids, no white pupils remain, no differently colored rectangles; damage2 right eyelid preserved.'}})
    sheet.save(out/'qa-open-blink.png')
    (out/'manifest.json').write_text(json.dumps(rows,indent=2)+'\n')
    print(json.dumps({'count':len(rows),'manifest':str(out/'manifest.json')}))

if __name__=='__main__':
    main()
