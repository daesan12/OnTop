import json
from pathlib import Path
import shutil
import tempfile
import unittest

from check_park_handoff import TEST_CLASSES, prepare, validate, verify_results


ROOT = Path(__file__).resolve().parents[2]


class ParkHandoffChecks(unittest.TestCase):
    def test_current_candidate_is_consistent(self):
        version, digest = validate(ROOT)
        self.assertEqual(version, "c05d8ada8b12d4e509f50c7e807949bd976811e1c69a628232520b88c15a0d07")
        self.assertEqual(digest, "81d9a70a1b28751f3dc8708bb0c21fc5cae17604263f1f6ae10f4e2c6d3aeafb")

    def test_prepares_the_four_be_handoff_files(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as folder:
            destination = Path(folder) / "handoff"
            prepare(ROOT, destination)
            self.assertEqual({path.name for path in destination.iterdir()}, {
                "server-map.json", "manifest.json", "park-bindings.dev.json",
                "park-bindings.frontend-test.json",
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
            "frontend/public/park-bindings.generated.dev.json",
            "frontend/public/park-bindings.generated.frontend-test.json",
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
