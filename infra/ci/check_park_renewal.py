#!/usr/bin/env python3
"""Read-only verification of the shared renewal FE/BE release and optional built FE."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

from renewal_release import validate_bundle, validate_jar


def digest(data):
    return hashlib.sha256(data).hexdigest()


def validate(source, dist=None, source_sha=None, require_clean=False, jar=None):
    frontend = source / "frontend"
    generated = frontend / "generated/park-renewal"
    read = lambda p: json.loads(p.read_bytes())
    release = read(generated / "release.json")
    baseline = read(frontend / "park-renewal-baseline.json")
    assert release["format"] == "ontop.park-renewal-release"
    assert release["anchors"] == baseline["anchors"] == 230
    assert release["coordinateSha256"] == baseline["coordinatesSha256"]
    assert release["migration"]["version"] == 167
    migration = source / release["migration"]["path"]
    assert digest(migration.read_bytes()) == baseline["migrationSha256"] == release["migration"]["sha256"]
    assert digest((frontend / "park-renewal-assets.lock.json").read_bytes()) == release["assetLockSha256"]
    unsigned = {k: v for k, v in release.items() if k != "releaseId"}
    assert digest(json.dumps(unsigned, ensure_ascii=False, separators=(",", ":")).encode()) == release["releaseId"]
    directory = generated / "releases" / release["releaseId"]
    validate_bundle(directory, baseline, source_sha, release["releaseId"])
    if require_clean:
        actual_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
        assert actual_sha == release["sourceCommit"], "Build does not belong to the checked-out commit"
        assert not subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=normal"],
                                           cwd=source, text=True).strip(), "Deploy requires a clean committed checkout"
    if jar:
        assert validate_jar(jar) == baseline["migrationSha256"], "JAR V167 differs"
    assert read(directory / "release.json") == release
    expected = {"server-map.local.json", "server-manifest.local.json", "course.local.json", "course.local.sha256", "park-bindings.local.json"}
    assert {f["path"] for f in release["files"]} == expected
    for item in release["files"]:
        data = (directory / item["path"]).read_bytes()
        assert len(data) == item["bytes"] and digest(data) == item["sha256"], item["path"]
    world = read(directory / "server-map.local.json")
    mapping = read(generated / "mapping.json")
    # JSON.stringify is the canonical FE serializer (including float formatting).
    actual_coordinates = subprocess.check_output(["node", "--input-type=module", "-e",
        "import fs from 'node:fs';import{createHash}from'node:crypto';"
        "const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));"
        "process.stdout.write(createHash('sha256').update(JSON.stringify({coordinates:m.coordinates,world:m.world})).digest('hex'))",
        str(generated / "mapping.json")], text=True).strip()
    assert len(mapping["coordinates"]) == 230 and actual_coordinates == baseline["coordinatesSha256"], "Mapped coordinates/world changed"
    vr = next(v for v in world["data"]["facilities"] if v["id"] == "vr-experience-hall")
    entrance = next(v for v in mapping["coordinates"] if v["kind"] == "game-entry" and v["id"] == vr["id"])
    assert vr["reachPosition"] == [entrance["reach"][axis] for axis in ("x", "y", "z")]
    assert vr["radius"] == entrance["radius"] and vr["heightTolerance"] == entrance["heightTolerance"]
    course = read(directory / "course.local.json")
    bindings = read(directory / "park-bindings.local.json")
    assert world["mapId"] == release["mapId"] == "park-renewal-local"
    assert world["mapVersion"] == course["mapVersion"] == bindings["mappingVersion"] == release["mapVersion"]
    assert course["courseVersion"] == release["courseVersion"] == "park220-jump10-v1"
    assert course["rulesVersion"] == release["rulesVersion"] == "v4"
    assert len(course["colliders"]) == 178
    assert [s["reward"] for s in course["stages"]] == [5, 10, 15, 20, 25, 30, 32, 35, 38, 40]
    if dist is not None:
        assert (dist / "index.html").is_file()
        assert read(dist / "generated/park-renewal/release.json") == release
        assert (dist / "generated/park-renewal/park-bindings.local.json").read_bytes() == (directory / "park-bindings.local.json").read_bytes()
        assets = read(frontend / "park-renewal-assets.lock.json")
        for item in assets["files"]:
            if item["path"].startswith("public/"):
                assert digest((dist / item["path"][7:]).read_bytes()) == item["sha256"]
        for file in (dist / "assets").glob("*.js"):
            text = file.read_text(encoding="utf-8")
            assert all(marker not in text for marker in ("/@fs/", "local-approved-assets", "C:/Users/SSAFY", "renewal-integration-qa")), file.name
    return release["mapVersion"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--dist", type=Path)
    parser.add_argument("--source-sha")
    parser.add_argument("--require-clean", action="store_true")
    parser.add_argument("--jar", type=Path)
    args = parser.parse_args()
    print("Renewal release verified:", validate(args.source_root.resolve(), args.dist.resolve() if args.dist else None,
                                              args.source_sha, args.require_clean, args.jar))
