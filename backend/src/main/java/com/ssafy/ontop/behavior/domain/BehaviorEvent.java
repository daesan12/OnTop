package com.ssafy.ontop.behavior.domain;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * 서버가 성공 처리했거나 클라이언트가 보고한 사용자 행동 한 건. 채팅 본문·토큰·IP 같은 원문은 props에 넣지 않는다.
 * props 값은 JSON으로 그대로 저장할 수 있는 문자열·숫자·boolean과 그 목록만 허용한다.
 * source가 없으면 서버가 기록한 것(SERVER)으로 본다.
 */
public record BehaviorEvent(UUID eventId, BehaviorEventType type, Instant occurredAt, Long userId,
        String loginSessionId, String connectionId, String channelId, String tableId, String gameId,
        Map<String, Object> props, BehaviorSource source) implements BehaviorRecord {

    private static final int MAX_ID_LENGTH = 64;
    private static final int MAX_GAME_ID_LENGTH = 120;
    private static final int MAX_PROP_TEXT_LENGTH = 200;

    public BehaviorEvent {
        Objects.requireNonNull(eventId, "eventId");
        Objects.requireNonNull(type, "type");
        Objects.requireNonNull(occurredAt, "occurredAt");
        checkLength("loginSessionId", loginSessionId, MAX_ID_LENGTH);
        checkLength("connectionId", connectionId, MAX_ID_LENGTH);
        checkLength("channelId", channelId, MAX_ID_LENGTH);
        checkLength("tableId", tableId, MAX_ID_LENGTH);
        checkLength("gameId", gameId, MAX_GAME_ID_LENGTH);
        props = props == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(props));
        props.forEach(BehaviorEvent::checkProp);
        source = source == null ? BehaviorSource.SERVER : source;
    }

    public static Builder builder(BehaviorEventType type, Instant occurredAt) {
        return new Builder(type, occurredAt);
    }

    private static void checkLength(String name, String value, int max) {
        if (value != null && value.length() > max) {
            throw new IllegalArgumentException(name + "는 " + max + "자를 넘을 수 없습니다.");
        }
    }

    private static void checkProp(String key, Object value) {
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException("props 키가 비어 있습니다.");
        }
        if (value instanceof List<?> values) {
            values.forEach(item -> checkScalar(key, item));
            return;
        }
        checkScalar(key, value);
    }

    private static void checkScalar(String key, Object value) {
        if (value instanceof String text) {
            checkLength("props." + key, text, MAX_PROP_TEXT_LENGTH);
            return;
        }
        if (!(value instanceof Number) && !(value instanceof Boolean)) {
            throw new IllegalArgumentException("props." + key + "는 문자열·숫자·boolean만 허용합니다.");
        }
    }

    public static final class Builder {
        private final BehaviorEventType type;
        private final Instant occurredAt;
        private final Map<String, Object> props = new LinkedHashMap<>();
        private Long userId;
        private String loginSessionId;
        private String connectionId;
        private String channelId;
        private String tableId;
        private String gameId;
        private BehaviorSource source = BehaviorSource.SERVER;

        private Builder(BehaviorEventType type, Instant occurredAt) {
            this.type = type;
            this.occurredAt = occurredAt;
        }

        public Builder userId(Long userId) {
            this.userId = userId;
            return this;
        }

        public Builder loginSessionId(String loginSessionId) {
            this.loginSessionId = loginSessionId;
            return this;
        }

        public Builder connectionId(String connectionId) {
            this.connectionId = connectionId;
            return this;
        }

        public Builder channelId(String channelId) {
            this.channelId = channelId;
            return this;
        }

        public Builder tableId(String tableId) {
            this.tableId = tableId;
            return this;
        }

        public Builder gameId(String gameId) {
            this.gameId = gameId;
            return this;
        }

        public Builder source(BehaviorSource source) {
            this.source = source;
            return this;
        }

        /** 값이 null이면 키를 남기지 않는다. */
        public Builder prop(String key, Object value) {
            if (value != null) {
                props.put(key, value);
            }
            return this;
        }

        public BehaviorEvent build() {
            return new BehaviorEvent(UUID.randomUUID(), type, occurredAt, userId, loginSessionId, connectionId,
                    channelId, tableId, gameId, props, source);
        }
    }
}
