import base64, importlib.util, json, tempfile, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('har_editor',Path(__file__).resolve().parents[1]/'scripts/har_editor.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class HarTest(unittest.TestCase):
 def test_secrets_base64_and_no_network(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);(p/'stage.json').write_text(json.dumps({'elements':[]}))
   response={'STATUS':'OK','RESULT':{'levelId':1,'canvas':{'bg':'<image href="/upload/a.svg?token=SECRET"/>','vb':'0 0 1 1','w':'1','h':'1'},'templates':{'groups':[],'items':{}},'items':[]},'REQUEST':{'secret':'SECRET'}}
   e={'request':{'method':'POST','url':m.ENDPOINT,'headers':[{'name':'Cookie','value':'SECRET'}],'postData':{'text':json.dumps({'action':'getEditorData','params':[1],'token':'SECRET'})}},'response':{'status':200,'content':{'encoding':'base64','text':base64.b64encode(json.dumps(response).encode()).decode()}}}
   (p/'a.har').write_text(json.dumps({'log':{'entries':[e]}}));r=m.extract(p/'a.har',p/'stage.json',p/'out')
   self.assertEqual(len(r['editors']),1);self.assertNotIn('SECRET',json.dumps(r));self.assertEqual(r['editors'][0]['canvas']['backgroundUrl'],'/upload/a.svg')
 def test_active_svg_rejected(self):
  for s in ['<svg><script>alert(1)</script></svg>','<svg onload="x"/>','<svg><image href="https://example.com"/></svg>']:
   with self.assertRaises(ValueError):m.svg_geometry(s)
 def test_body_and_total_bounds_distinct(self):
  g=m.svg_geometry('<g width="160" height="149"><rect class="basis" width="160" height="70"/></g>');self.assertEqual(g['root']['height'],149);self.assertEqual(g['basis'][0]['height'],70)
if __name__=='__main__':unittest.main()
