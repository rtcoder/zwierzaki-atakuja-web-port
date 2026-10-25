#!/usr/bin/env python3
"""Package reviewed AI candidates at 4x without changing logical game geometry."""
from pathlib import Path
import argparse,hashlib,json,re,shutil,subprocess,sys
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
SCALE=4
ORIGINAL=ROOT/'assets-original'; CANDIDATES=ROOT/'assets-ai/images'; DEST=ROOT/'dist/assets'; QA=ROOT/'assets-ai/runtime-qa'
PRESERVED={'ai_normalized','ai_repaired','deterministic_font','original_upscale'}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def resize(im,size):return im.convert('RGBa').resize(size,Image.Resampling.LANCZOS).convert('RGBA')
def bbox(im,threshold=0):return im.getchannel('A').point(lambda v:255 if v>threshold else 0).getbbox()
def repeat_edges(im,width=8):
 # Blend only two logical pixels on each side to one shared premultiplied profile.
 premul=im.convert('RGBa');p=premul.load();w,h=premul.size
 for y in range(h):
  common=tuple(round((p[0,y][c]+p[w-1,y][c])/2) for c in range(4))
  for i in range(width):
   t=1-i/(width-1);t=t*t*(3-2*t)
   for x in [i,w-1-i]:p[x,y]=tuple(round(p[x,y][c]*(1-t)+common[c]*t) for c in range(4))
 result=premul.convert('RGBA')
 assert all(result.getpixel((0,y))==result.getpixel((w-1,y)) for y in range(h))
 return result
def origins():
 result={}
 for path in sorted((ROOT/'assets-ai/reports').glob('*.json')):
  data=json.loads(path.read_text()); rows=data if isinstance(data,list) else data.get('items',[])
  for row in rows:
   if row.get('origin'):result[row['key']]=row['origin']
 return result

def package(im,original,key,meta,manifest,origin):
 size=(meta['width']*SCALE,meta['height']*SCALE)
 source_box=bbox(original); meaningful=bbox(im,8)
 info={'candidateDimensions':list(im.size),'candidateAlphaBounds':bbox(im),'candidateMeaningfulBounds':meaningful,'originalAlphaBounds':source_box,'originalAnchor':None}
 effect=manifest['effects'].get(key)
 font=next((v for v in manifest['fonts'].values() if v['asset']==key),None)
 if effect or font:
  # Sampling boundaries never cross glyph/frame cells.
  sx=im.width/meta['width'];sy=im.height/meta['height'];out=resize(im,size);cells=[]
  rects=([(i*effect['frameWidth'],0,effect['frameWidth'],effect['frameHeight']) for i in range(effect['frames'])] if effect else [(g['x'],g['y'],g['width'],g['height']) for g in font['glyphs'].values()])
  for x,y,w,h in rects:
   box=(round(x*sx),round(y*sy),round((x+w)*sx),round((y+h)*sy));dest=(x*SCALE,y*SCALE,(x+w)*SCALE,(y+h)*SCALE)
   out.paste(resize(im.crop(box),(w*SCALE,h*SCALE)),dest)
   cells.append({'candidateBox':box,'runtimeBox':dest})
  policy='Preserve reviewed full canvas; premultiplied-alpha Lanczos independently per original glyph/frame cell.';info['cells']=cells
 elif origin in PRESERVED or original.getchannel('A').getextrema()==(255,255):
  out=resize(im,size);policy='Preserve reviewed full canvas; premultiplied-alpha Lanczos to original logical canvas at 4x.'
 else:
  # Crop only alpha <=8 outside the visible content, retaining internal soft alpha.
  content=im.crop(meaningful);ob=tuple(v*SCALE for v in source_box)
  factor=min((ob[2]-ob[0])/content.width,(ob[3]-ob[1])/content.height)
  fitted=resize(content,(max(1,round(content.width*factor)),max(1,round(content.height*factor))))
  px=ob[0]+((ob[2]-ob[0])-fitted.width)//2
  bottom=key.startswith(('char_','tree'))
  py=ob[3]-fitted.height if bottom else ob[1]+((ob[3]-ob[1])-fitted.height)//2
  out=Image.new('RGBA',size);out.alpha_composite(fitted,(px,py))
  policy='Crop only faint outer alpha padding (bbox alpha>8); proportionally fit into original alpha bounds; '+('original bottom-center anchor.' if bottom else 'original content center anchor.')
  info.update({'placement':[px,py],'uniformContentScale':factor,'originalAnchor':[27,27] if key.startswith('char_') and original.size==(54,54) else None,'anchorPolicy':'bottom-center within original alpha bounds' if bottom else 'center within original alpha bounds'})
 info['operation']=policy;info['runtimeAlphaBounds']=bbox(out)
 if key=='grass':
  out=repeat_edges(out)
  info['operation']+=' Normalize 8 runtime pixels (2 logical pixels) at both repeat edges to a shared premultiplied RGBA row profile with smoothstep blending.'
  info['edgeNormalization']={'widthPixels':8,'widthLogical':2,'matchingFirstLastColumns':True}
  info['runtimeAlphaBounds']=bbox(out)
 return out,info

