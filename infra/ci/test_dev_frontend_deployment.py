import json
from pathlib import Path
import re
import unittest

from check_live_park import EXPECTED_MAP, validate_live


ROOT = Path(__file__).resolve().parents[2]


class DevFrontendDeploymentTests(unittest.TestCase):
    def test_live_park_guard_compares_the_renewal_map(self):
        self.assertEqual(
            EXPECTED_MAP,
            ROOT / "frontend/generated/park-renewal/server-map.json",
        )
        expected = json.loads(EXPECTED_MAP.read_text(encoding="utf-8"))
        manifest = json.loads(
            (EXPECTED_MAP.parent / "manifest.json").read_text(encoding="utf-8")
        )
        self.assertRegex(expected["mapVersion"], re.compile(r"^[0-9a-f]{64}$"))
        self.assertEqual(expected["mapId"], manifest["mapId"])
        self.assertEqual(expected["schemaVersion"], manifest["schemaVersion"])
        self.assertEqual(expected["mapVersion"], manifest["mapVersion"])

    def test_remote_dev_build_explicitly_receives_wardrobe_and_dev_bindings(self):
        pipeline = (ROOT / "Jenkinsfile").read_text(encoding="utf-8")
        command = next(line for line in pipeline.splitlines() if line.startswith("vercel deploy "))
        self.assertIn("--local-config vercel.dev.json", command)
        self.assertIn("--build-env VITE_WARDROBE_OUTFITS=true", command)
        self.assertIn("--build-env VITE_SKEWER_COOP_ENABLED=true", command)
        self.assertIn("--build-env VITE_PARK_RENEWAL_ENABLED=true", command)
        self.assertIn("--build-env VITE_STONE_RUMBLE_ENABLED=true", command)
        self.assertIn("--build-env VITE_DAVINCI_ENABLED=true", command)
        self.assertIn("--build-env VITE_PARK_BINDINGS_URL=/park-bindings.generated.dev.json", command)

    def test_ci_build_and_vercel_deploy_share_dev_feature_flags(self):
        pipeline = (ROOT / "Jenkinsfile").read_text(encoding="utf-8")
        for flag in (
            "VITE_WARDROBE_OUTFITS=true",
            "VITE_SKEWER_COOP_ENABLED=true",
            "VITE_PARK_RENEWAL_ENABLED=true",
            "VITE_STONE_RUMBLE_ENABLED=true",
            "VITE_DAVINCI_ENABLED=true",
        ):
            self.assertEqual(pipeline.count(flag), 3)

    def test_archives_the_renewal_manifest_and_bindings(self):
        pipeline = (ROOT / "Jenkinsfile").read_text(encoding="utf-8")
        self.assertIn("frontend/generated/park-renewal/manifest.json", pipeline)
        self.assertIn("frontend/generated/park-renewal/park-bindings.json", pipeline)
        self.assertNotIn("docs/integration/park-180/park-bindings.dev.json', allowEmptyArchive", pipeline)

    def test_prod_and_dev_use_their_generated_bindings_without_changing_service_routes(self):
        prod = json.loads((ROOT / "frontend/vercel.json").read_text(encoding="utf-8"))
        dev = json.loads((ROOT / "frontend/vercel.dev.json").read_text(encoding="utf-8"))
        self.assertEqual(prod.pop("buildCommand"),
                         "VITE_ALKKAGI_ENABLED=true VITE_PARK_BINDINGS_URL=/park-bindings.generated.prod.json pnpm run build:park")
        self.assertEqual(prod.pop("outputDirectory"), "dist-park")
        self.assertEqual(dev.pop("buildCommand"),
                         "VITE_ALKKAGI_ENABLED=true VITE_WARDROBE_OUTFITS=true VITE_SKEWER_COOP_ENABLED=true VITE_PARK_RENEWAL_ENABLED=true VITE_STONE_RUMBLE_ENABLED=true VITE_DAVINCI_ENABLED=true VITE_PARK_BINDINGS_URL=/park-bindings.generated.dev.json pnpm run build:park")
        self.assertEqual(dev.pop("outputDirectory"), "dist-park")
        self.assertEqual(dev, prod)

    def test_compatible_live_backend_passes(self):
        expected = {"mapId": "park", "schemaVersion": 2, "mapVersion": "new"}
        self.assertEqual(validate_live(expected, "generated\n", dict(expected)), "new")

    def test_legacy_or_different_backend_blocks_frontend_promotion(self):
        expected = {"mapId": "park", "schemaVersion": 2, "mapVersion": "new"}
        with self.assertRaisesRegex(ValueError, "not using"):
            validate_live(expected, "legacy", expected)
        for key in expected:
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, key):
                validate_live(expected, "generated", {**expected, key: "wrong"})

    def test_live_check_names_the_requested_environment(self):
        expected = {"mapId": "park", "schemaVersion": 2, "mapVersion": "new"}
        with self.assertRaisesRegex(ValueError, "PROD backend"):
            validate_live(expected, "legacy", expected, "PROD")


if __name__ == "__main__":
    unittest.main()
