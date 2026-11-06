package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.config.WorldEmoteProperties;
import com.ssafy.ontop.world.domain.EmoteCode;
import java.time.Clock;
import java.time.Duration;
import java.util.HashMap;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class WorldEmoteService {

    private final Set<String> codes;
    private final long minimumIntervalNanos;
    private final Map<String, Duration> cooldowns;
    private final Map<String, Duration> durations;
    private final int maximumPerSecond;
    private final Clock clock;
    private final LongSupplier nanoTime;
    private final Map<String, Sent> lastSent = new HashMap<>();
    private final Map<String, Active> lastEvents = new HashMap<>();
    private final Map<String, Deque<Long>> accepted = new HashMap<>();

    @Autowired
    public WorldEmoteService(WorldEmoteProperties properties,
            @Value("${ontop.world.emote.minimum-interval:1s}") Duration minimumInterval,
            @Value("${ontop.world.emote.maximum-per-second:5}") int maximumPerSecond) {
        this(properties, minimumInterval, Clock.systemUTC(), System::nanoTime, maximumPerSecond);
    }

    public WorldEmoteService(WorldEmoteProperties properties, Duration minimumInterval) {
        this(properties, minimumInterval, Clock.systemUTC(), System::nanoTime);
    }

    public WorldEmoteService(WorldEmoteProperties properties, Duration minimumInterval,
            Clock clock, LongSupplier nanoTime) {
        this(properties, minimumInterval, clock, nanoTime, 5);
    }

    public WorldEmoteService(WorldEmoteProperties properties, Duration minimumInterval,
            Clock clock, LongSupplier nanoTime, int maximumPerSecond) {
        if (minimumInterval == null || minimumInterval.isNegative() || minimumInterval.isZero()
                || minimumInterval.compareTo(Duration.ofSeconds(60)) > 0) {
            throw new IllegalArgumentException("감정표현 전송 간격은 0 초과 60초 이하여야 합니다.");
        }
        if (maximumPerSecond < 1 || maximumPerSecond > 100) {
            throw new IllegalArgumentException("감정표현 초당 승인 제한은 1~100회여야 합니다.");
        }
        codes = Set.copyOf(properties.codes());
        minimumIntervalNanos = minimumInterval.toNanos();
        cooldowns = properties.cooldowns();
        durations = properties.durations();
        this.maximumPerSecond = maximumPerSecond;
        this.clock = clock;
        this.nanoTime = nanoTime;
    }

    public synchronized Event create(String channelId, String userId, EmoteCode code) {
        if (!codes.contains(code.value())) throw new EmoteException("EMOTE_NOT_SUPPORTED", "등록되지 않은 감정표현입니다.");
        long now = nanoTime.getAsLong();
        Sent previous = lastSent.get(userId);
        if (previous != null && now - previous.at() < previous.interval()) {
            throw new EmoteException("EMOTE_TOO_FREQUENT", "감정표현 전송 간격을 확인해주세요.");
        }
        Deque<Long> window = accepted.computeIfAbsent(userId, ignored -> new ArrayDeque<>());
        while (!window.isEmpty() && now - window.getFirst() >= 1_000_000_000L) { window.removeFirst(); }
        if (window.size() >= maximumPerSecond) {
            throw new EmoteException("EMOTE_TOO_FREQUENT", "감정표현 초당 승인 제한을 초과했습니다.");
        }
        Event event = new Event(UUID.randomUUID().toString(), channelId, userId, code.value(), clock.instant().toString());
        long interval = Math.max(minimumIntervalNanos,
                cooldowns.getOrDefault(code.value(), Duration.ZERO).toNanos());
        lastSent.put(userId, new Sent(now, interval));
        lastEvents.put(userId, new Active(event, now,
                durations.getOrDefault(code.value(), Duration.ofMillis(1600)).toNanos()));
        window.addLast(now);
        return event;
    }

    /** 현재 재생 중인 원본만 취소한다. FART는 이동 취소에서 제외한다. */
    public synchronized Cancellation cancel(String userId, String reason) {
        Active active = lastEvents.get(userId);
        if (active == null) {
            return null;
        }
        if (nanoTime.getAsLong() - active.at() >= active.duration()) {
            lastEvents.remove(userId);
            return null;
        }
        Event event = active.event();
        if (reason.equals("MOVEMENT") && event.emoteCode().equals("FART")) { return null; }
        lastEvents.remove(userId);
        // 실제 재생 중 활동 취소만 새 표현을 허용한다. 채널 왕복·만료로 제한을 우회하지 않는다.
        if (reason.equals("MOVEMENT") || reason.equals("ACTIVITY_STARTED")) { lastSent.remove(userId); }
        return new Cancellation(UUID.randomUUID().toString(), event.eventId(), event.channelId(), userId,
                reason, clock.instant().toString());
    }

    public synchronized void disconnected(String userId) {
        lastSent.remove(userId);
        lastEvents.remove(userId);
        accepted.remove(userId);
    }

    public synchronized boolean isActive(String userId) {
        Active active = lastEvents.get(userId);
        return active != null && nanoTime.getAsLong() - active.at() < active.duration();
    }

    public synchronized void clear() {
        lastSent.clear();
        lastEvents.clear();
        accepted.clear();
    }

    public record Event(String eventId, String channelId, String userId, String emoteCode, String sentAt) {
    }

    public record Cancellation(String eventId, String emoteEventId, String channelId, String userId,
            String reason, String sentAt) {
    }

    private record Sent(long at, long interval) {
    }

    private record Active(Event event, long at, long duration) {
    }

    public static final class EmoteException extends RuntimeException {
        private final String code;

        private EmoteException(String code, String message) {
            super(message);
            this.code = code;
        }

        public String code() {
            return code;
        }
    }
}
