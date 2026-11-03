import json
from pathlib import Path
import re
import shutil
import tempfile
import unittest

from check_park_handoff import TEST_CLASSES, prepare, validate, verify_results


ROOT = Path(__file__).resolve().parents[2]


class ParkHandoffChecks(unittest.TestCase):
    def test_current_candidate_is_consistent(self):
        version, digest = validate(ROOT)
        # 정상적인 맵 갱신을 과거 해시로 막지 않고 FE 런타임과 BE 전달본의 동일성을 검사한다.
        runtime = (ROOT / "frontend/src/map/park/generated/mapVersion.ts").read_text(encoding="utf-8")
        runtime_version = re.search(r'\bexport\s+const\s+PARK_MAP_VERSION\s*=\s*["\']([0-9a-f]{64})["\']', runtime)
        self.assertIsNotNone(runtime_version, "Generated FE map version must be present")
        self.assertEqual(version, runtime_version.group(1))
        manifest = json.loads((ROOT / "frontend/generated/park/manifest.json").read_text(encoding="utf-8"))
        artifact = next(row for row in manifest["artifacts"] if row["path"] == "generated/park/server-map.json")
        self.assertEqual(digest, artifact["sha256"])

    def test_prepares_the_five_be_handoff_files(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as folder:
            destination = Path(folder) / "handoff"
            prepare(ROOT, destination)
            self.assertEqual({path.name for path in destination.iterdir()}, {
                "server-map.json", "manifest.json", "park-bindings.dev.json",
                "park-bindings.frontend-test.json", "park-bindings.prod.json",
            })
            self.assertEqual((destination / "server-map.json").read_bytes(),
                             (ROOT / "frontend/generated/park/server-map.json").read_bytes())

    def test_map_byte_change_cannot_pass_manifest_check(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as folder:
            candidate = Path(folder)
            self.copy_inputs(candidate)
            map_path = candidate / "frontend/generated/park/server-map.json"
            map_path.write_bytes(map_path.read_bytes() + b"\n")
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                validate(candidate)

    def test_fe_mapping_must_match_be_canonical_mapping(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as folder:
            candidate = Path(folder)
            self.copy_inputs(candidate)
            path = candidate / "frontend/public/park-bindings.generated.dev.json"
            data = json.loads(path.read_text(encoding="utf-8"))
            data["bindings"][0]["tableId"] = "table-wrong"
            path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "BE and FE bindings differ"):
                validate(candidate)

    def test_prod_mapping_must_use_server_deterministic_ids(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as folder:
            candidate = Path(folder)
            self.copy_inputs(candidate)
            for relative in (
                "docs/integration/park-180/park-bindings.prod.json",
                "frontend/public/park-bindings.generated.prod.json",
            ):
                path = candidate / relative
                data = json.loads(path.read_text(encoding="utf-8"))
                data["bindings"][0]["tableId"] = "table-00000000-0000-3000-8000-000000000000"
                path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "deterministic rule"):
                validate(candidate)

    def test_missing_or_skipped_be_handoff_test_fails(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as folder:
            results = Path(folder)
            for name in TEST_CLASSES:
                (results / f"TEST-com.ssafy.ontop.{name}.xml").write_text(
                    f'<testsuite name="com.ssafy.ontop.{name}" tests="1" skipped="0" failures="0" errors="0"/>',
                    encoding="utf-8",
                )
            verify_results(results)
            path = next(results.glob("TEST-*.xml"))
            path.write_text(path.read_text(encoding="utf-8").replace('skipped="0"', 'skipped="1"'),
                            encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "skipped or failed"):
                verify_results(results)
            path.unlink()
            with self.assertRaisesRegex(ValueError, "not executed"):
                verify_results(results)

    @staticmethod
    def copy_inputs(candidate):
        for relative in (
            "frontend/generated/park/server-map.json",
            "frontend/generated/park/manifest.json",
            "frontend/src/map/park/generated/mapVersion.ts",
            "docs/integration/park-180/park-bindings.dev.json",
            "docs/integration/park-180/park-bindings.frontend-test.json",
            "docs/integration/park-180/park-bindings.prod.json",
            "frontend/public/park-bindings.generated.dev.json",
            "frontend/public/park-bindings.generated.frontend-test.json",
            "frontend/public/park-bindings.generated.prod.json",
        ):
            target = candidate / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, target)
        manifest = json.loads((ROOT / "frontend/generated/park/manifest.json").read_text(encoding="utf-8"))
        for entry in manifest["sources"]:
            relative = Path("frontend") / entry["path"]
            target = candidate / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, target)


if __name__ == "__main__":
    unittest.main()
