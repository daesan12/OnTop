"""Filesystem-only installer tests; run as root in an isolated Linux container."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


@unittest.skipUnless(hasattr(os, "geteuid") and os.geteuid() == 0,
                     "requires an isolated Linux root container")
class RapfiStagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        names = ("config.toml", "pbrain-rapfi-linux-clang-sse", "pbrain-rapfi-linux-clang-avx2")
        for name in names:
            (self.source / name).write_text(name)
        self.manifest = self.root / "rapfi-250615.sha256"
        self.manifest.write_text("".join(
            hashlib.sha256((self.source / name).read_bytes()).hexdigest() + "  " + name + "\n"
            for name in names))
        script = (Path(__file__).parents[1] / "app/stage-rapfi.sh").read_text()
        script = script.replace("/opt/ontop/rapfi", str(self.root / "releases"))
        script = script.replace("/run/lock/ontop-rapfi-stage.lock", str(self.root / "stage.lock"))
        self.script = self.root / "stage.sh"
        self.script.write_text(script)
        self.release = self.root / "releases/250615"

    def stage(self):
        return subprocess.run(["bash", str(self.script), str(self.source)],
                              capture_output=True, text=True)

    def test_installs_readable_weights_and_executable_and_is_idempotent(self):
        result = self.stage()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.release.stat().st_mode & 0o777, 0o755)
        self.assertEqual((self.release / "config.toml").stat().st_mode & 0o777, 0o644)
        self.assertEqual((self.release / "rapfi").stat().st_mode & 0o777, 0o755)
        self.assertEqual(self.stage().returncode, 0)

    def test_corrupted_source_never_creates_release(self):
        (self.source / "config.toml").write_text("tampered")
        self.assertNotEqual(self.stage().returncode, 0)
        self.assertFalse(self.release.exists())

    def test_existing_modified_release_is_not_overwritten(self):
        self.assertEqual(self.stage().returncode, 0)
        target = self.release / "rapfi"
        target.write_text("different")
        self.assertNotEqual(self.stage().returncode, 0)
        self.assertEqual(target.read_text(), "different")

    def test_symlinked_source_is_rejected(self):
        original = self.source / "config.toml"
        outside = self.root / "outside"
        original.rename(outside)
        original.symlink_to(outside)
        self.assertNotEqual(self.stage().returncode, 0)
        self.assertFalse(self.release.exists())

    def test_symlinked_destination_is_rejected(self):
        self.release.parent.mkdir()
        self.release.symlink_to(self.source, target_is_directory=True)
        self.assertNotEqual(self.stage().returncode, 0)
        self.assertFalse((self.source / "rapfi").exists())


if __name__ == "__main__":
    unittest.main()
