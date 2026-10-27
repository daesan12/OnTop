#!/usr/bin/env python3
"""Atomically record one successfully verified Jenkins baseline."""

import argparse
import os
from pathlib import Path
import re
import subprocess
import tempfile


KINDS = {
    "tested": "tested.sha",
    "backend": "backend-deployed.sha",
    "frontend": "frontend-deployed.sha",
    "reviewed-config": "reviewed-config.sha",
}


def record(kind: str, sha: str, state_dir: Path) -> None:
    if kind not in KINDS or re.fullmatch(r"[0-9a-f]{40}", sha) is None:
        raise ValueError("Expected a known state kind and a full Git SHA")
    subprocess.run(["git", "cat-file", "-e", f"{sha}^{{commit}}"], check=True)
    subprocess.run(["git", "merge-base", "--is-ancestor", sha, "HEAD"], check=True)
    state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = state_dir / KINDS[kind]
    fd, temporary = tempfile.mkstemp(prefix="." + target.name + ".", dir=state_dir)
    try:
        if hasattr(os, "fchmod"):
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="ascii") as output:
            output.write(sha + "\n")
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=KINDS, required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--state-dir", type=Path, required=True)
    args = parser.parse_args()
    record(args.kind, args.sha, args.state_dir)


if __name__ == "__main__":
    main()
