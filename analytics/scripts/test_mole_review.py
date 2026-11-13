import tempfile
import unittest
from pathlib import Path

from mole_review import Detection, apply_review, read_confirmed


class MoleReviewTests(unittest.TestCase):
    def read(self, reviews: str, log: str) -> set[Detection]:
        with tempfile.TemporaryDirectory() as directory:
            review_path = Path(directory) / "review.csv"
            review_path.write_text("game,round_id,user_id,status\n" + reviews, encoding="utf-8-sig")
            log_path = Path(directory) / "server.log"
            log_path.write_text(log, encoding="utf-8")
            return read_confirmed(review_path, log_path)

    def test_only_confirmed_detections_are_applied(self):
        confirmed = self.read(
            "whack-a-mole,2,101,CONFIRMED\nspeed-mole,3,101,CONFIRMED\n"
            "speed-mole,1,103,PENDING\nwhack-a-mole,1,102,REJECTED\n",
            "2026-11-12 INFO --- [ontop] c.s.o.m.service.MoleTargets : "
            "mole_honeypot_hit game=whack-a-mole userId=101 roundId=2 hits=3\n"
            "mole_honeypot_hit game=speed-mole userId=101 roundId=3 hits=1\n"
            "mole_honeypot_hit game=speed-mole userId=103 roundId=1 hits=2\n"
            "mole_honeypot_hit game=whack-a-mole userId=102 roundId=1 hits=1\n",
        )
        self.assertEqual(confirmed, {Detection("whack-a-mole", 2, 101), Detection("speed-mole", 3, 101)})
        self.assertEqual(apply_review("SELECT 1;", confirmed), "SET @mole_confirmed_user_ids = '[101]';\nSELECT 1;")

    def test_same_round_id_from_another_game_or_user_is_not_evidence(self):
        review = "whack-a-mole,1,101,CONFIRMED\n"
        for log in (
            "mole_honeypot_hit game=speed-mole userId=101 roundId=1 hits=1\n",
            "mole_honeypot_hit game=whack-a-mole userId=102 roundId=1 hits=1\n",
            "ChatService : text=mole_honeypot_hit game=whack-a-mole userId=101 roundId=1 hits=1\n",
        ):
            with self.subTest(log=log), self.assertRaisesRegex(ValueError, "탐지 로그"):
                self.read(review, log)

    def test_invalid_ids_and_conflicting_decisions_fail(self):
        for review in (
            "speed-mole,3,9223372036854775808,CONFIRMED\n",
            "speed-mole,3,101,CONFIRMED\nspeed-mole,3,101,REJECTED\n",
        ):
            with self.subTest(review=review), self.assertRaises(ValueError):
                self.read(review, "")

    def test_unreviewed_detections_leave_filter_empty(self):
        self.assertEqual(
            self.read("speed-mole,1,103,PENDING\n",
                      "mole_honeypot_hit game=speed-mole userId=103 roundId=1 hits=2\n"),
            set(),
        )
