"""Fail before publishing the generated DEV frontend to an incompatible backend."""
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[2]


def validate_live(expected, source, actual):
    if source.strip() != "generated":
        raise ValueError("DEV backend is not using the generated park map")
    for key in ("mapId", "schemaVersion", "mapVersion"):
        if actual.get(key) != expected[key]:
            raise ValueError(f"DEV backend park {key} does not match the frontend")
    return expected["mapVersion"]


def main():
    expected = json.loads((ROOT / "frontend/generated/park/server-map.json").read_text(encoding="utf-8"))
    container = "ontop-dev-app-app-1"
    source = subprocess.check_output(
        ["docker", "exec", container, "printenv", "WORLD_MAP_SOURCE"], text=True)
    actual = json.loads(subprocess.check_output(
        ["docker", "exec", container, "cat", "/run/ontop/maps/server-map.json"], text=True))
    version = validate_live(expected, source, actual)
    print(f"DEV backend generated park matches frontend: {version}")


if __name__ == "__main__":
    main()
