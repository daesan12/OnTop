"""Validate PROD monitoring configuration without installing services or contacting the database."""
from pathlib import Path
import json
import os
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]


def run(*args, **kwargs):
    return subprocess.run(
        args,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=45,
        check=True,
        **kwargs,
    )


with tempfile.TemporaryDirectory(prefix="ontop-monitor-prod-config-") as temporary:
    directory = Path(temporary)
    placeholder = directory / "dummy"
    placeholder.write_text("", encoding="utf-8")
    environment = dict(
        os.environ,
        PROD_APP_NETWORK="ontop-prod-app_default",
        MYSQL_EXPORTER_CONFIG_FILE=str(placeholder),
        APP_ENV_FILE=str(placeholder),
        DB_PASSWORD_FILE=str(placeholder),
        BACKEND_IMAGE="example.invalid/ontop:config-check",
        NGINX_CONFIG_FILE=str(REPO / "infra/app/nginx/tls.conf"),
        ACME_WEBROOT_DIR=str(directory),
        TLS_DIR=str(directory),
    )

    monitoring = json.loads(
        run(
            "docker",
            "compose",
            "-f",
            str(HERE / "compose.yaml"),
            "config",
            "--format",
            "json",
            env=environment,
        ).stdout
    )
    assert set(monitoring["services"]) == {"prometheus", "mysql-exporter"}
    assert sum(int(service["mem_limit"]) for service in monitoring["services"].values()) == 640 * 1024 * 1024
    assert not monitoring["services"]["mysql-exporter"].get("ports")
    ports = monitoring["services"]["prometheus"]["ports"]
    assert len(ports) == 1 and ports[0]["host_ip"] == "127.0.0.1" and ports[0]["published"] == "9090"
    assert monitoring["networks"]["prod-app"]["external"] is True

    application = json.loads(
        run(
            "docker",
            "compose",
            "-f",
            str(REPO / "infra/app/compose.prod.yaml"),
            "-f",
            str(HERE / "compose.app.yaml"),
            "config",
            "--format",
            "json",
            env=environment,
        ).stdout
    )
    app = application["services"]["app"]
    assert not app.get("ports")
    assert app["environment"]["SPRING_PROFILES_ACTIVE"] == "prod,db,observe-prod"
    assert app["environment"]["ONTOP_OBSERVABILITY_JPA_STATISTICS_ENABLED"] == "false"
    assert "8082/actuator/health" in app["healthcheck"]["test"][-1]
    nginx_mount = next(
        volume
        for volume in application["services"]["nginx"]["volumes"]
        if volume["target"] == "/etc/nginx/conf.d/default.conf"
    )
    assert nginx_mount["source"] == "/opt/ontop/infra/monitoring/prod/nginx.tls.conf"

    nginx = (HERE / "nginx.tls.conf").read_text(encoding="utf-8")
    assert "location = /actuator/health" in nginx
    assert "proxy_pass http://app:8082;" in nginx
    assert "actuator/prometheus" not in nginx

    target = "/check/prometheus.yml"
    run(
        "docker",
        "run",
        "--rm",
        "--network",
        "none",
        "-v",
        str(HERE / "prometheus.yml") + ":" + target + ":ro",
        "--entrypoint",
        "/bin/promtool",
        "prom/prometheus:v3.5.0",
        "check",
        "config",
        target,
    )

print(
    json.dumps(
        {
            "passed": True,
            "PRODMemoryCapMiB": 640,
            "publicManagementPort": False,
            "prometheusLoopbackOnly": True,
            "flywayMigrationAdded": False,
            "servicesInstalled": False,
        }
    )
)
