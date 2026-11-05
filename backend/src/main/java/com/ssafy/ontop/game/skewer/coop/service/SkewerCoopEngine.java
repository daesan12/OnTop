package com.ssafy.ontop.game.skewer.coop.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.action.GameForfeitResult;
import com.ssafy.ontop.game.engine.GameEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.result.GameLifecycle;
import com.ssafy.ontop.game.skewer.coop.domain.SkewerCoopMatch;
import com.ssafy.ontop.game.skewer.coop.domain.SkewerCoopRoomAccess;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateView;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiPredicate;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** 무료 경기 엔진. 소켓·인증·복구는 공통 경로를 사용하고 실제 지갑이나 DB를 수정하지 않는다. */
public final class SkewerCoopEngine implements GameEngine {
    private static final Logger log = LoggerFactory.getLogger(SkewerCoopEngine.class);
    private static final long PASSWORD_FAILURE_WINDOW_MILLIS = 30_000;
    private static final long PASSWORD_CLEANUP_INTERVAL_MILLIS = 1_000;
    private static final int MAX_PASSWORD_FAILURES = 5;
    private static final long CANCELLED_RETENTION_MILLIS = 60_000;
    private static final long FINISHED_RETENTION_MILLIS = 30 * 60_000;
    private static final int MAX_RETAINED_ROOMS = 1024;
    private final Consumer<SkewerCoopFinished> recordResult;
    private final Map<String, SkewerCoopFinished> terminalResults = new HashMap<>();
    private final Map<String, Long> terminalRetryAt = new HashMap<>();
    private final Map<String, Long> retireAt = new HashMap<>();
    private final AtomicBoolean terminalWriterRunning = new AtomicBoolean();
    private final ObjectMapper mapper;
    private final Clock clock;
    private final GameEngineRouter router;
    private final Consumer<Object> events;
    private final Consumer<Long> recoveryChanged;
    private final BiPredicate<Long, String> connected;
    private final BooleanSupplier newActivityAllowed;
    private final Random random;
    private final double duration;
    private final Map<String, SkewerCoopMatch> games = new LinkedHashMap<>();
    private final Map<String, SkewerCoopRoomAccess> roomAccess = new HashMap<>();
    private final Map<Long, List<Long>> passwordAttempts = new HashMap<>();
    private final Set<Long> passwordChecks = new HashSet<>();
    private long nextPasswordCleanupAt;
    private final Map<Long, String> latest = new HashMap<>();
    private final Map<Long, String> recoveryLatest = new HashMap<>();
    private final Map<String, String> creations = new HashMap<>();
    // 경기 수명과 영수증 수명을 함께 관리해 만료 시 다른 경기의 영수증을 순회하지 않는다.
    private final Map<String, Map<String, Receipt>> receipts = new HashMap<>();
    private final Map<String, Map<String, GameForfeitResult>> forfeits = new HashMap<>();
    private final Set<String> completed = new HashSet<>();
    private final Set<String> dismissed = new HashSet<>();
    private final GameLifecycle lifecycle = new GameLifecycle();

    public SkewerCoopEngine(ObjectMapper mapper, Clock clock, GameEngineRouter router, Consumer<Object> events,
            Consumer<Long> recoveryChanged, BiPredicate<Long, String> connected, Random random, double duration) {
        this(mapper, clock, router, events, recoveryChanged, connected, random, duration, result -> { }, () -> true);
    }

    public SkewerCoopEngine(ObjectMapper mapper, Clock clock, GameEngineRouter router, Consumer<Object> events,
            Consumer<Long> recoveryChanged, BiPredicate<Long, String> connected, Random random, double duration,
            Consumer<SkewerCoopFinished> recordResult) {
        this(mapper, clock, router, events, recoveryChanged, connected, random, duration, recordResult, () -> true);
    }

