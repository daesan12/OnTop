"""Validate configs using dummy values and offline parser containers, never install services."""
from pathlib import Path
import json
import os
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]


def run(*args, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, encoding="utf-8", timeout=45, check=True, **kwargs)


with tempfile.TemporaryDirectory(prefix="ontop-monitor-config-") as temporary:
    directory = Path(temporary)
    placeholder = directory / "dummy"
    placeholder.write_text("", encoding="utf-8")
    environment = dict(os.environ, DEV_APP_NETWORK="ontop-dev-app_default",
                       MYSQL_EXPORTER_CONFIG_FILE=str(placeholder), GRAFANA_LOCAL_PASSWORD_FILE=str(placeholder))
    # Do not use private env files or contact a DB during configuration checks.
    server = json.loads(run("docker", "compose", "-f", str(HERE / "compose.yaml"),
                            "config", "--format", "json", env=environment).stdout)
    assert set(server["services"]) == {"prometheus", "mysql-exporter"}
    assert sum(int(service["mem_limit"]) for service in server["services"].values()) == 480 * 1024 * 1024
    assert not server["services"]["mysql-exporter"].get("ports")
    ports = server["services"]["prometheus"]["ports"]
    assert len(ports) == 1 and ports[0]["host_ip"] == "127.0.0.1" and ports[0]["published"] == "9090"
    assert server["networks"]["dev-app"]["external"] is True
    local = json.loads(run("docker", "compose", "-f", str(HERE / "compose.grafana-local.yaml"),
                           "config", "--format", "json", env=environment).stdout)
    assert set(local["services"]) == {"grafana"}
    grafana = local["services"]["grafana"]
    assert grafana["environment"]["GF_AUTH_ANONYMOUS_ENABLED"] == "false"
    assert all(port["host_ip"] == "127.0.0.1" for port in grafana["ports"])
    environment["APP_ENV_FILE"] = str(placeholder)
    app = json.loads(run("docker", "compose", "--env-file", str(REPO / "infra/app/dev.deploy.env.example"),
                         "-f", str(REPO / "infra/app/compose.dev.yaml"), "-f", str(HERE / "compose.app.yaml"),
                         "config", "--format", "json", env=environment).stdout)
    assert not app["services"]["app"].get("ports")
    assert app["services"]["app"]["environment"]["SPRING_FLYWAY_ENABLED"] == "false"
    assert "8082/actuator/health" in app["services"]["app"]["healthcheck"]["test"][-1]
    dashboard = json.loads((HERE / "grafana/dashboards/ontop-dev.json").read_text(encoding="utf-8"))
    rules = [{"record": "ontop_panel_check_" + str(i), "expr": target["expr"]}
             for i, panel in enumerate(dashboard["panels"]) for target in panel.get("targets", [])]
    assert len(rules) == 18
    rules_file = directory / "rules.json"
    rules_file.write_text(json.dumps({"groups": [{"name": "syntax", "rules": rules}]}), encoding="utf-8")
    for kind, source in [("config", HERE / "prometheus.yml"), ("rules", rules_file)]:
        target = "/check/" + source.name
        run("docker", "run", "--rm", "--network", "none", "-v", str(source) + ":" + target + ":ro",
            "--entrypoint", "/bin/promtool", "prom/prometheus:v3.5.0", "check", kind, target)

print(json.dumps({"passed": True, "metricQueries": 18, "DEVMemoryCapMiB": 480,
                  "publicManagementPort": False, "remoteAccess": False, "servicesInstalled": False}))
