"""Fail before FE promotion unless the running BE uses the exact shared release."""
import argparse
import json
from pathlib import Path
import subprocess
import time
from urllib.request import urlopen

from renewal_release import FILES, digest, read_json, require, validate_bundle

ROOT = Path(__file__).resolve().parents[2]


def check_container(directory, baseline, source_sha, container, image=None, run=subprocess.check_output):
    release = validate_bundle(directory, baseline, source_sha)
    expected_image = image or 'wooaw/ontop-backend:sha-' + source_sha
    inspect = json.loads(run(['docker', 'inspect', container], text=True))[0]
    require(inspect['Config']['Image'] == expected_image, 'Running BE image differs')
    labels = inspect['Config'].get('Labels') or {}
    require(labels.get('ontop.park.release-id') == release['releaseId'], 'Running BE release label differs')
    require(labels.get('ontop.source-sha') == source_sha, 'Running BE source label differs')
    environment = dict(value.split('=', 1) for value in inspect['Config']['Env'] if '=' in value)
    profiles = set(environment.get('SPRING_PROFILES_ACTIVE', '').split(','))
    require({'dev', 'db', 'park-renewal'} <= profiles, 'Running BE profile differs')
    require(environment.get('PARK_RENEWAL_MAP_DIR') == '/run/ontop/park-renewal', 'Running BE map directory differs')
    mount = next((m for m in inspect['Mounts'] if m['Destination'] == '/run/ontop/park-renewal'), None)
    require(mount is not None and mount['RW'] is False, 'BE map must be mounted read-only')
    for name in sorted(FILES | {'release.json'}):
        actual = run(['docker', 'exec', container, 'cat', '/run/ontop/park-renewal/' + name])
        require(actual == (Path(directory) / name).read_bytes(), 'Running BE file differs: ' + name)
    return release


def check_public(release, url, attempts=15, fetch=urlopen, sleep=time.sleep):
    require(url == 'https://dev.on-top.world', 'Only the dev frontend can be promoted')
    for attempt in range(attempts):
        try:
            with fetch(url + '/generated/park-renewal/release.json', timeout=10) as response:
                actual = json.load(response)
            require(actual == release, 'Public FE release differs')
            return
        except (OSError, ValueError):
            if attempt == attempts - 1:
                raise
            sleep(2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--release-dir', type=Path, required=True)
    parser.add_argument('--source-sha', required=True)
    parser.add_argument('--baseline', type=Path, default=ROOT / 'frontend/park-renewal-baseline.json')
    parser.add_argument('--container', default='ontop-dev-app-app-1')
    parser.add_argument('--image')
    parser.add_argument('--public-url')
    args = parser.parse_args()
    release = check_container(args.release_dir, read_json(args.baseline), args.source_sha, args.container, args.image)
    if args.public_url:
        check_public(release, args.public_url)
    print('Running renewal release verified:', release['releaseId'])


if __name__ == '__main__':
    main()