    public SkewerCoopEngine(ObjectMapper mapper, Clock clock, GameEngineRouter router, Consumer<Object> events,
            Consumer<Long> recoveryChanged, BiPredicate<Long, String> connected, Random random, double duration,
            Consumer<SkewerCoopFinished> recordResult, BooleanSupplier newActivityAllowed) {
        this.recordResult = recordResult;
        this.newActivityAllowed = newActivityAllowed;
        this.mapper = mapper;
        this.clock = clock;
        this.router = router;
        this.events = events;
        this.recoveryChanged = recoveryChanged;
        this.connected = connected;
        this.random = random;
        this.duration = duration;
    }

    public ObjectNode create(long user, String channel, String key) {
        return create(user, channel, key, "함께 여는 꼬치집", "방장", "");
    }

    public ObjectNode create(long user, String channel, String key, String name, String nickname, String password) {
        if (user <= 0 || channel == null || channel.isBlank() || channel.length() > 64
                || key == null || !key.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new IllegalArgumentException("공원과 중복 방지 키를 확인해주세요.");
        }
        // 비용이 큰 비밀번호 해시는 게임 입력·틱의 공유 락 밖에서 계산한다.
        SkewerCoopRoomAccess access = new SkewerCoopRoomAccess(name, nickname, password);
        synchronized (this) {
            String previous = creations.get(user + ":" + key);
            if (previous != null) {
                SkewerCoopMatch existing = requireMember(user, previous);
                if (!existing.channelId.equals(channel)) {
                    throw new IllegalStateException("같은 생성 요청의 채널이 달라졌어요.");
                }
                return room(user, existing);
            }
            if (games.size() >= MAX_RETAINED_ROOMS || current(user).filter(this::occupiesRoom).isPresent()
                    || games.values().stream().filter(this::occupiesRoom).count() >= 64) {
                throw new IllegalStateException("기존 방을 나가거나 잠시 후 다시 시도해주세요.");
            }
            String id = "skewer-coop-" + UUID.randomUUID();
            SkewerCoopMatch match = new SkewerCoopMatch(id, channel, user, mapper, random, clock.millis(), duration);
            games.put(id, match);
            roomAccess.put(id, access);
            latest.put(user, id);
            creations.put(user + ":" + key, id);
            return room(user, match);
        }
    }

    public ObjectNode join(long user, String channel, String id) {
        return join(user, channel, id, "");
    }

    public ObjectNode join(long user, String channel, String id, String password) {
        SkewerCoopRoomAccess.validatePassword(password);
        SkewerCoopRoomAccess access;
        boolean member;
        synchronized (this) {
            SkewerCoopMatch candidate = requireJoinableRoom(user, channel, id);
            access = roomAccess.get(id);
            member = candidate.contains(user);
            if (!member && access.locked()) {
                long now = clock.millis();
                List<Long> attempts = passwordAttempts.get(user);
                if (attempts != null) {
                    attempts.removeIf(at -> now - at >= PASSWORD_FAILURE_WINDOW_MILLIS);
                    if (attempts.isEmpty()) {
                        passwordAttempts.remove(user);
                    }
                }
                if ((attempts != null && attempts.size() >= MAX_PASSWORD_FAILURES) || !passwordChecks.add(user)) {
                    throw new SkewerCoopRoomAccess.PasswordRejected(true);
                }
            }
        }
        if (!member && access.locked()) {
            boolean verified = false;
            boolean accepted = false;
            try {
                // 해시는 공유 락 밖에서 계산하되 사용자별 진행 중 검증은 하나만 허용한다.
                accepted = access.accepts(password);
                verified = true;
            } finally {
                synchronized (this) {
                    passwordChecks.remove(user);
                    if (verified && accepted) {
                        passwordAttempts.remove(user);
                    } else if (verified) {
                        passwordAttempts.computeIfAbsent(user, ignored -> new ArrayList<>()).add(clock.millis());
                    }
                }
            }
            if (!accepted) {
                throw new SkewerCoopRoomAccess.PasswordRejected(false);
            }
        }
        SkewerCoopMatch match;
        synchronized (this) {
            match = requireJoinableRoom(user, channel, id);
            if (current(user).filter(value -> value != match && occupiesRoom(value)).isPresent()) {
                throw new IllegalStateException("같은 공원의 참가 가능한 방을 선택해주세요.");
            }
            if (!match.registered() && match.players().size() == 1 && !match.contains(user)) {
                var participants = new ArrayList<>(match.players());
                participants.add(user);
                router.register(this, id, "vr:" + id, participants);
                match.registered(true);
            }
            match.join(user);
            latest.put(user, id);
            if (match.registered()) {
                match.players().forEach(player -> recoveryLatest.put(player, id));
            }
        }
        if (match.registered()) {
            match.players().forEach(recoveryChanged);
            events.accept(new GameStateChanged(match.id, match.version));
        }
        synchronized (this) {
            return room(user, match);
        }
    }

