import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path


TOOLS = Path(__file__).resolve().parent


class RepoFixture:
    def setUp(self):
        # The Jenkins workspace is writable; some local sandboxes restrict Git
        # repository creation in the operating system's default temp folder.
        self.temp = tempfile.TemporaryDirectory(dir=Path.cwd())
        self.addCleanup(self.cleanup_temp)
        self.repo = Path(self.temp.name)
        self.git("init", "-q")
        self.git("config", "user.name", "CI Test")
        self.git("config", "user.email", "ci-test@example.invalid")
        self.base = self.commit({"backend/App.java": "a", "frontend/App.tsx": "a", "Jenkinsfile": "a"})

    def cleanup_temp(self):
        # Windows can briefly retain Git's directory handle after the last
        # subprocess exits. Jenkins runs on Linux, where the first try works.
        for attempt in range(10):
            try:
                self.temp.cleanup()
                return
            except PermissionError:
                if attempt == 9:
                    raise
                time.sleep(0.1)

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.repo, text=True).strip()

    def commit(self, files):
        for name, content in files.items():
            path = self.repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        self.git("add", ".")
        self.git("commit", "-qm", "test change")
        return self.git("rev-parse", "HEAD")

    def plan(self, head, tested=None, backend=None, frontend=None, live=None):
        arguments = [sys.executable, str(TOOLS / "plan_changes.py"), "--head", head]
        for name, value in {
            "tested-base": tested,
            "backend-base": backend,
            "frontend-base": frontend,
            "live-backend-image": live,
        }.items():
            arguments.extend(["--" + name, value or ""])
        output = subprocess.check_output(arguments, cwd=self.repo, text=True)
        return dict(line.split("=", 1) for line in output.splitlines())

