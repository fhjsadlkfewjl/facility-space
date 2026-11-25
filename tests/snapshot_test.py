import importlib.util,json,tempfile,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
spec=importlib.util.spec_from_file_location('snapshot',Path(__file__).resolve().parents[1]/'scripts/extract-editor-snapshot.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class SnapshotTest(unittest.TestCase):
 def test_allowlist_drops_personal_data_and_preserves_rotation(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);(p/'stage').write_text(json.dumps({'elements':[{'id':'1','iblock':134}]}))
   r={'levelId':1,'canvas':{'bg':'','vb':'0 0 100 100','w':100,'h':100},'templates':{'items':{}},'items':[{'id':2,'tpl':3,'x':10,'y':20,'r':17,'ownerName':'PRIVATE','popupData':{'token':'SECRET'}}]}
   (p/'capture').write_text(json.dumps({'results':[r],'cookies':'SECRET'}));e=m.extract(p/'capture',p/'stage',p/'out')
   self.assertNotIn('PRIVATE',json.dumps(e));self.assertNotIn('SECRET',json.dumps(e));self.assertEqual(e['editors'][0]['items'][0]['r'],17)
   (p/'capture').write_text(json.dumps({'results':[r,r]}))
   with self.assertRaises(ValueError):m.extract(p/'capture',p/'stage',p/'duplicate')
if __name__=='__main__':unittest.main()
