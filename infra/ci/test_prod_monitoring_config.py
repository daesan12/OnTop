from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
MONITORING = ROOT / "infra/monitoring/prod"


class ProdMonitoringConfigTests(unittest.TestCase):
    def test_prometheus_is_loopback_only_and_exporter_has_no_host_port(self):
        compose = (MONITORING / "compose.yaml").read_text(encoding="utf-8")

        self.assertIn('ports: ["127.0.0.1:${PROMETHEUS_PORT:-9090}:9090"]', compose)
        exporter = compose.split("  mysql-exporter:", 1)[1]
        self.assertNotIn("ports:", exporter)
        self.assertIn("PROD_APP_NETWORK", compose)

    def test_application_overlay_uses_prod_observability_without_publishing_management_port(self):
        overlay = (MONITORING / "compose.app.yaml").read_text(encoding="utf-8")

        self.assertIn("SPRING_PROFILES_ACTIVE: prod,db,observe-prod", overlay)
        self.assertIn("127.0.0.1:8082/actuator/health", overlay)
        self.assertIn("PROD_MONITORING_NGINX_CONFIG_FILE", overlay)
        self.assertNotIn("ports:", overlay)

    def test_public_health_routes_to_management_port_without_exposing_prometheus(self):
        nginx = (MONITORING / "nginx.tls.conf").read_text(encoding="utf-8")

        self.assertIn("location = /actuator/health", nginx)
        self.assertIn("proxy_pass http://app:8082;", nginx)
        self.assertIn("proxy_set_header Host 127.0.0.1:8082;", nginx)
        self.assertNotIn("actuator/prometheus", nginx)

    def test_prometheus_targets_are_labeled_as_production(self):
        prometheus = (MONITORING / "prometheus.yml").read_text(encoding="utf-8")

        self.assertIn("targets: [app:8082]", prometheus)
        self.assertIn("targets: [mysql-exporter:9104]", prometheus)
        self.assertEqual(prometheus.count("deployment: prod"), 3)


if __name__ == "__main__":
    unittest.main()
