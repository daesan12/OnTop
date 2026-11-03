#!/usr/bin/env python3
"""Print a compact timing summary from Gradle's JUnit XML reports."""

import argparse
from pathlib import Path
import xml.etree.ElementTree as ET


def report(directory: Path, wall_seconds: int | None = None, top: int = 10) -> str:
    suites = []
    details = []
    for path in sorted(directory.glob("TEST-*.xml")):
        root = ET.parse(path).getroot()
        suites.append((
            float(root.attrib["time"]),
            root.attrib["name"],
            int(root.attrib["tests"]),
            int(root.attrib.get("failures", 0)) + int(root.attrib.get("errors", 0)),
        ))
        for case in root.findall("testcase"):
            for failure in case.findall("failure") + case.findall("error"):
                if len(details) < 5:
                    details.append((root.attrib["name"], case.attrib.get("name", ""), failure))
    if not suites:
        raise ValueError(f"No JUnit XML reports found in {directory}")

    suite_seconds = sum(row[0] for row in suites)
    tests = sum(row[2] for row in suites)
    failures = sum(row[3] for row in suites)
    lines = [f"Test timing: {len(suites)} suites, {tests} tests, {failures} failures; "
             f"suite time {suite_seconds:.1f}s"]
    if wall_seconds is not None:
        lines[0] += f", Gradle wall time {wall_seconds}s"
    lines.append(f"Slowest {min(top, len(suites))} suites:")
    for seconds, name, count, _ in sorted(suites, reverse=True)[:top]:
        lines.append(f"  {seconds:6.1f}s  {count:3d} tests  {name}")
    if details:
        lines.append("Failed test details (up to 5 failures, 12000 characters each):")
        for suite, case, failure in details:
            lines.append(f"  Failure: {suite} > {case}")
            detail = f"{failure.attrib.get('type', '')}: {failure.attrib.get('message', '')}\n{failure.text or ''}"
            lines.append(detail[:12000])
            if len(detail) > 12000:
                lines.append("[truncated; see the JUnit XML report for the complete stack]")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--wall-seconds", type=int)
    parser.add_argument("--top", type=int, default=10)
    args = parser.parse_args()
    if args.top < 1:
        parser.error("--top must be positive")
    print(report(args.directory, args.wall_seconds, args.top))


if __name__ == "__main__":
    main()
