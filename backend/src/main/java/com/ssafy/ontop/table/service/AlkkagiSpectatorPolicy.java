package com.ssafy.ontop.table.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/** Hub의 승인된 경기 범위 안에서만 호출한다. 물리 상태에는 접근·수정하지 않는다. */
public final class AlkkagiSpectatorPolicy {
    private final Map<String, Receipt> receipts = new LinkedHashMap<>();
    private final Map<String, Long> limits = new HashMap<>();

    public Emission accept(String userId, JsonNode input, JsonNode state, long now) {
        receipts.values().removeIf(r -> now - r.at > 60_000);
        limits.values().removeIf(at -> now - at > 60_000);
        String key = userId + ":" + input.path("eventId").asText();
        Receipt old = receipts.get(key);
        if (old != null) {
            require(old.input.equals(input), "ALKKAGI_SPECTATOR_ID_CONFLICT");
            require((long) old.event.get("expiresAt") > now, "ALKKAGI_SPECTATOR_EXPIRED");
            var replay = new HashMap<>(old.event); replay.put("serverNow", now);
            return new Emission(Map.copyOf(replay), false);
        }
        require(state != null && state.path("stage").asText().equals("AIMING"), "ALKKAGI_SPECTATOR_NOT_AIMING");
        require(input.path("basedOnVersion").asLong() == state.path("version").asLong(), "ALKKAGI_SPECTATOR_STALE_VERSION");
        String kind = input.path("kind").asText();
        var event = new HashMap<String, Object>();
        event.put("kind", kind); event.put("gameId", input.path("gameId").asText());
        event.put("eventId", input.path("eventId").asText()); event.put("senderUserId", userId);
        event.put("basedOnVersion", input.path("basedOnVersion").asLong());
        event.put("turnNumber", state.path("turnNumber").asInt());
        event.put("sentAt", now); event.put("serverNow", now);
        event.put("expiresAt", now + (kind.equals("CURSOR") ? 2000 : 4000));
        if (kind.equals("CURSOR")) {
            double x = input.path("x").asDouble(), y = input.path("y").asDouble();
            require(Math.abs(x) <= state.path("settings").path("halfWidth").asDouble()
                    && Math.abs(y) <= state.path("settings").path("halfHeight").asDouble(), "ALKKAGI_SPECTATOR_OUTSIDE_BOARD");
            event.put("x", x); event.put("y", y);
        } else {
            JsonNode target = null;
            for (JsonNode piece : state.path("pieces")) if (piece.path("id").asText().equals(input.path("pieceId").asText())) target = piece;
            require(target != null && target.path("alive").asBoolean()
                    && target.path("owner").asInt() == state.path("turn").asInt(), "ALKKAGI_SPECTATOR_INVALID_TARGET");
            double dx = input.path("dx").asDouble(), dy = input.path("dy").asDouble(), length = Math.hypot(dx, dy);
            require(length >= .0001 && length <= 1.0001, "ALKKAGI_SPECTATOR_INVALID_DIRECTION");
            event.put("pieceId", target.path("id").asText()); event.put("dx", dx / length);
            event.put("dy", dy / length); event.put("power", input.path("power").asDouble());
        }
        String rate = userId + ":" + kind;
        require(!limits.containsKey(rate) || now - limits.get(rate) >= (kind.equals("CURSOR") ? 80 : 600), "ALKKAGI_SPECTATOR_TOO_FREQUENT");
        limits.put(rate, now);
        Map<String, Object> immutable = Map.copyOf(event);
        receipts.put(key, new Receipt(input.deepCopy(), immutable, now));
        if (receipts.size() > 2048) receipts.remove(receipts.keySet().iterator().next());
        return new Emission(immutable, true);
    }
    private void require(boolean condition, String code) { if (!condition) throw new IllegalArgumentException(code); }
    private record Receipt(JsonNode input, Map<String, Object> event, long at) { }
    public record Emission(Map<String, Object> event, boolean fresh) { }
}
