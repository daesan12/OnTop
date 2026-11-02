package com.ssafy.ontop.table.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.reconnect.GameReconnectService.View;
import com.ssafy.ontop.game.result.GameResultService.Delivery;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.table.dto.TableProtocol;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class GameDeliveryScopeTests {
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final List<JsonNode> sent = new ArrayList<>();
    private final GameDeliveryScope scope = new GameDeliveryScope(new TableProtocol(mapper), raw -> {
        try { sent.add(mapper.readTree(raw)); }
        catch (Exception e) { throw new AssertionError(e); }
    });

    @Test void 퇴장뒤늦은종료와진행복구는로비로보내고_명시이력조회는유지한다() {
        scope.current("old");
        scope.left("leave", "table");
        for (String status : List.of("FINISHED", "RESTORED", "ELIMINATED")) {
            scope.recovery(null, new View(status, "old", 1L, mapper.createObjectNode(), null, null));
            assertThat(sent.getLast().at("/payload/status").asText()).isEqualTo("LOBBY");
            assertThat(sent.getLast().at("/payload/gameId").isNull()).isTrue();
        }
        int size = sent.size();
        scope.result(new Delivery(null, result("old", 1), null));
        assertThat(sent).hasSize(size);
        scope.result(new Delivery("history", result("old", 1), null));
        assertThat(sent.getLast().path("type").asText()).isEqualTo("GAME_RESULT");
        scope.current("new");
        scope.result(new Delivery(null, result("old", 2), null));
        assertThat(sent).hasSize(size + 1);
    }

    @Test void 미착석의_진행중첫복구는유지하고_종료와탈락은숨긴다() {
        for (String status : List.of("RESTORED", "ELIMINATED", "FINISHED")) {
            scope.recovery(null, new View(status, "old", 1L, mapper.createObjectNode(), null, null));
            assertThat(sent.getLast().at("/payload/status").asText())
                    .isEqualTo(status.equals("RESTORED") ? status : "LOBBY");
        }
        scope.close();
        scope.recovery(null, new View("RESTORED", "old", 2L, mapper.createObjectNode(), null, null));
        assertThat(sent).hasSize(3);
    }

    @Test void 시작확정전조기종료결과는_현재경기확정뒤한번만보낸다() {
        scope.starting();
        scope.result(new Delivery(null, result("previous", 9), null));
        scope.result(new Delivery(null, result("current", 2), null));
        scope.result(new Delivery(null, result("current", 1), null));
        assertThat(sent).isEmpty();
        scope.current("current");
        assertThat(sent).hasSize(1);
        assertThat(sent.getFirst().at("/payload/gameSessionId").asText()).isEqualTo("current");
        assertThat(sent.getFirst().at("/payload/version").asLong()).isEqualTo(2);
        scope.current("current");
        assertThat(sent).hasSize(1);
        scope.starting();
        scope.result(new Delivery(null, result("cancelled", 1), null));
        scope.left("leave", "table");
        scope.current("cancelled");
        assertThat(sent).hasSize(2);
    }

    private GameResultView result(String gameId, long version) {
        return new GameResultView(101, version, gameId, "OMOK", GameResultView.Status.FINISHED,
                "NORMAL", GameResultView.SettlementStatus.SETTLED, 1,
                List.of(new GameResultView.Participant("101", "WIN"), new GameResultView.Participant("202", "LOSE")),
                1L, Instant.parse("2026-10-28T00:00:00Z"));
    }
}
