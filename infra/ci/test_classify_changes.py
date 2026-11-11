import unittest

from classify_changes import classify


class ChangeClassificationTests(unittest.TestCase):
    def test_backend_only(self):
        flags = classify(["backend/src/main/java/App.java"])
        self.assertEqual((flags["BACKEND_CHANGED"], flags["FRONTEND_CHANGED"]), (1, 0))

    def test_frontend_only(self):
        flags = classify(["frontend/src/App.tsx"])
        self.assertEqual((flags["BACKEND_CHANGED"], flags["FRONTEND_CHANGED"]), (0, 1))

    def test_mixed(self):
        flags = classify(["backend/Dockerfile", "frontend/vercel.json"])
        self.assertEqual((flags["BACKEND_CHANGED"], flags["FRONTEND_CHANGED"]), (1, 1))

    def test_docs_only(self):
        flags = classify(["README.md", "docs/auth.md", "infra/app/README.md"])
        self.assertFalse(any(flags.values()))

    def test_analytics_only(self):
        flags = classify(["analytics/queries/01_daily_active.sql", "analytics/scripts/run.py"])
        self.assertFalse(any(flags.values()))

    def test_generated_map_and_be_bindings_trigger_park_checks(self):
        for path in (
            "frontend/generated/park/server-map.json",
            "frontend/src/config/parkLayout.ts",
            "frontend/src/park/runtime/deployment.ts",
            "frontend/scripts/map/load-input.ts",
            "frontend/vite.config.ts",
            "frontend/public/park-bindings.generated.dev.json",
            "docs/integration/park-180/park-bindings.dev.json",
        ):
            with self.subTest(path=path):
                flags = classify([path])
                self.assertEqual((flags["PARK_MAP_CHANGED"], flags["FRONTEND_CHANGED"]), (1, 1))
                self.assertEqual(flags["BACKEND_CHANGED"], 0)

    def test_gitignore_only(self):
        self.assertFalse(any(classify([".gitignore"]).values()))

    def test_infra_is_classified_without_service_changes(self):
        flags = classify(["infra/prod-db/compose.yaml", "infra/app/compose.dev.yaml"])
        self.assertEqual(flags["PROD_CONFIG_CHANGED"], 1)
        self.assertEqual(flags["DEV_CONFIG_CHANGED"], 1)
        self.assertEqual((flags["BACKEND_CHANGED"], flags["FRONTEND_CHANGED"]), (0, 0))

    def test_skewer_coop_rollout_files_are_dev_only(self):
        flags = classify([
            "infra/app/compose.skewer-coop.yaml",
            "infra/app/verify-skewer-coop-db.sh",
        ])
        self.assertEqual(flags["DEV_CONFIG_CHANGED"], 1)
        self.assertEqual(flags["PROD_CONFIG_CHANGED"], 0)

    def test_ci_change_uses_pipeline_checks(self):
        flags = classify(["Jenkinsfile"])
        self.assertEqual(flags["CI_CONFIG_CHANGED"], 1)
        self.assertEqual((flags["BACKEND_CHANGED"], flags["FRONTEND_CHANGED"]), (0, 0))

    def test_unknown_shared_file_tests_both_services(self):
        flags = classify(["settings.gradle"])
        self.assertEqual((flags["BACKEND_CHANGED"], flags["FRONTEND_CHANGED"]), (1, 1))


if __name__ == "__main__":
    unittest.main()
