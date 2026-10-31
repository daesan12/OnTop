package com.ssafy.ontop.world.service;

import com.ssafy.ontop.game.result.GameDefeatConfirmed;
import com.ssafy.ontop.game.result.GameDepartureReason;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 채널별 잔해는 새 경기·재접속에도 남으며 AI 청소 전까지 15초 후 서버가 자동 정리한다.
 * 지갑·경기 결과·길찾기·플레이어 충돌에는 영향을 주지 않으며 공원 서버 프로세스 동안 보관한다.
 */
public final class ParkDebrisStore {
    public static final int MAX_BATCHES = 64;
    public static final int COINS = 12;
    public static final int OMOK_STONES = 5;
    public static final Duration RETENTION = Duration.ofSeconds(15);

    public record Item(String id, String gameId, String tableId, String anchorId, String gameCode,
            String userId, Instant occurredAt, double throwYaw, int seed, List<String> parts) {
    }

    public record State(String channelId, long version, List<Item> items) {
    }

    private static final class Room {
        long version;
        final Map<String, Item> items = new LinkedHashMap<>();
    }

    private final Map<String, Room> rooms = new HashMap<>();

    public synchronized boolean add(String channelId, String anchorId, GameDefeatConfirmed event,
            int participantCount, double throwYaw) {
        if (event.kind() != GameDefeatConfirmed.Kind.FORFEIT || participantCount != 2
                || event.leaveReason() != GameDepartureReason.EXPLICIT_LEAVE
                || event.remainingBefore() != 2 || anchorId == null || !Double.isFinite(throwYaw)) {
            return false;
        }
        Room room = rooms.computeIfAbsent(channelId, ignored -> new Room());
        if (room.items.containsKey(event.eventId()) || room.items.size() >= MAX_BATCHES) {
            return false;
        }
        var parts = new ArrayList<String>();
        parts.add("board");
        for (int i = 0; i < COINS; i++) {
            parts.add("coin-" + i);
        }
        if ("OMOK".equals(event.gameCode())) {
            for (int i = 0; i < OMOK_STONES; i++) {
                parts.add("stone-" + i);
            }
        }
        room.items.put(event.eventId(), new Item(event.eventId(), event.gameId(), event.tableId(), anchorId,
                event.gameCode(), Long.toString(event.userId()), event.occurredAt(), throwYaw,
                event.eventId().hashCode() & 0x7fffffff, List.copyOf(parts)));
        room.version++;
        return true;
    }

    public synchronized State state(String channelId) {
        Room room = rooms.get(channelId);
        return new State(channelId, room == null ? 0 : room.version,
                room == null ? List.of() : List.copyOf(room.items.values()));
    }

    /** 만료된 묶음을 지우고 변경된 채널만 반환해 기존 전체 상태 전파를 재사용한다. */
    public synchronized List<String> expire(Instant now) {
        var changed = new ArrayList<String>();
        for (var entry : rooms.entrySet()) {
            Room room = entry.getValue();
            if (room.items.values().removeIf(item -> !item.occurredAt().plus(RETENTION).isAfter(now))) {
                room.version++;
                changed.add(entry.getKey());
            }
        }
        return List.copyOf(changed);
    }

    /** AI 청소 연결점: 물체 ID는 item.id + '/' + part이며 클라이언트 삭제 명령은 제공하지 않는다. */
    public synchronized boolean clean(String channelId, String itemId, String part) {
        Room room = rooms.get(channelId);
        Item item = room == null ? null : room.items.get(itemId);
        if (item == null || !item.parts().contains(part)) {
            return false;
        }
        List<String> remaining = item.parts().stream().filter(p -> !p.equals(part)).toList();
        if (remaining.isEmpty()) {
            room.items.remove(itemId);
        } else {
            room.items.put(itemId, new Item(item.id(), item.gameId(), item.tableId(), item.anchorId(),
                    item.gameCode(), item.userId(), item.occurredAt(), item.throwYaw(), item.seed(), remaining));
        }
        room.version++;
        return true;
    }

    public synchronized void clear() {
        rooms.clear();
    }
}
