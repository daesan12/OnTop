"""Run in an isolated Linux container as root; Docker calls are harmless stubs.

docker run --rm --network none --mount type=bind,source=<repo>,target=/repo,readonly \
  python:3.12-slim python /repo/infra/ci/test_deploy_dev_skewer.py
"""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


@unittest.skipUnless(hasattr(os, "geteuid") and os.geteuid() == 0,
                     "requires an isolated Linux root container")
class DevSkewerDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        source = (Path(__file__).parent / "deploy-dev.sh").read_text(encoding="utf-8")
        for prefix in ("/etc/ontop", "/opt/ontop", "/var/lib/ontop", "/run/lock"):
            source = source.replace(prefix, str(self.root) + prefix)
        self.script = self.root / "deploy.sh"
        self.script.write_text(source, encoding="utf-8")
        self.env_file = self.root / "etc/ontop/dev-app/deploy.env"
        self.env_file.parent.mkdir(parents=True)
        self.env_file.write_text("BACKEND_IMAGE=wooaw/ontop-backend:previous\n")
        self.compose_dir = self.root / "opt/ontop/infra/app"
        self.compose_dir.mkdir(parents=True)
        (self.compose_dir / "compose.dev.yaml").touch()
        (self.compose_dir / "compose.skewer-coop.yaml").touch()
        (self.root / "run/lock").mkdir(parents=True)
        self.log = self.root / "calls"
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        for name, body in {
            "docker": 'printf "%s\\n" "$*" >> "$CALL_LOG"\n'
                      'if [ "$1" = inspect ]; then echo healthy; fi\n',
            "curl": "exit 0\n",
        }.items():
            path = bin_dir / name
            path.write_text("#!/bin/sh\n" + body)
            path.chmod(0o755)
        self.environment = {**os.environ, "PATH": str(bin_dir) + ":" + os.environ["PATH"],
                            "CALL_LOG": str(self.log)}

    def run_deploy(self):
        return subprocess.run(["bash", str(self.script), "a" * 40],
                              env=self.environment, text=True, capture_output=True)

    def journal(self, *, owner=10001, mode=0o700):
        journal = self.root / "journal"
        journal.mkdir()
        os.chown(journal, owner, owner)
        journal.chmod(mode)
        with self.env_file.open("a") as target:
            target.write(f"SKEWER_COOP_JOURNAL_HOST_DIR={journal}\n")
        (self.env_file.parent / "skewer-coop.enabled").touch()
        return journal

    def test_default_deployment_keeps_coop_disabled(self):
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("compose.skewer-coop.yaml", self.log.read_text())

    def test_configured_journal_adds_override_and_preserves_generated_map(self):
        self.journal()
        version = "b" * 64
        map_dir = self.root / "opt/ontop/maps" / version
        map_dir.mkdir(parents=True)
        for name in ("server-map.json", "manifest.json"):
            (map_dir / name).touch()
        (self.compose_dir / "compose.generated-map.yaml").touch()
        (self.env_file.parent / "park-map.enabled").write_text(version)
        with self.env_file.open("a") as target:
            target.write(f"PARK_MAP_HOST_DIR={map_dir}\n")
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = [line for line in self.log.read_text().splitlines() if line.startswith("compose ")]
        self.assertTrue(calls)
        for call in calls:
            self.assertIn("compose.generated-map.yaml", call)
            self.assertIn("compose.skewer-coop.yaml", call)

    def test_missing_journal_blocks_before_changing_image_or_recreating_app(self):
        (self.env_file.parent / "skewer-coop.enabled").touch()
        with self.env_file.open("a") as target:
            target.write("SKEWER_COOP_JOURNAL_HOST_DIR=/missing-journal\n")
        before = self.env_file.read_text()
        result = self.run_deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.env_file.read_text(), before)
        self.assertNotIn("compose ", self.log.read_text())

    def test_wrong_owner_or_permissions_block_before_recreation(self):
        journal = self.journal(owner=0)
        for owner, mode in ((0, 0o700), (10001, 0o755)):
            with self.subTest(owner=owner, mode=mode):
                os.chown(journal, owner, owner)
                journal.chmod(mode)
                result = self.run_deploy()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("ownership, permissions", result.stderr)
                self.assertNotIn("compose ", self.log.read_text())


if __name__ == "__main__":
    unittest.main()
