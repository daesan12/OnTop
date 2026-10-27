"""관리자에게 발행할 파일이 집계값만 담고, 실패 시 기존 파일을 보존하는지 확인한다."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from export_admin_snapshot import build_snapshot, write_snapshot


class ExportAdminSnapshotTests(unittest.TestCase):
    def test_only_aggregate_fields_are_published(self):
        results = {
            "01_daily_active.sql": [{"kst_date": "2026-10-27", "active_users": "3", "new_users": "1",
                                     "connections": "4", "players": "2", "user_id": "sensitive"}],
            "17_dashboard_funnel_daily.sql": [{"kst_date": "2026-10-27", "onboarded": "1",
                                               "channel_joined": "1", "table_joined": "1",
                                               "game_started": "1", "game_completed": "1"}],
            "18_dashboard_game_daily.sql": [{"kst_date": "2026-10-27", "game_code": "OMOK",
                                             "games_started": "1", "games_ended": "1",
                                             "games_completed": "1", "forfeits": "0",
                                             "participants": "2", "duration_seconds": "120",
                                             "timed_games": "1"}],
        }
        with patch("export_admin_snapshot.rows_for", side_effect=lambda _c, _d, name, _p: results[name]):
            snapshot = build_snapshot("isolated", "snapshot", "ontop-prod-20261027T180000Z.sql.gz", "fixture")
        self.assertEqual(snapshot["dataAsOf"], "2026-10-27T18:00:00Z")
        self.assertEqual(snapshot["games"][0]["gameCode"], "OMOK")
        self.assertNotIn("sensitive", json.dumps(snapshot))
        self.assertNotIn("user_id", json.dumps(snapshot))

    def test_invalid_aggregate_does_not_replace_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "summary.json"
            path.write_text('{"previous":true}', encoding="utf-8")
            with patch("export_admin_snapshot.rows_for", return_value=[
                    {"kst_date": "2026-10-27", "active_users": "-1", "new_users": "0",
                     "connections": "0", "players": "0"}]):
                with self.assertRaises(ValueError):
                    write_snapshot(path, build_snapshot("isolated", "snapshot",
                                                        "ontop-prod-20261027T180000Z.sql.gz", "fixture"))
            self.assertEqual(path.read_text(encoding="utf-8"), '{"previous":true}')


if __name__ == "__main__":
    unittest.main()
