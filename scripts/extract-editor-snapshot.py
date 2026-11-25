"""Normalize a browser RESULT export offline; never retain owner/popup/auth fields."""
import argparse, hashlib, importlib.util, json, re
from pathlib import Path
from har_editor import numbers, svg_geometry, asset_url
spec=importlib.util.spec_from_file_location('prepare_assets',Path(__file__).with_name('prepare-assets.py')); norm=importlib.util.module_from_spec(spec);spec.loader.exec_module(norm)
def extract(snapshot, staging, out, assets=None):
 raw=snapshot.read_bytes();capture=json.loads(raw);stage=json.loads(staging.read_text());out.mkdir(parents=True,exist_ok=True);(out/'renderable').mkdir(exist_ok=True)
 evidence={'schemaVersion':1,'sourceSha256':hashlib.sha256(raw).hexdigest(),'sourceKind':'browser-result-export','editors':[],'assets':[],'issues':[],'missingLevelIds':capture.get('missing',[]),'failedLevelIds':capture.get('failed',[])}
 assets_data=json.loads(assets.read_text()).get('assets',[]) if assets else []
 known={str(e['id']) for e in stage['elements'] if e['iblock']==134};seen=set()
 for r in capture['results']:
  lid=int(r['levelId'])
  if str(lid) not in known or lid in seen:raise ValueError('Unknown or duplicate level ID')
  seen.add(lid);c=r['canvas'];bg=re.search(r'href=[\"\']([^\"\']+)',c['bg']);url=asset_url(bg[1]) if bg else None
  editor={'entryIndex':len(evidence['editors']),'levelId':lid,'canvas':{'backgroundUrl':url,'viewBox':c['vb'],'width':float(c['w']),'height':float(c['h'])},'templates':[],'items':[]}
  asset=next((a for a in assets_data if a['url']==url),None)
  if asset:
   try:
    svg=norm.normalize(asset['svg']);path=f'renderable/floor-{lid}.svg';(out/path).write_text(svg);editor['canvas']['renderSvg']=svg
    evidence['assets'].append({'url':url,'svgPath':path,'sourceSha256':hashlib.sha256(asset['svg'].encode()).hexdigest()})
   except (ValueError,Exception) as e:evidence['issues'].append({'levelId':lid,'kind':'background','reason':type(e).__name__})
  for t in r['templates']['items'].values():
   try:
    geom=svg_geometry(t['template']);tid=int(t['id']);path=f'renderable/template-{tid}.svg'
    record={'id':tid,'name':t['name'],'groupId':int(t['group_id']),'box':numbers(t['box']),'is_table':bool(t['is_table']),'previewUrl':asset_url(t['preview']),'inlineSvg':t['template'],'svgPath':path,'geometry':geom,'legacyMatch':{'method':'id','ids':[e['id'] for e in stage['elements'] if e['iblock']==132 and str(e['id'])==str(tid)]},'status':'observed','confidence':'confirmed-by-current-API','unit':'SVG-user-unit'}
    try:
     svg=norm.normalize(t['template'],geom['root'].get('width'),geom['root'].get('height'));record['renderSvg']=svg;(out/path).write_text(svg)
    except Exception as e:evidence['issues'].append({'templateId':tid,'kind':'render','reason':type(e).__name__})
    editor['templates'].append(record)
   except Exception as e:evidence['issues'].append({'levelId':lid,'kind':'template','reason':type(e).__name__})
  for item in r['items']:
   editor['items'].append({'id':int(item['id']),'templateId':int(item['tpl']),**numbers(item)})
  evidence['editors'].append(editor)
 (out/'har-renderable-data.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2))
 print(json.dumps({'floors':len(seen),'templates':len({t['id'] for e in evidence['editors'] for t in e['templates']}),'backgrounds':len(evidence['assets']),'missing':len(evidence['missingLevelIds']),'issues':len(evidence['issues'])}))
 return evidence
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('snapshot',type=Path);p.add_argument('staging',type=Path);p.add_argument('out',type=Path);p.add_argument('--assets',type=Path);a=p.parse_args();extract(a.snapshot,a.staging,a.out,a.assets)
