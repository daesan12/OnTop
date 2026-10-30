#!/usr/bin/env python3
"""Validate the generated park handoff and prepare the exact BE test inputs."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import xml.etree.ElementTree as ET


TEST_CLASSES = {
    "GeneratedParkMapHandoffTests",
    "PreparedParkMapHandoffTests",
    "PreparedParkMovementTests",
    "PreparedParkSocketTests",
    "GeneratedWorldMapRuntimeTests",
    "WorldMapSelectionWebSocketTests",
}


def read_json(path: Path) -> dict:
    value = json.loads(path.read_bytes())
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def validate(source: Path) -> tuple[str, str]:
    generated = source / "frontend/generated/park"
    map_path = generated / "server-map.json"
    manifest_path = generated / "manifest.json"
    manifest = read_json(manifest_path)
    park = read_json(map_path)
    if manifest.get("format") != "ontop.park-map-manifest" or park.get("format") != "ontop.park-map":
        raise ValueError("Unexpected park map or manifest format")
    identity = {key: park.get(key) for key in ("mapId", "schemaVersion", "mapVersion")}
    if identity != {key: manifest.get(key) for key in identity}:
        raise ValueError("Park map and manifest identities differ")
    if identity["mapId"] != "park" or identity["schemaVersion"] != 2 or not identity["mapVersion"]:
        raise ValueError("Unsupported park map identity")
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list):
        raise ValueError("Manifest artifacts must be a list")
    expected_artifacts = {
        "generated/park/server-map.json": map_path,
        "src/map/park/generated/mapVersion.ts": source / "frontend/src/map/park/generated/mapVersion.ts",
    }
    if {item.get("path") for item in artifacts if isinstance(item, dict)} != set(expected_artifacts):
        raise ValueError("Manifest artifact paths differ from the park handoff")
    for name, path in expected_artifacts.items():
        matches = [item for item in artifacts if isinstance(item, dict) and item.get("path") == name]
        if len(matches) != 1:
            raise ValueError(f"Manifest must name exactly one {name} artifact")
        raw = path.read_bytes()
        if matches[0].get("bytes") != len(raw) or matches[0].get("sha256") != hashlib.sha256(raw).hexdigest():
            raise ValueError(f"Artifact bytes or SHA-256 differ from manifest: {name}")
    digest = hashlib.sha256(map_path.read_bytes()).hexdigest()

    sources = manifest.get("sources")
    if not isinstance(sources, list) or not sources:
        raise ValueError("Manifest sources are missing")
    for item in sources:
        if not isinstance(item, dict) or not isinstance(item.get("path"), str):
            raise ValueError("Invalid manifest source entry")
        relative = Path(item["path"])
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Manifest source path escapes frontend")
        # The map generator hashes normalized UTF-8 text, so Windows CRLF
        # checkouts must produce the same source identity as Linux CI.
        source_text = (source / "frontend" / relative).read_text(encoding="utf-8")
        source_bytes = source_text.replace("\r\n", "\n").replace("\r", "\n").encode("utf-8")
        if item.get("sha256") != hashlib.sha256(source_bytes).hexdigest():
            raise ValueError(f"Source SHA-256 differs from manifest: {relative}")

    anchors = {f"table-{number}" for number in range(1, 19)}
    if len(park.get("data", {}).get("tables", [])) != 18:
        raise ValueError("The candidate park map must contain 18 tables")
    for environment, channels in (("dev", {"channel-1"}),
                                  ("frontend-test", {"channel-1", "channel-2"})):
        name = f"park-bindings.{environment}.json"
        canonical_path = source / "docs/integration/park-180" / name
        public_path = source / "frontend/public" / f"park-bindings.generated.{environment}.json"
        if canonical_path.read_bytes() != public_path.read_bytes():
            raise ValueError(f"BE and FE bindings differ for {environment}")
        canonical = read_json(canonical_path)
        public = read_json(public_path)
        bindings = canonical.get("bindings")
        if not isinstance(bindings, list) or public.get("bindings") != bindings:
            raise ValueError(f"BE and FE bindings differ for {environment}")
        if public.get("emotes") != canonical.get("emotes"):
            raise ValueError(f"FE emotes differ from BE handoff for {environment}")
        for channel in channels:
            selected = [row for row in bindings if row.get("channelId") == channel]
            if len(selected) != 18 or {row.get("anchorId") for row in selected} != anchors:
                raise ValueError(f"Expected 18 unique table anchors in {environment}/{channel}")
            ids = [row.get("tableId") for row in selected]
            if len(set(ids)) != 18 or any(not isinstance(item, str) or
                                          not item.startswith("table-") or
                                          item.startswith("fixture-") for item in ids):
                raise ValueError(f"Invalid server table IDs in {environment}/{channel}")
        if {row.get("channelId") for row in bindings} != channels:
            raise ValueError(f"Unexpected channels in {environment} bindings")
    return identity["mapVersion"], digest


def prepare(source: Path, destination: Path) -> None:
    if destination.exists() and any(destination.iterdir()):
        raise ValueError(f"Preparation directory must be empty: {destination}")
    destination.mkdir(parents=True, exist_ok=True)
    for name in ("server-map.json", "manifest.json"):
        shutil.copyfile(source / "frontend/generated/park" / name, destination / name)
    for environment in ("dev", "frontend-test"):
        name = f"park-bindings.{environment}.json"
        shutil.copyfile(source / "docs/integration/park-180" / name, destination / name)


def verify_results(results: Path) -> None:
    found = {}
    for path in results.glob("TEST-*.xml"):
        root = ET.parse(path).getroot()
        short_name = root.get("name", "").rsplit(".", 1)[-1]
        if short_name in TEST_CLASSES:
            found[short_name] = root
    missing = TEST_CLASSES - found.keys()
    if missing:
        raise ValueError(f"Generated map tests were not executed: {', '.join(sorted(missing))}")
    for name, suite in found.items():
        if int(suite.get("tests", "0")) == 0 or suite.findall(".//skipped") or any(
            int(suite.get(key, "0")) for key in ("skipped", "failures", "errors")
        ):
            raise ValueError(f"Generated map test skipped or failed: {name}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--prepare-dir", type=Path)
    parser.add_argument("--verify-results", type=Path)
    args = parser.parse_args()
    if args.verify_results:
        verify_results(args.verify_results)
        print("All six generated park test classes executed without skips or failures")
        return
    source = args.source_root.resolve()
    version, digest = validate(source)
    if args.prepare_dir:
        prepare(source, args.prepare_dir.resolve())
    print(f"park mapVersion={version} serverMapSha256={digest}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, json.JSONDecodeError, ET.ParseError) as error:
        print(f"Park handoff validation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
