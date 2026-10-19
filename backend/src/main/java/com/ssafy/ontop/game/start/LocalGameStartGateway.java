package com.ssafy.ontop.game.start;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

// DB·지갑·실제 게임을 사용하지 않는 연동 검증 대역이다. 운영 B 구현으로 사용하지 않는다.
@Component
@Profile("local")
@ConditionalOnProperty(prefix = "ontop.start-rehearsal", name = "enabled", havingValue = "true")
public class LocalGameStartGateway implements GameStartGateway {

    private final Scenario scenario;
    private final long delayMillis;
    private final Map<UUID, Entry> entries = new ConcurrentHashMap<>();

    public LocalGameStartGateway(@Value("${ontop.start-rehearsal.scenario:SUCCESS}") Scenario scenario,
            @Value("${ontop.start-rehearsal.delay-millis:500}") long delayMillis) {
        if (delayMillis < 0 || delayMillis > 60000) {
            throw new IllegalArgumentException("검증 대기 시간은 0~60000ms입니다.");
        }
        this.scenario = scenario;
        this.delayMillis = delayMillis;
    }

    @Override
    public GameStartResult startGame(GameStartCommand command) {
        if (command.participants().stream().anyMatch(participant -> !participant.userId().startsWith("dev-"))) {
            throw new IllegalArgumentException("검증 대역에는 임시 사용자만 전달해주세요.");
        }
        Entry candidate = new Entry(command, "demo-game-" + UUID.randomUUID(),
                System.nanoTime() + delayMillis * 1_000_000);
        Entry previous = entries.putIfAbsent(command.startAttemptId(), candidate);
        Entry entry = previous == null ? candidate : previous;
        if (!entry.command().equals(command)) {
            return GameStartResult.conflict(command.startAttemptId());
        }
        if (scenario == Scenario.DELAYED_SUCCESS) {
            return result(entry);
        }
        try {
            Thread.sleep(delayMillis);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("검증 요청 대기 종료", exception);
        }
        return result(entry);
    }

    @Override
    public GameStartResult findStartResult(UUID startAttemptId) {
        Entry entry = entries.get(startAttemptId);
        return entry == null ? GameStartResult.pending(startAttemptId) : result(entry);
    }

    private GameStartResult result(Entry entry) {
        if (scenario == Scenario.REJECT) {
            return GameStartResult.rejected(entry.command().startAttemptId(), "INSUFFICIENT_BALANCE");
        }
        if (scenario == Scenario.DELAYED_SUCCESS && System.nanoTime() - entry.readyAtNanos() < 0) {
            return GameStartResult.pending(entry.command().startAttemptId());
        }
        return GameStartResult.succeeded(entry.command(), entry.gameSessionId());
    }

    public enum Scenario {
        SUCCESS, REJECT, DELAYED_SUCCESS
    }

    private record Entry(GameStartCommand command, String gameSessionId, long readyAtNanos) {
    }
}
