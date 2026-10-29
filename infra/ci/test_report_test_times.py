import tempfile
import unittest
from pathlib import Path

from report_test_times import report


class TestTimingReportTests(unittest.TestCase):
    def test_reports_slowest_suite_first(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as temp:
            directory = Path(temp)
            (directory / "TEST-fast.xml").write_text(
                '<testsuite name="fast" tests="2" failures="0" time="1.0"/>',
                encoding="utf-8",
            )
            (directory / "TEST-slow.xml").write_text(
                '<testsuite name="slow" tests="3" failures="0" time="4.5"/>',
                encoding="utf-8",
            )
            result = report(directory, wall_seconds=8)
        self.assertIn("2 suites, 5 tests, 0 failures; suite time 5.5s, Gradle wall time 8s", result)
        self.assertLess(result.index("slow"), result.index("fast"))


if __name__ == "__main__":
    unittest.main()
