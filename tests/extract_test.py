import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from extract_bitrix import rows,extract
import tempfile
class DumpTest(unittest.TestCase):
 def test_escaping_and_allowlist(self):
  text="INSERT INTO `unrelated_secrets` (`x`) VALUES ('secret');\nINSERT INTO `b_user` (`ID`, `NAME`, `LAST_NAME`) VALUES (1, 'O\\'Brien;\u0410', 'a\\nb'), (2, 'Second', NULL);"
  out=list(rows(text));self.assertEqual(len(out),2);self.assertEqual(out[0][1]['NAME'],"O'Brien;А");self.assertEqual(out[0][1]['LAST_NAME'],'a\nb');self.assertIsNone(out[1][1]['LAST_NAME'])
 def test_department_names_require_verified_user_field_link(self):
  sql="INSERT INTO `b_iblock_element` (`ID`,`IBLOCK_ID`,`NAME`,`ACTIVE`) VALUES (42,12,'Synthetic department','Y');"
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/'fixture.sql';path.write_text(sql)
   self.assertEqual(extract(path)['departments'],[])
   path.write_text(sql+'\nINSERT INTO `b_user_field` (`ENTITY_ID`,`FIELD_NAME`,`USER_TYPE_ID`,`SETTINGS`) VALUES (\'USER\',\'UF_DEPARTMENT\',\'iblock_element\',\'a:1:{s:9:"IBLOCK_ID";i:12;}\');')
   result=extract(path);self.assertEqual(result['departments'],[{'id':'42','name':'Synthetic department'}]);self.assertEqual(result['elements'],[])
if __name__=='__main__':unittest.main()