    public synchronized boolean owns(long user, String channel) {
        return current(user).filter(match -> match.channelId.equals(channel) && !match.finished()).isPresent();
    }

    public synchronized List<Long> waitingPlayers(String channel, String id) {
        SkewerCoopMatch match = games.get(id);
        if (match == null || !match.channelId.equals(channel)) {
            throw new IllegalStateException("같은 공원의 방을 선택해주세요.");
        }
        return match.registered() ? List.of() : match.players();
    }

    public synchronized ObjectNode rooms(long user, String channel) {
        ObjectNode result = mapper.createObjectNode();
        result.put("gameCode", SkewerCoopMatch.CODE).put("entryFee", 0);
        result.set("rooms", mapper.valueToTree(games.values().stream()
                .filter(match -> match.channelId.equals(channel) && !match.finished()
                        && (match.players().size() < 2 || match.contains(user)))
                .map(match -> Map.of("gameId", match.id, "players", match.players().size(),
                        "mine", match.contains(user), "roomName", roomAccess.get(match.id).name(),
                        "hostNickname", roomAccess.get(match.id).hostNickname(), "locked", roomAccess.get(match.id).locked()))
                .limit(64).toList()));
        result.set("mine", current(user).filter(match -> match.channelId.equals(channel)
                        && !dismissed.contains(user + ":" + match.id))
                .map(match -> room(user, match)).orElse(null));
        return result;
    }

    public void leaveWaiting(long user, String id) {
        SkewerCoopMatch match;
        boolean cancelled;
        synchronized (this) {
            match = requireMember(user, id);
            cancelled = match.waiting();
            if (!cancelled && !match.finished()) {
                throw new IllegalStateException("공동 경기는 기권으로 종료해주세요.");
            }
            if (cancelled) {
                match.finish("SKEWER_CANCELLED");
                completed.add(id);
                retireAt.putIfAbsent(id, clock.millis() + CANCELLED_RETENTION_MILLIS);
                if (match.registered()) router.finished(this, id);
            }
            dismissed.add(user + ":" + id);
        }
        if (cancelled && match.registered()) {
            match.players().forEach(recoveryChanged);
            events.accept(new GameStateChanged(match.id, match.version));
        }
    }

    private ObjectNode room(long user, SkewerCoopMatch match) {
        ObjectNode result = mapper.createObjectNode();
        result.put("gameId", match.id).put("version", match.version).put("registered", match.registered());
        ObjectNode state = match.publicView(user);
        SkewerCoopRoomAccess access = roomAccess.get(match.id);
        state.put("roomName", access.name()).put("hostNickname", access.hostNickname()).put("locked", access.locked());
        result.set("publicState", state);
        result.set("privateState", match.privateView(user));
        return result;
    }

