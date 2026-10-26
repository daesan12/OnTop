package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.Map;
import java.util.WeakHashMap;

/** 기존 테스트 클라이언트도 FE처럼 실제 수신한 TABLE_STATE의 참가비/version으로 준비한다.
 * 인증/서버 상태를 우회하지 않으며 잘못된 명시 값은 덮지 않는다. 거절 테스트는 원문을 직접 전송한다. */
final class ReadyConsent {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Map<Object, JsonNode> STATES = new WeakHashMap<>();
    private ReadyConsent() { }

    static synchronized <T> T received(Object client, T message) {
        try {
            JsonNode node = message instanceof JsonNode json ? json : MAPPER.readTree((String) message);
            if (node.path("type").asText().equals("TABLE_STATE")) { STATES.put(client, node.path("payload")); }
            if (node.path("type").asText().equals("TABLE_LEFT")) { STATES.remove(client); }
            return message;
        } catch (java.io.IOException exception) { throw new AssertionError("테스트 클라이언트 상태 수신 실패", exception); }
    }

    static synchronized Object payload(Object client, String type, Object payload) {
        if (!type.equals("READY_SET") || !(payload instanceof Map<?, ?> supplied) || !Boolean.TRUE.equals(supplied.get("ready"))) {
            return payload;
        }
        JsonNode state = STATES.get(client);
        if (state == null) { return payload; }
        Map<String, Object> confirmed = new HashMap<>();
        supplied.forEach((key, value) -> confirmed.put((String) key, value));
        if (state.path("betAmountPerPlayer").isIntegralNumber()) {
            confirmed.putIfAbsent("betAmountPerPlayer", state.path("betAmountPerPlayer").longValue());
        }
        confirmed.putIfAbsent("expectedVersion", state.path("version").longValue());
        return confirmed;
    }
}
