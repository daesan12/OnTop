"""Release contract, live-BE and dev-only pipeline regression checks."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from renewal_release import FILES, REWARDS, digest, validate_bundle, validate_jar
from check_live_renewal import check_container, check_public
from prepare_active_renewal_frontend import verify_output

ROOT = Path(__file__).resolve().parents[2]
SHA = 'a' * 40


def fixture(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    baseline = {'anchors': 230, 'coordinatesSha256': 'b' * 64, 'migrationSha256': 'c' * 64}
    world = {'mapId': 'park-renewal-local', 'schemaVersion': 2, 'mapVersion': 'd' * 64}
    data = {'server-map.local.json': world, 'server-manifest.local.json': world,
            'course.local.json': {'mapVersion': world['mapVersion'], 'courseVersion': 'park220-jump10-v1',
                                  'rulesVersion': 'v4', 'colliders': [0] * 178,
                                  'stages': [{'reward': n} for n in REWARDS]},
            'park-bindings.local.json': {'mappingVersion': world['mapVersion']}}
    for name, value in data.items():
        (directory / name).write_text(json.dumps(value) + '\n', encoding='utf-8')
    (directory / 'course.local.sha256').write_text(digest((directory / 'course.local.json').read_bytes()) + '\n')
    release = {'format': 'ontop.park-renewal-release', 'localOnly': False, 'sourceCommit': SHA,
               'mapId': world['mapId'], 'mapVersion': world['mapVersion'], 'anchors': 230,
               'courseVersion': 'park220-jump10-v1', 'rulesVersion': 'v4',
               'coordinateSha256': baseline['coordinatesSha256'],
               'migration': {'version': 167, 'sha256': baseline['migrationSha256']},
               'files': [{'path': name, 'bytes': len((directory / name).read_bytes()),
                          'sha256': digest((directory / name).read_bytes())} for name in sorted(FILES)]}
    sign(directory, release)
    return baseline, release


def sign(directory, release):
    release.pop('releaseId', None)
    release['releaseId'] = digest(json.dumps(release, ensure_ascii=False, separators=(',', ':')).encode())
    (Path(directory) / 'release.json').write_text(json.dumps(release) + '\n', encoding='utf-8')


class RenewalReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.baseline, self.release = fixture(self.directory)

    def test_matching_release_passes(self):
        self.assertEqual(validate_bundle(self.directory, self.baseline, SHA, self.release['releaseId']), self.release)

    def test_corrupt_file_blocks_release(self):
        with (self.directory / 'course.local.json').open('a') as file:
            file.write(' ')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            validate_bundle(self.directory, self.baseline)

    def test_wrong_source_and_release_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Source commit'):
            validate_bundle(self.directory, self.baseline, 'f' * 40)
        with self.assertRaisesRegex(ValueError, 'Release ID'):
            validate_bundle(self.directory, self.baseline, SHA, 'f' * 64)

    def test_v167_and_coordinates_cannot_be_changed_even_with_resigned_manifest(self):
        for field, value in [('coordinateSha256', 'f' * 64), ('anchors', 229), ('migration', {'version': 169, 'sha256': 'c' * 64})]:
            changed = copy.deepcopy(self.release)
            changed[field] = value
            sign(self.directory, changed)
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_bundle(self.directory, self.baseline)

    def test_path_traversal_or_duplicate_release_file_is_rejected(self):
        changed = copy.deepcopy(self.release)
        changed['files'][0]['path'] = '../outside'
        sign(self.directory, changed)
        with self.assertRaisesRegex(ValueError, 'release file'):
            validate_bundle(self.directory, self.baseline)
        changed = copy.deepcopy(self.release)
        changed['files'].append(copy.deepcopy(changed['files'][0]))
        sign(self.directory, changed)
        with self.assertRaisesRegex(ValueError, 'repeated'):
            validate_bundle(self.directory, self.baseline)

    def jar(self, extra=()):
        target = self.directory / 'app.jar'
        with zipfile.ZipFile(target, 'w') as jar:
            jar.writestr('BOOT-INF/classes/application-park-renewal.yml', 'ontop: {}')
            jar.writestr('BOOT-INF/classes/db/minigame/V167__extend_jumpmap_to_ten_stages.sql', 'reviewed SQL')
            for name in extra:
                jar.writestr(name, 'test-only')
        return target

    def test_deploy_jar_accepts_only_runtime_profile(self):
        self.assertEqual(validate_jar(self.jar()), digest(b'reviewed SQL'))
        for name in ['application-park-renewal-local.yml', 'application-local.yml',
                     'application-frontend-test.yml', 'application-visual-test.yml']:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'profile'):
                validate_jar(self.jar(['BOOT-INF/classes/' + name]))
        with self.assertRaisesRegex(ValueError, 'login/demo'):
            validate_jar(self.jar(['BOOT-INF/classes/com/ssafy/ontop/demo/RenewalIntegrationApplication.class']))

    def inspect(self):
        return {'Config': {'Image': 'wooaw/ontop-backend:sha-' + SHA,
                           'Labels': {'ontop.park.release-id': self.release['releaseId'], 'ontop.source-sha': SHA},
                           'Env': ['SPRING_PROFILES_ACTIVE=dev,db,park-renewal',
                                   'PARK_RENEWAL_MAP_DIR=/run/ontop/park-renewal']},
                'Mounts': [{'Destination': '/run/ontop/park-renewal', 'RW': False}]}

    def run_docker(self, inspect):
        def run(command, text=False):
            if command[1] == 'inspect':
                return json.dumps([inspect])
            return (self.directory / command[-1].rsplit('/', 1)[-1]).read_bytes()
        return run

    def test_live_be_requires_matching_image_labels_profiles_mount_and_bytes(self):
        inspect = self.inspect()
        self.assertEqual(check_container(self.directory, self.baseline, SHA, 'container', run=self.run_docker(inspect)), self.release)
        for key in ['image', 'label', 'profile', 'mount']:
            changed = copy.deepcopy(inspect)
            if key == 'image': changed['Config']['Image'] = 'old'
            if key == 'label': changed['Config']['Labels']['ontop.park.release-id'] = 'old'
            if key == 'profile': changed['Config']['Env'] = ['SPRING_PROFILES_ACTIVE=dev,db']
            if key == 'mount': changed['Mounts'][0]['RW'] = True
            with self.subTest(key=key), self.assertRaises(ValueError):
                check_container(self.directory, self.baseline, SHA, 'container', run=self.run_docker(changed))

    def test_live_be_can_update_code_image_without_changing_map_release(self):
        runtime_sha = 'e' * 40
        inspect = self.inspect()
        inspect['Config']['Image'] = 'wooaw/ontop-backend:sha-' + runtime_sha
        inspect['Config']['Labels']['ontop.source-sha'] = runtime_sha
        self.assertEqual(
            check_container(self.directory, self.baseline, SHA, 'container',
                            runtime_source_sha=runtime_sha, run=self.run_docker(inspect)),
            self.release,
        )

    def test_running_file_tamper_blocks_fe_promotion(self):
        run = self.run_docker(self.inspect())
        def altered(command, text=False):
            value = run(command, text=text)
            return value + b' ' if command[-1].endswith('/course.local.json') else value
        with self.assertRaisesRegex(ValueError, 'Running BE file'):
            check_container(self.directory, self.baseline, SHA, 'container', run=altered)

    def test_public_check_cannot_target_prod(self):
        with self.assertRaisesRegex(ValueError, 'dev frontend'):
            check_public(self.release, 'https://www.on-top.world')

    def test_active_frontend_output_must_reuse_live_release_and_bindings(self):
        output = self.directory / 'dist/generated/park-renewal'
        output.mkdir(parents=True)
        for name in ('release.json', 'park-bindings.local.json'):
            (output / name).write_bytes((self.directory / name).read_bytes())
        verify_output(self.directory / 'dist', self.directory)
        (output / 'park-bindings.local.json').write_text('{}\n')
        with self.assertRaisesRegex(ValueError, 'active renewal contract'):
            verify_output(self.directory / 'dist', self.directory)


class RenewalPipelineTests(unittest.TestCase):
    def test_default_is_legacy_and_manual_renewal_preserves_approval_order(self):
        pipeline = (ROOT / 'Jenkinsfile').read_text(encoding='utf-8')
        self.assertIn("choices: ['legacy', 'renewal-candidate', 'renewal-deploy']", pipeline)
        self.assertIn("params.PARK_RELEASE_MODE ?: 'legacy'", pipeline)
        self.assertIn("env.ALLOW_BACKEND_DEPLOY = '0'", pipeline)
        stages = ['Prepare shared renewal release', 'Backend tests', 'Frontend tests and build',
                  'Approve coordinated renewal deployment', 'Prepare verified Vercel prebuilt frontend',
                  'Build and publish backend image', 'Deploy backend to dev', 'Deploy frontend to dev Vercel project']
        positions = [pipeline.index("stage('" + name + "')") for name in stages]
        self.assertEqual(positions, sorted(positions))
        self.assertIn("if (confirmed != true)", pipeline)
        self.assertIn('--require-clean', pipeline)
        self.assertIn("dir('backend') { sh 'bash ./gradlew --no-daemon bootJar' }", pipeline)
        post = pipeline[pipeline.rindex('    post {'):]
        self.assertLess(post.index('success {'), post.index('frontend/dist-park-renewal/**'))
        self.assertIn('releases/${env.PARK_RELEASE_ID}/**', post)

    def test_legacy_backend_tests_prepare_renewal_inputs_before_gradle(self):
        pipeline = (ROOT / 'Jenkinsfile').read_text(encoding='utf-8')
        preparation = pipeline.split("stage('Prepare shared renewal release')", 1)[1]
        preparation = preparation.split("stage('Pipeline and Compose checks')", 1)[0]
        self.assertIn("env.PARK_RENEWAL == '1' || env.TEST_BACKEND == '1'", preparation)
        self.assertIn('pnpm install --frozen-lockfile && pnpm run prepare:park-renewal:release', preparation)
        self.assertNotIn('prepare_active_renewal_frontend.py', preparation)

    def test_vercel_renewal_preserves_dev_routes_and_prod_config(self):
        legacy = json.loads((ROOT / 'frontend/vercel.dev.json').read_text())
        renewal = json.loads((ROOT / 'frontend/vercel.renewal.json').read_text())
        prod = json.loads((ROOT / 'frontend/vercel.json').read_text())
        self.assertEqual(renewal['rewrites'], legacy['rewrites'])
        self.assertEqual(renewal['headers'][:len(legacy['headers'])], legacy['headers'])
        self.assertIn('build:park-renewal:release', renewal['buildCommand'])
        self.assertEqual(renewal['outputDirectory'], 'dist-park-renewal')
        active = json.loads((ROOT / 'frontend/vercel.renewal-active.json').read_text())
        self.assertEqual(active['rewrites'], renewal['rewrites'])
        self.assertEqual(active['headers'], renewal['headers'])
        self.assertIn('build:park-renewal:active', active['buildCommand'])
        self.assertIn('/park-bindings.generated.prod.json', prod['buildCommand'])
        self.assertEqual(prod['outputDirectory'], 'dist-park')

    def test_prebuilt_helper_checks_be_before_publish_and_public_fe_after(self):
        helper = (ROOT / 'infra/ci/renewal-vercel.sh').read_text()
        special = helper[helper.index('if [[ $1 == deploy ]]'):]
        command = special.index('vercel deploy --prebuilt --prod')
        self.assertLess(special.index('check_live_renewal.py'), command)
        self.assertGreater(special.index('--public-url https://dev.on-top.world'), command)
        self.assertIn('--dist "$root/frontend/.vercel/output/static"', helper)
        self.assertNotIn('vercel deploy --prod --yes', helper)
        self.assertIn('vercel.renewal-active.json', helper)
        self.assertIn('prepare_active_renewal_frontend.py', helper)


if __name__ == '__main__':
    unittest.main()
