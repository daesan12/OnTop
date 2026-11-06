from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]


class SkewerCoopDeploymentTests(unittest.TestCase):
    def test_dev_deploy_requires_marker_and_persistent_journal_contract(self):
        deploy = (ROOT / "infra/ci/deploy-dev.sh").read_text(encoding="utf-8")
        self.assertIn("skewer_marker=/etc/ontop/dev-app/skewer-coop.enabled", deploy)
        self.assertIn("SKEWER_COOP_JOURNAL_HOST_DIR", deploy)
        self.assertIn("10001:10001", deploy)
        self.assertIn("$(stat -c '%a' \"$skewer_journal_dir\") == 700", deploy)
        self.assertIn('compose_args+=(-f "$skewer_compose")', deploy)

    def test_dev_env_example_names_the_persistent_journal_directory(self):
        env_example = (ROOT / "infra/app/dev.deploy.env.example").read_text(encoding="utf-8")
        self.assertIn("SKEWER_COOP_JOURNAL_HOST_DIR=/var/lib/ontop/skewer-coop", env_example)

    def test_compose_activates_profile_and_fixed_container_path(self):
        override = (ROOT / "infra/app/compose.skewer-coop.yaml").read_text(encoding="utf-8")
        self.assertIn("SPRING_PROFILES_INCLUDE: skewer-coop", override)
        self.assertIn("SKEWER_COOP_JOURNAL_PATH: /var/lib/ontop/skewer-coop", override)
        self.assertIn("create_host_path: false", override)

    def test_db_preflight_requires_v145_and_both_settlement_tables(self):
        verifier = (ROOT / "infra/app/verify-skewer-coop-db.sh").read_text(encoding="utf-8")
        self.assertIn("version = '145' AND success = 1", verifier)
        self.assertIn("skewer_coop_results", verifier)
        self.assertIn("skewer_coop_rewards", verifier)


if __name__ == "__main__":
    unittest.main()
