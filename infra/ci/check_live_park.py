"""Fail before publishing a generated frontend to an incompatible backend."""
import argparse
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[2]
EXPECTED_MAP = ROOT / "frontend/generated/park-renewal/server-map.json"


def validate_live(expected, source, actual, environment="DEV"):
    if source.strip() != "generated":
        raise ValueError(f"{environment} backend is not using the generated park map")
    for key in ("mapId", "schemaVersion", "mapVersion"):
        if actual.get(key) != expected[key]:
            raise ValueError(f"{environment} backend park {key} does not match the frontend")
    return expected["mapVersion"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", default="ontop-dev-app-app-1")
    parser.add_argument("--environment", default="DEV")
    args = parser.parse_args()
    expected = json.loads(EXPECTED_MAP.read_text(encoding="utf-8"))
    source = subprocess.check_output(
        ["docker", "exec", args.container, "printenv", "WORLD_MAP_SOURCE"], text=True)
    actual = json.loads(subprocess.check_output(
        ["docker", "exec", args.container, "cat", "/run/ontop/maps/server-map.json"], text=True))
    version = validate_live(expected, source, actual, args.environment)
    print(f"{args.environment} backend generated park matches frontend: {version}")


if __name__ == "__main__":
    main()
