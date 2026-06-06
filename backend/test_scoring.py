import unittest

import main


class ScoringStateTests(unittest.TestCase):
    def test_finalize_applies_points_once_and_next_question_clears_delta(self) -> None:
        state = main.GameState()
        state.players = {"p1": main.Player(id="p1", name="Mao")}
        state.start_question(0)
        state.answers["p1"] = main.Answer(option_indices=(1,), correct=True, points=938, elapsed=4.2)

        self.assertEqual(state.players["p1"].score, 0)
        self.assertEqual(state.players["p1"].last_delta, 0)

        state.finalize_question()
        state.finalize_question()

        self.assertEqual(state.players["p1"].score, 938)
        self.assertEqual(state.players["p1"].streak, 1)
        self.assertEqual(state.players["p1"].last_delta, 938)
        self.assertTrue(state.players["p1"].last_correct)

        state.start_question(1)

        self.assertEqual(state.players["p1"].score, 938)
        self.assertEqual(state.players["p1"].last_delta, 0)
        self.assertIsNone(state.players["p1"].last_correct)
        self.assertIsNone(state.players["p1"].last_result_question_id)

    def test_unanswered_player_loses_streak_on_finalize(self) -> None:
        state = main.GameState()
        state.players = {"p1": main.Player(id="p1", name="Mao", streak=3)}
        state.start_question(0)

        state.finalize_question()

        self.assertEqual(state.players["p1"].score, 0)
        self.assertEqual(state.players["p1"].streak, 0)
        self.assertEqual(state.players["p1"].last_delta, 0)
        self.assertFalse(state.players["p1"].last_correct)
        self.assertFalse(state.players["p1"].last_answered)


if __name__ == "__main__":
    unittest.main()