    @Override
    public GameActionResult apply(GameActionCommand command) {
        GameActionResult result;
        synchronized (this) {
            SkewerCoopMatch match = requireMember(command.userId(), command.gameId());
            String key = command.userId() + ":" + command.actionId();
            Map<String, Receipt> gameReceipts = receipts.get(command.gameId());
            Receipt previous = gameReceipts == null ? null : gameReceipts.get(key);
            if (previous != null) {
                if (!previous.command().equals(command)) {
                    throw new Rejected(Rejection.ACTION_ID_CONFLICT);
                }
                return previous.result();
            }
            if (command.expectedVersion() != match.actionVersion) {
                throw new Rejected(Rejection.STALE_VERSION);
            }
            if (Set.of("RESTART_REQUEST", "RESTART_REPLY").contains(command.input().path("type").asText())
                    && match.players().stream().anyMatch(player -> !connected.test(player, match.channelId))) {
                throw new Rejected(Rejection.INVALID_ACTION);
            }
            if (command.input().path("type").asText().equals("READY")
                    && command.input().path("ready").asBoolean() && !newActivityAllowed.getAsBoolean()) {
                throw new Rejected(Rejection.NOT_ACTIVE);
            }
            match.act(command.userId(), command.input(), clock.millis());
            result = new GameActionResult(command.userId(), command.gameId(), command.actionId(), match.version);
            receipts.computeIfAbsent(command.gameId(), ignored -> new HashMap<>())
                    .put(key, new Receipt(command, result));
        }
        events.accept(new GameStateChanged(command.gameId(), result.version()));
        return result;
    }

    @Override
    public GameForfeitResult forfeit(GameForfeitCommand command) {
        GameForfeitResult result;
        synchronized (this) {
            SkewerCoopMatch match = requireMember(command.userId(), command.gameId());
            String key = command.userId() + ":" + command.actionId();
            Map<String, GameForfeitResult> gameForfeits = forfeits.get(command.gameId());
            GameForfeitResult previous = gameForfeits == null ? null : gameForfeits.get(key);
            if (previous != null) {
                return new GameForfeitResult(previous.userId(), previous.gameId(), previous.actionId(),
                        previous.version(), true);
            }
            match.finish("SKEWER_FORFEIT");
            queueTerminalResult(match);
            result = new GameForfeitResult(command.userId(), match.id, command.actionId(), match.version, false);
            forfeits.computeIfAbsent(command.gameId(), ignored -> new HashMap<>()).put(key, result);
        }
        return result;
    }

    @Override
    public synchronized Optional<GameStateView> load(long userId, String gameId) {
        SkewerCoopMatch match = games.get(gameId);
        if (match == null || !match.contains(userId)) {
            return Optional.empty();
        }
        return Optional.of(new GameStateView(userId, match.id, match.version, GameStateView.Role.PLAYER,
                match.publicView(userId), match.privateView(userId), "vr:" + match.id));
    }

    @Override
    public synchronized Optional<GameRecoverySnapshot> load(long userId) {
        return Optional.ofNullable(games.get(recoveryLatest.get(userId))).map(match -> {
            ObjectNode state = mapper.createObjectNode();
            state.set("publicState", match.publicView(userId));
            state.set("privateState", match.privateView(userId));
            state.put("role", "PLAYER");
            return new GameRecoverySnapshot(userId, match.id, 2, match.version,
                    match.finished() ? GameRecoverySnapshot.Phase.FINISHED : GameRecoverySnapshot.Phase.PLAYING, state);
        });
    }

    @Override
    public synchronized boolean isUnreservedSession(GameRecoverySnapshot snapshot) {
        SkewerCoopMatch match = games.get(snapshot.gameId());
        return match != null && match.registered() && match.contains(snapshot.userId());
    }

    @Override
    public void graceExpired(GraceExpiration command) {
        synchronized (this) {
            SkewerCoopMatch match = games.get(command.gameId());
            if (match == null || !match.contains(command.userId())) {
                return;
            }
            match.finish("SKEWER_DISCONNECT_TIMEOUT");
            queueTerminalResult(match);
        }
    }