def make_qa(manifest):
 QA.mkdir(exist_ok=True)
 def load(key,original=False):
  if original:
   im=Image.open(ORIGINAL/manifest['assets'][key]['file']).convert('RGBA');return resize(im,(im.width*SCALE,im.height*SCALE))
  return Image.open(DEST/(key+'.png')).convert('RGBA')
 def place(canvas,key,x,y,original=False):canvas.alpha_composite(load(key,original),(round(x*SCALE),round(y*SCALE)))
 sheet=Image.new('RGBA',(1280,1280),'#355447');d=ImageDraw.Draw(sheet)
 for row,orig in enumerate((True,False)):
  for col,angle in enumerate((0,-45)):
   panel=Image.new('RGBA',(640,640));pivot=(80,65)
   for n in range(2):place(panel,'launcherBaseElement',pivot[0]-15,pivot[1]+40+15*n,orig)
   place(panel,'launcherBaseTop',pivot[0]-19,pivot[1]+40,orig)
   rotating=Image.new('RGBA',(640,640))
   for key,x,y in [('launcher_5',-27,-27),('launcher_1',-27,-27),('char_skunk3',-27,-35),('launcher_4',-27,-27)]:place(rotating,key,pivot[0]+x,pivot[1]+y,orig)
   panel.alpha_composite(rotating.rotate(-angle,Image.Resampling.BICUBIC,center=(pivot[0]*SCALE,pivot[1]*SCALE)))
   place(panel,'launcher_2',pivot[0]-4,pivot[1]-2,orig)
   sheet.alpha_composite(panel,(col*640,row*640));d.text((col*640+10,row*640+10),f'{"ORIGINAL" if orig else "AI runtime"} angle {angle}; pull=-20',fill='white')
 sheet.convert('RGB').save(QA/'launcher-composition.png')
 for animal in manifest['animals']:
  keys=animal['frames']+([animal['specialFrame']] if 'specialFrame' in animal else [])
  sheet=Image.new('RGBA',(len(keys)*240,500),'#355447');d=ImageDraw.Draw(sheet)
  for col,key in enumerate(keys):
   for row,orig in enumerate((True,False)):
    sheet.alpha_composite(load(key,orig),(col*240+12,row*250+26));d.text((col*240+8,row*250+5),('original ' if orig else 'runtime ')+key,fill='white')
    cx,cy=col*240+120,row*250+134;d.line((cx-4,cy,cx+4,cy),fill='#ff7979');d.line((cx,cy-4,cx,cy+4),fill='#ff7979')
  sheet.convert('RGB').save(QA/f'animal-{animal["key"]}.png')
 sheet=Image.new('RGBA',(600,500),'#355447');d=ImageDraw.Draw(sheet)
 for r,(size,target) in enumerate(manifest['targets'].items()):
  for col,key in enumerate(target['frames']):
   for orig,dy in [(True,25),(False,125)]:
    tile=load(key,orig);tile.thumbnail((96,96));sheet.alpha_composite(tile,(col*200+45,r*250+dy))
   d.text((col*200+8,r*250+6),key+' original / runtime',fill='white')
 sheet.convert('RGB').save(QA/'target-bases.png')
 grass=load('grass');sheet=Image.new('RGBA',(grass.width*3,grass.height),'#355447')
 for i in range(3):sheet.alpha_composite(grass,(i*grass.width,0))
 sheet.convert('RGB').save(QA/'grass-3tiles.png')

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--overrides',type=Path,help='Optional reviewed derivative manifest; candidate provenance remains unchanged.')
 args=parser.parse_args();overrides={}
 helper=ROOT/'tools/prepare-ai-blinks.py'
 if not args.overrides and not helper.exists():raise FileNotFoundError(f'Required blink derivative helper missing: {helper}')
 if args.overrides:
  data=json.loads(args.overrides.read_text());rows=data if isinstance(data,list) else data['items']
  overrides={row['key']:row for row in rows}
 manifest=json.loads((ORIGINAL/'manifest.json').read_text());origin_map=origins();assets={};records=[]
 assert not set(overrides)-set(manifest['assets']),'Unknown override keys'
 def candidate_path(key):return CANDIDATES/(key+'.png')
 for key,meta in manifest['assets'].items():
  assert sha(ORIGINAL/meta['file'])==meta['sha256'],key
  assert candidate_path(key).exists(),key
 for key,meta in manifest['assets'].items():
  candidate=candidate_path(key);origin=origin_map.get(key,'ai_generated')
  with Image.open(candidate) as raw,Image.open(ORIGINAL/meta['file']) as raw_original:
   out,record=package(raw.convert('RGBA'),raw_original.convert('RGBA'),key,meta,manifest,origin)
  if out.getchannel('A').getextrema()==(255,255):out=out.convert('RGB')
  path=DEST/(key+'.png');out.save(path,optimize=True)
  assets[key]={'file':path.name,'width':meta['width'],'height':meta['height'],'pixelWidth':out.width,'pixelHeight':out.height,'scale':SCALE,'bytes':path.stat().st_size,'sha256':sha(path),'originalFile':meta['file'],'originalSha256':meta['sha256'],'candidateFile':str(candidate.relative_to(ROOT)),'candidateSha256':sha(candidate),'origin':origin,'processing':record['operation']}
  records.append({'key':key,**assets[key],**record})
 if not args.overrides:
  derivative_dir=ROOT/'assets-ai/runtime-blinks'
  subprocess.run([sys.executable,str(helper),'--base-dir',str(DEST),'--output-dir',str(derivative_dir)],check=True)
  rows=json.loads((derivative_dir/'manifest.json').read_text())
  overrides={row['key']:row for row in rows}
 assert not set(overrides)-set(manifest['assets']),'Unknown derivative keys'
 for key,override in overrides.items():
  derivative=ROOT/override.get('derivativeFile',override.get('candidateFile',''))
  if override.get('derivativeSha256'):assert sha(derivative)==override['derivativeSha256'],key
  if override.get('baseKey'):assert assets[override['baseKey']]['sha256']==override['baseSha256'],key
  with Image.open(derivative) as raw:
   assert raw.size==(assets[key]['pixelWidth'],assets[key]['pixelHeight']),key
   record={'operation':'Copy reviewed derivative PNG bytes unchanged at exact runtime dimensions.',
           'dimensions':list(raw.size),'alphaBounds':bbox(raw.convert('RGBA'))}
  path=DEST/(key+'.png');shutil.copyfile(derivative,path)
  extra={'derivativeFile':str(derivative.relative_to(ROOT)),'derivativeSha256':sha(derivative),
         'derivativeOrigin':override.get('origin','ai_repaired'),
         'processing':override.get('processing','Reviewed derivative')+'; '+record['operation'],
         'bytes':path.stat().st_size,'sha256':sha(path)}
  for field in ['blinkRect','baseSha256','baseFile','baseKey']:
   if field in override:extra[field]=override[field]
  assets[key].update(extra)
  rec=next(r for r in records if r['key']==key);rec.update(extra);rec['derivativeOperation']=record
 source={**manifest['source'],'pixelPolicy':'AI remaster; approved AI artwork and deterministic repairs at 4x; originals preserved in assets-original','processing':'Pillow premultiplied-alpha Lanczos; original logical anchors; isolated atlas cells; lossless PNG'}
 payload={**manifest,'source':source,'assets':assets};(DEST/'manifest.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
 js_path=ROOT/'dist/js/assets.js';js=js_path.read_text()
 for name,value in [('ASSET_SOURCE',source),('ASSET_META',assets)]:
  replacement=f'export const {name} = '+json.dumps(value,ensure_ascii=False,separators=(',',':'))+';'
  js,count=re.subn(rf'^export const {name} = .*;$',lambda _:replacement,js,flags=re.MULTILINE);assert count==1
 js_path.write_text(js)
 report={'scale':SCALE,'assetCount':len(assets),'totalBytes':sum(v['bytes'] for v in assets.values()),'decodedRGBABytes':sum(v['pixelWidth']*v['pixelHeight']*4 for v in assets.values()),'assets':records,'qa':{'launcher':'runtime-qa/launcher-composition.png','animalStrips':[f'runtime-qa/animal-{a["key"]}.png' for a in manifest['animals']],'targetBases':'runtime-qa/target-bases.png','status':'generated; pending visual review'}}
 inspection=QA/'inspection.json'
 if inspection.exists():
  reviewed=json.loads(inspection.read_text());changed=[k for k,v in assets.items() if reviewed['reviewedRuntimeHashes'].get(k)!=v['sha256']]
  report['qa']={**reviewed['qa'],'changedSinceReview':changed,'status':'visually_reviewed' if not changed else 'unchanged assets retain visual review; changed assets require separate review'}
 (ROOT/'assets-ai/runtime-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');make_qa(manifest)
 print(json.dumps({k:report[k] for k in ['assetCount','totalBytes','decodedRGBABytes']}))
if __name__=='__main__':main()
