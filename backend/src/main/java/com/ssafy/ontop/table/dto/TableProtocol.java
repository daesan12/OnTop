package com.ssafy.ontop.table.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.domain.ChatText;
import com.ssafy.ontop.world.domain.EmoteCode;
import java.util.Map;
import java.util.Set;

public final class TableProtocol {

    private final ObjectMapper mapper;
    private boolean startRehearsal;

    public TableProtocol(ObjectMapper mapper) {
        this(mapper, false);
    }

    public TableProtocol(ObjectMapper mapper, boolean startRehearsal) {
        this.startRehearsal = startRehearsal;
        this.mapper = mapper.copy().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
    }

    // Spring 초기 연결 때만 호출한다. 기본/개발용 계약은 그대로 둔다.
    public void enableStartQueries() { startRehearsal = true; }

    public Request parse(String text) {
        JsonNode root;
        try {
            root = mapper.readTree(text);
            if (root == null || root.isMissingNode()) {
                throw new RequestException(null, "INVALID_JSON", "JSON 형식을 확인해주세요.");
            }
        } catch (JsonProcessingException exception) {
            throw new RequestException(null, "INVALID_JSON", "JSON 형식을 확인해주세요.");
        }
        String requestId = validId(root) ? root.get("requestId").textValue() : null;
        if (requestId == null || !fields(root, Set.of("requestId", "type", "payload"))
                || !root.path("type").isTextual() || root.path("type").textValue().isBlank()
                || !root.path("payload").isObject()) {
            throw new RequestException(requestId, "INVALID_MESSAGE", "공통 메시지 형식을 확인해주세요.");
        }
        String type = root.get("type").textValue();
        JsonNode payload = root.get("payload");
        if (type.equals("GAME_START_CHECK") && !startRehearsal) {
            throw new RequestException(requestId, "UNSUPPORTED_MESSAGE_TYPE", "지원하지 않는 메시지입니다.");
        }
        boolean valid = switch (type) {
            case "CHANNEL_JOIN" -> fields(payload, Set.of("channelId")) && payload.get("channelId").isTextual()
                    && !payload.get("channelId").textValue().isBlank();
            case "CHANNEL_LEAVE" -> fields(payload, Set.of());
            case "WORLD_CHAT_SEND" -> fields(payload, Set.of("text")) && validChatText(payload.get("text"));
            case "WORLD_EMOTE_SEND" -> fields(payload, Set.of("emoteCode")) && validEmoteCode(payload.get("emoteCode"));
            case "WORLD_MOVE" -> validMove(payload);
            case "WORLD_FOLLOW_CHECK" -> fields(payload, Set.of());
            case "WORLD_FOLLOW_START" -> fields(payload, Set.of("targetId"))
                    && payload.path("targetId").isTextual()
                    && payload.path("targetId").asText().matches("[A-Za-z0-9_-]{1,80}");
            case "WORLD_FOLLOW_STOP" -> fields(payload, Set.of("followId"))
                    && payload.path("followId").isTextual()
                    && payload.path("followId").asText().matches(
                            "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
            case "WORLD_FACILITY_CHECK" -> fields(payload, Set.of());
            case "WORLD_FACILITY_CATALOG" -> fields(payload, Set.of())
                    || fields(payload, Set.of("offset")) && payload.path("offset").isIntegralNumber()
                            && payload.path("offset").canConvertToInt() && payload.path("offset").asInt() >= 0;
            case "WORLD_FACILITY_USE" -> fields(payload, Set.of("facilityId", "seatIndex"))
                    && payload.path("facilityId").isTextual() && !payload.path("facilityId").asText().isBlank()
                    && payload.path("facilityId").asText().length() <= 80
                    && payload.path("seatIndex").isIntegralNumber() && payload.path("seatIndex").canConvertToInt()
                    && payload.path("seatIndex").asInt() >= 0 && payload.path("seatIndex").asInt() <= 1;
            case "WORLD_FACILITY_RELEASE" -> fields(payload, Set.of("leaseId")) && validLease(payload);
            case "WORLD_FACILITY_AIM" -> fields(payload, Set.of("leaseId", "seq", "yaw", "pitch"))
                    && validLease(payload) && payload.path("seq").isIntegralNumber()
                    && payload.path("seq").canConvertToLong() && payload.path("seq").asLong() > 0
                    && payload.path("seq").asLong() <= 4_294_967_295L
                    && payload.path("yaw").isNumber() && Double.isFinite(payload.path("yaw").asDouble())
                    && payload.path("pitch").isNumber() && Double.isFinite(payload.path("pitch").asDouble());
            case "TABLE_JOIN", "TABLE_WATCH" -> fields(payload, Set.of("tableId")) && payload.get("tableId").isTextual()
                    && !payload.get("tableId").textValue().isBlank();
            case "READY_SET" -> fields(payload, Set.of("ready")) && payload.get("ready").isBoolean();
            case "GAME_SELECT" -> validGameSelection(payload);
            case "TABLE_LEAVE", "TABLE_UNWATCH" -> fields(payload, Set.of());
            case "GAME_START_CHECK" -> fields(payload, Set.of());
            case "GAME_RECONNECT_CHECK" -> fields(payload, Set.of());
            case "GAME_RESULT_CHECK" -> fields(payload, Set.of("gameSessionId"))
                    && payload.get("gameSessionId").isTextual()
                    && !payload.get("gameSessionId").textValue().isBlank()
                    && payload.get("gameSessionId").textValue().length() <= 120;
            case "GAME_ACTION_SEND" -> fields(payload, Set.of("gameId", "actionId", "expectedVersion", "input"))
                    && payload.get("gameId").isTextual() && !payload.get("gameId").textValue().isBlank()
                    && payload.get("gameId").textValue().length() <= 120
                    && payload.get("actionId").isTextual() && !payload.get("actionId").textValue().isBlank()
                    && payload.get("actionId").textValue().length() <= 64
                    && payload.get("expectedVersion").isIntegralNumber()
                    && payload.get("expectedVersion").canConvertToLong()
                    && payload.get("expectedVersion").longValue() >= 0
                    && payload.get("expectedVersion").longValue() <= 9_007_199_254_740_991L
                    && payload.get("input").isObject();
            case "GAME_UNWATCH" -> fields(payload, Set.of());
            case "GAME_FORFEIT" -> fields(payload, Set.of("gameId", "actionId"))
                    && payload.path("gameId").isTextual() && !payload.path("gameId").asText().isBlank()
                    && payload.path("gameId").asText().length() <= 120
                    && payload.path("actionId").isTextual() && !payload.path("actionId").asText().isBlank()
                    && payload.path("actionId").asText().length() <= 64;
            case "GAME_STATE_CHECK", "GAME_WATCH" -> fields(payload, Set.of("gameId"))
                    && payload.get("gameId").isTextual()
                    && !payload.get("gameId").textValue().isBlank()
                    && payload.get("gameId").textValue().length() <= 120;
            default -> throw new RequestException(requestId, "UNSUPPORTED_MESSAGE_TYPE", "지원하지 않는 메시지입니다.");
        };
        if (!valid) {
            throw new RequestException(requestId, "INVALID_PAYLOAD", "요청 데이터를 확인해주세요.");
        }
        return new Request(requestId, type, payload);
    }

    public String encode(String requestId, String type, Object payload) {
        try {
            return mapper.writeValueAsString(new Response(requestId, type, payload));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("서버 메시지 직렬화 실패", exception);
        }
    }

    private boolean validLease(JsonNode payload) {
        return payload.path("leaseId").isTextual() && !payload.path("leaseId").asText().isBlank()
                && payload.path("leaseId").asText().length() <= 64;
    }

    private boolean validMove(JsonNode payload) {
        try {
            com.ssafy.ontop.world.movement.MoveInput.parse(payload);
            return true;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private boolean validGameSelection(JsonNode payload) {
        if (!payload.path("gameCode").isTextual() || payload.path("gameCode").textValue().isBlank()) { return false; }
        if (!payload.has("targetScore")) { return fields(payload, Set.of("gameCode")); }
        return fields(payload, Set.of("gameCode", "targetScore")) && payload.path("gameCode").asText().equals("DICE")
                && payload.path("targetScore").isIntegralNumber() && payload.path("targetScore").canConvertToInt()
                && Set.of(2000, 4000, 6000).contains(payload.path("targetScore").intValue());
    }

    public String error(String requestId, String code, String message) {
        return encode(requestId, "ERROR", Map.of("code", code, "message", message));
    }

    private boolean validId(JsonNode root) {
        if (root == null || !root.isObject() || !root.path("requestId").isTextual()) {
            return false;
        }
        String id = root.get("requestId").textValue();
        return !id.isBlank() && id.length() <= 64;
    }

    private boolean finite(JsonNode value) {
        return value.isNumber() && Double.isFinite(value.doubleValue());
    }

    private boolean validChatText(JsonNode value) {
        if (!value.isTextual()) {
            return false;
        }
        try {
            new ChatText(value.textValue());
            return true;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private boolean fields(JsonNode node, Set<String> expected) {
        if (node == null || !node.isObject() || node.size() != expected.size()) {
            return false;
        }
        return expected.stream().allMatch(node::has);
    }

    private boolean validEmoteCode(JsonNode value) {
        if (!value.isTextual()) return false;
        try {
            new EmoteCode(value.textValue());
            return true;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    public record Request(String requestId, String type, JsonNode payload) {
    }

    private record Response(String requestId, String type, Object payload) {
    }

    public static final class RequestException extends RuntimeException {

        private final String requestId;
        private final String code;

        public RequestException(String requestId, String code, String message) {
            super(message);
            this.requestId = requestId;
            this.code = code;
        }

        public String requestId() {
            return requestId;
        }

        public String code() {
            return code;
        }
    }
}
