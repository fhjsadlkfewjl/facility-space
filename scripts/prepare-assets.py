"""Offline normalization of captured SVG only. Fail closed on unsupported CSS/XML."""
import json,re,hashlib,copy,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
TAGS=set('svg g path rect circle ellipse line polyline polygon text tspan title desc defs clipPath mask'.split())
ATTRS=set('viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points transform fill stroke stroke-width opacity fill-opacity stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit fill-rule font-size font-family text-anchor dominant-baseline id clip-rule clip-path mask maskUnits mask-type display overflow enable-background'.split())
def normalize(source, width=None, height=None):
 if re.search(r'<!DOCTYPE|<!ENTITY',source,re.I):raise ValueError('DTD/entity rejected')
 root=ET.fromstring(source); rules={}
 ids={x.get('id'):x for x in root.iter() if x.get('id')}
 def value_ok(key,value):
  if key in ('clip-path','mask'):return value=='none' or bool(re.fullmatch(r'url\(#[A-Za-z0-9_-]+\)',value))
  return not re.search(r'url\s*\(|[&<>]|javascript:|data:|https?:',value,re.I)
 def declarations(body):
  result={}
  for part in body.split(';'):
   if not part.strip():continue
   key,value=part.split(':',1);key=key.strip();value=value.strip()
   if key not in ATTRS or not value_ok(key,value):raise ValueError('Unsupported style '+key)
   result[key]=value
  return result
 for x in root.iter():
  if x.tag.split('}')[-1]=='style':
   css=x.text or ''; remainder=re.sub(r'([^{}]+)\{([^{}]*)\}', '',css)
   if remainder.strip():raise ValueError('Unsupported CSS')
   for selectors,body in re.findall(r'([^{}]+)\{([^{}]*)\}',css):
    styles=declarations(body)
    for selector in selectors.split(','):
     selector=selector.strip()
     if not re.fullmatch(r'\.[\w-]+',selector):raise ValueError('Unsupported selector')
     rules.setdefault(selector[1:],{}).update(styles)
 def rebuild(x):
  tag=x.tag.split('}')[-1]
  if tag in ('style','namedview'):return None
  if tag=='use':
   href=x.get('{http://www.w3.org/1999/xlink}href',x.get('href',''))
   if not href.startswith('#') or href[1:] not in ids:raise ValueError('External or missing use target')
   target=ids[href[1:]]
   if target.tag.split('}')[-1] not in ('path','rect','circle','ellipse','polygon','polyline','line'):raise ValueError('Unsupported use target')
   group=ET.Element('g')
   if x.get('transform'):group.set('transform',x.get('transform'))
   if x.get('x','0')!='0' or x.get('y','0')!='0':raise ValueError('Unsupported use offset')
   group.append(rebuild(copy.deepcopy(target)));return group
  if tag not in TAGS:raise ValueError('Unsupported element '+tag)
  attrs={}
  for key,value in x.attrib.items():
   if key in ('class','style','version','{http://www.w3.org/XML/1998/namespace}space') or key.startswith('data-') or key.startswith('{http://www.inkscape.org/') or key.startswith('{http://sodipodi.'):continue
   if key not in ATTRS or not value_ok(key,value):raise ValueError('Unsupported attribute '+key)
   attrs[key]=value
  for cls in x.get('class','').split():attrs.update(rules.get(cls,{}))
  attrs.update(declarations(x.get('style','')))
  if 'font-family' in attrs:attrs['font-family']=attrs['font-family'].replace(chr(39),'')
  out=ET.Element(tag,attrs);out.text=x.text if tag not in ('svg','g') else None
  for child in x:
   c=rebuild(child)
   if c is not None:out.append(c)
  return out
 result=rebuild(root)
 if result.tag!='svg':
  if not width or not height:raise ValueError('Missing bounds')
  wrapper=ET.Element('svg',{'viewBox':f'0 0 {width} {height}'})
  result.attrib.pop('width',None);result.attrib.pop('height',None);wrapper.append(result);result=wrapper
 result.set('xmlns','http://www.w3.org/2000/svg')
 return ET.tostring(result,encoding='unicode')
if __name__=='__main__':
 evidence=ROOT/'evidence';data=json.loads((evidence/'har-editor-data.json').read_text());out=evidence/'renderable';out.mkdir(exist_ok=True);manifest=[]
 for editor in data['editors']:
  asset=next((a for a in data['assets'] if a['url']==editor['canvas']['backgroundUrl']),None)
  if asset:
   source=(evidence/asset['svgPath']).read_text()
   try:
    svg=normalize(source);dest=out/f"floor-{editor['levelId']}.svg";dest.write_text(svg);editor['canvas']['renderSvg']=svg
    manifest.append({'kind':'floor','legacyId':editor['levelId'],'path':str(dest.relative_to(evidence)),'sourceSha256':hashlib.sha256(source.encode()).hexdigest(),'status':'normalized'})
   except ValueError as e:manifest.append({'kind':'floor','legacyId':editor['levelId'],'status':'blocked','reason':str(e)})
  for template in editor['templates']:
   try:
    geom=template['geometry']['root'];svg=normalize(template['inlineSvg'],geom.get('width'),geom.get('height'));dest=out/f"template-{template['id']}.svg";dest.write_text(svg);template['renderSvg']=svg
    manifest.append({'kind':'template','legacyId':template['id'],'path':str(dest.relative_to(evidence)),'status':'normalized'})
   except ValueError as e:manifest.append({'kind':'template','legacyId':template['id'],'status':'blocked','reason':str(e)})
 (evidence/'renderable-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
 (evidence/'har-renderable-data.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
 print(json.dumps({'normalized':sum(r['status']=='normalized' for r in manifest),'blocked':sum(r['status']=='blocked' for r in manifest)}))
