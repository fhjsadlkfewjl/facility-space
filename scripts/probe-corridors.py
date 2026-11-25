"""Read-only feasibility probe. No database writes, no official areas or classifications.
Requires shapely and svgpathtools in a separate analysis environment.
"""
import argparse,json,hashlib,xml.etree.ElementTree as ET
from pathlib import Path
from collections import Counter
from shapely.geometry import Polygon
from shapely.ops import unary_union
from svgpathtools import parse_path,Line

def linear_polygons(d):
    path=parse_path(d);result=[]
    for sub in path.continuous_subpaths():
        if not sub.isclosed() or not all(isinstance(s,Line) for s in sub):continue
        p=Polygon([(s.start.real,s.start.imag) for s in sub])
        if p.is_valid and not p.is_empty:result.append(p)
    return result

def outline(p):
    rings=[p.exterior,*p.interiors]
    return ' '.join('M'+' L'.join(f'{x:.3f},{y:.3f}' for x,y in ring.coords)+' Z' for ring in rings)

def run(inputs,assets,out):
    out.mkdir(parents=True,exist_ok=True);audit=[]
    for f in sorted(assets.glob('floor-*.svg')):
        root=ET.parse(f).getroot();named=[e for e in root.iter() if (e.get('id') or '').startswith('room-area-')]
        audit.append({'file':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'named_room_shapes':len(named)})
    cases=[]
    for f in sorted(inputs.glob('*.svg')):
        layout=json.loads(f.with_suffix('.json').read_text());root=ET.parse(f).getroot()
        named=[e for e in root.iter() if (e.get('id') or '').startswith('room-area-')]
        case={'floor_id':layout['floor']['id'],'source_sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'named_shapes':len(named),'rooms':len(layout['rooms']),'method':'none','database_writes':0}
        if f.stem=='112474':
            # Existing generic-numbered zones: preserve their exact SVG paths, do not classify.
            shapes=[e for e in named if e.get('id') in ('room-area-1','room-area-2')]
            for e in shapes:
                e.set('fill','#f5a623');e.set('fill-opacity','0.55');e.set('stroke','#b05b00');e.set('stroke-width','8')
            case.update(method='existing_named_paths',candidate_ids=[e.get('id') for e in shapes],note='Already imported as rooms 1 and 2 / other; corridor classification requires review.')
        elif f.stem=='370666':
            # Strictly a residual-space proposal. Walls, stairs and shafts are NOT automatically classified.
            whites=[]
            for e in root.iter():
                if e.tag.split('}')[-1]=='path' and e.get('fill','').lower() in ('#fff','#ffffff','white'):
                    whites.extend(linear_polygons(e.get('d','')))
            rooms=[]
            for r in layout['rooms']:
                coords=r['shape'].get('polygon')
                if coords:
                    p=Polygon(coords)
                    if p.is_valid:rooms.append(p)
            residual=unary_union(whites).difference(unary_union(rooms))
            polygons=[residual] if residual.geom_type=='Polygon' else [g for g in residual.geoms if g.geom_type=='Polygon']
            polygons=[p for p in polygons if p.area>100]
            for p in polygons:ET.SubElement(root,'path',{'d':outline(p),'fill':'#f5a623','fill-opacity':'0.55','fill-rule':'evenodd','stroke':'#b05b00','stroke-width':'5'})
            case.update(method='white_floor_footprint_minus_existing_rooms',components=len(polygons),note='Residual includes corridor, walls, stair/service zones; NOT a corridor polygon and NOT usable for area totals.')
            (out/(f.stem+'-candidates.geojson')).write_text(json.dumps({'type':'FeatureCollection','features':[{'type':'Feature','properties':{'status':'UNCONFIRMED_RESIDUAL','units':'drawing_units','source_floor':case['floor_id']},'geometry':p.__geo_interface__} for p in polygons]},indent=2))
        else:
            case['note']='Structure audit only: no automatic corridor classification.'
        if case['method']!='none':
            ET.register_namespace('','http://www.w3.org/2000/svg');ET.ElementTree(root).write(out/(f.stem+'-preview.svg'),encoding='unicode')
        cases.append(case)
    report={'scope':'58 recovered SVG assets; four current local layouts inspected','total_assets':len(audit),'assets_with_named_room_shapes':sum(x['named_room_shapes']>0 for x in audit),'named_room_shapes':sum(x['named_room_shapes'] for x in audit),'assets':audit,'cases':cases,'production_writes':0,'official_area_calculations':0}
    (out/'evidence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in report.items() if k not in ('assets','cases')}))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--inputs',type=Path,required=True);p.add_argument('--assets',type=Path,default=Path('evidence/renderable'));p.add_argument('--out',type=Path,default=Path('docs/corridor-recovery'));a=p.parse_args();run(a.inputs,a.assets,a.out)