    public void tick() {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            long now = clock.millis();
            if (now >= nextPasswordCleanupAt) {
                passwordAttempts.values().removeIf(attempts -> {
                    attempts.removeIf(at -> now - at >= PASSWORD_FAILURE_WINDOW_MILLIS);
                    return attempts.isEmpty();
                });
                nextPasswordCleanupAt = now + PASSWORD_CLEANUP_INTERVAL_MILLIS;
                removeExpiredRooms(now);
            }
            for (SkewerCoopMatch match : games.values()) {
                try {
                    long before = match.version;
                    match.tick(now, user -> connected.test(user, match.channelId));
                    if (!match.finished() && match.registered() && before != match.version) {
                        notices.add(new GameStateChanged(match.id, match.version));
                    }
                } catch (RuntimeException exception) {
                    // 불완전하게 갱신된 한 경기를 계속 진행하지 않고 정상 영속 인계 경로로 종료한다.
                    log.error("꼬치왕 경기 틱 오류로 해당 경기만 종료합니다: gameId={}", match.id, exception);
                    match.finish("SKEWER_RUNTIME_ERROR");
                }
                if (match.finished()) {
                    try {
                        queueTerminalResult(match);
                    } catch (RuntimeException exception) {
                        // 결과 구성 실패도 다른 방의 틱을 중단하지 않는다. 원본은 다음 틱까지 보존한다.
                        log.error("꼬치왕 종료 결과 구성을 재시도합니다: gameId={}", match.id, exception);
                    }
                }
            }
        }
        publishNotices(notices);
    }

    private void removeExpiredRooms(long now) {
        Set<String> expired = new HashSet<>();
        for (var entry : retireAt.entrySet()) {
            String id = entry.getKey();
            SkewerCoopMatch match = games.get(id);
            if (entry.getValue() > now || match == null || !match.finished() || terminalResults.containsKey(id)
                    || match.registered() && !completed.contains(id)) {
                continue;
            }
            if (router.forgetFinished(this, id)) {
                expired.add(id);
            }
        }
        if (expired.isEmpty()) {
            return;
        }
        expired.forEach(id -> {
            games.remove(id);
            roomAccess.remove(id);
            retireAt.remove(id);
            terminalRetryAt.remove(id);
            receipts.remove(id);
            forfeits.remove(id);
        });
        latest.values().removeIf(expired::contains);
        recoveryLatest.values().removeIf(expired::contains);
        creations.values().removeIf(expired::contains);
        completed.removeAll(expired);
        dismissed.removeIf(key -> expired.contains(key.substring(key.indexOf(':') + 1)));
    }

    // 호출자는 엔진 락을 보유한다. 채널·종료 여부 확인 후에만 정원 정보를 구분해 반환한다.
    private SkewerCoopMatch requireJoinableRoom(long user, String channel, String id) {
        SkewerCoopMatch match = games.get(id);
        if (match == null || !match.channelId.equals(channel)) {
            throw new IllegalStateException("같은 공원의 참가 가능한 방을 선택해주세요.");
        }
        if (match.finished()) {
            throw new SkewerCoopRoomAccess.RoomClosedException();
        }
        if (!match.contains(user) && match.players().size() >= 2) {
            throw new SkewerCoopRoomAccess.RoomFullException();
        }
        if (!match.canJoin(user)) {
            throw new IllegalStateException("같은 공원의 참가 가능한 방을 선택해주세요.");
        }
        return match;
    }

    private boolean occupiesRoom(SkewerCoopMatch match) {
        return !match.finished() || match.registered() && !completed.contains(match.id);
    }

    // 엔진 락 안에서는 결과를 고정하기만 한다. 저장 대기도 64개 방 제한에 포함한다.
    private void queueTerminalResult(SkewerCoopMatch match) {
        if (!match.registered()) {
            retireAt.putIfAbsent(match.id, clock.millis() + CANCELLED_RETENTION_MILLIS);
            return;
        }
        if (completed.contains(match.id)) {
            return;
        }
        terminalResults.computeIfAbsent(match.id, id -> terminalResult(match));
    }

    /** 게임 틱과 다른 전용 작업자에서 호출한다. 메모리 인계는 영속 저장 성공이 아니다. */
    public void persistTerminalResults() {
        if (!terminalWriterRunning.compareAndSet(false, true)) {
            return;
        }
        try {
            List<SkewerCoopFinished> pending;
            synchronized (this) {
                pending = terminalResults.entrySet().stream()
                        .filter(entry -> clock.millis() >= terminalRetryAt.getOrDefault(entry.getKey(), 0L))
                        .map(Map.Entry::getValue).toList();
            }
            for (SkewerCoopFinished result : pending) {
                persistTerminalResult(result);
            }
        } finally {
            terminalWriterRunning.set(false);
        }
    }

    private void persistTerminalResult(SkewerCoopFinished result) {
        String id = result.result().gameId();
        long started = System.nanoTime();
        try {
            // 파일 생성·force(true)는 엔진 락과 100ms 게임 틱을 점유하지 않는다.
            recordResult.accept(result);
        } catch (RuntimeException exception) {
            synchronized (this) {
                terminalRetryAt.put(id, clock.millis() + 5000);
            }
            log.error("꼬치왕 종료 결과의 영속 인계를 재시도합니다: gameId={}", id, exception);
            return;
        } finally {
            long elapsedMillis = (System.nanoTime() - started) / 1_000_000;
            if (elapsedMillis >= 250) {
                log.warn("꼬치왕 종료 결과의 영속 인계가 지연되었습니다: gameId={}, elapsedMillis={}", id, elapsedMillis);
            }
        }
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            if (!completed.add(id)) {
                return;
            }
            terminalResults.remove(id);
            terminalRetryAt.remove(id);
            router.finished(this, id);
            retireAt.putIfAbsent(id, clock.millis() + FINISHED_RETENTION_MILLIS);
            notices.add(new GameStateChanged(id, games.get(id).version));
            notices.add(result);
        }
        publishNotices(notices);
    }

    private void publishNotices(List<Object> notices) {
        for (Object notice : notices) {
            try {
                events.accept(notice);
            } catch (RuntimeException exception) {
                // 한 알림 소비자의 오류가 다른 방의 상태·종료 알림까지 막지 않는다.
                log.error("꼬치왕 알림 발행에 실패했습니다: eventType={}", notice.getClass().getSimpleName(), exception);
            }
        }
    }

    private SkewerCoopFinished terminalResult(SkewerCoopMatch match) {
        // 무료 보상 소비자로만 보낸다. 판돈 DB 정산 소비자에 전달하면 안 된다.
        var state = match.publicView(match.players().getFirst());
        Long chef = null;
        Long server = null;
        for (var player : state.path("players")) {
            if (player.path("role").asText().equals("chef")) {
                chef = player.path("userId").asLong();
            } else if (player.path("role").asText().equals("server")) {
                server = player.path("userId").asLong();
            }
        }
        return new SkewerCoopFinished(lifecycle.finished(match.id, "vr:" + match.id, SkewerCoopMatch.CODE,
                match.version, match.players(), match.players(), state.path("endReason").asText(), clock.instant()),
                state.path("score").asInt(), state.path("served").asInt(), chef, server,
                state.path("rankingEligible").asBoolean(), Math.round(state.path("elapsed").asDouble() * 1000),
                Math.round(duration * 1000));
    }

    private Optional<SkewerCoopMatch> current(long user) {
        return Optional.ofNullable(games.get(latest.get(user)));
    }

    private SkewerCoopMatch requireMember(long user, String id) {
        SkewerCoopMatch match = games.get(id);
        if (match == null || !match.contains(user)) {
            throw new Rejected(Rejection.ACCESS_DENIED);
        }
        return match;
    }

    private record Receipt(GameActionCommand command, GameActionResult result) { }
}
