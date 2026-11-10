#!/usr/bin/env python3
"""Reuse the immutable DEV park contract for an ordinary frontend release."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
from urllib.request import urlopen

from classify_changes import changed_paths, classify
from renewal_release import FILES, read_json, validate_bundle


ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "frontend/park-renewal-baseline.json"
CONTAINER = "ontop-dev-app-app-1"


def docker(*arguments: str) -> bytes:
    return subprocess.check_output(("docker", *arguments))


def running_release(directory: Path) -> dict:
    inspect = json.loads(docker("inspect", CONTAINER))[0]
    labels = inspect["Config"].get("Labels") or {}
    release_id = labels.get("ontop.park.release-id", "")
    if len(release_id) != 64:
        raise ValueError("DEV is not running a labelled renewal release")
    mount = next((item for item in inspect["Mounts"]
                  if item["Destination"] == "/run/ontop/park-renewal"), None)
    if mount is None or mount["RW"] is not False:
        raise ValueError("DEV renewal map is not mounted read-only")
    directory.mkdir(parents=True, exist_ok=True)
    for name in sorted(FILES | {"release.json"}):
        (directory / name).write_bytes(
            docker("exec", CONTAINER, "cat", "/run/ontop/park-renewal/" + name)
        )
    return validate_bundle(directory, read_json(BASELINE), release_id=release_id)


def assert_no_contract_change(release: dict, source_sha: str) -> None:
    paths, invalid = changed_paths(release["sourceCommit"], source_sha)
    if invalid:
        raise ValueError("Active renewal source is not an ancestor of this build")
    protected = [path for path in paths if classify([path])["PARK_RENEWAL_CHANGED"]]
    if protected:
        raise ValueError("Renewal contract changed; use renewal-candidate then renewal-deploy: "
                         + ", ".join(protected[:5]))


def stage(source_sha: str, live_dir: Path, release: dict) -> None:
    generated = ROOT / "frontend/generated/park-renewal"
    validate_bundle(generated, read_json(BASELINE), source_sha=source_sha)
    assert_no_contract_change(release, source_sha)
    mapping_path = generated / "mapping.json"
    mapping = read_json(mapping_path)
    mapping["sourceCommit"] = release["sourceCommit"]
    mapping["mappingVersion"] = release["mapVersion"]
    mapping_path.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for name in sorted(FILES | {"release.json"}):
        (generated / name).write_bytes((live_dir / name).read_bytes())


def compare_file(target: Path, expected: Path) -> None:
    if not target.is_file() or target.read_bytes() != expected.read_bytes():
        raise ValueError("Frontend output differs from the active renewal contract: " + target.name)


def verify_output(directory: Path, live_dir: Path) -> None:
    public = directory / "generated/park-renewal"
    compare_file(public / "release.json", live_dir / "release.json")
    compare_file(public / "park-bindings.local.json", live_dir / "park-bindings.local.json")


def verify_public(url: str, live_dir: Path) -> None:
    if url != "https://dev.on-top.world":
        raise ValueError("Only the DEV frontend can be verified")
    for name in ("release.json", "park-bindings.local.json"):
        with urlopen(f"{url}/generated/park-renewal/{name}", timeout=10) as response:
            actual = response.read()
        if actual != (live_dir / name).read_bytes():
            raise ValueError("Public frontend differs from the active renewal contract: " + name)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-sha")
    parser.add_argument("--stage", action="store_true")
    parser.add_argument("--dist", type=Path)
    parser.add_argument("--public-url")
    args = parser.parse_args()
    if args.stage and not args.source_sha:
        parser.error("--stage requires --source-sha")
    with tempfile.TemporaryDirectory() as temporary:
        live_dir = Path(temporary)
        release = running_release(live_dir)
        if args.stage:
            stage(args.source_sha, live_dir, release)
        if args.dist:
            verify_output(args.dist, live_dir)
        if args.public_url:
            verify_public(args.public_url, live_dir)
        print("Active renewal frontend contract verified:", release["releaseId"])


if __name__ == "__main__":
    main()
