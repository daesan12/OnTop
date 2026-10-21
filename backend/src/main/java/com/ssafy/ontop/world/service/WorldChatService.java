package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.domain.ChatText;
import java.time.Clock;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("local")
public class WorldChatService {

    private final long minimumIntervalNanos;
    private final Clock clock;
    private final LongSupplier nanoTime;
    private final Map<String, Long> lastSent = new HashMap<>();

    @Autowired
    public WorldChatService(@Value("${ontop.world.chat.minimum-interval:1s}") Duration minimumInterval) {
        this(minimumInterval, Clock.systemUTC(), System::nanoTime);
    }

    public WorldChatService(Duration minimumInterval, Clock clock, LongSupplier nanoTime) {
        if (minimumInterval == null || minimumInterval.isNegative() || minimumInterval.isZero()
                || minimumInterval.compareTo(Duration.ofSeconds(60)) > 0) {
            throw new IllegalArgumentException("채팅 전송 간격은 0 초과 60초 이하여야 합니다.");
        }
        minimumIntervalNanos = minimumInterval.toNanos();
        this.clock = clock;
        this.nanoTime = nanoTime;
    }

    public synchronized Message create(String channelId, String userId, ChatText text) {
        long now = nanoTime.getAsLong();
        Long previous = lastSent.get(userId);
        if (previous != null && now - previous < minimumIntervalNanos) {
            throw new ChatException();
        }
        Message message = new Message(UUID.randomUUID().toString(), channelId, userId, text.value(),
                clock.instant().toString());
        lastSent.put(userId, now);
        return message;
    }

    public synchronized void disconnected(String userId) {
        lastSent.remove(userId);
    }

    public synchronized void clear() {
        lastSent.clear();
    }

    public record Message(String messageId, String channelId, String userId, String text, String sentAt) {
    }

    public static final class ChatException extends RuntimeException {

        private ChatException() {
            super("채팅 전송 간격을 확인해주세요.");
        }
    }
}