class ChangePlanTests(RepoFixture, unittest.TestCase):
    def test_backend_pending_after_docs_only_merge(self):
        changed = self.commit({"backend/App.java": "b"})
        head = self.commit({"docs/notes.md": "documentation"})
        flags = self.plan(head, tested=changed, backend=self.base, frontend=self.base,
                          live=f"wooaw/ontop-backend:sha-{self.base}")
        self.assertEqual((flags["TEST_BACKEND"], flags["DEPLOY_BACKEND"]), ("0", "1"))
        self.assertEqual((flags["TEST_FRONTEND"], flags["DEPLOY_FRONTEND"]), ("0", "0"))
        self.assertEqual(flags["DEPLOY_BLOCKED"], "0")

    def test_frontend_retries_after_backend_was_deployed(self):
        changed = self.commit({"backend/App.java": "b", "frontend/App.tsx": "b"})
        head = self.commit({"docs/notes.md": "documentation"})
        flags = self.plan(head, tested=changed, backend=changed, frontend=self.base,
                          live=f"wooaw/ontop-backend:sha-{changed}")
        self.assertEqual((flags["DEPLOY_BACKEND"], flags["DEPLOY_FRONTEND"]), ("0", "1"))
        self.assertEqual((flags["TEST_BACKEND"], flags["TEST_FRONTEND"]), ("0", "0"))

    def test_failed_frontend_test_is_retested_on_next_merge(self):
        self.commit({"frontend/App.tsx": "b"})
        head = self.commit({"docs/notes.md": "documentation"})
        flags = self.plan(head, tested=self.base, backend=self.base, frontend=self.base,
                          live=f"wooaw/ontop-backend:sha-{self.base}")
        self.assertEqual((flags["TEST_FRONTEND"], flags["DEPLOY_FRONTEND"]), ("1", "1"))

    def test_ci_change_does_not_block_pending_backend_deploy(self):
        tested = self.commit({"Jenkinsfile": "new pipeline"})
        head = self.commit({"backend/App.java": "b"})
        flags = self.plan(head, tested=tested, backend=self.base, frontend=self.base,
                          live=f"wooaw/ontop-backend:sha-{self.base}")
        self.assertEqual((flags["DEPLOY_BACKEND"], flags["ALLOW_BACKEND_DEPLOY"]), ("1", "1"))
        self.assertEqual(flags["DEPLOY_BLOCKED"], "0")

    def test_missing_frontend_baseline_blocks_automatic_deploy(self):
        flags = self.plan(self.base, tested=self.base, backend="", frontend="",
                          live=f"wooaw/ontop-backend:sha-{self.base}")
        self.assertEqual(flags["BACKEND_SEED_SHA"], self.base)
        self.assertEqual(flags["BACKEND_BASELINE_REQUIRED"], "0")
        self.assertEqual(flags["FRONTEND_BASELINE_REQUIRED"], "1")
        self.assertEqual(flags["DEPLOY_BLOCKED"], "1")
        self.assertEqual(flags["ALLOW_FRONTEND_DEPLOY"], "0")

    def test_missing_frontend_baseline_does_not_block_backend(self):
        head = self.commit({"backend/App.java": "b", "frontend/App.tsx": "b"})
        flags = self.plan(head, tested=self.base, backend=self.base, frontend="",
                          live=f"wooaw/ontop-backend:sha-{self.base}")
        self.assertEqual(flags["ALLOW_BACKEND_DEPLOY"], "1")
        self.assertEqual(flags["ALLOW_FRONTEND_DEPLOY"], "0")
        self.assertEqual(flags["DEPLOY_BLOCKED"], "1")

    def test_ci_change_does_not_block_both_deployments(self):
        head = self.commit({"Jenkinsfile": "b", "backend/App.java": "b", "frontend/App.tsx": "b"})
        flags = self.plan(head, tested=self.base, backend=self.base, frontend=self.base,
                          live=f"wooaw/ontop-backend:sha-{self.base}")
        self.assertEqual((flags["ALLOW_BACKEND_DEPLOY"], flags["ALLOW_FRONTEND_DEPLOY"]), ("1", "1"))
        self.assertEqual(flags["DEPLOY_BLOCKED"], "0")

    def test_gitignore_does_not_retest_or_redeploy_frontend(self):
        head = self.commit({".gitignore": "generated/", "backend/App.java": "b"})
        flags = self.plan(head, tested=self.base, backend=self.base, frontend=self.base,
                          live=f"wooaw/ontop-backend:sha-{self.base}")
        self.assertEqual((flags["TEST_BACKEND"], flags["TEST_FRONTEND"]), ("1", "0"))
        self.assertEqual((flags["ALLOW_BACKEND_DEPLOY"], flags["DEPLOY_FRONTEND"]), ("1", "0"))

    def test_dev_config_only_does_not_pretend_to_deploy_server_config(self):
        head = self.commit({"infra/app/dev.app.env.example": "WORLD_DYNAMIC_CHANNELS_ENABLED=false"})
        flags = self.plan(head, tested=self.base, backend=self.base, frontend=self.base,
                          live=f"wooaw/ontop-backend:sha-{self.base}")
        self.assertEqual((flags["TEST_BACKEND"], flags["TEST_FRONTEND"]), ("0", "0"))
        self.assertEqual((flags["DEPLOY_BACKEND"], flags["DEPLOY_FRONTEND"]), ("0", "0"))
        self.assertEqual(flags["DEPLOY_BLOCKED"], "0")

    def test_unknown_shared_file_checks_and_deploys_both_services(self):
        head = self.commit({"shared.settings": "changed"})
        flags = self.plan(head, tested=self.base, backend=self.base, frontend=self.base,
                          live=f"wooaw/ontop-backend:sha-{self.base}")
        self.assertEqual((flags["TEST_BACKEND"], flags["TEST_FRONTEND"]), ("1", "1"))
        self.assertEqual((flags["ALLOW_BACKEND_DEPLOY"], flags["ALLOW_FRONTEND_DEPLOY"]), ("1", "1"))

    def test_ci_only_runs_pipeline_checks_without_service_deploy(self):
        head = self.commit({"Jenkinsfile": "new pipeline"})
        flags = self.plan(head, tested=self.base, backend=self.base, frontend=self.base,
                          live=f"wooaw/ontop-backend:sha-{self.base}")
        self.assertEqual((flags["TEST_BACKEND"], flags["TEST_FRONTEND"]), ("0", "0"))
        self.assertEqual((flags["DEPLOY_BACKEND"], flags["DEPLOY_FRONTEND"]), ("0", "0"))
        self.assertEqual(flags["DEPLOY_BLOCKED"], "0")

    def test_frontend_only_tests_and_deploys_frontend(self):
        head = self.commit({"frontend/App.tsx": "b"})
        flags = self.plan(head, tested=self.base, backend=self.base, frontend=self.base,
                          live=f"wooaw/ontop-backend:sha-{self.base}")
        self.assertEqual((flags["TEST_BACKEND"], flags["TEST_FRONTEND"]), ("0", "1"))
        self.assertEqual((flags["ALLOW_BACKEND_DEPLOY"], flags["ALLOW_FRONTEND_DEPLOY"]), ("0", "1"))

    def test_running_backend_mismatch_blocks_automatic_deploy(self):
        live = self.commit({"backend/App.java": "b"})
        flags = self.plan(live, tested=live, backend=self.base, frontend=self.base,
                          live=f"wooaw/ontop-backend:sha-{live}")
        self.assertEqual((flags["BACKEND_DRIFT"], flags["DEPLOY_BLOCKED"]), ("1", "1"))

    def test_missing_test_baseline_runs_both_test_suites_without_deploy(self):
        flags = self.plan(self.base, backend=self.base, frontend=self.base,
                          live=f"wooaw/ontop-backend:sha-{self.base}")
        self.assertEqual((flags["TEST_BACKEND"], flags["TEST_FRONTEND"]), ("1", "1"))
        self.assertEqual((flags["FULL_CHECK"], flags["DEPLOY_BLOCKED"]), ("1", "1"))


class StateWriterTests(RepoFixture, unittest.TestCase):
    def test_writes_successful_baseline_atomically(self):
        state = self.repo / "state"
        subprocess.run([sys.executable, str(TOOLS / "write_state.py"), "--kind", "frontend",
                        "--sha", self.base, "--state-dir", str(state)], cwd=self.repo, check=True)
        self.assertEqual((state / "frontend-deployed.sha").read_text().strip(), self.base)

    def test_rejects_non_ancestor_baseline(self):
        other = self.git("hash-object", "backend/App.java")
        process = subprocess.run([sys.executable, str(TOOLS / "write_state.py"), "--kind", "tested",
                                  "--sha", other, "--state-dir", str(self.repo / "state")],
                                 cwd=self.repo, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.assertNotEqual(process.returncode, 0)
        self.assertFalse((self.repo / "state" / "tested.sha").exists())


if __name__ == "__main__":
    unittest.main()
