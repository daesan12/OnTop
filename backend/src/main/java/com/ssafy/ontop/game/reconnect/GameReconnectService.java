package com.ssafy.ontop.game.reconnect;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.auth.service.AuthenticationRevocations.Revoked;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway.Action;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway.GraceExpiration;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot.Phase;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.start.GameRuntimeIdentity;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionalEventListener;

@Service
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
public class GameReconnectService {

    private static final Duration GRACE = Duration.ofSeconds(30);
    private static final Logger log = LoggerFactory.getLogger(GameReconnectService.class);

    private final Optional<GameRecoveryGateway> gateway;
    private final Optional<ActiveGameLookup> activeGames;
    private final Optional<GameRuntimeIdentity> runtimeIdentity;
    private final Clock clock;
    private final Map<Long, Slot> users = new HashMap<>();
    private final ExecutorService workers = Executors.newVirtualThreadPerTaskExecutor();
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().daemon(true).name("game-reconnect-timer").factory());
    private boolean stopped;

    public GameReconnectService(Optional<GameRecoveryGateway> gateway, Optional<Clock> clock) {
        this(gateway, clock, Optional.empty(), Optional.empty());
    }

    @Autowired
    public GameReconnectService(Optional<GameRecoveryGateway> gateway, Optional<Clock> clock,
            Optional<ActiveGameLookup> activeGames, Optional<GameRuntimeIdentity> runtimeIdentity) {
        this.gateway = gateway;
        this.activeGames = activeGames;
        this.runtimeIdentity = runtimeIdentity;
        this.clock = clock.orElseGet(Clock::systemUTC);
        timer.scheduleWithFixedDelay(this::checkTimeouts, 1, 1, TimeUnit.SECONDS);
    }

    public synchronized void connected(long userId, String sessionId, BiConsumer<String, View> output) {
        connected(userId, sessionId, null, output);
    }

    public synchronized void connected(long userId, String sessionId, String loginSessionId,
            BiConsumer<String, View> output) {
        connected(userId, sessionId, loginSessionId, output, game -> true);
    }

    public synchronized void connected(long userId, String sessionId, String loginSessionId,
            BiConsumer<String, View> output, java.util.function.Predicate<String> finishedAllowed) {
        if (!recoveryConfigured() || stopped) {
            return;
        }
        Slot slot = users.computeIfAbsent(userId, Slot::new);
        slot.generation++;
        slot.sessionId = sessionId;
        slot.loginSessionId = loginSessionId;
        slot.authenticationClosed = false;
        slot.pendingDeparture = null;
        slot.output = output;
        slot.finishedAllowed = finishedAllowed;
        slot.returnedInTime = slot.deadline != null && clock.instant().isBefore(slot.deadline)
                && slot.expiration == null;
        slot.loading = false;
        submitLoad(slot, null);
    }

    /** 퇴장은 이력을 지우지 않는다. 늦은 이전 조회를 무효화하고 현재 연결의 복구만 다시 판정한다. */
    public synchronized void tableLeft(long userId, String sessionId) {
        Slot slot = users.get(userId);
        if (stopped || !recoveryConfigured() || slot == null || !sessionId.equals(slot.sessionId)) { return; }
        slot.generation++;
        slot.loading = false;
        if (slot.snapshot != null && slot.snapshot.phase() == Phase.FINISHED) { slot.snapshot = null; }
        submitLoad(slot, null);
    }

    public synchronized void disconnected(long userId, String sessionId) {
        disconnected(userId, sessionId, GameDepartureReason.DISCONNECT_TIMEOUT);
    }

    public synchronized void disconnected(long userId, String sessionId, GameDepartureReason reason) {
        disconnected(userId, sessionId, reason, reason != GameDepartureReason.DISCONNECT_TIMEOUT);
    }

    public synchronized void disconnected(long userId, String sessionId, GameDepartureReason reason,
            boolean authenticationClosed) {
        java.util.Objects.requireNonNull(reason);
        Slot slot = users.get(userId);
        if (slot == null || !sessionId.equals(slot.sessionId)) {
            return;
        }
        slot.authenticationClosed = authenticationClosed;
        // 인증 레지스트리가 선점한 종료 사유를 우선한다. 단절 콜백과 로그아웃의 순서만 보정한다.
        if (!authenticationClosed && slot.pendingDeparture != null) {
            reason = slot.pendingDeparture;
        }
        slot.pendingDeparture = null;
        slot.sessionId = null;
        slot.output = null;
        if (slot.deadline == null || reason != GameDepartureReason.DISCONNECT_TIMEOUT) {
            slot.disconnectedAt = clock.instant();
            slot.deadline = reason == GameDepartureReason.DISCONNECT_TIMEOUT
                    ? slot.disconnectedAt.plus(GRACE) : slot.disconnectedAt;
            slot.departureReason = reason;
        }
        slot.returnedInTime = false;
        // 경기 시작 이후 상태가 달라졌을 수 있어 종료 감지 때도 실제 경기 담당에게 조회한다.
        if (!slot.loading) {
            submitLoad(slot, null);
        }
        if (reason != GameDepartureReason.DISCONNECT_TIMEOUT) {
            checkTimeouts();
        }
    }

    @TransactionalEventListener
    public synchronized void authenticationRevoked(Revoked event) {
        GameDepartureReason reason = switch (event.reason()) {
            case LOGOUT -> GameDepartureReason.LOGOUT;
            case MEMBER_DEACTIVATED -> GameDepartureReason.MEMBER_DEACTIVATED;
            default -> null;
        };
        Slot slot = users.get(event.userId());
        if (reason == null || stopped || slot == null || slot.authenticationClosed
                || slot.expiration != null || slot.departureReason != GameDepartureReason.DISCONNECT_TIMEOUT
                || slot.loginSessionId == null
                || event.sessionId() != null && !event.sessionId().equals(slot.loginSessionId)) {
            return;
        }
        if (slot.sessionId != null) {
            // 살아 있는 소켓의 종료는 기존 인증 담당이 처리한다. 늦은 Hub 정리에만 이 사유를 쓴다.
            if (slot.pendingDeparture == null) { slot.pendingDeparture = reason; }
            return;
        }
        slot.departureReason = reason;
        slot.disconnectedAt = clock.instant();
        slot.deadline = slot.disconnectedAt;
        slot.returnedInTime = false;
        checkTimeouts();
    }

    public synchronized boolean canUseLobby(long userId, String sessionId) {
        if (!recoveryConfigured()) {
            return true;
        }
        Slot slot = users.get(userId);
        return slot != null && sessionId.equals(slot.sessionId)
                && (slot.status.equals("LOBBY") || slot.status.equals("FINISHED")
                        || slot.status.equals("ELIMINATED"));
    }

    public synchronized void startPending(long userId) {
        if (recoveryConfigured()) { users.computeIfAbsent(userId, Slot::new).pendingStart = true; }
    }

    public synchronized void startResolved(long userId) {
        Slot slot = users.get(userId);
        if (slot == null || stopped || !recoveryConfigured()) { return; }
        slot.pendingStart = false;
        // 시작 전 LOBBY 조회가 늦게 끝나 새 경기 상태를 덮지 못하게 한다.
        slot.generation++;
        slot.loading = false;
        submitLoad(slot, null);
    }

    /**
     * 정산 완료로 테이블이 대기 상태가 된 뒤 정산 전 판정만 다시 조회한다.
     * 결과는 기존 DB·엔진 대조를 그대로 따르며, 정산 통지만으로 LOBBY나 FINISHED를 만들지 않는다.
     */
    public synchronized void roundSettled(long userId) {
        Slot slot = users.get(userId);
        if (stopped || !recoveryConfigured() || slot == null || slot.sessionId == null || slot.pendingStart) {
            return;
        }
        if (slot.status.equals("UNAVAILABLE")) {
            slot.generation++;
            slot.loading = false;
            submitLoad(slot, null);
        } else if (slot.status.equals("PENDING")) {
            // 정산 커밋 전에 읽었을 수 있는 조회를 버리고, 원래 요청 ID로 다시 읽는다.
            slot.generation++;
            startLoad(slot, slot.loadRequestId);
        }
    }

    // 경기 입력 담당이 사용한다. 복구 완료한 현재 연결만 해당 경기를 조작할 수 있다.
    public synchronized boolean canControlGame(long userId, String sessionId, String gameId) {
        Slot slot = users.get(userId);
        return slot != null && sessionId.equals(slot.sessionId) && slot.status.equals("RESTORED")
                && slot.snapshot != null && slot.snapshot.gameId().equals(gameId);
    }

    // 종료·탈락 후에도 동일 경기의 기권 영수증을 재확인할 수 있다. 새 경기에는 적용하지 않는다.
    public synchronized boolean canForfeitGame(long userId, String sessionId, String gameId) {
        Slot slot = users.get(userId);
        return slot != null && sessionId.equals(slot.sessionId)
                && (slot.status.equals("LOBBY") && !slot.pendingStart && gameId.equals(slot.finishedReceiptGameId)
                    || slot.snapshot != null && slot.snapshot.gameId().equals(gameId)
                        && (slot.status.equals("RESTORED") || slot.status.equals("FINISHED")
                            || slot.status.equals("ELIMINATED")));
    }

    // 기권 전 시작한 느린 조회가 기권 후 참가 자격을 되살리지 못하게 세대를 교체한다.
    public synchronized void forfeitResolved(long userId, String sessionId) {
        Slot slot = users.get(userId);
        if (stopped || !recoveryConfigured() || slot == null || !sessionId.equals(slot.sessionId)) { return; }
        slot.generation++;
        slot.loading = false;
        submitLoad(slot, null);
    }

    public synchronized void refresh(long userId, String sessionId, String requestId,
            BiConsumer<String, View> output) {
        if (!recoveryConfigured()) {
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
        if (stopped || !recoveryConfigured()) {
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
        startLoad(slot, requestId);
    }

    private void startLoad(Slot slot, String requestId) {
        slot.loading = true;
        slot.loadRequestId = requestId;
        long generation = slot.generation;
        workers.execute(() -> load(slot, generation, requestId));
    }

    private boolean recoveryConfigured() {
        return gateway.isPresent() || activeGames.isPresent();
    }

    private void load(Slot slot, long generation, String requestId) {
        try {
            RecoveryRead read = loadConsistent(slot.userId);
            Optional<GameRecoverySnapshot> result = read.snapshot();
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
                read = loadConsistent(slot.userId);
                result = read.snapshot();
                validate(slot, result);
            }
            synchronized (this) {
                if (!current(slot, generation)) {
                    return;
                }
                slot.loading = false;
                apply(slot, result, read.activeMarker(), requestId);
            }
        } catch (RuntimeException exception) {
            RecoveryFailure failure = exception instanceof RecoveryConsistencyException consistency
                    ? consistency.failure : RecoveryFailure.ENGINE_LOOKUP_FAILED;
            log.warn("경기 복구 불가: reason={}, category={}", failure,
                    exception.getClass().getSimpleName());
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

    private RecoveryRead loadConsistent(long userId) {
        if (activeGames.isEmpty()) {
            return new RecoveryRead(gateway.orElseThrow().load(userId), false);
        }
        if (runtimeIdentity.isEmpty()) {
            throw new RecoveryConsistencyException(RecoveryFailure.RUNTIME_IDENTITY_MISSING);
        }
        Optional<ActiveGameRecord> active;
        try {
            active = activeGames.orElseThrow().findByUserId(userId);
        } catch (RuntimeException exception) {
            throw new RecoveryConsistencyException(RecoveryFailure.DB_LOOKUP_FAILED, exception);
        }
        if (gateway.isEmpty()) {
            if (active.isEmpty()) {
                return new RecoveryRead(Optional.empty(), false);
            }
            throw new RecoveryConsistencyException(RecoveryFailure.ENGINE_LOOKUP_FAILED);
        }
        Optional<GameRecoverySnapshot> engine;
        try {
            engine = gateway.orElseThrow().load(userId);
        } catch (RuntimeException exception) {
            throw new RecoveryConsistencyException(RecoveryFailure.ENGINE_LOOKUP_FAILED, exception);
        }
        return new RecoveryRead(reconcile(active, engine), active.isPresent());
    }

    private Optional<GameRecoverySnapshot> reconcile(Optional<ActiveGameRecord> active,
            Optional<GameRecoverySnapshot> engine) {
        if (active.isEmpty()) {
            if (engine.isPresent() && engine.get().phase() != Phase.FINISHED) {
                throw new RecoveryConsistencyException(RecoveryFailure.DB_RECORD_MISSING);
            }
            // 정산 커밋이 활성 마커를 먼저 해제한 직후에도 기존 종료 영수증은 그대로 전달할 수 있다.
            return engine;
        }
        ActiveGameRecord record = active.get();
        GameRuntimeIdentity identity = runtimeIdentity.orElseThrow();
        if (!record.ownedBy(identity.instanceId(), identity.bootId())) {
            throw new RecoveryConsistencyException(RecoveryFailure.OWNER_MISMATCH);
        }
        if (engine.isEmpty()) {
            throw new RecoveryConsistencyException(RecoveryFailure.ENGINE_MISSING);
        }
        GameRecoverySnapshot snapshot = engine.get();
        if (!record.gameId().equals(snapshot.gameId())) {
            throw new RecoveryConsistencyException(RecoveryFailure.GAME_MISMATCH);
        }
        if (record.settlementStatus() != GameSession.SettlementStatus.PENDING) {
            // SETTLED인데 active_user_id가 남아 있으면 정상 정산 완료로 묵인하지 않는다.
            throw new RecoveryConsistencyException(RecoveryFailure.ACTIVE_MARKER_INVALID);
        }
        switch (record.status()) {
            case RESERVED, RUNNING -> {
                // 엔진 종료와 DB 판정 수신 사이의 짧은 경합에서는 FINISHED snapshot도 유효하다.
            }
            case FINISHED, INVALID -> {
                if (snapshot.phase() != Phase.FINISHED) {
                    throw new RecoveryConsistencyException(RecoveryFailure.TERMINAL_STATE_MISMATCH);
                }
            }
            default -> throw new RecoveryConsistencyException(RecoveryFailure.ACTIVE_MARKER_INVALID);
        }
        return engine;
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

    private void apply(Slot slot, Optional<GameRecoverySnapshot> result, boolean activeMarker, String requestId) {
        // 종료 이력은 활성 복구와 분리한다. 기존 기권 영수증 재확인 권한은 유지한다.
        slot.finishedReceiptGameId = result.filter(snapshot -> snapshot.phase() == Phase.FINISHED)
                .map(GameRecoverySnapshot::gameId).orElse(null);
        boolean hiddenActiveTerminal = activeMarker && result.filter(snapshot -> snapshot.phase() == Phase.FINISHED)
                .filter(snapshot -> !slot.finishedAllowed.test(snapshot.gameId())).isPresent();
        result = result.filter(snapshot -> snapshot.phase() != Phase.FINISHED
                || slot.finishedAllowed.test(snapshot.gameId()));
        slot.snapshot = result.orElse(null);
        if (hiddenActiveTerminal) {
            // DB 예약이 남은 종결 경기를 현재 테이블 이력 부재만으로 LOBBY라고 하지 않는다.
            slot.status = "UNAVAILABLE";
        } else if (slot.snapshot == null) {
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
                slot.deadline, slot.status.equals("EXPIRED") ? "RECONNECT_EXPIRED"
                        : slot.status.equals("UNAVAILABLE") ? "RECOVERY_UNAVAILABLE" : null));
    }

    private GraceExpiration expiration(Slot slot, GameRecoverySnapshot snapshot) {
        if (slot.expiration == null) {
            slot.expiration = new GraceExpiration(UUID.randomUUID(), slot.userId, snapshot.gameId(),
                    slot.disconnectedAt, slot.deadline,
                    snapshot.participantCount() == 2 ? Action.FORFEIT : Action.ELIMINATE, slot.departureReason);
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

    private record RecoveryRead(Optional<GameRecoverySnapshot> snapshot, boolean activeMarker) {
    }

    private static final class Slot {
        private final long userId;
        private String sessionId;
        private String loginSessionId;
        private boolean authenticationClosed;
        private GameDepartureReason pendingDeparture;
        private BiConsumer<String, View> output;
        private java.util.function.Predicate<String> finishedAllowed = game -> true;
        private long generation;
        private boolean loading;
        private String loadRequestId;
        private boolean returnedInTime;
        private boolean pendingStart;
        private String status = "PENDING";
        private Instant disconnectedAt;
        private Instant deadline;
        private GameDepartureReason departureReason = GameDepartureReason.DISCONNECT_TIMEOUT;
        private GameRecoverySnapshot snapshot;
        private String finishedReceiptGameId;
        private GraceExpiration expiration;
        private CompletableFuture<Void> expirationResult;

        private Slot(long userId) {
            this.userId = userId;
        }
    }

    private enum RecoveryFailure {
        DB_LOOKUP_FAILED,
        ENGINE_LOOKUP_FAILED,
        RUNTIME_IDENTITY_MISSING,
        DB_RECORD_MISSING,
        ENGINE_MISSING,
        GAME_MISMATCH,
        OWNER_MISMATCH,
        ACTIVE_MARKER_INVALID,
        TERMINAL_STATE_MISMATCH
    }

    private static final class RecoveryConsistencyException extends RuntimeException {
        private final RecoveryFailure failure;

        private RecoveryConsistencyException(RecoveryFailure failure) {
            this.failure = failure;
        }

        private RecoveryConsistencyException(RecoveryFailure failure, RuntimeException cause) {
            super(cause);
            this.failure = failure;
        }
    }
}
