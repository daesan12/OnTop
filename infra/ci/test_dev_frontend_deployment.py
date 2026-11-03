import json
from pathlib import Path
import unittest

from check_live_park import validate_live


ROOT = Path(__file__).resolve().parents[2]


class DevFrontendDeploymentTests(unittest.TestCase):
    def test_dev_uses_generated_build_without_changing_service_routes(self):
        default = json.loads((ROOT / "frontend/vercel.json").read_text(encoding="utf-8"))
        dev = json.loads((ROOT / "frontend/vercel.dev.json").read_text(encoding="utf-8"))
        self.assertEqual(dev.pop("buildCommand"),
                         "VITE_ALKKAGI_ENABLED=true VITE_WARDROBE_OUTFITS=true VITE_PARK_BINDINGS_URL=/park-bindings.generated.dev.json pnpm run build:park")
        self.assertEqual(dev.pop("outputDirectory"), "dist-park")
        self.assertEqual(dev, default)
        self.assertNotIn("buildCommand", default)
        self.assertNotIn("outputDirectory", default)

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


if __name__ == "__main__":
    unittest.main()
