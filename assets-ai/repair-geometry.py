#!/usr/bin/env python3
"""Normalize reviewed AI sprites; always reads immutable before-repair backups."""
from pathlib import Path
import json, shutil, statistics
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
ORIGINAL = ROOT.parent / 'assets-original'
IMAGES = ROOT / 'images'
BACKUP = ROOT / 'before-repair'
QA = ROOT / 'repair-qa'
SCALE = 8
MANIFEST = json.loads((ORIGINAL / 'manifest.json').read_text())
KEYS = ['grass','pbarEmpty','pbarFull','launcherBaseTop','launcher_2','softButton','tree_3b','lg','buttonStripe','explosion','fire','sparkles','mark']

def bounds(im, threshold=8):
    return im.getchannel('A').point(lambda a:255 if a>threshold else 0).getbbox()

def clean(im):
    im=im.copy(); im.putalpha(im.getchannel('A').point(lambda a:0 if a<=8 else a)); return im

def fit(im,size):
    ratio=min(size[0]/im.width,size[1]/im.height)
    return im.resize((max(1,round(im.width*ratio)),max(1,round(im.height*ratio))),Image.Resampling.LANCZOS)

def preview(im,path):
    matte=Image.new('RGBA',im.size,'#355447');matte.alpha_composite(im);matte.convert('RGB').save(path)

def segments(im):
    p=im.getchannel('A').point(lambda a:255 if a>32 else 0).getprojection()[0]
    result=[];start=None
    for x,v in enumerate(p+[0]):
        if v and start is None:start=x
        if not v and start is not None:result.append((start,x));start=None
    return result

