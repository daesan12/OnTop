"""Exercise CLI order with local stubs; never contact Vercel or Docker."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from test_renewal_release import ROOT, SHA


@unittest.skipUnless(os.name == 'posix', 'requires a Linux shell')
class RenewalVercelTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.ci = self.root / 'infra/ci'
        self.ci.mkdir(parents=True)
        self.frontend = self.root / 'frontend'
        self.frontend.mkdir()
        self.script = self.ci / 'renewal-vercel.sh'
        self.script.write_text((ROOT / 'infra/ci/renewal-vercel.sh').read_text())
        self.log = self.root / 'calls'
        for name in ['check_park_renewal.py', 'check_live_renewal.py']:
            (self.ci / name).write_text('''import os,sys
with open(os.environ['CALL_LOG'],'a') as f:f.write(sys.argv[0].rsplit('/',1)[-1]+' '+' '.join(sys.argv[1:])+'\\n')
if os.environ.get('FAIL_DIST')=='1' and '--dist' in sys.argv:sys.exit(1)
if os.environ.get('FAIL_BE')=='1' and sys.argv[0].endswith('check_live_renewal.py'):sys.exit(1)
''')
        bin_dir = self.root / 'bin'
        bin_dir.mkdir()
        vercel = bin_dir / 'vercel'
        vercel.write_text('''#!/usr/bin/env python3
import json,os,pathlib,sys
args=sys.argv[1:]
with open(os.environ['CALL_LOG'],'a') as f:f.write('vercel '+args[0]+'\\n')
if args[0]=='pull':
 pathlib.Path('.vercel').mkdir(exist_ok=True)
 pathlib.Path('.vercel/project.json').write_text(json.dumps({'projectId':os.environ['VERCEL_PROJECT_ID']}))
if args[0]=='build':pathlib.Path('.vercel/output/static').mkdir(parents=True,exist_ok=True)
if args[0]=='deploy':print('https://local-stub.vercel.app')
''')
        vercel.chmod(0o755)
        self.environment = {**os.environ, 'PATH': str(bin_dir) + ':' + os.environ['PATH'], 'CALL_LOG': str(self.log),
                            'SOURCE_SHA': SHA, 'PARK_RELEASE_ID': 'b' * 64, 'VERCEL_TOKEN': 'test-only-placeholder',
                            'VERCEL_ORG_ID': 'local-stub', 'VERCEL_PROJECT_ID': 'prj_q9105AHzFQmB1Bu2FkjmDfsrkKi9'}

    def run_helper(self, action):
        return subprocess.run(['bash', str(self.script), action], env=self.environment, text=True, capture_output=True)

    def test_prepare_only_pulls_and_builds_without_publishing(self):
        result = self.run_helper('prepare')
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.log.read_text()
        self.assertIn('vercel pull', calls)
        self.assertIn('vercel build', calls)
        self.assertNotIn('vercel deploy', calls)
        self.assertIn('--dist', calls)
        self.assertNotIn(self.environment['VERCEL_TOKEN'], calls)

    def test_production_or_wrong_project_is_rejected_before_cli(self):
        self.environment['VERCEL_PROJECT_ID'] = 'production-project'
        self.assertNotEqual(self.run_helper('prepare').returncode, 0)
        self.assertFalse(self.log.exists())

    def test_wrong_build_or_running_be_prevents_deploy(self):
        for failure in ['FAIL_DIST', 'FAIL_BE']:
            self.environment[failure] = '1'
            result = self.run_helper('deploy')
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn('vercel deploy', self.log.read_text())
            self.environment.pop(failure)
            self.log.unlink()

    def test_matching_prebuilt_is_published_after_be_check_and_publicly_verified(self):
        result = self.run_helper('deploy')
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.log.read_text()
        self.assertLess(calls.index('check_live_renewal.py'), calls.index('vercel deploy'))
        self.assertGreater(calls.index('--public-url'), calls.index('vercel deploy'))


if __name__ == '__main__':
    unittest.main()
