"""Offline allowlisted HAR evidence extraction. Never imports a network client or auth values."""
import argparse, base64, csv, hashlib, json, re
from pathlib import Path
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

ACTIONS = ('getEditorData', 'getPopupData', 'searchUser')
ENDPOINT = 'https://portal.irkutskoil.ru/local/modules/adict.office_map/ajax.php'

def asset_url(value):
    u = urlsplit(value)
    if u.scheme not in ('', 'https') or (u.netloc and u.netloc != 'portal.irkutskoil.ru'):
        return None
    return u.path if u.path.startswith('/upload/') and u.path.endswith('.svg') else None

def numbers(obj):
    return {k: float(v) for k, v in obj.items() if k in ('x','y','w','h','cx','cy','width','height','r','rotation','scale','scaleX','scaleY') and isinstance(v,(int,float,str)) and re.fullmatch(r'-?\d+(?:\.\d+)?', str(v))}

def svg_geometry(svg):
    root = ET.fromstring(svg)
    # XML has no external entities in ElementTree. Reject active content and external references.
    for el in root.iter():
        if el.tag.split('}')[-1] in ('script','foreignObject','iframe'):
            raise ValueError('Active SVG content rejected')
        for key,val in el.attrib.items():
            if key.lower().startswith('on') or key.split('}')[-1] in ('href','src') and not val.startswith('#'):
                raise ValueError('External SVG reference rejected')
            if re.search(r'(token|cookie|authorization|sessid|password)\s*[:=]|https?://|url\((?!#)',val,re.I):
                raise ValueError('Non-geometric SVG attribute rejected')
    bases = [numbers(el.attrib) for el in root.iter() if 'basis' in el.get('class','').split()]
    return {'root': numbers(root.attrib), 'viewBox': root.get('viewBox'), 'basis': bases}

