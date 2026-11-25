import contextlib, importlib.util, io, json, pathlib, tempfile, time, unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('ops',pathlib.Path(__file__).with_name('facility-ops.py'))
ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)

class OperationsTests(unittest.TestCase):
    def test_dump_comparison_detects_changes_but_not_row_order(self):
        a=b'COPY public.a (id) FROM stdin;\n1\n2\n\\.\n'
        b=b'COPY public.a (id) FROM stdin;\n2\n1\n\\.\n'
        self.assertEqual(ops.copy_digest(a),ops.copy_digest(b))
        self.assertNotEqual(ops.copy_digest(a),ops.copy_digest(b.replace(b'2',b'3')))

    def test_monitor_detects_auth_bypass_and_stale_backup(self):
        with tempfile.TemporaryDirectory() as d, patch.object(ops,'STATE',pathlib.Path(d)), patch.object(ops,'inspect',return_value={'State':{'Running':True},'HostConfig':{'PortBindings':{}}}), patch.object(ops,'dbinfo',return_value=('u','d')), patch.object(ops,'dbcmd'), patch.object(ops.shutil,'disk_usage',return_value=type('Disk',(),{'free':100*1024**3,'total':150*1024**3})()):
            for name in ['backup','restore']:
                ops.write(ops.STATE/(name+'-status.json'),{'ok':True,'at':time.time()})
            def good(args,**kw):
                if '%{http_code}' in args:return b'401'
                if 'show' in args:return b'success'
                return b''
            with patch.object(ops,'run',side_effect=good),contextlib.redirect_stdout(io.StringIO()):ops.monitor()
            self.assertTrue(json.loads((ops.STATE/'health-status.json').read_text())['ok'])
            def bad(args,**kw):return b'200' if '%{http_code}' in args else good(args,**kw)
            ops.write(ops.STATE/'backup-status.json',{'ok':True,'at':0})
            with patch.object(ops,'run',side_effect=bad),contextlib.redirect_stdout(io.StringIO()),self.assertRaises(RuntimeError):ops.monitor()
            problems=json.loads((ops.STATE/'health-status.json').read_text())['problems']
            self.assertIn('Unauthenticated API rejection',problems)
            self.assertIn('backup missing or overdue',problems)

    def test_failed_release_switches_back_without_database_restore(self):
        old={'id':'old','schema':'same','images':{'api':'old-api','web':'old-web'}}
        with patch.object(ops,'backup'),patch.object(ops,'verify'),patch.object(ops,'checkpoint',return_value=old),patch.object(ops,'dbinfo',return_value=('u','d')),patch.object(ops,'inspect',return_value={'Id':'db'}),patch.object(ops,'schema_hash',return_value='same'),patch.object(ops,'switch_images') as switch,patch.object(ops,'persist_images') as persist,patch.object(ops,'monitor',side_effect=RuntimeError('bad release')):
            with self.assertRaises(RuntimeError):ops.update('new-api','new-web')
            self.assertEqual(switch.call_args_list[0].args[0],{'api':'new-api','web':'new-web'})
            self.assertEqual(switch.call_args_list[1].args[0],old['images'])
            persist.assert_called_once_with(old['images'])

    def test_rollback_refuses_schema_mismatch_before_changing_anything(self):
        with tempfile.TemporaryDirectory() as d,patch.object(ops,'STATE',pathlib.Path(d)),patch.object(ops,'dbinfo',return_value=('u','d')),patch.object(ops,'inspect',return_value={'Id':'db'}),patch.object(ops,'schema_hash',return_value='different'),patch.object(ops,'backup') as backup,patch.object(ops,'switch_images') as switch:
            ops.write(ops.STATE/'rollback-target.json',{'schema':'old'})
            with self.assertRaises(RuntimeError):ops.rollback()
            backup.assert_not_called();switch.assert_not_called()

if __name__=='__main__':unittest.main()
