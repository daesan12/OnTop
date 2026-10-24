package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.config.WorldEmoteProperties;
import com.ssafy.ontop.world.domain.EmoteCode;
import java.time.Clock;
import java.time.Duration;
import java.util.HashMap;
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
    private final Clock clock;
    private final LongSupplier nanoTime;
    private final Map<String, Sent> lastSent = new HashMap<>();

    @Autowired
    public WorldEmoteService(WorldEmoteProperties properties,
            @Value("${ontop.world.emote.minimum-interval:1s}") Duration minimumInterval) {
        this(properties, minimumInterval, Clock.systemUTC(), System::nanoTime);
    }

    public WorldEmoteService(WorldEmoteProperties properties, Duration minimumInterval,
            Clock clock, LongSupplier nanoTime) {
        if (minimumInterval == null || minimumInterval.isNegative() || minimumInterval.isZero()
                || minimumInterval.compareTo(Duration.ofSeconds(60)) > 0) {
            throw new IllegalArgumentException("감정표현 전송 간격은 0 초과 60초 이하여야 합니다.");
        }
        codes = Set.copyOf(properties.codes());
        minimumIntervalNanos = minimumInterval.toNanos();
        cooldowns = properties.cooldowns();
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
        Event event = new Event(UUID.randomUUID().toString(), channelId, userId, code.value(), clock.instant().toString());
        long interval = Math.max(minimumIntervalNanos,
                cooldowns.getOrDefault(code.value(), Duration.ZERO).toNanos());
        lastSent.put(userId, new Sent(now, interval));
        return event;
    }

    public synchronized void disconnected(String userId) {
        lastSent.remove(userId);
    }

    public synchronized void clear() {
        lastSent.clear();
    }

    public record Event(String eventId, String channelId, String userId, String emoteCode, String sentAt) {
    }

    private record Sent(long at, long interval) {
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
