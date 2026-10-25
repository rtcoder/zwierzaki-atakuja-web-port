"""Create a static, local source/candidate review gallery. Does not edit images."""
import html
import hashlib
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent
assignments = [item for path in sorted((root / 'assignments').glob('*.json')) for item in json.loads(path.read_text())]
reports = {}
for path in sorted((root / 'reports').glob('*.json')):
    if path.name == 'alpha-cleanup.json':
        continue
    data = json.loads(path.read_text())
    if isinstance(data, dict):
        data = data.get('items', [])
    if isinstance(data, list):
        reports.update({item['key']: item for item in data if 'key' in item})
cards, records = [], []
for item in assignments:
    key = item['key']
    path = root / 'images' / f'{key}.png'
    generated = path.is_file()
    report = reports.get(key, {})
    origin = report.get('origin', 'ai')
    labels = {'ai': 'AI — kandydat', 'ai_normalized': 'AI — poprawiona geometria', 'ai_repaired': 'AI — poprawiona wersja', 'deterministic_font': 'Font odtworzony deterministycznie', 'original_upscale': 'Oryginał — wierny upscale 4×'}
    label = labels.get(origin, origin)
    record = {'key': key, 'available': generated, 'origin': origin, 'generated_by_ai': origin.startswith('ai'), 'source': item['source'], 'output': str(path) if generated else None}
    if generated:
        with Image.open(path) as image:
            image.load()
            alpha = image.convert('RGBA').getchannel('A')
            record.update(dimensions=list(image.size), mode=image.mode, alpha_extrema=list(alpha.getextrema()), content_bounds=alpha.getbbox())
        record['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    record['qa'] = reports.get(key, {}).get('qa', reports.get(key, {}).get('qa_notes', ''))
    record['status'] = reports.get(key, {}).get('status', '')
    record['method'] = report.get('method', 'image_gen.imagegen')
    record['logical_size'] = item['logical_size']
    if generated:
        record['aspect_ratio_relative_error'] = round(abs(record['dimensions'][0] / record['dimensions'][1] / (item['logical_size'][0] / item['logical_size'][1]) - 1), 4)
    records.append(record)
    qa = reports.get(key, {}).get('qa', reports.get(key, {}).get('qa_notes', ''))
    if not isinstance(qa, str):
        qa = json.dumps(qa, ensure_ascii=False)
    source = '../assets-original/' + Path(item['source']).name
    missing_text = 'Brak wyniku — blokada generatora' if 'blocked' in record['status'] else 'W trakcie'
    candidate = f'<img src="images/{key}.png" loading="lazy" alt="Poprawiona wersja: {key}">' if generated else f'<p>{missing_text}</p>'
    candidate_panel = f'<a class="art" href="images/{key}.png">{candidate}</a>' if generated else f'<div class="art">{candidate}</div>'
    issue = record['status'] in ('generated_rejected', 'generation_blocked')
    badge = '<strong class="warning">Wymaga poprawki treści</strong>' if record['status'] == 'generated_rejected' else ('<strong class="warning">Zablokowane przez generator</strong>' if record['status'] == 'generation_blocked' else '')
    cards.append(f'<article><h2>{html.escape(key)}</h2>{badge}<div class="pair"><figure><div class="art original"><img src="{html.escape(source)}" loading="lazy" alt="Oryginał: {key}"></div><figcaption>Oryginał {item["logical_size"][0]}×{item["logical_size"][1]}</figcaption></figure><figure>{candidate_panel}<figcaption>{html.escape(label)}</figcaption></figure></div><p class="qa">{html.escape(qa)}</p></article>')
count = sum(r['available'] for r in records)
unresolved = [r['key'] for r in records if r['status'] in ('generation_blocked','generated_rejected')]
issue_summary = 'Nierozwiązane problemy: ' + ', '.join(unresolved) + '.' if unresolved else 'Fonty, geometria i pochodzenie poprawek opisane są przy poszczególnych obrazach.'
page = f'''<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zwierzaki — przegląd assetów AI</title><style>
body{{margin:0;padding:28px;font:15px system-ui;background:#f5f3ed;color:#243d2e}}h1{{margin:0}}header{{max-width:1000px;margin:0 auto 28px}}main{{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:20px}}article{{background:white;padding:18px;border:1px solid #ddd;border-radius:12px;overflow:hidden}}h2{{font-size:17px;overflow-wrap:anywhere}}.pair{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}figure{{margin:0;min-width:0}}.art{{height:250px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#ddd 0% 25%,#f4f4f4 0% 50%) 0/20px 20px}}.art img{{max-width:100%;max-height:100%;object-fit:contain}}.original img{{width:100%;image-rendering:pixelated}}figcaption{{font-size:12px;margin-top:8px}}.warning{{display:block;color:#a52020;margin:0 0 12px}}.qa{{font-size:12px;line-height:1.5}}@media(max-width:500px){{body{{padding:12px}}main{{grid-template-columns:1fr}}.art{{height:180px}}}}
</style><header><h1>Zwierzaki — assety AI</h1><p>{count}/{len(records)} dostępnych obrazów. Po lewej oryginał, po prawej nowy obraz. Kliknij kandydat, aby zobaczyć pełną rozdzielczość.</p><p>Wersje robocze do kontroli: nie zostały podpięte do gry. Różnice opisano przy obrazach i w raportach. {html.escape(issue_summary)}</p><p><a href="repair-preview.html">Podgląd naprawionych fontów i animacji</a></p></header><main>{''.join(cards)}</main></html>'''
(root / 'gallery.html').write_text(page)
(root / 'inventory.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
print(f'Gallery: {count}/{len(records)} files; PNG decoding verified.')
