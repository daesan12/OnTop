#!/usr/bin/env python3
"""Classify every changed path since the last successful CI deployment."""

import argparse
import subprocess
from pathlib import PurePosixPath


def classify(paths: list[str]) -> dict[str, int]:
    result = {
        "BACKEND_CHANGED": 0,
        "FRONTEND_CHANGED": 0,
        "DEV_CONFIG_CHANGED": 0,
        "PROD_CONFIG_CHANGED": 0,
        "CI_CONFIG_CHANGED": 0,
        "MANUAL_REVIEW": 0,
    }
    for path in paths:
        normalized = PurePosixPath(path).as_posix()
        if normalized.startswith("backend/"):
            result["BACKEND_CHANGED"] = 1
        elif normalized.startswith("frontend/"):
            result["FRONTEND_CHANGED"] = 1
            if normalized.startswith(("frontend/src/map/", "frontend/src/config/", "frontend/generated/park/")):
                result["BACKEND_CHANGED"] = 1
        elif normalized == "Jenkinsfile" or normalized.startswith("infra/ci/"):
            result["CI_CONFIG_CHANGED"] = 1
            result["MANUAL_REVIEW"] = 1
        elif normalized == "infra/app/compose.dev.yaml" or normalized.startswith(
            "infra/app/nginx/"
        ) or normalized.startswith("infra/app/dev."):
            result["DEV_CONFIG_CHANGED"] = 1
            result["MANUAL_REVIEW"] = 1
        elif normalized == "infra/app/compose.prod.yaml" or normalized.startswith(
            "infra/app/prod."
        ) or normalized.startswith("infra/prod-db/"):
            result["PROD_CONFIG_CHANGED"] = 1
            result["MANUAL_REVIEW"] = 1
        elif normalized.startswith("infra/app/"):
            result["DEV_CONFIG_CHANGED"] = 1
            result["PROD_CONFIG_CHANGED"] = 1
            result["MANUAL_REVIEW"] = 1
        elif normalized.startswith("postman/"):
            result["BACKEND_CHANGED"] = 1
        elif (
            normalized.startswith("docs/")
            or normalized.startswith("analytics/")
            or normalized.endswith(".md")
        ):
            # Offline analytics queries and scripts are not part of a deployed build.
            continue
        else:
            # Unknown shared files must not silently skip checks or deploy.
            result["BACKEND_CHANGED"] = 1
            result["FRONTEND_CHANGED"] = 1
            result["MANUAL_REVIEW"] = 1
    return result


def git(*args: str) -> bytes:
    return subprocess.check_output(("git", *args), stderr=subprocess.DEVNULL)


def changed_paths(base: str | None, head: str) -> tuple[list[str], bool]:
    if not base:
        return [], True
    try:
        git("cat-file", "-e", f"{base}^{{commit}}")
        git("cat-file", "-e", f"{head}^{{commit}}")
        subprocess.run(
            ("git", "merge-base", "--is-ancestor", base, head),
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        raw = git("diff", "--name-only", "-z", base, head)
    except (subprocess.CalledProcessError, OSError):
        return [], True
    return [p.decode("utf-8", "surrogateescape") for p in raw.split(b"\0") if p], False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base")
    parser.add_argument("--head", required=True)
    args = parser.parse_args()
    paths, full_check = changed_paths(args.base, args.head)
    result = classify(paths)
    if full_check:
        result["BACKEND_CHANGED"] = 1
        result["FRONTEND_CHANGED"] = 1
        result["DEV_CONFIG_CHANGED"] = 1
    result["FULL_CHECK"] = int(full_check)
    result["DEPLOY_REQUIRED"] = int(any(result[k] for k in ("BACKEND_CHANGED", "FRONTEND_CHANGED")))
    for key, value in result.items():
        print(f"{key}={value}")


if __name__ == "__main__":
    main()

