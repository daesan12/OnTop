#!/usr/bin/env python3
"""Classify paths changed between two Git commits."""

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
        "PARK_MAP_CHANGED": 0,
        "PARK_RENEWAL_CHANGED": 0,
    }
    for path in paths:
        normalized = PurePosixPath(path).as_posix()
        if normalized == "frontend/vercel.renewal-active.json":
            # This file controls ordinary deployments while an already approved
            # renewal map stays mounted. It does not alter that immutable map
            # contract and must not force another coordinated transition.
            result["CI_CONFIG_CHANGED"] = 1
        elif (
            normalized.startswith("frontend/src/park-renewal/")
            or normalized.startswith("frontend/public/art/park-renewal/")
            or normalized in (
                "frontend/park-renewal-assets.lock.json",
                "frontend/park-renewal-baseline.json",
                "frontend/scripts/check-renewal-assets.mjs",
                "frontend/scripts/export-renewal-backend.mjs",
                "frontend/scripts/export-renewal-mapping.mjs",
                "frontend/scripts/package-renewal-release.mjs",
                "frontend/vite.renewal.config.ts",
                "frontend/vite.renewal-release.config.ts",
                "frontend/vercel.renewal.json",
            )
        ):
            result["PARK_RENEWAL_CHANGED"] = 1
            result["PARK_MAP_CHANGED"] = 1
            result["FRONTEND_CHANGED"] = 1
        elif (
            normalized.startswith("frontend/generated/park/")
            or normalized.startswith("frontend/src/config/")
            or normalized.startswith("frontend/src/map/park/")
            or normalized.startswith("frontend/src/park/")
            or normalized == "frontend/src/map/geometry.ts"
            or normalized.startswith("frontend/scripts/map/")
            or normalized in (
                "frontend/scripts/generate-park-map.mjs",
                "frontend/scripts/park-map-vite-plugin.ts",
                "frontend/scripts/parkGeometryPlugin.ts",
                "frontend/scripts/parkBindingsPlugin.ts",
                "frontend/vite.config.ts",
                "frontend/package.json",
                "frontend/pnpm-lock.yaml",
            )
            or normalized.startswith("frontend/public/park-bindings.generated.")
            or normalized.startswith("docs/integration/park-180/")
        ):
            result["PARK_MAP_CHANGED"] = 1
            result["FRONTEND_CHANGED"] = 1
        elif normalized.startswith("backend/"):
            result["BACKEND_CHANGED"] = 1
        elif normalized.startswith("frontend/"):
            result["FRONTEND_CHANGED"] = 1
        elif normalized == "Jenkinsfile" or normalized.startswith("infra/ci/"):
            result["CI_CONFIG_CHANGED"] = 1
        elif normalized.endswith(".md"):
            continue
        elif normalized in (
            "infra/app/compose.dev.yaml",
            "infra/app/compose.skewer-coop.yaml",
            "infra/app/verify-skewer-coop-db.sh",
        ) or normalized.startswith(
            "infra/app/nginx/"
        ) or normalized.startswith("infra/app/dev."):
            result["DEV_CONFIG_CHANGED"] = 1
        elif normalized == "infra/app/compose.prod.yaml" or normalized.startswith(
            "infra/app/prod."
        ) or normalized.startswith("infra/prod-db/"):
            result["PROD_CONFIG_CHANGED"] = 1
        elif normalized.startswith("infra/app/"):
            result["DEV_CONFIG_CHANGED"] = 1
            result["PROD_CONFIG_CHANGED"] = 1
        elif normalized.startswith("postman/"):
            result["BACKEND_CHANGED"] = 1
        elif normalized == ".gitignore" or (
            normalized.startswith("docs/")
            or normalized.startswith("analytics/")
        ):
            # Documentation, offline analytics and Git ignore rules do not change the app.
            continue
        else:
            # Unknown shared files require both service tests and deployments.
            result["BACKEND_CHANGED"] = 1
            result["FRONTEND_CHANGED"] = 1
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

