package com.ssafy.ontop.game.quoridor.domain;

import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Cell;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Orientation;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Wall;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QuoridorMatchTests {
    private static final Instant NOW = Instant.parse("2026-11-21T00:00:00Z");

    @ParameterizedTest
    @ValueSource(ints = {0, 5})
    void 말에_갇힌_턴의_시간이_만료되면_장벽과_말을_보존하고_다음_차례로_넘긴다(int wallStock) {
        QuoridorMatch match = blockedMatch(wallStock);
        var players = match.players();
        var walls = match.walls();
        assertThat(match.legalMoves()).isEmpty();
        assertThat(match.players()).allSatisfy(player -> assertThat(QuoridorBoard.hasPath(
                new Cell(player.x(), player.y()), player.goal(), walls)).isTrue());

        match.expire(NOW.plusMillis(29999));
        assertThat(match.version()).isEqualTo(1);
        match.expire(NOW.plusSeconds(30));
        match.expire(NOW.plusSeconds(30));

        assertThat(match.version()).isEqualTo(2);
        assertThat(match.turnUserId()).isEqualTo(2L);
        assertThat(match.turnDeadline()).isEqualTo(NOW.plusSeconds(60));
        assertThat(match.players()).isEqualTo(players);
        assertThat(match.walls()).isEqualTo(walls);
        assertThat(match.endedAt()).isNull();
        assertThat(match.legalMoves()).isNotEmpty();

        match.expire(NOW.plusSeconds(60));

        assertThat(match.version()).isEqualTo(3);
        assertThat(match.players().get(1)).isNotEqualTo(players.get(1));
    }

    @Test
    void 이동_불가_시간초과는_기권한_참가자를_건너뛴다() {
        QuoridorMatch match = blockedMatch(0);
        match.forfeit(2, NOW);
        assertThat(match.legalMoves()).isEmpty();

        match.expire(NOW.plusSeconds(30));

        assertThat(match.version()).isEqualTo(3);
        assertThat(match.turnUserId()).isEqualTo(3L);
        assertThat(match.turnDeadline()).isEqualTo(NOW.plusSeconds(60));
    }

    private QuoridorMatch blockedMatch(int wallStock) {
        QuoridorMatch match = new QuoridorMatch(List.of(1L, 2L, 3L, 4L), 0, NOW);
        // 북서 모서리에서 세로 장벽과 두 말이 직진 점프·양쪽 회피를 막지만 장벽 경로는 남는다.
        ReflectionTestUtils.setField(match, "positions", new ArrayList<>(List.of(
                new Cell(0, 0), new Cell(1, 1), new Cell(0, 2), new Cell(0, 1))));
        ReflectionTestUtils.setField(match, "walls", new ArrayList<>(List.of(new Wall(0, 0, Orientation.VERTICAL))));
        ReflectionTestUtils.setField(match, "remaining", new int[]{wallStock, 5, 5, 5});
        return match;
    }

    @Test
    void 자동이동은_장벽을_통과하지_않고_우회하며_장벽을_소비하지_않는다() {
        QuoridorMatch match = new QuoridorMatch(List.of(1L, 2L), 0, NOW);
        match.place(1, new Wall(4, 7, Orientation.HORIZONTAL), NOW);

        match.expire(NOW.plusSeconds(30));

        assertThat(match.players().get(1).x()).isEqualTo(3);
        assertThat(match.players().get(1).y()).isEqualTo(8);
        assertThat(match.players().get(1).wallsRemaining()).isEqualTo(10);
        assertThat(match.walls()).hasSize(1);
    }

    @Test
    void 삼십초_정각에만_합법적인_목표방향으로_한번_자동이동한다() {
        QuoridorMatch match = new QuoridorMatch(List.of(1L, 2L, 3L, 4L), 0, NOW);
        match.expire(NOW.plusMillis(29999));
        assertThat(match.version()).isEqualTo(1);

        match.expire(NOW.plusSeconds(30));
        match.expire(NOW.plusSeconds(30));

        assertThat(match.version()).isEqualTo(2);
        assertThat(match.players().getFirst().y()).isEqualTo(1);
        assertThat(match.turnUserId()).isEqualTo(2L);
        assertThat(match.turnDeadline()).isEqualTo(NOW.plusSeconds(60));
        assertThat(match.walls()).isEmpty();
        assertThat(match.players().getFirst().wallsRemaining()).isEqualTo(5);
    }

    @Test
    void 직접_행동은_새_마감시간을_만들고_다른_참가자의_기권은_현재_시간을_보존한다() {
        QuoridorMatch match = new QuoridorMatch(List.of(1L, 2L, 3L, 4L), 0, NOW);
        match.place(1, new Wall(0, 0, Orientation.HORIZONTAL), NOW.plusSeconds(12));
        match.forfeit(4, NOW.plusSeconds(20));

        assertThat(match.turnDeadline()).isEqualTo(NOW.plusSeconds(42));
        match.expire(NOW.plusSeconds(41));
        assertThat(match.turnUserId()).isEqualTo(2L);
        match.expire(NOW.plusSeconds(42));
        assertThat(match.turnUserId()).isEqualTo(3L);
        assertThat(match.players().get(1).x()).isEqualTo(7);
    }

    @Test
    void 두_명은_장벽_열_개씩_네_명은_다섯_개씩_나눈다() {
        assertThat(new QuoridorMatch(List.of(1L, 2L), 0).players())
                .extracting(QuoridorMatch.Player::wallsRemaining).containsExactly(10, 10);
        assertThat(new QuoridorMatch(List.of(1L, 2L, 3L, 4L), 0).players())
                .extracting(QuoridorMatch.Player::wallsRemaining).containsExactly(5, 5, 5, 5);
        assertThatThrownBy(() -> new QuoridorMatch(List.of(1L, 2L, 3L), 0))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 네_면의_중앙에서_시작하고_시계_방향으로_차례가_진행된다() {
        QuoridorMatch match = new QuoridorMatch(List.of(1L, 2L, 3L, 4L), 0);
        assertThat(match.players()).extracting(p -> List.of(p.x(), p.y()))
                .containsExactly(List.of(4, 0), List.of(8, 4), List.of(4, 8), List.of(0, 4));

        match.move(1, 4, 1, NOW);
        match.move(2, 7, 4, NOW);
        match.move(3, 4, 7, NOW);
        match.move(4, 1, 4, NOW);

        assertThat(match.turnUserId()).isEqualTo(1L);
        assertThat(match.version()).isEqualTo(5);
    }

    @Test
    void 장벽을_놓으면_개수가_줄고_차례가_넘어가며_다시_이동하지_못한다() {
        QuoridorMatch match = new QuoridorMatch(List.of(1L, 2L), 0);

        match.place(1, new Wall(0, 0, Orientation.HORIZONTAL));

        assertThat(match.players().getFirst().wallsRemaining()).isEqualTo(9);
        assertThat(match.turnUserId()).isEqualTo(2L);
        assertThatThrownBy(() -> match.move(1, 4, 1, NOW)).isInstanceOf(Rejected.class);
    }

    @Test
    void 맞은편_끝줄에_도착하면_즉시_끝나고_추가_입력을_거절한다() {
        QuoridorMatch match = new QuoridorMatch(List.of(1L, 2L), 0);
        for (int y = 1; y <= 8; y++) {
            match.move(1, 4, y, NOW);
            if (y < 8) {
                match.move(2, y % 2 == 1 ? 5 : 6, 8, NOW);
            }
        }

        assertThat(match.winnerUserId()).isEqualTo(1L);
        assertThat(match.endReason()).isEqualTo("GOAL_REACHED");
        assertThat(match.turnUserId()).isNull();
        assertThat(match.legalMoves()).isEmpty();
        assertThatThrownBy(() -> match.move(2, 5, 7, NOW)).isInstanceOf(Rejected.class);
    }

    @Test
    void 기권한_말은_빠지고_장벽은_유지하며_마지막_한_명이_승리한다() {
        QuoridorMatch match = new QuoridorMatch(List.of(1L, 2L, 3L, 4L), 0);
        match.place(1, new Wall(0, 0, Orientation.HORIZONTAL));

        match.forfeit(1, NOW);
        match.forfeit(2, NOW);
        match.forfeit(3, NOW);

        assertThat(match.walls()).hasSize(1);
        assertThat(match.winnerUserId()).isEqualTo(4L);
        assertThat(match.endReason()).isEqualTo("LAST_PLAYER_STANDING");
        long version = match.version();
        assertThat(match.forfeit(3, NOW)).isFalse();
        assertThat(match.version()).isEqualTo(version);
    }
}
