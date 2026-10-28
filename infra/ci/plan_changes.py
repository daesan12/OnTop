#!/usr/bin/env python3
"""Plan DEV tests and deployments from their independent Git baselines."""

import argparse
import re

from classify_changes import changed_paths, classify


IMAGE_TAG = re.compile(r"^wooaw/ontop-backend:sha-([0-9a-f]{40})$")


def difference(base: str, head: str) -> tuple[dict[str, int], bool]:
    paths, invalid = changed_paths(base or None, head)
    return classify(paths), invalid


def plan(
    head: str,
    tested_base: str,
    backend_base: str,
    frontend_base: str,
    reviewed_base: str,
    live_backend_image: str,
) -> dict[str, str]:
    image_match = IMAGE_TAG.fullmatch(live_backend_image.strip())
    live_backend_sha = image_match.group(1) if image_match else ""
    live_is_ancestor = bool(live_backend_sha) and not changed_paths(live_backend_sha, head)[1]
    backend_seed = live_backend_sha if not backend_base and live_is_ancestor else ""
    effective_backend_base = backend_base or backend_seed
    backend_drift = bool(backend_base and backend_base != live_backend_sha)

    test_flags, invalid_test = difference(tested_base, head)
    backend_flags, invalid_backend = difference(effective_backend_base, head)
    frontend_flags, invalid_frontend = difference(frontend_base, head)
    review_flags, invalid_review = difference(reviewed_base, head)

    missing_baseline = invalid_backend or invalid_frontend
    full_check = invalid_test
    config_review = bool(review_flags["MANUAL_REVIEW"]) or invalid_review
    manual_review = (
        config_review
        or missing_baseline
        or backend_drift
        or full_check
    )
    deploy_backend = bool(invalid_backend or backend_flags["BACKEND_CHANGED"])
    deploy_frontend = bool(invalid_frontend or frontend_flags["FRONTEND_CHANGED"])
    return {
        "TEST_BACKEND": str(int(full_check or test_flags["BACKEND_CHANGED"] or invalid_backend)),
        "TEST_FRONTEND": str(int(full_check or test_flags["FRONTEND_CHANGED"] or invalid_frontend)),
        "DEPLOY_BACKEND": str(int(deploy_backend)),
        "DEPLOY_FRONTEND": str(int(deploy_frontend)),
        "ALLOW_BACKEND_DEPLOY": str(int(deploy_backend and not (config_review or full_check or invalid_backend or backend_drift))),
        "ALLOW_FRONTEND_DEPLOY": str(int(deploy_frontend and not (config_review or full_check or invalid_frontend))),
        "MANUAL_REVIEW": str(int(manual_review)),
        "CONFIG_REVIEW_REQUIRED": str(int(config_review)),
        "FULL_CHECK": str(int(full_check)),
        "BACKEND_BASELINE_REQUIRED": str(int(invalid_backend)),
        "FRONTEND_BASELINE_REQUIRED": str(int(invalid_frontend)),
        "REVIEW_BASELINE_REQUIRED": str(int(invalid_review)),
        "BACKEND_DRIFT": str(int(backend_drift)),
        "BACKEND_SEED_SHA": backend_seed,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    for name in ("head", "tested-base", "backend-base", "frontend-base", "reviewed-base", "live-backend-image"):
        parser.add_argument("--" + name, required=name == "head", default="")
    arguments = parser.parse_args()
    result = plan(
        arguments.head,
        arguments.tested_base,
        arguments.backend_base,
        arguments.frontend_base,
        arguments.reviewed_base,
        arguments.live_backend_image,
    )
    for key, value in result.items():
        print(f"{key}={value}")


if __name__ == "__main__":
    main()
