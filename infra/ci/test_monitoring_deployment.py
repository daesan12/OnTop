from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]


class MonitoringDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.deploy = (ROOT / "infra/ci/deploy-dev.sh").read_text(encoding="utf-8")

    def test_marker_controls_monitoring_compose_override(self):
        self.assertIn(
            "monitoring_marker=/etc/ontop/dev-app/monitoring.enabled",
            self.deploy,
        )
        self.assertIn(
            "monitoring_compose=/opt/ontop/infra/monitoring/dev/compose.app.yaml",
            self.deploy,
        )
        self.assertIn('compose_args+=(-f "$monitoring_compose")', self.deploy)

    def test_monitoring_health_uses_internal_management_port(self):
        self.assertIn("if (( monitoring_enabled )); then", self.deploy)
        self.assertIn(
            "docker exec ontop-dev-app-app-1 curl --fail --silent --show-error",
            self.deploy,
        )
        self.assertIn("http://127.0.0.1:8082/actuator/health", self.deploy)

    def test_default_health_keeps_existing_public_probe(self):
        self.assertIn("https://dev-api.on-top.world/actuator/health", self.deploy)

    def test_monitoring_override_enables_observe_dev_without_publishing_8082(self):
        override = (ROOT / "infra/monitoring/dev/compose.app.yaml").read_text(
            encoding="utf-8"
        )
        self.assertIn("SPRING_PROFILES_ACTIVE: dev,db,observe-dev", override)
        self.assertIn("127.0.0.1:8082/actuator/health", override)
        self.assertNotIn("ports:", override)


if __name__ == "__main__":
    unittest.main()
