"""Linux-only orchestration tests: no Docker socket, network, DB or real deploy paths."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from test_renewal_release import fixture, ROOT, SHA


@unittest.skipUnless(hasattr(os, 'geteuid') and os.geteuid() == 0,
                     'requires an isolated Linux root container')
class RenewalDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.installed = self.root / 'opt/ontop'
        self.ci = self.installed / 'infra/ci'
        self.ci.mkdir(parents=True)
        for name in ['renewal_release.py', 'check_live_renewal.py']:
            shutil.copyfile(ROOT / 'infra/ci' / name, self.ci / name)
        initial = self.root / 'fixture'
        baseline, release = fixture(initial)
        self.release_id = release['releaseId']
        self.release = self.installed / 'park-renewal' / self.release_id
        self.release.parent.mkdir(parents=True)
        shutil.move(initial, self.release)
        (self.installed / 'frontend').mkdir()
        (self.installed / 'frontend/park-renewal-baseline.json').write_text(json.dumps(baseline))
        compose = self.installed / 'infra/app'
        compose.mkdir()
        for name in ['compose.dev.yaml', 'compose.park-renewal.yaml', 'compose.skewer-coop.yaml', 'compose.park-renewal-observe.yaml']:
            (compose / name).touch()
        self.env_dir = self.root / 'etc/ontop/dev-app'
        self.env_dir.mkdir(parents=True)
        self.env_file = self.env_dir / 'park-renewal.deploy.env'
        journal = self.root / 'journal'
        journal.mkdir()
        os.chown(journal, 10001, 10001)
        journal.chmod(0o700)
        self.env_file.write_text(f'BACKEND_IMAGE=wooaw/ontop-backend:sha-{SHA}\nPARK_RENEWAL_SOURCE_SHA={SHA}\n'
                                 f'PARK_RENEWAL_RELEASE_ID={self.release_id}\nPARK_RENEWAL_HOST_DIR={self.release}\n'
                                 f'SKEWER_COOP_JOURNAL_HOST_DIR={journal}\n')
        self.env_file.chmod(0o600)
        (self.env_dir / 'deploy.env').write_text('BACKEND_IMAGE=old\n')
        (self.root / 'run/lock').mkdir(parents=True)
        source = (ROOT / 'infra/ci/deploy-park-renewal.sh').read_text()
        for prefix in ['/etc/ontop', '/opt/ontop', '/var/lib/ontop', '/run/lock']:
            source = source.replace(prefix, str(self.root) + prefix)
        self.script = self.root / 'deploy.sh'
        self.script.write_text(source)
        self.log = self.root / 'calls'
        bin_dir = self.root / 'bin'
        bin_dir.mkdir()
        inspect = {'Config': {'Image': 'wooaw/ontop-backend:sha-' + SHA,
                              'Labels': {'ontop.park.release-id': self.release_id, 'ontop.source-sha': SHA},
                              'Env': ['SPRING_PROFILES_ACTIVE=dev,db,park-renewal',
                                      'PARK_RENEWAL_MAP_DIR=/run/ontop/park-renewal']},
                   'Mounts': [{'Destination': '/run/ontop/park-renewal', 'RW': False}]}
        (self.root / 'inspect.json').write_text(json.dumps([inspect]))
        docker = bin_dir / 'docker'
        docker.write_text('''#!/usr/bin/env python3
import json,os,pathlib,sys
args=sys.argv[1:]
with open(os.environ['CALL_LOG'],'a') as f:f.write(' '.join(args)+'\\n')
if args[0]=='compose' and 'up' in args and os.environ.get('FAIL_UP')=='1':sys.exit(1)
if args[0]=='inspect':
 if '--format' not in args:print(pathlib.Path(os.environ['INSPECT']).read_text())
 elif 'Health' in args[args.index('--format')+1]:print('healthy')
 else:print('previous-image')
if args[0]=='exec' and 'cat' in args:
 sys.stdout.buffer.write((pathlib.Path(os.environ['RELEASE'])/args[-1].rsplit('/',1)[-1]).read_bytes())
''')
        docker.chmod(0o755)
        curl = bin_dir / 'curl'
        curl.write_text('#!/bin/sh\nexit 0\n')
        curl.chmod(0o755)
        self.environment = {**os.environ, 'PATH': str(bin_dir) + ':' + os.environ['PATH'],
                            'CALL_LOG': str(self.log), 'INSPECT': str(self.root / 'inspect.json'), 'RELEASE': str(self.release)}

    def run_helper(self, mode='--check'):
        return subprocess.run(['bash', str(self.script), mode, SHA, self.release_id],
                              env=self.environment, text=True, capture_output=True)

    def test_check_validates_without_service_or_marker_changes(self):
        result = self.run_helper()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('up -d', self.log.read_text())
        self.assertFalse((self.env_dir / 'park-renewal.enabled').exists())
        self.assertFalse((self.root / 'var').exists())

    def test_tampered_release_stops_before_docker(self):
        (self.release / 'course.local.json').write_text('{}')
        result = self.run_helper('--apply')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.log.exists())
        self.assertFalse((self.env_dir / 'park-renewal.enabled').exists())

    def test_environment_mismatch_and_journal_permissions_stop_transition(self):
        self.env_file.write_text(self.env_file.read_text().replace(SHA, 'f' * 40))
        self.assertNotEqual(self.run_helper('--apply').returncode, 0)
        self.assertFalse(self.log.exists())
        self.env_file.write_text(self.env_file.read_text().replace('f' * 40, SHA))
        (self.root / 'journal').chmod(0o755)
        self.assertNotEqual(self.run_helper('--apply').returncode, 0)
        self.assertFalse(self.log.exists())

    def test_apply_preserves_legacy_configuration_and_uses_only_renewal_coop_overrides(self):
        result = self.run_helper('--apply')
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.log.read_text()
        self.assertIn('compose.park-renewal.yaml', calls)
        self.assertIn('compose.skewer-coop.yaml', calls)
        self.assertNotIn('compose.generated-map.yaml', calls)
        self.assertEqual((self.env_dir / 'deploy.env').read_text(), 'BACKEND_IMAGE=old\n')
        self.assertEqual((self.env_dir / 'park-renewal.enabled').read_text().strip(), self.release_id)
        self.assertIn('BE_VERIFIED', next((self.root / 'var/lib/ontop/ci/park-renewal' / self.release_id).glob('attempt-*')).read_text())

    def test_monitoring_keeps_renewal_profile_override_last(self):
        (self.env_dir / 'monitoring.enabled').touch()
        monitoring = self.installed / 'infra/monitoring/dev/compose.app.yaml'
        monitoring.parent.mkdir(parents=True)
        monitoring.touch()
        result = self.run_helper('--apply')
        self.assertEqual(result.returncode, 0, result.stderr)
        call = next(line for line in self.log.read_text().splitlines() if line.startswith('compose ') and 'up -d' in line)
        self.assertLess(call.index('monitoring/dev/compose.app.yaml'), call.index('compose.park-renewal-observe.yaml'))
        self.assertLess(call.index('compose.skewer-coop.yaml'), call.index('compose.park-renewal-observe.yaml'))

    def test_failed_be_does_not_auto_rollback_or_promote_fe(self):
        self.environment['FAIL_UP'] = '1'
        result = self.run_helper('--apply')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('No automatic image rollback', result.stderr)
        self.assertEqual(self.log.read_text().count('up -d --no-deps app'), 1)
        self.assertNotIn('vercel', self.log.read_text())

    def test_legacy_helper_refuses_to_replace_active_renewal(self):
        (self.env_dir / 'park-renewal.enabled').write_text(self.release_id)
        source = (ROOT / 'infra/ci/deploy-dev.sh').read_text().replace('/etc/ontop', str(self.root) + '/etc/ontop')
        legacy = self.root / 'legacy.sh'
        legacy.write_text(source)
        result = subprocess.run(['bash', str(legacy), SHA], env=self.environment, text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('legacy deployment is blocked', result.stderr)
        self.assertFalse(self.log.exists())

    def test_update_mode_accepts_the_existing_release_without_reapplying_transition(self):
        (self.env_dir / 'park-renewal.enabled').write_text(self.release_id)
        result = self.run_helper('--update')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('up -d --no-deps app', self.log.read_text())
        self.assertEqual((self.env_dir / 'park-renewal.enabled').read_text().strip(), self.release_id)


if __name__ == '__main__':
    unittest.main()
