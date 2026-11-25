"""Read-only, allowlisted MySQL INSERT parser. Never executes source SQL.
Supports mysqldump explicit-column INSERT VALUES with quoted/escaped strings.
Produces a portable normalized staging JSON; raw secrets are never exported.
"""
import re, json, sys, hashlib, collections
from pathlib import Path
ALLOWED={'b_iblock','b_iblock_property','b_iblock_property_enum','b_iblock_element','b_iblock_element_property','b_user','b_uts_user','b_iblock_section','b_user_field'}
def rows(text):
    head=re.compile(r'INSERT INTO `([^`]+)`\s*\(([^;]+?)\) VALUES\s*',re.M)
    token=re.compile(r"\s*(?:('(?:\\.|''|[^'\\])*')|(NULL)|(-?\d+(?:\.\d+)?))\s*", re.S)
    for h in head.finditer(text):
        table=h[1]
        if table not in ALLOWED: continue
        cols=re.findall(r'`([^`]+)`',h[2]); i=h.end()
        while i<len(text):
            while text[i].isspace() or text[i]==',': i+=1
            if text[i]==';': break
            if text[i]!='(': raise ValueError(f'Unsupported INSERT at {i}')
            i+=1; values=[]
            while True:
                m=token.match(text,i)
                if not m: raise ValueError(f'Unsupported SQL literal at {i}')
                if m[1] is not None:
                    v=m[1][1:-1].replace("''", "'")
                    v=re.sub(r'\\(.)',lambda x:{'n':'\n','r':'\r','t':'\t','0':'\0'}.get(x[1],x[1]),v,flags=re.S)
                elif m[2]: v=None
                else: v=m[3]
                values.append(v); i=m.end()
                if text[i]==')': i+=1; break
                if text[i]!=',': raise ValueError(f'Expected comma at {i}')
                i+=1
            if len(cols)!=len(values): raise ValueError('Column count mismatch')
            yield table,dict(zip(cols,values))
def extract(path):
    text=Path(path).read_text(); tables=collections.defaultdict(list)
    for t,r in rows(text):
        if t in {'b_iblock','b_iblock_element','b_iblock_property'} and int(r.get('IBLOCK_ID',r.get('ID','0'))) not in {*range(132,137),12}: continue
        tables[t].append(r)
    props={p['ID']:p for p in tables['b_iblock_property']}
    elements={e['ID']:{'id':e['ID'],'iblock':int(e['IBLOCK_ID']),'name':e['NAME'],'active':e.get('ACTIVE')=='Y','properties':{}} for e in tables['b_iblock_element'] if int(e['IBLOCK_ID']) in range(132,137)}
    for p in tables['b_iblock_element_property']:
        if p['IBLOCK_ELEMENT_ID'] not in elements or p['IBLOCK_PROPERTY_ID'] not in props: continue
        d=elements[p['IBLOCK_ELEMENT_ID']]['properties']; key=props[p['IBLOCK_PROPERTY_ID']]['CODE']
        d.setdefault(key,[]).append(p['VALUE'])
    users={u['ID']:{'id':u['ID'],'name':' '.join(filter(None,[u.get('NAME'),u.get('LAST_NAME')])) or f"Employee {u['ID']}",'active':u.get('ACTIVE')=='Y','position':u.get('WORK_POSITION') or ''} for u in tables['b_user']}
    for u in tables['b_uts_user']:
        if u['VALUE_ID'] in users:
            users[u['VALUE_ID']].update(table_num=u.get('UF_TABLE_NUM'),department_raw=u.get('UF_DEPARTMENT'))
    department_link=any(r.get('ENTITY_ID')=='USER' and r.get('FIELD_NAME')=='UF_DEPARTMENT' and r.get('USER_TYPE_ID')=='iblock_element' and re.search(r'"IBLOCK_ID";i:12;',r.get('SETTINGS') or '') for r in tables['b_user_field'])
    departments=[{'id':r['ID'],'name':r['NAME']} for r in tables['b_iblock_element'] if r['IBLOCK_ID']=='12' and r.get('NAME','').strip()] if department_link else []
    office=list(elements.values()); counts=collections.Counter(e['iblock'] for e in office)
    codes=collections.Counter(v for e in office if e['iblock']==136 for v in e['properties'].get('INV',[]) if v)
    occupied=collections.Counter(u.get('table_num') for u in users.values() if u.get('table_num'))
    report={'sha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),'bytes':Path(path).stat().st_size,'counts':dict(counts),'employees':len(users),'assignment_values':sum(occupied.values()),'duplicate_inventory_codes':sum(v>1 for v in codes.values()),'duplicate_employee_table_codes':sum(v>1 for v in occupied.values()),'unmatched_assignment_codes':sum(k not in codes for k in occupied),'properties':[{k:p.get(k) for k in ['ID','IBLOCK_ID','CODE','PROPERTY_TYPE','MULTIPLE','LINK_IBLOCK_ID']} for p in props.values()]}
    return {'source':'redacted-bitrix-dump','report':report,'elements':office,'employees':list(users.values()),'departments':departments}
if __name__=='__main__':
    result=extract(sys.argv[1]); Path(sys.argv[2]).write_text(json.dumps(result,ensure_ascii=False,indent=2)); print(json.dumps(result['report'],ensure_ascii=False,indent=2))
