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

    def test_shared_park_change_rebuilds_both_apps(self):
        for path in ("frontend/src/map/park/definition.ts", "frontend/src/config/fitness.ts", "frontend/generated/park/server-map.json"):
            flags = classify([path])
            self.assertEqual((flags["BACKEND_CHANGED"], flags["FRONTEND_CHANGED"]), (1, 1))

    def test_docs_only(self):
        flags = classify(["README.md", "docs/auth.md"])
        self.assertFalse(any(flags.values()))

    def test_analytics_only(self):
        flags = classify(["analytics/queries/01_daily_active.sql", "analytics/scripts/run.py"])
        self.assertFalse(any(flags.values()))

    def test_infra_requires_review(self):
        flags = classify(["infra/prod-db/compose.yaml", "infra/app/compose.dev.yaml"])
        self.assertEqual(flags["PROD_CONFIG_CHANGED"], 1)
        self.assertEqual(flags["DEV_CONFIG_CHANGED"], 1)
        self.assertEqual(flags["MANUAL_REVIEW"], 1)

    def test_ci_change_requires_review(self):
        flags = classify(["Jenkinsfile"])
        self.assertEqual(flags["CI_CONFIG_CHANGED"], 1)
        self.assertEqual(flags["MANUAL_REVIEW"], 1)

    def test_unknown_shared_file_fails_closed(self):
        flags = classify(["settings.gradle"])
        self.assertEqual((flags["BACKEND_CHANGED"], flags["FRONTEND_CHANGED"]), (1, 1))
        self.assertEqual(flags["MANUAL_REVIEW"], 1)


if __name__ == "__main__":
    unittest.main()
