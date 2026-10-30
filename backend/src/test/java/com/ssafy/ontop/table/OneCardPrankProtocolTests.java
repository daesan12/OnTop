package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.dto.TableProtocol;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class OneCardPrankProtocolTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final TableProtocol protocol = new TableProtocol(mapper);
    @Test void 신규요청은_식별자와정수만받고_사칭과카드내용은거절한다() throws Exception {
        var valid = new java.util.HashMap<String, Object>(Map.of("gameId", "game", "eventId", UUID.randomUUID().toString(),
                "targetUserId", "101", "turnCount", 2));
        assertThat(protocol.parse(frame("ONECARD_PRANK_REACH_SEND", valid)).type()).isEqualTo("ONECARD_PRANK_REACH_SEND");
        for (String extra : new String[]{"actorUserId", "cardId", "hand"}) {
            var forged = new java.util.HashMap<>(valid); forged.put(extra, "private");
            assertThatThrownBy(() -> protocol.parse(frame("ONECARD_PRANK_REACH_SEND", forged)))
                    .isInstanceOf(TableProtocol.RequestException.class);
        }
        var decimal = new java.util.HashMap<>(valid); decimal.put("turnCount", 2.0);
        assertThatThrownBy(() -> protocol.parse(frame("ONECARD_PRANK_REACH_SEND", decimal)))
                .isInstanceOf(TableProtocol.RequestException.class);
        assertThatThrownBy(() -> protocol.parse(frame("ONECARD_PRANK_HIT_SEND", Map.of("gameId", "game",
                "eventId", UUID.randomUUID().toString(), "attemptId", "not-a-uuid"))))
                .isInstanceOf(TableProtocol.RequestException.class);
    }
    @Test void 카드위치와버전은_함께_정수로_받고_비공개카드는_받지않는다() throws Exception {
        var payload = new java.util.HashMap<String, Object>(Map.of("gameId", "game", "eventId", UUID.randomUUID().toString(),
                "targetUserId", "101", "turnCount", 2, "cardIndex", 3, "handVersion", 9));
        for (String type : new String[]{"ONECARD_PRANK_REACH_SEND", "ONECARD_HAND_FLIP_SEND"}) {
            assertThat(protocol.parse(frame(type, payload)).type()).isEqualTo(type);
            for (Object value : new Object[]{-1, 54, 1.5, "2"}) {
                var invalid = new java.util.HashMap<>(payload); invalid.put("cardIndex", value);
                assertThatThrownBy(() -> protocol.parse(frame(type, invalid))).isInstanceOf(TableProtocol.RequestException.class);
            }
            var incomplete = new java.util.HashMap<>(payload); incomplete.remove("handVersion");
            assertThatThrownBy(() -> protocol.parse(frame(type, incomplete))).isInstanceOf(TableProtocol.RequestException.class);
        }
    }
    private String frame(String type, Object payload) throws Exception {
        return mapper.writeValueAsString(Map.of("type", type, "requestId", "request", "payload", payload));
    }
}
