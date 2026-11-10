"""Export a reviewable local candidate; never stage, commit, push or deploy."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

from check_park_renewal import validate
from renewal_release import read_json, require

ROOT = Path(__file__).resolve().parents[2]


def hash_file(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as file:
        for block in iter(lambda: file.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root)


def names(root, *args):
    return [value for value in git(root, *args, '-z').decode('utf-8').split('\0') if value]


def allowed(path):
    return path in {'Jenkinsfile', 'Jenkinsfile.park-renewal', '.gitignore', '.gitattributes'} or path.startswith(
        ('frontend/', 'backend/', 'infra/', 'docs/integration/'))


def archive(path, entries):
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=3) as target:
        for name, content in sorted(entries.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            target.writestr(info, content.read_bytes() if isinstance(content, Path) else content,
                            compress_type=zipfile.ZIP_DEFLATED, compresslevel=3)


def package(root, output, jar, snapshot=False, verification=None):
    root, output, jar = root.resolve(), output.resolve(), jar.resolve()
    require(not output.is_relative_to(root), 'Keep review outputs outside the source repository')
    validate(root, root / 'frontend/dist-park-renewal', jar=jar)
    release = read_json(root / 'frontend/generated/park-renewal/release.json')
    source_sha = git(root, 'rev-parse', 'HEAD').decode().strip()
    require(source_sha == release['sourceCommit'], 'Release belongs to another source commit')
    changed = names(root, 'diff', '--name-only', 'HEAD')
    additions = names(root, 'ls-files', '--others', '--exclude-standard')
    included = sorted({name for name in changed + additions if allowed(name)})
    excluded = sorted(set(changed + additions) - set(included))
    records, contents = [], {}
    for name in included:
        path = root / name
        if not path.exists():
            records.append({'path': name, 'status': 'deleted'})
            continue
        require(path.is_file() and not path.is_symlink(), 'Unexpected source link/path: ' + name)
        content = path.read_bytes()
        contents['files/' + name] = content
        records.append({'path': name, 'status': 'untracked' if name in additions else 'modified',
                        'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()})
    dirty = bool(git(root, 'status', '--porcelain', '--untracked-files=normal').strip())
    inventory = {'format': 'ontop.park-renewal-review', 'sourceCommit': source_sha, 'workingTreeDirty': dirty,
                 'deployable': False, 'reason': 'Review candidate. Rebuild from the final approved clean commit before deployment.',
                 'releaseId': release['releaseId'], 'mapVersion': release['mapVersion'],
                 'coordinateSha256': release['coordinateSha256'], 'anchors': 230,
                 'migration': release['migration'], 'files': records, 'excludedUnrelatedPaths': excluded}
    inventory['verification'] = read_json(verification) if verification else {'status': 'not-provided', 'deployReady': False}
    tree_hash = hashlib.sha256(json.dumps(records, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    inventory['changeSetSha256'] = tree_hash
    destination = output / ('candidate-' + release['releaseId'][:12] + '-' + tree_hash[:12])
    require(not destination.exists(), 'Candidate directory already exists; retain it and use a new output directory')
    destination.mkdir(parents=True)
    manifest = (json.dumps(inventory, ensure_ascii=False, indent=2) + '\n').encode()
    contents['changes.json'] = manifest
    contents['tracked.patch'] = git(root, 'diff', '--binary', 'HEAD', '--', *included)
    archive(destination / 'source-changes.zip', contents)
    readme = ("LOCAL REVIEW CANDIDATE — NOT APPROVED FOR DEPLOYMENT\n"
              "No commit, push, MR, merge or deployment was performed.\n"
              "Read configuration/docs/integration/park-renewal-deployment-status.md first.\n"
              "source-changes.zip is an overlay against sourceCommit in changes.json.\n"
              "files/ contains materialized changed files; tracked.patch contains tracked changes only.\n"
              "Do not apply the same tracked change twice. Preserve deletions listed in changes.json.\n"
              "Rebuild FE, BE and map artifacts together from the final approved clean commit.\n")
    runtime = {'candidate.json': manifest, 'README.txt': readme.encode(), 'backend/app.jar': jar}
    for path in sorted((root / 'frontend/dist-park-renewal').rglob('*')):
        if path.is_file():
            runtime['frontend/' + path.relative_to(root / 'frontend/dist-park-renewal').as_posix()] = path
    bundle = root / 'frontend/generated/park-renewal/releases' / release['releaseId']
    for path in bundle.iterdir():
        if path.is_file(): runtime['park-release/' + path.name] = path
    migration = release['migration']['path']
    runtime[migration] = root / migration
    for name in ['Jenkinsfile', 'Jenkinsfile.park-renewal', 'frontend/vercel.renewal.json', 'infra/ci/deploy-park-renewal.sh',
                 'infra/ci/deploy-dev.sh', 'infra/app/compose.dev.yaml', 'infra/monitoring/dev/compose.app.yaml',
                 'backend/Dockerfile', 'backend/docker-entrypoint.sh',
                 'infra/ci/renewal-vercel.sh', 'infra/ci/renewal_release.py', 'infra/ci/check_live_renewal.py',
                 'infra/ci/check_park_renewal.py', 'infra/app/compose.park-renewal.yaml',
                 'infra/app/compose.park-renewal-observe.yaml', 'infra/app/compose.skewer-coop.yaml',
                 'infra/app/stage-park-renewal.sh', 'infra/app/park-renewal.deploy.env.example',
                 'frontend/park-renewal-baseline.json', 'docs/integration/park-renewal-release.md',
                 'docs/integration/park-renewal-deployment-status.md']:
        runtime['configuration/' + name] = root / name
    archive(destination / 'deployment-candidate.zip', runtime)
    if snapshot:
        source = destination / 'source-snapshot'
        for name in sorted(set(names(root, 'ls-files')) | set(additions)):
            path = root / name
            if not path.is_file() or path.is_symlink(): continue
            target = source / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
        inventory['sourceSnapshot'] = str(source)
    inventory['artifacts'] = [{'path': name, 'bytes': (destination / name).stat().st_size,
                               'sha256': hash_file(destination / name)}
                              for name in ['source-changes.zip', 'deployment-candidate.zip']]
    (destination / 'candidate.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (output / 'latest-candidate.txt').write_text(str(destination) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(destination), 'sourceFiles': len(records), 'deployable': False,
                      'releaseId': release['releaseId'], 'artifacts': inventory['artifacts']}, indent=2))
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-root', type=Path, default=ROOT)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--jar', type=Path, required=True)
    parser.add_argument('--source-snapshot', action='store_true')
    parser.add_argument('--verification', type=Path)
    args = parser.parse_args()
    package(args.source_root, args.output, args.jar, args.source_snapshot, args.verification)