def extract(har, staging, out):
    out.mkdir(parents=True, exist_ok=True)
    assets = out/'svg'; assets.mkdir(exist_ok=True)
    raw = har.read_bytes(); data = json.loads(raw)
    stage = json.loads(staging.read_text())
    levels = [e for e in stage['elements'] if e['iblock']==134]
    legacy = [e for e in stage['elements'] if e['iblock']==132]
    evidence = {'schemaVersion':1,'sourceSha256':hashlib.sha256(raw).hexdigest(), 'calls':[], 'editors':[], 'assets':[], 'issues':[]}
    def save_svg(svg, prefix):
        geometry = svg_geometry(svg)
        digest = hashlib.sha256(svg.encode()).hexdigest()
        path = 'svg/'+prefix+'-'+digest[:16]+'.svg'
        (out/path).write_text(svg)
        return path, geometry
    for index, entry in enumerate(data['log']['entries']):
        req=entry.get('request',{}); content=entry.get('response',{}).get('content',{})
        body=content.get('text','')
        if content.get('encoding')=='base64':
            try: body=base64.b64decode(body,validate=True).decode('utf8')
            except Exception: body=''
        try: request=json.loads(req.get('postData',{}).get('text','{}'))
        except Exception: request={}
        if not isinstance(request,dict): request={}
        action=request.get('action')
        if action in ACTIONS:
            u=urlsplit(req['url'])
            params=request.get('params',[])
            safe_params=params if isinstance(params,list) and all(type(p) is int for p in params) else '[omitted]'
            call={'entryIndex':index,'action':action,'endpoint':u.scheme+'://'+u.netloc+u.path,'method':req.get('method'),'params':safe_params,'httpStatus':entry['response'].get('status'),'responseBodyPresent':bool(body)}
            evidence['calls'].append(call)
            if action=='getEditorData':
                try:
                    response=json.loads(body)
                    if response.get('STATUS')!='OK': raise ValueError()
                    r=response['RESULT']; c=r['canvas']; bg=re.search(r'href=[\"\']([^\"\']+)',c['bg'])
                    editor={'entryIndex':index,'levelId':r['levelId'],'canvas':{'backgroundUrl':asset_url(bg[1]) if bg else None,'viewBox':c['vb'],'width':float(c['w']),'height':float(c['h'])},'groups':[{k:g[k] for k in ('id','name')} for g in r['templates']['groups']], 'templates':[], 'items':[]}
                    for key,t in r['templates']['items'].items():
                        path,geometry=save_svg(t['template'],'template-'+str(int(t['id'])))
                        editor['templates'].append({'id':t['id'],'groupId':t['group_id'],'name':t['name'],'previewUrl':asset_url(t['preview']),'box':numbers(t['box']),'is_table':t['is_table'],'inlineSvg':t['template'],'svgPath':path,'geometry':geometry,'status':'observed','confidence':'confirmed-by-current-API','unit':'SVG-user-unit'})
                    for item in r['items']:
                        editor['items'].append({'id':item['id'],'templateId':item['tpl'],**numbers(item)})
                    evidence['editors'].append(editor)
                except Exception:
                    evidence['issues'].append({'entryIndex':index,'reason':'Editor body rejected or missing; inspect locally without logging raw content'})
        url=asset_url(req.get('url',''))
        if url and body.lstrip().startswith(('<svg','<?xml')):
            try:
                path,geometry=save_svg(body,'asset')
                evidence['assets'].append({'entryIndex':index,'url':url,'svgPath':path,'geometry':geometry})
            except Exception: evidence['issues'].append({'entryIndex':index,'reason':'SVG body rejected'})
    mapping=[]
    normalize=lambda s: re.sub(r'\s+',' ',s.strip().casefold()).replace('×','x').replace('х','x')
    for editor in evidence['editors']:
        matches=[l for l in levels if str(l['id'])==str(editor['levelId'])]
        editor['legacyMatch']={'method':'id' if matches else 'unmatched','ids':[m['id'] for m in matches]}
        for t in editor['templates']:
            matches=[x for x in legacy if str(x['id'])==str(t['id'])]; method='id'
            if not matches:
                matches=[x for x in legacy if normalize(x['name'])==normalize(t['name'])];method='unique-name' if len(matches)==1 else 'ambiguous-name' if matches else 'unmatched'
            t['legacyMatch']={'method':method,'ids':[m['id'] for m in matches]}
            mapping.append({'levelId':editor['levelId'],'templateId':t['id'],'name':t['name'],'legacyIds':'|'.join(str(m['id']) for m in matches),'match':method,'nameAgrees':bool(matches) and all(normalize(x['name'])==normalize(t['name']) for x in matches),'width':t['geometry']['root'].get('width'),'height':t['geometry']['root'].get('height'),'basis':json.dumps(t['geometry']['basis']),'box':json.dumps(t['box']),'is_table':t['is_table'],'confidence':t['confidence'],'previewUrl':t['previewUrl'],'svgPath':t['svgPath']})
    evidence['unmatchedLegacyTemplates']=[{'id':t['id'],'name':t['name']} for t in legacy if not any(str(t['id']) in [str(i) for i in x['legacyMatch']['ids']] for e in evidence['editors'] for x in e['templates'])]
    (out/'har-editor-data.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2))
    with (out/'template-mapping.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=list(mapping[0]) if mapping else ['levelId']);w.writeheader();w.writerows(mapping)
    ids=sorted([int(l['id']) for l in levels]);(out/'level-ids.json').write_text(json.dumps(ids,indent=2))
    with (out/'level-mapping.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=['levelId','name','buildingId','observed']);w.writeheader();w.writerows({'levelId':l['id'],'name':l['name'],'buildingId':l['properties'].get('BUILDING_ID',[''])[0],'observed':any(str(e['levelId'])==str(l['id']) for e in evidence['editors'])} for l in levels)
    print(json.dumps({'calls':{a:sum(c['action']==a for c in evidence['calls']) for a in ACTIONS},'editors':len(evidence['editors']),'templates':len(mapping),'svgBodies':len(evidence['assets']),'levels':len(ids),'issues':evidence['issues']}))
    return evidence

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('har',type=Path);parser.add_argument('--staging',required=True,type=Path);parser.add_argument('--out',type=Path,default=Path('evidence'));args=parser.parse_args()
    extract(args.har,args.staging,args.out)