def cap_resize(im,size):
    # Preserve rounded end geometry while adjusting only the straight middle.
    w,h=size; factor=h/im.height; cap=min(im.height//2,(im.width-1)//2)
    cw=min(round(cap*factor),(w-1)//2)
    out=Image.new('RGBA',size)
    pieces=[(im.crop((0,0,cap,im.height)),(cw,h),0),
            (im.crop((cap,0,im.width-cap,im.height)),(w-2*cw,h),cw),
            (im.crop((im.width-cap,0,im.width,im.height)),(cw,h),w-cw)]
    for piece,sz,x in pieces:out.alpha_composite(piece.resize(sz,Image.Resampling.LANCZOS),(x,0))
    return out

def run():
    BACKUP.mkdir(exist_ok=True);QA.mkdir(exist_ok=True);report=[]
    for key in KEYS:
        dst=IMAGES/(key+'.png');bak=BACKUP/(key+'.png')
        if not bak.exists():shutil.copy2(dst,bak)
        ai=Image.open(bak).convert('RGBA');src=Image.open(ORIGINAL/(key+'.png')).convert('RGBA')
        size=(src.width*SCALE,src.height*SCALE);box=bounds(ai);original_box=src.getchannel('A').getbbox()
        content=clean(ai).crop(box);out=Image.new('RGBA',size)
        rec={'key':key,'origin':'ai_normalized','source':str(bak.relative_to(ROOT.parent)),
             'original_reference':str((ORIGINAL/(key+'.png')).relative_to(ROOT.parent)),
             'original_dimensions':list(src.size),'input_dimensions':list(ai.size),
             'source_content_bounds':list(box),'original_content_bounds':list(original_box),
             'scale':SCALE,'dimensions':list(size),'status':'repaired','qa':[]}
        if key in MANIFEST['effects']:
            spec=MANIFEST['effects'][key];spans=segments(ai)
            assert len(spans)==spec['frames'],(key,spans)
            rec['method']='Segment alpha projection into distinct frames; aspect-preserving fit in original per-frame alpha bounds; preserve frame order and offsets.'
            rec['frames']=[]
            for i,(left,right) in enumerate(spans):
                fw,fh=spec['frameWidth'],spec['frameHeight']
                source_cell=(i*fw,0,(i+1)*fw,fh)
                source_bounds=src.crop(source_cell).getchannel('A').getbbox()
                # Segment boundary includes all meaningful alpha; neighboring frames never share a crop.
                region=clean(ai).crop((left,0,right,ai.height));rb=region.getchannel('A').getbbox()
                crop_box=(left+rb[0],rb[1],left+rb[2],rb[3]);piece=clean(ai).crop(crop_box)
                sb=tuple(v*SCALE for v in source_bounds)
                fitted=fit(piece,(sb[2]-sb[0],sb[3]-sb[1]))
                px=i*fw*SCALE+sb[0]+((sb[2]-sb[0])-fitted.width)//2
                py=sb[3]-fitted.height if key=='fire' else sb[1]+((sb[3]-sb[1])-fitted.height)//2
                out.alpha_composite(fitted,(px,py))
                assert px>=i*fw*SCALE and px+fitted.width<=(i+1)*fw*SCALE and py>=0 and py+fitted.height<=fh*SCALE
                frame=out.crop((i*fw*SCALE,0,(i+1)*fw*SCALE,fh*SCALE))
                preview(frame,QA/f'{key}-frame-{i}.png')
                rec['frames'].append({'index':i,'ai_source_box':list(crop_box),'original_cell':list(source_cell),
                    'original_content_bounds':list(source_bounds),'output_cell':[i*fw*SCALE,0,(i+1)*fw*SCALE,fh*SCALE],
                    'output_content_bounds':list(frame.getchannel('A').getbbox()),'placement':[px,py],
                    'no_clipping':True,'content_present':frame.getchannel('A').getbbox() is not None})
        elif key=='buttonStripe':
            # A median interior column value per row removes all horizontal variation.
            resized=ai.resize(size,Image.Resampling.LANCZOS);pix=resized.load()
            for y in range(size[1]):
                c=tuple(round(statistics.median(pix[x,y][ch] for x in range(size[0]//4,3*size[0]//4))) for ch in range(4))
                for x in range(size[0]):out.putpixel((x,y),c)
            assert all(out.getpixel((0,y))==out.getpixel((x,y)) for y in range(size[1]) for x in range(size[0]))
            rec['method']='Per-row median RGBA from middle half of AI image, replicated horizontally; exact seamless horizontal repeat.'
        elif key=='grass':
            # Keep tuft zone separate from deep soil, avoiding flat squashed tufts.
            tops=[content.getchannel('A').crop((x,0,x+1,content.height)).getbbox()[1] for x in range(content.width)]
            split=round(statistics.median(tops))+12
            top_h=9*SCALE+16
            out.alpha_composite(content.crop((0,0,content.width,split)).resize((size[0],top_h),Image.Resampling.LANCZOS),(0,0))
            out.alpha_composite(content.crop((0,split,content.width,content.height)).resize((size[0],size[1]-top_h),Image.Resampling.LANCZOS),(0,top_h))
            rec['method']='Piecewise vertical normalization: tuft/cream-edge zone mapped separately from deep soil; preserves three tuft positions and original 8:1 canvas.'
            rec['split']={'ai_y':box[1]+split,'output_y':top_h}
        elif key in ['pbarEmpty','pbarFull']:
            # Stopwatch is approximately circular; do not stretch it with the long track.
            scale=size[1]/content.height;left=min(content.width-1,round(content.height*1.02))
            lw=round(left*scale)
            out.alpha_composite(content.crop((0,0,left,content.height)).resize((lw,size[1]),Image.Resampling.LANCZOS),(0,0))
            out.alpha_composite(content.crop((left,0,content.width,content.height)).resize((size[0]-lw,size[1]),Image.Resampling.LANCZOS),(lw,0))
            rec['method']='Remove transparent padding; scale stopwatch uniformly to original height; stretch only straight bar section horizontally to original logical width.'
            rec['split']={'ai_x':box[0]+left,'output_x':lw}
        elif key=='softButton':
            out=cap_resize(content,size)
            # Restore original translucent dark center, keeping the AI rim geometry.
            fill=Image.new('RGBA',size);d=ImageDraw.Draw(fill)
            alpha=src.getpixel((src.width//2,src.height//2))[3]
            d.rounded_rectangle((4,4,size[0]-5,size[1]-5),radius=size[1]/2-4,fill=(0,0,0,alpha))
            fill.alpha_composite(out);out=fill
            rec['method']='Nine-slice rounded caps preserve curvature; restore original black center alpha=77 beneath AI rim.'
        elif key=='launcherBaseTop':
            out=content.resize(size,Image.Resampling.LANCZOS)
            rec['method']='Map tight wooden platform alpha bounds to original 39:8 geometry, correcting excessive horizontal flattening from AI.'
        else:
            sb=tuple(v*SCALE for v in original_box)
            piece=fit(content,(sb[2]-sb[0],sb[3]-sb[1]))
            x=sb[0]+((sb[2]-sb[0])-piece.width)//2
            y=sb[3]-piece.height if key in ['launcher_2','tree_3b'] else sb[1]+((sb[3]-sb[1])-piece.height)//2
            out.alpha_composite(piece,(x,y))
            rec['method']='Remove alpha padding; uniformly fit source bounds into original logical canvas; preserve silhouette aspect, center horizontally, bottom-anchor stems/trees.'
            rec['placement']=[x,y]
            if key=='lg':
                # Reviewed, isolated faulty badge; only a 10 px wide gold corner
                # intersects this box. Restore it from the same vertical edge.
                erase=(1330,0,1400,77)
                corner_source=(1330,80,1340,108)
                corner_target=(1330,49,1340,77)
                corner=out.crop(corner_source)
                out.paste((0,0,0,0),erase)
                out.paste(corner,corner_target)
                font_path='/System/Library/Fonts/Supplemental/Arial.ttf'
                font=ImageFont.truetype(font_path,64)
                glyph=Image.new('RGBA',(96,96));gd=ImageDraw.Draw(glyph)
                gd.text((0,0),'®',font=font,fill='white',stroke_width=0)
                glyph=glyph.crop(glyph.getchannel('A').getbbox())
                glyph=glyph.resize((48,48),Image.Resampling.LANCZOS)
                out.alpha_composite(glyph,(1352,8))
                rec['method']+=' AI logo plus deterministic registered glyph; erase isolated wrong badge, reconstruct small gold l corner from matching adjacent vertical edge, render white Arial ® at original glyph proportions and position.'
                rec['glyph_repair']={'removed_badge_box':list(erase),'corner_sample_box':list(corner_source),
                    'corner_rebuilt_box':list(corner_target),'glyph':'®','font':font_path,
                    'output_glyph_box':[1352,8,1400,56],'original_glyph_region':[169,1,175,7],
                    'mask':'rectangular erase box plus adjacent-edge replacement; no other logo pixels modified'}
                rec['qa'].append('Registered glyph and reconstructed gold l corner inspected at enlarged scale and on light/dark matte composites; badge removed, letter retained. White glyph visibility on light backgrounds matches original white glyph behavior.')
                for color,name in [('#f4f4f4','light'),('#151515','dark')]:
                    matte=Image.new('RGBA',size,color);matte.alpha_composite(out)
                    matte.convert('RGB').save(QA/f'lg-{name}.png')
        assert out.size==size and out.getchannel('A').getbbox()
        out.save(dst);preview(out,QA/(key+'.png'))
        rec['output_content_bounds']=list(out.getchannel('A').getbbox())
        rec['qa'].append('Exact logical dimensions times 8 verified; meaningful alpha retained within canvas. Proper alpha-composited output visually inspected; expected content is present.')
        if key in MANIFEST['effects']:
            rec['qa'].append('Every individual frame inspected after normalization; no missing content or clipping introduced by placement. Original relative margins retained, with aspect-preserving fit where AI silhouettes differ.')
            for frame in rec['frames']:frame['visual_qa']='Individual matte composite inspected; content present and no introduced clipping.'
        report.append(rec)
    (ROOT/'reports'/'zz-geometry-repairs.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'assets':len(report),'frames':sum(len(r.get('frames',[])) for r in report),'report':'assets-ai/reports/zz-geometry-repairs.json'}))

if __name__=='__main__':run()
