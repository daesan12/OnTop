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

    def test_includes_executor_failure_and_nested_cause_without_system_output(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as temp:
            directory = Path(temp)
            (directory / "TEST-executor.xml").write_text(
                '<testsuite name="Gradle Test Executor 1" tests="1" failures="1" time="2">'
                '<testcase name="failed to execute tests">'
                '<failure type="ExecutionException" message="Test worker failed">'
                'ExecutionException: Test worker failed\nCaused by: java.lang.OutOfMemoryError: Java heap space'
                '</failure></testcase><system-out>unrelated application output</system-out></testsuite>',
                encoding="utf-8",
            )
            result = report(directory)
        self.assertIn("Gradle Test Executor 1 > failed to execute tests", result)
        self.assertIn("Caused by: java.lang.OutOfMemoryError: Java heap space", result)
        self.assertNotIn("unrelated application output", result)

    def test_bounds_failure_output_and_includes_error_elements(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as temp:
            directory = Path(temp)
            cases = ''.join(
                f'<testcase name="case-{index}"><error type="ExampleError">{"x" * 13000}</error></testcase>'
                for index in range(6)
            )
            (directory / "TEST-errors.xml").write_text(
                f'<testsuite name="errors" tests="6" errors="6" time="1">{cases}</testsuite>',
                encoding="utf-8",
            )
            result = report(directory)
        self.assertIn("6 failures", result)
        self.assertIn("errors > case-4", result)
        self.assertNotIn("errors > case-5", result)
        self.assertNotIn("x" * 12001, result)
        self.assertIn("[truncated;", result)


if __name__ == "__main__":
    unittest.main()
