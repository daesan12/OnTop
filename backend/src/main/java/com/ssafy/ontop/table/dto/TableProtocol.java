package com.ssafy.ontop.table.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
            case "TABLE_JOIN" -> fields(payload, Set.of("tableId")) && payload.get("tableId").isTextual()
                    && !payload.get("tableId").textValue().isBlank();
            case "READY_SET" -> fields(payload, Set.of("ready")) && payload.get("ready").isBoolean();
            case "TABLE_LEAVE" -> fields(payload, Set.of());
            case "GAME_START_CHECK" -> fields(payload, Set.of());
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

    private boolean fields(JsonNode node, Set<String> expected) {
        if (node == null || !node.isObject() || node.size() != expected.size()) {
            return false;
        }
        return expected.stream().allMatch(node::has);
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
