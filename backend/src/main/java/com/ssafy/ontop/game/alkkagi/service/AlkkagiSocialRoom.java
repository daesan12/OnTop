package com.ssafy.ontop.game.alkkagi.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.alkkagi.domain.AlkkagiMatch;
import java.util.ArrayDeque;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 로컬 검수용 관전자 통신. 실제 제품에서는 기존 채팅/관전 권한 경계를 재사용한다. 물리 API가 없다. */
public final class AlkkagiSocialRoom {
    private final String gameId;
    private final Map<String, Cursor> cursors = new HashMap<>();
    private final Map<String, Advice> advice = new HashMap<>();
    private final Map<String, Long> limits = new HashMap<>();
    private final Map<String, Receipt> receipts = new LinkedHashMap<>();
    private final ArrayDeque<Chat> chat = new ArrayDeque<>();
    private long revision;
    private final Set<String> owners = new java.util.HashSet<>();

    public AlkkagiSocialRoom(String gameId) { this.gameId = gameId; }

    public void apply(String sessionId, String label, int actor, JsonNode input, AlkkagiMatch.Snapshot state, long now) {
        require(gameId.equals(state.gameId()) && gameId.equals(input.path("gameId").asText()), "STALE_GAME");
        owners.add(sessionId);
        String type = input.path("type").asText();
        if (type.equals("CURSOR")) {
            only(input, Set.of("type", "gameId", "x", "y"));
            require(input.path("x").isNumber() && input.path("y").isNumber(), "INVALID_CURSOR");
            double x = input.path("x").asDouble(), y = input.path("y").asDouble();
            require(Double.isFinite(x) && Double.isFinite(y) && Math.abs(x) <= state.settings().halfWidth()
                    && Math.abs(y) <= state.settings().halfHeight(), "INVALID_CURSOR");
            if (!allow(sessionId + ":cursor", now, 80)) return;
            var old = cursors.get(sessionId);
            cursors.put(sessionId, new Cursor(old == null ? "cursor:" + ++revision : old.id(), label, actor, x, y, now + 2000));
            return;
        }
        require(type.equals("CHAT") || type.equals("ADVICE"), "UNKNOWN_TYPE");
        String actionId = input.path("actionId").asText();
        require(actionId.matches("[A-Za-z0-9-]{1,64}"), "INVALID_ACTION");
        String key = sessionId + ":" + actionId;
        var previous = receipts.get(key);
        if (previous != null) { require(previous.input.equals(input), "ACTION_ID_CONFLICT"); return; }
        if (type.equals("CHAT")) {
            only(input, Set.of("type", "gameId", "actionId", "text"));
            require(input.path("text").isTextual(), "INVALID_CHAT");
            String text = input.path("text").asText().strip();
            require(!text.isBlank() && text.codePointCount(0, text.length()) <= 200
                    && text.codePoints().noneMatch(Character::isISOControl), "INVALID_CHAT");
            require(allow(sessionId + ":chat", now, 600), "CHAT_RATE_LIMIT");
            chat.addLast(new Chat(gameId + ":chat:" + ++revision, label, actor, text, now));
            while (chat.size() > 50) chat.removeFirst();
        } else {
            only(input, Set.of("type", "gameId", "actionId", "expectedVersion", "pieceId", "dx", "dy", "power"));
            require(actor == -1, "SPECTATOR_REQUIRED");
            require(state.stage().equals("AIMING"), "NOT_AIMING");
            require(input.path("expectedVersion").isIntegralNumber() && input.path("expectedVersion").canConvertToLong()
                    && input.path("expectedVersion").asLong() == state.version(), "STALE_VERSION");
            var piece = state.pieces().stream().filter(p -> p.id().equals(input.path("pieceId").asText())).findFirst().orElse(null);
            require(piece != null && piece.alive() && piece.owner() == state.turn(), "INVALID_ADVICE_TARGET");
            require(input.path("dx").isNumber() && input.path("dy").isNumber() && input.path("power").isNumber(), "INVALID_ADVICE");
            double dx = input.path("dx").asDouble(), dy = input.path("dy").asDouble(), power = input.path("power").asDouble();
            double length = Math.hypot(dx, dy);
            require(Double.isFinite(length) && length >= .0001 && length <= 1.0001
                    && Double.isFinite(power) && power > 0 && power <= 1, "INVALID_ADVICE");
            require(allow(sessionId + ":advice", now, 600), "ADVICE_RATE_LIMIT");
            advice.put(sessionId, new Advice(gameId + ":advice:" + ++revision, label, state.turnNumber(), piece.id(),
                    dx / length, dy / length, power, now + 4000));
        }
        receipts.put(key, new Receipt(input.deepCopy()));
        if (receipts.size() > 256) receipts.remove(receipts.keySet().iterator().next());
    }

    public View snapshot(AlkkagiMatch.Snapshot state, long now) {
        cursors.values().removeIf(c -> c.expiresAt() <= now);
        advice.values().removeIf(a -> a.expiresAt() <= now || a.turnNumber() != state.turnNumber() || !state.stage().equals("AIMING"));
        // UTF-8 긴 메시지50개가 소켓의32KB 송신 버퍼를 넘기지 않도록 최신 부분만 싣는다.
        var visibleChat = new ArrayDeque<Chat>(); int bytes = 0;
        for (var entries = chat.descendingIterator(); entries.hasNext();) {
            var message = entries.next();
            int cost = message.text().getBytes(java.nio.charset.StandardCharsets.UTF_8).length * 2 + 256;
            if (bytes + cost > 8192) break;
            bytes += cost; visibleChat.addFirst(message);
        }
        return new View(List.copyOf(visibleChat), List.copyOf(cursors.values()), advice.values().stream()
                .sorted(Comparator.comparing(Advice::expiresAt).reversed().thenComparing(Advice::id)).limit(3).toList());
    }

    public void disconnected(String sessionId) {
        cursors.remove(sessionId); advice.remove(sessionId);
        limits.keySet().removeIf(key -> key.startsWith(sessionId + ":"));
        receipts.keySet().removeIf(key -> key.startsWith(sessionId + ":"));
        owners.remove(sessionId);
    }

    public void retainSessions(Set<String> connected) {
        for (String session : List.copyOf(owners)) if (!connected.contains(session)) disconnected(session);
    }

    private boolean allow(String key, long now, long interval) {
        Long last = limits.get(key);
        if (last != null && now - last < interval) return false;
        limits.put(key, now); return true;
    }
    private void only(JsonNode input, Set<String> allowed) {
        input.fieldNames().forEachRemaining(field -> require(allowed.contains(field), "UNKNOWN_FIELD"));
    }
    private void require(boolean ok, String code) { if (!ok) throw new IllegalArgumentException(code); }
    private record Receipt(JsonNode input) { }
    public record Chat(String id, String label, int actor, String text, long at) { }
    public record Cursor(String id, String label, int actor, double x, double y, long expiresAt) { }
    public record Advice(String id, String label, int turnNumber, String pieceId, double dx, double dy, double power, long expiresAt) { }
    public record View(List<Chat> chat, List<Cursor> cursors, List<Advice> advice) { }
}
