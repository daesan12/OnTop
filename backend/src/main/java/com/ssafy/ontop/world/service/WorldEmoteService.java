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
    private final Clock clock;
    private final LongSupplier nanoTime;
    private final Map<String, Long> lastSent = new HashMap<>();

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
        this.clock = clock;
        this.nanoTime = nanoTime;
    }

    public synchronized Event create(String channelId, String userId, EmoteCode code) {
        if (!codes.contains(code.value())) throw new EmoteException("EMOTE_NOT_SUPPORTED", "등록되지 않은 감정표현입니다.");
        long now = nanoTime.getAsLong();
        Long previous = lastSent.get(userId);
        if (previous != null && now - previous < minimumIntervalNanos) {
            throw new EmoteException("EMOTE_TOO_FREQUENT", "감정표현 전송 간격을 확인해주세요.");
        }
        Event event = new Event(UUID.randomUUID().toString(), channelId, userId, code.value(), clock.instant().toString());
        lastSent.put(userId, now);
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
