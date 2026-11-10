"""Validate one immutable FE/BE park release without credentials or DB access."""
import hashlib
import json
from pathlib import Path
import re
import zipfile

FILES = {'server-map.local.json', 'server-manifest.local.json', 'course.local.json',
         'course.local.sha256', 'park-bindings.local.json'}
REWARDS = [5, 10, 15, 20, 25, 30, 32, 35, 38, 40]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(path):
    return json.loads(Path(path).read_bytes())


def validate_bundle(directory, baseline, source_sha=None, release_id=None):
    directory = Path(directory)
    release = read_json(directory / 'release.json')
    require(release.get('format') == 'ontop.park-renewal-release', 'Unexpected release format')
    require(release.get('localOnly') is False, 'Local-only map cannot be released')
    require(re.fullmatch(r'[0-9a-f]{40}', release.get('sourceCommit', '')), 'Invalid source commit')
    require(re.fullmatch(r'[0-9a-f]{64}', release.get('releaseId', '')), 'Invalid release ID')
    unsigned = {key: value for key, value in release.items() if key != 'releaseId'}
    require(digest(json.dumps(unsigned, ensure_ascii=False, separators=(',', ':')).encode()) == release['releaseId'],
            'Release manifest checksum differs')
    if source_sha is not None:
        require(release['sourceCommit'] == source_sha, 'Source commit differs')
    if release_id is not None:
        require(release['releaseId'] == release_id, 'Release ID differs')
    require(release['anchors'] == baseline['anchors'] == 230, 'Anchor count differs')
    require(release['coordinateSha256'] == baseline['coordinatesSha256'], 'Coordinates/world differ')
    require(release['migration']['version'] == 167 and
            release['migration']['sha256'] == baseline['migrationSha256'], 'V167 differs')
    entries = release['files']
    require(len(entries) == len(FILES) and {entry['path'] for entry in entries} == FILES,
            'Unexpected or repeated release file')
    for entry in entries:
        path = directory / entry['path']
        require(path.is_file() and not path.is_symlink(), 'Missing or linked release file: ' + entry['path'])
        content = path.read_bytes()
        require(len(content) == entry['bytes'] and digest(content) == entry['sha256'],
                'Release file checksum differs: ' + entry['path'])
    world = read_json(directory / 'server-map.local.json')
    manifest = read_json(directory / 'server-manifest.local.json')
    course = read_json(directory / 'course.local.json')
    bindings = read_json(directory / 'park-bindings.local.json')
    require(world['mapId'] == manifest['mapId'] == release['mapId'] == 'park-renewal-local',
            'Map identity differs')
    require(world['mapVersion'] == manifest['mapVersion'] == course['mapVersion'] ==
            bindings['mappingVersion'] == release['mapVersion'], 'Map version differs')
    require(world['schemaVersion'] == manifest['schemaVersion'] == 2, 'Map schema differs')
    require(course['courseVersion'] == release['courseVersion'] == 'park220-jump10-v1' and
            course['rulesVersion'] == release['rulesVersion'] == 'v4', 'Jump course version differs')
    require(len(course['colliders']) == 178 and [stage['reward'] for stage in course['stages']] == REWARDS,
            'Jump geometry/rewards differ')
    require((directory / 'course.local.sha256').read_text().strip() ==
            digest((directory / 'course.local.json').read_bytes()), 'Jump checksum differs')
    return release


def validate_jar(path):
    with zipfile.ZipFile(path) as jar:
        names = jar.namelist()
        forbidden = ['application-local.yml', 'application-park-renewal-local.yml',
                     'application-frontend-test.yml', 'application-visual-test.yml']
        require(not any(name.rsplit('/', 1)[-1] in forbidden for name in names), 'Local/test profile in deploy JAR')
        require(not any(name.startswith('BOOT-INF/classes/com/ssafy/ontop/demo/') for name in names),
                'Test login/demo class in deploy JAR')
        require('BOOT-INF/classes/application-park-renewal.yml' in names, 'Missing deployment profile')
        migration = 'BOOT-INF/classes/db/minigame/V167__extend_jumpmap_to_ten_stages.sql'
        require(migration in names, 'Missing V167 in deploy JAR')
        return digest(jar.read(migration))
