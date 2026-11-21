package com.ssafy.ontop.game.chess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.chess.domain.ChessMatch;
import com.ssafy.ontop.game.chess.domain.ChessPosition;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChessMatchTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final Instant now = Instant.parse("2026-11-21T00:00:00Z");

    @Test
    void 백이_선공하고_바보메이트가_흑의_승리로_끝난다() throws Exception {
        ChessMatch match = match(ChessPosition.initial());
        move(match, "f2", "f3"); move(match, "e7", "e5");
        move(match, "g2", "g4"); move(match, "d8", "h4");

        assertThat(match.reason()).isEqualTo("CHECKMATE");
        assertThat(match.winner()).isEqualTo(202L);
        assertThat(match.position().board()).contains("K");
    }

    @Test
    void 행동재전송은_멱등이고_내용충돌과_낡은버전_비참가자를_거절한다() throws Exception {
        ChessMatch match = match(ChessPosition.initial());
        GameActionCommand command = command(101, "a", 0, "{\"kind\":\"move\",\"from\":\"e2\",\"to\":\"e4\"}");
        var first = match.apply(command, now);

        assertThat(match.apply(command, now)).isEqualTo(first);
        assertThat(match.version()).isEqualTo(1);
        assertThatThrownBy(() -> match.apply(command(101, "a", 0,
                "{\"kind\":\"move\",\"from\":\"d2\",\"to\":\"d4\"}"), now)).isInstanceOf(Rejected.class);
        assertThatThrownBy(() -> match.apply(command(202, "b", 0,
                "{\"kind\":\"move\",\"from\":\"e7\",\"to\":\"e5\"}"), now)).isInstanceOf(Rejected.class);
        assertThatThrownBy(() -> match.apply(command(505, "c", 1, "{\"kind\":\"drawOffer\"}"), now))
                .isInstanceOf(Rejected.class);
    }

    @Test
    void 스테일메이트와_기물부족은_무승부다() throws Exception {
        ChessMatch stalemate = match(ChessPosition.fromFen("k7/8/1QK5/8/8/8/8/8 w - - 0 1"));
        move(stalemate, "b6", "c7");
        assertThat(stalemate.reason()).isEqualTo("STALEMATE");
        assertThat(stalemate.winner()).isNull();

        ChessMatch material = match(ChessPosition.fromFen("4k3/8/8/8/8/8/2b5/1B2K3 w - - 0 1"));
        move(material, "b1", "c2");
        assertThat(material.reason()).isEqualTo("INSUFFICIENT_MATERIAL");
    }

    @Test
    void 삼회반복은_청구하고_오회반복은_자동으로_끝난다() throws Exception {
        ChessMatch claimed = match(ChessPosition.initial());
        for (int i = 0; i < 2; i++) { cycle(claimed); }
        assertThat(claimed.canClaimDraw()).isTrue();
        assertThat(claimed.endedAt()).isNull();
        claimed.apply(command(101, "claim", claimed.version(), "{\"kind\":\"claimDraw\"}"), now);
        assertThat(claimed.reason()).isEqualTo("THREEFOLD_REPETITION");

        ChessMatch automatic = match(ChessPosition.initial());
        for (int i = 0; i < 4; i++) { cycle(automatic); }
        assertThat(automatic.reason()).isEqualTo("FIVEFOLD_REPETITION");
    }

    @Test
    void 오십수는_예정수로_청구하고_칠십오수는_자동으로_끝난다() throws Exception {
        ChessMatch claimed = match(ChessPosition.fromFen("4k3/8/8/8/8/8/8/R3K3 w - - 99 60"));
        claimed.apply(command(101, "claim", 0, "{\"kind\":\"claimDraw\",\"from\":\"a1\",\"to\":\"a2\"}"), now);
        assertThat(claimed.reason()).isEqualTo("FIFTY_MOVES");
        assertThat(claimed.moves()).isEmpty();

        ChessMatch automatic = match(ChessPosition.fromFen("4k3/8/8/8/8/8/8/R3K3 w - - 149 80"));
        move(automatic, "a1", "a2");
        assertThat(automatic.reason()).isEqualTo("SEVENTY_FIVE_MOVES");
    }

    @Test
    void 칠십오번째_수의_체크메이트는_자동무승부보다_우선한다() throws Exception {
        ChessMatch match = match(ChessPosition.fromFen("7k/8/5KQ1/8/8/8/8/8 w - - 149 80"));

        move(match, "g6", "g7");

        assertThat(match.position().halfmove()).isEqualTo(150);
        assertThat(match.reason()).isEqualTo("CHECKMATE");
        assertThat(match.winner()).isEqualTo(101L);
    }

    @Test
    void 무승부는_상대만_수락하고_제안해도_시계는_계속_간다() throws Exception {
        ChessMatch match = match(ChessPosition.initial());
        match.apply(command(101, "offer", 0, "{\"kind\":\"drawOffer\"}"), now);
        assertThatThrownBy(() -> match.apply(command(101, "self", 1,
                "{\"kind\":\"drawRespond\",\"accept\":true}"), now)).isInstanceOf(Rejected.class);
        assertThat(match.deadline()).isEqualTo(now.plusSeconds(600));
        match.apply(command(202, "accept", 1, "{\"kind\":\"drawRespond\",\"accept\":true}"), now);
        assertThat(match.reason()).isEqualTo("AGREED_DRAW");
    }

    @Test
    void 시간만료와_상대의_메이트_기물부족을_구분한다() {
        ChessMatch match = match(ChessPosition.initial());
        match.expire(now.plusSeconds(600));
        assertThat(match.reason()).isEqualTo("TIMEOUT");
        assertThat(match.winner()).isEqualTo(202L);

        ChessMatch draw = match(ChessPosition.fromFen("4k3/8/8/8/8/8/8/R3K3 w - - 0 1"));
        draw.expire(now.plusSeconds(600));
        assertThat(draw.reason()).isEqualTo("TIMEOUT_DRAW");
    }

    private ChessMatch match(ChessPosition position) {
        return new ChessMatch("chess-test", "table-1", List.of(101L, 202L), now, position);
    }

    private void cycle(ChessMatch match) throws Exception {
        move(match, "g1", "f3"); move(match, "g8", "f6"); move(match, "f3", "g1"); move(match, "f6", "g8");
    }

    private void move(ChessMatch match, String from, String to) throws Exception {
        match.apply(command(match.turnUserId(), "move-" + match.version(), match.version(),
                "{\"kind\":\"move\",\"from\":\"" + from + "\",\"to\":\"" + to + "\"}"), now);
    }

    private GameActionCommand command(long user, String id, long version, String json) throws Exception {
        return new GameActionCommand(user, "chess-test", id, version, mapper.readTree(json));
    }
}
