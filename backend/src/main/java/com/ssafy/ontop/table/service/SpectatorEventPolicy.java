package com.ssafy.ontop.table.service;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Component;

/**
 * 오목 관전자 채팅·핑의 중복·전송 간격·경기별 상한·표시 수명만 판단한다(docs/websocket-api/10-game-spectator-events.md).
 * 권한·수신 대상은 TableHub가 판단하고 판·버전·타이머·정산은 다루지 않는다. 메모리에만 보관한다.
 */
@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class SpectatorEventPolicy {

    public enum Kind {
        CHAT("GAME_SPECTATOR_CHAT_TOO_FREQUENT"), PING("OMOK_SPECTATOR_PING_TOO_FREQUENT");

        private final String tooFrequent;

        Kind(String tooFrequent) {
            this.tooFrequent = tooFrequent;
        }
    }

    public record Settings(Duration chatTtl, Duration pingTtl, Duration minimumInterval,
            int chatGameLimit, Duration chatGameWindow, int pingGameLimit, Duration pingGameWindow,
            Duration dedupeRetention, int dedupeMaxPerUser) {

        public static final Settings DEFAULT = new Settings(Duration.ofSeconds(3), Duration.ofSeconds(2),
                Duration.ofSeconds(1), 3, Duration.ofSeconds(3), 5, Duration.ofSeconds(2), Duration.ofSeconds(30), 64);

        public Settings {
            for (Duration value : new Duration[] {chatTtl, pingTtl, minimumInterval, chatGameWindow, pingGameWindow,
                    dedupeRetention}) {
                if (value == null || value.isNegative() || value.isZero() || value.compareTo(Duration.ofMinutes(5)) > 0) {
                    throw new IllegalArgumentException("관전 이벤트 시간 설정은 0 초과 5분 이하여야 합니다.");
                }
            }
            if (chatGameLimit < 1 || pingGameLimit < 1 || dedupeMaxPerUser < 1 || dedupeMaxPerUser > 1024) {
                throw new IllegalArgumentException("관전 이벤트 상한 설정을 확인해주세요.");
            }
            if (dedupeRetention.compareTo(chatTtl) < 0 || dedupeRetention.compareTo(pingTtl) < 0) {
                throw new IllegalArgumentException("중복 보존 시간은 표시 수명보다 짧을 수 없습니다.");
            }
        }

        Duration ttl(Kind kind) {
            return kind == Kind.CHAT ? chatTtl : pingTtl;
        }
    }

    /** 승인된 이벤트의 서버 시각(Unix ms). 중복 재요청에도 그대로 돌려준다. */
    public record Stamp(long sentAt, long expiresAt) {
    }

    private final Settings settings;
    private final LongSupplier nanoTime;
    // 사용자별 eventId. 삽입 순서가 승인 순서이므로 앞에서부터 오래된 항목을 지운다.
    private final Map<Long, LinkedHashMap<String, Accepted>> accepted = new HashMap<>();
    private final Map<UserKind, Long> lastAccepted = new HashMap<>();
    private final Map<GameKind, Deque<Long>> gameWindows = new HashMap<>();

    public SpectatorEventPolicy() {
        this(Settings.DEFAULT, System::nanoTime);
    }

    @Autowired
    public SpectatorEventPolicy(
            @Value("${ontop.games.spectator-events.chat-ttl:3s}") Duration chatTtl,
            @Value("${ontop.games.spectator-events.ping-ttl:2s}") Duration pingTtl,
            @Value("${ontop.games.spectator-events.minimum-interval:1s}") Duration minimumInterval,
            @Value("${ontop.games.spectator-events.chat-game-limit:3}") int chatGameLimit,
            @Value("${ontop.games.spectator-events.chat-game-window:3s}") Duration chatGameWindow,
            @Value("${ontop.games.spectator-events.ping-game-limit:5}") int pingGameLimit,
            @Value("${ontop.games.spectator-events.ping-game-window:2s}") Duration pingGameWindow,
            @Value("${ontop.games.spectator-events.dedupe-retention:30s}") Duration dedupeRetention,
            @Value("${ontop.games.spectator-events.dedupe-max-per-user:64}") int dedupeMaxPerUser) {
        this(new Settings(chatTtl, pingTtl, minimumInterval, chatGameLimit, chatGameWindow, pingGameLimit,
                pingGameWindow, dedupeRetention, dedupeMaxPerUser), System::nanoTime);
    }

    public SpectatorEventPolicy(Settings settings, LongSupplier nanoTime) {
        this.settings = Objects.requireNonNull(settings);
        this.nanoTime = Objects.requireNonNull(nanoTime);
    }

    public Duration ttl(Kind kind) {
        return settings.ttl(kind);
    }

    /**
     * 같은 발신자·eventId로 이미 승인한 이벤트를 찾는다. 같은 내용이면 원래 시각을, 처음이면 null을 돌려준다.
     * 내용·종류·경기가 다르면 충돌, 원래 수명이 지났으면 만료로 거절한다. 빈도는 소비하지 않는다.
     */
    public synchronized Stamp previous(long userId, String eventId, Kind kind, String gameId, String content,
            long nowMillis) {
        prune(nanoTime.getAsLong());
        LinkedHashMap<String, Accepted> events = accepted.get(userId);
        Accepted previous = events == null ? null : events.get(eventId);
        if (previous == null) {
            return null;
        }
        if (previous.kind() != kind || !previous.gameId().equals(gameId) || !previous.content().equals(content)) {
            throw new Rejected("GAME_SPECTATOR_EVENT_ID_CONFLICT", "이미 다른 내용으로 사용한 이벤트 ID입니다.");
        }
        if (nowMillis >= previous.stamp().expiresAt()) {
            throw new Rejected("GAME_SPECTATOR_EVENT_EXPIRED", "이미 만료된 이벤트입니다.");
        }
        return previous.stamp();
    }

    /** 사용자별 간격과 경기별 상한을 확인한 뒤 승인 시각을 기록한다. 거절은 어떤 기록도 바꾸지 않는다. */
    public synchronized Stamp accept(long userId, String eventId, Kind kind, String gameId, String content,
            long nowMillis) {
        long now = nanoTime.getAsLong();
        prune(now);
        UserKind user = new UserKind(userId, kind);
        Long last = lastAccepted.get(user);
        if (last != null && now - last < settings.minimumInterval().toNanos()) {
            throw new Rejected(kind.tooFrequent, "관전 이벤트 전송 간격을 확인해주세요.");
        }
        GameKind game = new GameKind(gameId, kind);
        Deque<Long> window = gameWindows.get(game);
        int limit = kind == Kind.CHAT ? settings.chatGameLimit() : settings.pingGameLimit();
        if (window != null && window.size() >= limit) {
            throw new Rejected(kind.tooFrequent, "이 경기의 관전 이벤트가 많습니다. 잠시 후 다시 보내주세요.");
        }
        Stamp stamp = new Stamp(nowMillis, nowMillis + settings.ttl(kind).toMillis());
        lastAccepted.put(user, now);
        gameWindows.computeIfAbsent(game, ignored -> new ArrayDeque<>()).addLast(now);
        LinkedHashMap<String, Accepted> events = accepted.computeIfAbsent(userId, ignored -> new LinkedHashMap<>());
        events.put(eventId, new Accepted(kind, gameId, content, stamp, now));
        while (events.size() > settings.dedupeMaxPerUser()) {
            Iterator<String> oldest = events.keySet().iterator();
            oldest.next();
            oldest.remove();
        }
        return stamp;
    }

    public synchronized void clear() {
        accepted.clear();
        lastAccepted.clear();
        gameWindows.clear();
    }

    // 승인된 이벤트 수에 비례하는 작은 정리다. 연결 종료로는 지우지 않아 재접속 뒤 같은 eventId 재방송을 막는다.
    private void prune(long now) {
        long retention = settings.dedupeRetention().toNanos();
        for (Iterator<LinkedHashMap<String, Accepted>> users = accepted.values().iterator(); users.hasNext(); ) {
            LinkedHashMap<String, Accepted> events = users.next();
            for (Iterator<Accepted> entries = events.values().iterator(); entries.hasNext(); ) {
                if (now - entries.next().acceptedAtNanos() < retention) {
                    break;
                }
                entries.remove();
            }
            if (events.isEmpty()) {
                users.remove();
            }
        }
        long interval = settings.minimumInterval().toNanos();
        lastAccepted.values().removeIf(last -> now - last >= interval);
        for (Iterator<Map.Entry<GameKind, Deque<Long>>> games = gameWindows.entrySet().iterator(); games.hasNext(); ) {
            Map.Entry<GameKind, Deque<Long>> entry = games.next();
            long window = (entry.getKey().kind() == Kind.CHAT ? settings.chatGameWindow() : settings.pingGameWindow())
                    .toNanos();
            Deque<Long> times = entry.getValue();
            while (!times.isEmpty() && now - times.peekFirst() >= window) {
                times.removeFirst();
            }
            if (times.isEmpty()) {
                games.remove();
            }
        }
    }

    private record Accepted(Kind kind, String gameId, String content, Stamp stamp, long acceptedAtNanos) {
    }

    private record UserKind(long userId, Kind kind) {
    }

    private record GameKind(String gameId, Kind kind) {
    }

    public static final class Rejected extends RuntimeException {

        private final String code;

        Rejected(String code, String message) {
            super(message);
            this.code = code;
        }

        public String code() {
            return code;
        }
    }
}
