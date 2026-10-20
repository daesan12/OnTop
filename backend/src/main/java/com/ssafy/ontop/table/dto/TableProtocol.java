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
    private final boolean startRehearsal;

    public TableProtocol(ObjectMapper mapper) {
        this(mapper, false);
    }

    public TableProtocol(ObjectMapper mapper, boolean startRehearsal) {
        this.startRehearsal = startRehearsal;
        this.mapper = mapper.copy().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
    }

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
            case "WORLD_MOVE" -> fields(payload, Set.of("sequence", "x", "y", "z", "yaw"))
                    && payload.get("sequence").isIntegralNumber() && payload.get("sequence").canConvertToLong()
                    && payload.get("sequence").longValue() >= 0
                    && payload.get("sequence").longValue() <= 9_007_199_254_740_991L
                    && finite(payload.get("x")) && finite(payload.get("y"))
                    && finite(payload.get("z")) && finite(payload.get("yaw"));
            case "TABLE_JOIN", "TABLE_WATCH" -> fields(payload, Set.of("tableId")) && payload.get("tableId").isTextual()
                    && !payload.get("tableId").textValue().isBlank();
            case "READY_SET" -> fields(payload, Set.of("ready")) && payload.get("ready").isBoolean();
            case "GAME_SELECT" -> fields(payload, Set.of("gameCode")) && payload.get("gameCode").isTextual()
                    && !payload.get("gameCode").textValue().isBlank();
            case "TABLE_LEAVE", "TABLE_UNWATCH" -> fields(payload, Set.of());
            case "GAME_START_CHECK" -> fields(payload, Set.of());
            case "GAME_RECONNECT_CHECK" -> fields(payload, Set.of());
            case "GAME_STATE_CHECK" -> fields(payload, Set.of("gameId")) && payload.get("gameId").isTextual()
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
