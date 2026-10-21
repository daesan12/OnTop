package com.ssafy.ontop.game.reconnect;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway.Action;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway.GraceExpiration;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot.Phase;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("local")
public class GameReconnectService {

    private static final Duration GRACE = Duration.ofSeconds(30);

    private final Optional<GameRecoveryGateway> gateway;
    private final Clock clock;
    private final Map<Long, Slot> users = new HashMap<>();
    private final ExecutorService workers = Executors.newVirtualThreadPerTaskExecutor();
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().daemon(true).name("game-reconnect-timer").factory());
    private boolean stopped;

    public GameReconnectService(Optional<GameRecoveryGateway> gateway, Optional<Clock> clock) {
        this.gateway = gateway;
        this.clock = clock.orElseGet(Clock::systemUTC);
        timer.scheduleWithFixedDelay(this::checkTimeouts, 1, 1, TimeUnit.SECONDS);
    }

    public synchronized void connected(long userId, String sessionId, BiConsumer<String, View> output) {
        if (gateway.isEmpty() || stopped) {
            return;
        }
        Slot slot = users.computeIfAbsent(userId, Slot::new);
        slot.generation++;
        slot.sessionId = sessionId;
        slot.output = output;
        slot.returnedInTime = slot.deadline != null && clock.instant().isBefore(slot.deadline)
                && slot.expiration == null;
        slot.loading = false;
        submitLoad(slot, null);
    }

    public synchronized void disconnected(long userId, String sessionId) {
        Slot slot = users.get(userId);
        if (slot == null || !sessionId.equals(slot.sessionId)) {
            return;
        }
        slot.sessionId = null;
        slot.output = null;
        if (slot.deadline == null) {
            slot.disconnectedAt = clock.instant();
            slot.deadline = slot.disconnectedAt.plus(GRACE);
        }
        slot.returnedInTime = false;
        // 경기 시작 이후 상태가 달라졌을 수 있어 종료 감지 때도 실제 경기 담당에게 조회한다.
        if (!slot.loading) {
            submitLoad(slot, null);
        }
    }

    public synchronized boolean canUseLobby(long userId, String sessionId) {
        if (gateway.isEmpty()) {
            return true;
        }
        Slot slot = users.get(userId);
        return slot != null && sessionId.equals(slot.sessionId)
                && (slot.status.equals("LOBBY") || slot.status.equals("FINISHED")
                        || slot.status.equals("ELIMINATED"));
    }

    public synchronized void startPending(long userId) {
        if (gateway.isPresent()) { users.computeIfAbsent(userId, Slot::new).pendingStart = true; }
    }

    public synchronized void startResolved(long userId) {
        Slot slot = users.get(userId);
        if (slot == null || stopped || gateway.isEmpty()) { return; }
        slot.pendingStart = false;
        // 시작 전 LOBBY 조회가 늦게 끝나 새 경기 상태를 덮지 못하게 한다.
        slot.generation++;
        slot.loading = false;
        submitLoad(slot, null);
    }

    // 경기 입력 담당이 사용한다. 복구 완료한 현재 연결만 해당 경기를 조작할 수 있다.
    public synchronized boolean canControlGame(long userId, String sessionId, String gameId) {
        Slot slot = users.get(userId);
        return slot != null && sessionId.equals(slot.sessionId) && slot.status.equals("RESTORED")
                && slot.snapshot != null && slot.snapshot.gameId().equals(gameId);
    }

    public synchronized void refresh(long userId, String sessionId, String requestId,
            BiConsumer<String, View> output) {
        if (gateway.isEmpty()) {
            output.accept(requestId, new View("UNAVAILABLE", null, null, null, null, "RECOVERY_NOT_CONFIGURED"));
            return;
        }
        Slot slot = users.get(userId);
        if (slot != null && sessionId.equals(slot.sessionId)) {
            submitLoad(slot, requestId);
        }
    }

    // 생산에서는 타이머가 호출하며, 테스트에서는 Clock을 진행시켜 30초 경계를 직접 확인한다.
    public synchronized void checkTimeouts() {
        if (stopped || gateway.isEmpty()) {
            return;
        }
        for (Slot slot : new ArrayList<>(users.values())) {
            if (slot.sessionId != null || slot.deadline == null || clock.instant().isBefore(slot.deadline)) {
                continue;
            }
            if (slot.snapshot != null && slot.snapshot.phase() == Phase.PLAYING) {
                GraceExpiration command = expiration(slot, slot.snapshot);
                if (slot.expirationResult == null || slot.expirationResult.isCompletedExceptionally()) {
                    workers.execute(() -> {
                        try {
                            expire(slot, command);
                        } catch (RuntimeException ignored) {
                            // 같은 eventId로 다음 검사에서 재시도한다. 실패를 복귀 허용으로 바꾸지 않는다.
                        }
                    });
                } else if (slot.expirationResult.isDone() && !slot.loading) {
                    // 만료 요청 성공 이후 실제 종료를 확인해 오프라인 상태를 정리한다.
                    submitLoad(slot, null);
                }
            } else if (!slot.loading) {
                submitLoad(slot, null);
            }
        }
    }

    private void submitLoad(Slot slot, String requestId) {
        slot.status = "PENDING";
        emit(slot, requestId, new View("PENDING", null, null, null, slot.deadline, null));
        if (slot.loading) {
            return;
        }
        slot.loading = true;
        long generation = slot.generation;
        workers.execute(() -> load(slot, generation, requestId));
    }

    private void load(Slot slot, long generation, String requestId) {
        try {
            Optional<GameRecoverySnapshot> result = gateway.orElseThrow().load(slot.userId);
            validate(slot, result);
            GraceExpiration overdue = null;
            synchronized (this) {
                if (!current(slot, generation)) {
                    return;
                }
                if (result.isPresent() && result.get().phase() == Phase.PLAYING && slot.deadline != null
                        && !slot.returnedInTime && !clock.instant().isBefore(slot.deadline)) {
                    overdue = expiration(slot, result.get());
                }
            }
            if (overdue != null) {
                expire(slot, overdue);
                result = gateway.orElseThrow().load(slot.userId);
                validate(slot, result);
            }
            synchronized (this) {
                if (!current(slot, generation)) {
                    return;
                }
                slot.loading = false;
                apply(slot, result, requestId);
            }
        } catch (RuntimeException exception) {
            synchronized (this) {
                if (current(slot, generation)) {
                    slot.loading = false;
                    slot.status = "UNAVAILABLE";
                    emit(slot, requestId, new View("UNAVAILABLE", null, null, null,
                            slot.deadline, "RECOVERY_UNAVAILABLE"));
                }
            }
        }
    }

    private synchronized void validate(Slot slot, Optional<GameRecoverySnapshot> result) {
        if (result.isPresent()) {
            GameRecoverySnapshot next = result.get();
            if (next.userId() != slot.userId || slot.snapshot != null
                    && slot.snapshot.gameId().equals(next.gameId()) && next.version() < slot.snapshot.version()) {
                throw new IllegalStateException("복구 대상 또는 상태 버전 불일치");
            }
        }
    }

    private void apply(Slot slot, Optional<GameRecoverySnapshot> result, String requestId) {
        slot.snapshot = result.orElse(null);
        if (slot.snapshot == null) {
            slot.status = "LOBBY";
        } else if (slot.expiration != null && slot.snapshot.gameId().equals(slot.expiration.gameId())
                && slot.snapshot.phase() == Phase.PLAYING) {
            slot.status = "EXPIRED";
        } else {
            slot.status = slot.snapshot.phase() == Phase.PLAYING ? "RESTORED" : slot.snapshot.phase().name();
        }
        if (slot.sessionId == null) {
            if (!slot.pendingStart && (slot.snapshot == null || slot.snapshot.phase() != Phase.PLAYING)) {
                users.remove(slot.userId, slot);
            }
            return;
        }
        if (!slot.status.equals("EXPIRED") && !(slot.pendingStart
                && (slot.snapshot == null || slot.snapshot.phase() != Phase.PLAYING))) {
            slot.deadline = null;
            slot.disconnectedAt = null;
            slot.expiration = null;
            slot.expirationResult = null;
            slot.returnedInTime = false;
        }
        boolean expose = slot.snapshot != null && !slot.status.equals("EXPIRED");
        emit(slot, requestId, new View(slot.status, expose ? slot.snapshot.gameId() : null,
                expose ? slot.snapshot.version() : null, expose ? slot.snapshot.state() : null,
                slot.deadline, slot.status.equals("EXPIRED") ? "RECONNECT_EXPIRED" : null));
    }

    private GraceExpiration expiration(Slot slot, GameRecoverySnapshot snapshot) {
        if (slot.expiration == null) {
            slot.expiration = new GraceExpiration(UUID.randomUUID(), slot.userId, snapshot.gameId(),
                    slot.disconnectedAt, slot.deadline,
                    snapshot.participantCount() == 2 ? Action.FORFEIT : Action.ELIMINATE);
        }
        return slot.expiration;
    }

    private void expire(Slot slot, GraceExpiration command) {
        CompletableFuture<Void> result;
        boolean owner;
        synchronized (this) {
            if (stopped || users.get(slot.userId) != slot || slot.expiration != command) {
                return;
            }
            owner = slot.expirationResult == null || slot.expirationResult.isCompletedExceptionally();
            if (owner) {
                slot.expirationResult = new CompletableFuture<>();
            }
            result = slot.expirationResult;
        }
        if (owner) {
            try {
                gateway.orElseThrow().graceExpired(command);
                result.complete(null);
            } catch (RuntimeException exception) {
                result.completeExceptionally(exception);
                throw exception;
            }
        } else {
            result.join();
        }
    }

    private boolean current(Slot slot, long generation) {
        return !stopped && users.get(slot.userId) == slot && slot.generation == generation;
    }

    private void emit(Slot slot, String requestId, View view) {
        if (slot.sessionId != null && slot.output != null) {
            slot.output.accept(requestId, view);
        }
    }

    @PreDestroy
    public synchronized void shutdown() {
        stopped = true;
        users.clear();
        timer.shutdownNow();
        workers.shutdownNow();
    }

    public record View(String status, String gameId, Long version, JsonNode state,
            Instant reconnectUntil, String code) {
    }

    private static final class Slot {
        private final long userId;
        private String sessionId;
        private BiConsumer<String, View> output;
        private long generation;
        private boolean loading;
        private boolean returnedInTime;
        private boolean pendingStart;
        private String status = "PENDING";
        private Instant disconnectedAt;
        private Instant deadline;
        private GameRecoverySnapshot snapshot;
        private GraceExpiration expiration;
        private CompletableFuture<Void> expirationResult;

        private Slot(long userId) {
            this.userId = userId;
        }
    }
}
