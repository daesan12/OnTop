package com.ssafy.ontop.minigame.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.minigame.domain.BungeoppangRecord;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Order;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Progress;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Receipt;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Round;
import com.ssafy.ontop.minigame.domain.BungeoppangV5Order;
import com.ssafy.ontop.minigame.domain.MinigameSession;
import com.ssafy.ontop.minigame.domain.MinigameStartRequest;
import com.ssafy.ontop.minigame.dto.BungeoppangStatusResponse;
import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;
import com.ssafy.ontop.minigame.dto.BungeoppangV4CompleteDtos;
import com.ssafy.ontop.minigame.dto.BungeoppangV5Responses;
import com.ssafy.ontop.minigame.dto.MinigameAbandonResponse;
import com.ssafy.ontop.minigame.dto.MinigameCompleteResponse;
import com.ssafy.ontop.minigame.dto.MinigameStartResponse;
import com.ssafy.ontop.minigame.dto.MinigameStatusResponse;
import com.ssafy.ontop.minigame.repository.MinigameRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

public class MinigameService {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final String BUNGEOPPANG = "BUNGEOPPANG";
    private static final String V2 = BungeoppangRules.VERSION;
    private static final String V4 = BungeoppangV4Spec.RULES_VERSION;
    private static final String V5 = BungeoppangV5Spec.RULES_VERSION;

    private final MinigameRepository repository;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final int startsPerMinute;
    private final boolean v5Enabled;
    private final Consumer<MinigameActivityChanged> activityEvents;
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final SecureRandom random = new SecureRandom();
    private final BungeoppangRules rules = new BungeoppangRules();
    private final BungeoppangV4Rules v4Rules = new BungeoppangV4Rules();
    private final BungeoppangV5Rules v5Rules = new BungeoppangV5Rules();
    private final ConcurrentHashMap<Long, DeliveryBucket> deliveryRates = new ConcurrentHashMap<>();

    public MinigameService(MinigameRepository repository, PlatformTransactionManager manager, Clock clock) {
        this(repository, manager, clock, 10);
    }

    public MinigameService(MinigameRepository repository, PlatformTransactionManager manager, Clock clock,
            int startsPerMinute) {
        this(repository, manager, clock, startsPerMinute, false);
    }

    /** v5 stays unavailable unless explicitly enabled; a disabled v5 start keeps the old version mismatch. */
    public MinigameService(MinigameRepository repository, PlatformTransactionManager manager, Clock clock,
            int startsPerMinute, boolean v5Enabled) {
        this(repository, manager, clock, startsPerMinute, v5Enabled, ignored -> { });
    }

    /**
     * {@code activityEvents} receives the public world activity from inside each transaction. The Spring
     * publisher delivers it to an AFTER_COMMIT listener, so a rollback never reaches the world.
     */
    public MinigameService(MinigameRepository repository, PlatformTransactionManager manager, Clock clock,
            int startsPerMinute, boolean v5Enabled, Consumer<MinigameActivityChanged> activityEvents) {
        if (startsPerMinute < 1) { throw new IllegalArgumentException("시작 제한은 1 이상이어야 합니다."); }
        this.repository = repository;
        this.transactions = new TransactionTemplate(manager);
        this.transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.clock = clock;
        this.startsPerMinute = startsPerMinute;
        this.v5Enabled = v5Enabled;
        this.activityEvents = java.util.Objects.requireNonNull(activityEvents);
    }

    public boolean v5Enabled() {
        return v5Enabled;
    }

    /** Existing v2 entry point retained for binary and test compatibility. */
    public MinigameStartResponse start(long userId, String type, String key) {
        return (MinigameStartResponse) startVersion(userId, type, V2, key);
    }

    public BungeoppangV4Responses.StartResponse startV4(long userId, String type, String key) {
        return (BungeoppangV4Responses.StartResponse) startVersion(userId, type, V4, key);
    }

    public BungeoppangV5Responses.StartResponse startV5(long userId, String type, String key) {
        return (BungeoppangV5Responses.StartResponse) startVersion(userId, type, V5, key);
    }

    private Object startVersion(long userId, String type, String requestedVersion, String key) {
        validateStart(type, requestedVersion, key);
        return transactions.execute(tx -> {
            lockWallet(userId);
            var previous = repository.startRequest(userId, key);
            if (previous.isPresent()) {
                MinigameSession session = requireSession(userId, previous.get().sessionId(), false);
                BungeoppangRecord record = requireAnyRecord(session.id());
                if (!requestedVersion.equals(record.rulesVersion())) {
                    throw error(409, "IDEMPOTENCY_KEY_CONFLICT", "같은 중복 방지 키에 다른 요청을 사용할 수 없습니다.");
                }
                return startResponse(session, record);
            }

            Instant issuedAt = now();
            if (repository.startsSince(userId, issuedAt.minusSeconds(60)) >= startsPerMinute) {
                throw error(429, "TOO_MANY_STARTS", "잠시 후 다시 시작하세요.");
            }
            for (MinigameSession active : repository.playing(userId)) {
                if (expired(active, issuedAt)) {
                    invalidate(active, issuedAt, "EXPIRED");
                } else {
                    active.abandon(issuedAt);
                    terminateV4(active.id(), "SUPERSEDED");
                    activityEnded(active);
                }
            }

            boolean firstGame = repository.firstGame(userId);
            BungeoppangV4Responses.Timing timing = V4.equals(requestedVersion) ? BungeoppangV4Spec.timing(issuedAt)
                    : V5.equals(requestedVersion) ? BungeoppangV5Spec.timing(issuedAt) : null;
            MinigameSession session = new MinigameSession(userId,
                    timing == null ? issuedAt : timing.playStartsAt());
            repository.persist(session);
            repository.flush();

            int heatCount = V4.equals(requestedVersion) ? BungeoppangV4Spec.rules().heatListLength()
                    : V5.equals(requestedVersion) ? BungeoppangV5Spec.rules().heatListLength() : 64;
            List<Integer> heats = random.ints(heatCount, 85, 116).boxed().toList();
            BungeoppangRecord record = new BungeoppangRecord(session.id(), requestedVersion, write(heats), firstGame);
            repository.persist(record);
            if (V4.equals(requestedVersion)) {
                persistV4Source(session.id(), issuedAt, timing);
            } else if (V5.equals(requestedVersion)) {
                persistV5Source(session.id(), issuedAt, timing, heats);
            }
            repository.persist(new MinigameStartRequest(userId, key, session.id()));
            repository.flush();
            // Only a newly created session announces itself; an idempotent replay above publishes nothing.
            // The bubble covers the start buffer and countdown and ends at the stored play end.
            activityEvents.accept(new MinigameActivityChanged(userId, session.id(),
                    timing == null ? session.startedAt().plusSeconds(60) : timing.playEndsAt()));
            return startResponse(session, record);
        });
    }

    private void persistV4Source(long sessionId, Instant issuedAt, BungeoppangV4Responses.Timing timing) {
        BungeoppangV4Responses.Checkpoint checkpoint = BungeoppangV4Spec.initialCheckpoint(sessionId);
        V4ConfigSnapshot config = new V4ConfigSnapshot(BungeoppangV4Spec.rules(),
                BungeoppangV4Spec.START_BUFFER_MS, BungeoppangV4Spec.SUBMISSION_GRACE_MS,
                BungeoppangV4Spec.PROCESSING_DRAIN_MS);
        repository.persist(new BungeoppangV4Round(sessionId, BungeoppangV4Spec.CONFIG_VERSION,
                write(config), issuedAt, timing.countdownStartsAt(), timing.playStartsAt(), timing.playEndsAt(),
                timing.submitDeadline(), timing.expiresAt(), checkpoint.prefixHash(), write(checkpoint)));
        repository.persist(new BungeoppangV4Progress(sessionId, "[]"));
        var first = BungeoppangV4Spec.firstOrder();
        repository.persist(new BungeoppangV4Order(sessionId, Long.parseLong(first.orderId()), first.orderIndex(),
                first.items().bean(), first.items().custard(), first.items().pizza(), first.items().chocolate(),
                issuedAt));
    }

    /**
     * v5 reuses the v4 round row for its time origin and approved checkpoint; only its orders get their own
     * table. The opening checkpoint is the replay of an empty log, so start and recovery share one source.
     */
    private void persistV5Source(long sessionId, Instant issuedAt, BungeoppangV4Responses.Timing timing,
            List<Integer> heats) {
        List<BungeoppangV5Rules.Order> opening = openingV5Orders();
        BungeoppangV5Responses.Checkpoint checkpoint = BungeoppangV5Spec.checkpoint(0, 0,
                BungeoppangV5Spec.initialPrefixHash(sessionId), v5Rules.replay(List.of(), heats, opening));
        V5ConfigSnapshot config = new V5ConfigSnapshot(BungeoppangV5Spec.rules(),
                BungeoppangV5Spec.START_BUFFER_MS, BungeoppangV5Spec.SUBMISSION_GRACE_MS,
                BungeoppangV5Spec.PROCESSING_DRAIN_MS);
        repository.persist(new BungeoppangV4Round(sessionId, BungeoppangV5Spec.CONFIG_VERSION,
                write(config), issuedAt, timing.countdownStartsAt(), timing.playStartsAt(), timing.playEndsAt(),
                timing.submitDeadline(), timing.expiresAt(), checkpoint.prefixHash(), write(checkpoint)));
        repository.persist(new BungeoppangV4Progress(sessionId, "[]"));
        for (BungeoppangV5Rules.Order order : opening) {
            repository.persist(new BungeoppangV5Order(sessionId, Long.parseLong(order.orderId()),
                    order.customerSlot(), order.availableAfterSeq(), order.items().bean(), order.items().custard(),
                    order.items().pizza(), order.items().chocolate(), issuedAt));
        }
    }

    /** One opening order per customer slot: the first is the fixed bean-2 order, the rest use the v4 mix. */
    private List<BungeoppangV5Rules.Order> openingV5Orders() {
        var orders = new ArrayList<BungeoppangV5Rules.Order>(BungeoppangV5Spec.MAX_ACTIVE_ORDERS);
        for (int slot = 0; slot < BungeoppangV5Spec.MAX_ACTIVE_ORDERS; slot++) {
            BungeoppangV4Rules.Order generated = v4Rules.nextOrder(slot, random,
                    BungeoppangV5Spec.calculationRules());
            orders.add(new BungeoppangV5Rules.Order(generated.orderId(), slot, 0, generated.items()));
        }
        return orders;
    }

    private Object startResponse(MinigameSession session, BungeoppangRecord record) {
        if (V2.equals(record.rulesVersion())) {
            return new MinigameStartResponse(Long.toString(session.id()), session.minigameType(), "PLAYING",
                    session.startedAt(), record.rulesVersion(), heats(record), record.firstGame());
        }
        if (V5.equals(record.rulesVersion())) {
            BungeoppangV4Round round = requireV4Round(session.id(), false);
            return new BungeoppangV5Responses.StartResponse(Long.toString(session.id()), session.minigameType(),
                    "PLAYING", "WAITING_START", V5, round.configVersion(), round.issuedAt(), session.startedAt(),
                    BungeoppangV4Spec.timing(round), v5Config(round).rules(), heats(record), record.firstGame(),
                    v5Checkpoint(round));
        }
        if (!V4.equals(record.rulesVersion())) {
            throw versionMismatch();
        }
        BungeoppangV4Round round = requireV4Round(session.id(), false);
        return new BungeoppangV4Responses.StartResponse(Long.toString(session.id()), session.minigameType(),
                "PLAYING", "WAITING_START",
                record.rulesVersion(), round.configVersion(), round.issuedAt(), session.startedAt(),
                BungeoppangV4Spec.timing(round), config(round).rules(), heats(record), record.firstGame(),
                checkpoint(round));
    }

    public BungeoppangStatusResponse status(long userId) {
        return transactions.execute(tx -> {
            lockWallet(userId);
            Instant current = now();
            repository.playing(userId).stream().filter(session -> expired(session, current))
                    .forEach(session -> invalidate(session, current, "EXPIRED"));
            return new BungeoppangStatusResponse(earned(userId, current), BungeoppangRules.DAILY_CAP,
                    repository.firstGame(userId), tips(repository.profile(userId).seenTips()), V2);
        });
    }

    public BungeoppangV4Responses.LobbyResponse statusV4(long userId) {
        return transactions.execute(tx -> {
            lockWallet(userId);
            Instant current = now();
            String activeSessionId = null;
            for (MinigameSession session : repository.playing(userId)) {
                if (expired(session, current)) {
                    invalidate(session, current, "EXPIRED");
                } else if (activeSessionId == null) {
                    activeSessionId = Long.toString(session.id());
                }
            }
            return new BungeoppangV4Responses.LobbyResponse(V4, current, earned(userId, current),
                    BungeoppangRules.DAILY_CAP, repository.firstGame(userId),
                    tips(repository.profile(userId).seenTips()), activeSessionId, List.of(V2, V4));
        });
    }

    /** The v4 lobby shape under rulesVersion v5; the v4 response itself is unchanged. */
    public BungeoppangV4Responses.LobbyResponse statusV5(long userId) {
        if (!v5Enabled) { throw versionMismatch(); }
        return transactions.execute(tx -> {
            lockWallet(userId);
            Instant current = now();
            String activeSessionId = null;
            for (MinigameSession session : repository.playing(userId)) {
                if (expired(session, current)) {
                    invalidate(session, current, "EXPIRED");
                } else if (activeSessionId == null) {
                    activeSessionId = Long.toString(session.id());
                }
            }
            return new BungeoppangV4Responses.LobbyResponse(V5, current, earned(userId, current),
                    BungeoppangRules.DAILY_CAP, repository.firstGame(userId),
                    tips(repository.profile(userId).seenTips()), activeSessionId, List.of(V2, V4, V5));
        });
    }

    /** Existing v2 state query retained for callers that depend on its exact JSON shape. */
    public MinigameStatusResponse load(long userId, long sessionId) {
        Object response = loadSession(userId, sessionId, false);
        if (response instanceof MinigameStatusResponse v2) { return v2; }
        throw versionMismatch();
    }

    public Object loadSession(long userId, long sessionId, boolean includeSource) {
        return loadSession(userId, sessionId, includeSource, false, null);
    }

    public Object loadSession(long userId, long sessionId, boolean includeSource, boolean includeProgress,
            String deliveryKey) {
        return transactions.execute(tx -> {
            lockWallet(userId);
            MinigameSession session = requireSession(userId, sessionId, true);
            BungeoppangRecord record = repository.record(session.id()).orElse(null);
            Instant current = now();
            if ("PLAYING".equals(session.status()) && expired(session, current)) {
                invalidate(session, current, "EXPIRED");
            }
            // V110과 V111 사이에 생성된 v2 판에는 replay record가 없다. 기존 조회 계약을 유지한다.
            if (record == null) {
                if (repository.v4Round(session.id(), false).isPresent()) { throw versionMismatch(); }
                return new MinigameStatusResponse(Long.toString(session.id()), session.status(), session.score(),
                        session.rewardAmount(), session.startedAt(), session.endedAt());
            }
            if (V2.equals(record.rulesVersion())) {
                return new MinigameStatusResponse(Long.toString(session.id()), session.status(), session.score(),
                        session.rewardAmount(), session.startedAt(), session.endedAt());
            }
            if (V5.equals(record.rulesVersion())) {
                return v5SessionResponse(session, record, current, includeSource, includeProgress, deliveryKey);
            }
            if (!V4.equals(record.rulesVersion())) { throw versionMismatch(); }
            return v4SessionResponse(session, record, current, includeSource, includeProgress, deliveryKey);
        });
    }

    /**
     * Recovery returns the stored approved checkpoint, its accepted log and every server-issued order.
     * Nothing from the client is trusted; the remaining time follows the stored timing and serverNow.
     */
    private BungeoppangV5Responses.SessionResponse v5SessionResponse(MinigameSession session,
            BungeoppangRecord record, Instant current, boolean includeSource, boolean includeProgress,
            String deliveryKey) {
        BungeoppangV4Round round = requireV4Round(session.id(), false);
        boolean active = "PLAYING".equals(session.status());
        boolean progress = active || includeProgress;
        List<BungeoppangV4DeliveryDtos.Action> accepted = progress ? acceptedLog(session.id()) : List.of();
        Object lookup = deliveryKey == null ? null : deliveryLookup(session.id(), deliveryKey);
        // v5 완료 응답 DTO는 V5-3에서 정한다. 그 전까지 저장된 결과를 그대로 읽기만 한다.
        Object finalResult = "COMPLETED".equals(session.status()) && record.result() != null
                ? readTree(record.result()) : null;
        return new BungeoppangV5Responses.SessionResponse(Long.toString(session.id()), V5,
                round.configVersion(), session.status(), BungeoppangV4Spec.phase(session.status(), current, round),
                session.score(), session.rewardAmount(), session.endedAt(), active ? null : round.terminalReason(),
                current, session.startedAt(), BungeoppangV4Spec.timing(round),
                progress ? v5Checkpoint(round) : null, new ArrayList<>(accepted),
                progress ? repository.v5Orders(session.id()).stream().map(this::v5Order)
                        .map(BungeoppangV5Spec::order).toList() : List.of(),
                finalResult, lookup, includeSource ? v5Config(round).rules() : null,
                includeSource ? heats(record) : null, includeSource ? round.issuedAt() : null,
                includeSource ? record.firstGame() : null);
    }

    private BungeoppangV4Responses.SessionResponse v4SessionResponse(MinigameSession session,
            BungeoppangRecord record, Instant current, boolean includeSource, boolean includeProgress,
            String deliveryKey) {
        BungeoppangV4Round round = requireV4Round(session.id(), false);
        boolean active = "PLAYING".equals(session.status());
        boolean progress = active || includeProgress;
        List<BungeoppangV4DeliveryDtos.Action> accepted = progress ? acceptedLog(session.id()) : List.of();
        Object lookup = deliveryKey == null ? null : deliveryLookup(session.id(), deliveryKey);
        // 저장 JSON을 그대로 내보내지 않고 완료 응답 DTO로 읽어 POST 완료와 같은 날짜·시각 표현으로 반환한다.
        Object finalResult = "COMPLETED".equals(session.status()) && record.result() != null
                ? read(record.result(), BungeoppangV4CompleteDtos.Response.class) : null;
        return new BungeoppangV4Responses.SessionResponse(Long.toString(session.id()), V4,
                round.configVersion(), session.status(), BungeoppangV4Spec.phase(session.status(), current, round),
                session.score(), session.rewardAmount(), session.endedAt(), active ? null : round.terminalReason(),
                current, session.startedAt(), BungeoppangV4Spec.timing(round),
                progress ? checkpoint(round) : null, new ArrayList<>(accepted),
                progress ? repository.v4Orders(session.id()).stream().map(BungeoppangV4Spec::order).toList() : List.of(),
                finalResult, lookup, includeSource ? config(round).rules() : null,
                includeSource ? heats(record) : null, includeSource ? round.issuedAt() : null,
                includeSource ? record.firstGame() : null);
    }

    public BungeoppangV4DeliveryDtos.Response deliver(long userId, long sessionId, String key,
            BungeoppangV4DeliveryDtos.Request request) {
        if (!deliveryRates.computeIfAbsent(userId, ignored -> new DeliveryBucket()).allow(clock.millis())) {
            throw error(429, "TOO_MANY_REQUESTS", "납품 요청이 너무 많습니다. 잠시 후 다시 시도하세요.");
        }
        Instant receivedAt = now();
        DeliveryDecision decision = transactions.execute(
                tx -> deliverInTransaction(userId, sessionId, key, request, receivedAt));
        if (decision.error() != null) {
            throw new StoredMinigameResponseException(decision.status(), decision.error());
        }
        return decision.response();
    }

    private DeliveryDecision deliverInTransaction(long userId, long sessionId, String key,
            BungeoppangV4DeliveryDtos.Request request, Instant receivedAt) {
        lockWallet(userId);
        MinigameSession session = requireSession(userId, sessionId, true);
        BungeoppangRecord record = requireAnyRecord(sessionId);
        if (!V4.equals(record.rulesVersion()) || !V4.equals(request.rulesVersion())) { throw versionMismatch(); }
        BungeoppangV4Round round = requireV4Round(sessionId, true);
        String requestHash = BungeoppangV4DeliveryContract.requestHash(sessionId, request);
        var stored = repository.v4Receipt(sessionId, "DELIVERY", key);
        if (stored.isPresent()) { return replayReceipt(stored.get(), requestHash); }
        if (!"PLAYING".equals(session.status()) || round.terminalReason() != null) {
            throw error(409, "GAME_NOT_ACTIVE", "이미 종료된 미니게임입니다.");
        }
        Instant current = now();
        if (receivedAt.isAfter(round.submitDeadline())) {
            throw error(409, "GAME_NOT_ACTIVE", "납품 제출 기한이 지났습니다.");
        }
        BungeoppangV4DeliveryDtos.Action last = request.log().getLast();
        if (!"DELIVER".equals(last.action()) || !key.equals(last.deliveryKey())) {
            throw error(400, "INVALID_REQUEST", "납품 키와 마지막 행동을 확인하세요.");
        }
        String calculatedHash = BungeoppangV4DeliveryContract.prefixHash(sessionId, round.configVersion(),
                request.log());
        if (!calculatedHash.equals(request.prefixHash())) {
            throw new MinigameException(400, "LOG_HASH_MISMATCH", "행동 기록 해시가 일치하지 않습니다.");
        }

        long targetOrderId;
        try { targetOrderId = Long.parseLong(last.orderId()); }
        catch (NumberFormatException exception) { throw error(400, "INVALID_REQUEST", "주문 ID를 확인하세요."); }
        if (repository.acceptedV4Delivery(sessionId, targetOrderId).isPresent()) {
            return rejectedDelivery(sessionId, key, requestHash, targetOrderId, request, round, current,
                    new MinigameException(409, "ORDER_ALREADY_DELIVERED", "이미 승인된 주문입니다."));
        }

        BungeoppangV4Progress progress = repository.v4Progress(sessionId, true)
                .orElseGet(() -> {
                    BungeoppangV4Progress created = new BungeoppangV4Progress(sessionId, "[]");
                    repository.persist(created);
                    return created;
                });
        List<BungeoppangV4DeliveryDtos.Action> accepted = readActions(progress.acceptedLogJson());

        try {
            validateApprovedPrefix(round, accepted, request.log());
            List<BungeoppangV4Order> storedOrders = repository.v4Orders(sessionId);
            if (storedOrders.isEmpty()) { throw new IllegalStateException("발급 주문이 없습니다."); }
            BungeoppangV4Order currentOrder = storedOrders.getLast();
            if (currentOrder.orderId() != targetOrderId) {
                throw new MinigameException(409, "STALE_ORDER", "현재 주문이 아닙니다.");
            }
            validateActionClock(receivedAt, round, last);
            List<BungeoppangV4Rules.Action> actions = BungeoppangV4DeliveryContract.domainActions(request);
            List<BungeoppangV4Rules.Order> orders = storedOrders.stream().map(this::ruleOrder).toList();
            V4ConfigSnapshot snapshot = config(round);
            List<BungeoppangV4Rules.Action> beforeActions = actions.subList(0, actions.size() - 1);
            BungeoppangV4Rules.Result before = v4Rules.replay(beforeActions, heats(record), orders, snapshot.rules());
            BungeoppangV4Rules.Result result = v4Rules.replay(actions, heats(record), orders, snapshot.rules());

            int nextIndex = storedOrders.size();
            BungeoppangV4Rules.Order generated = v4Rules.nextOrder(nextIndex, random, snapshot.rules());
            BungeoppangV4Responses.Order next = responseOrder(generated);
            repository.persist(new BungeoppangV4Order(sessionId, Long.parseLong(generated.orderId()),
                    generated.orderIndex(), generated.items().bean(), generated.items().custard(),
                    generated.items().pizza(), generated.items().chocolate(), current));

            List<Long> consumed = consumedBreadIds(before.tray(), result.tray());
            long scoreDelta = Math.subtractExact(result.score(), before.score());
            long bonusDelta = Math.subtractExact(result.bonusScore(), before.bonusScore());
            BungeoppangV4Responses.Checkpoint checkpoint = checkpoint(round.revision() + 1,
                    request.throughSeq(), request.prefixHash(), result, next);
            round.approve(request.throughSeq(), request.prefixHash(), write(checkpoint));
            progress.replace(write(request.log()));
            var response = new BungeoppangV4DeliveryDtos.Response(Long.toString(sessionId), key,
                    Long.toString(targetOrderId), true, current, request.throughSeq(), request.prefixHash(),
                    consumed, scoreDelta, bonusDelta, next, checkpoint);
            repository.persist(new BungeoppangV4Receipt(sessionId, "DELIVERY", key, requestHash,
                    targetOrderId, targetOrderId, "ACCEPTED", 200, write(response), request.throughSeq(),
                    request.prefixHash(), current));
            repository.flush();
            return DeliveryDecision.success(response);
        } catch (MinigameException exception) {
            return rejectedDelivery(sessionId, key, requestHash, targetOrderId, request, round, current, exception);
        }
    }

    public MinigameCompleteResponse complete(long userId, long sessionId, JsonNode submission) {
        return (MinigameCompleteResponse) complete(userId, sessionId, null, submission);
    }

    public Object complete(long userId, long sessionId, String key, JsonNode submission) {
        Instant receivedAt = now();
        Object result = transactions.execute(tx -> finish(userId, sessionId, key, submission, receivedAt));
        if (result instanceof RuntimeException failure) { throw failure; }
        return result;
    }

    private Object finish(long userId, long sessionId, String key, JsonNode submission, Instant receivedAt) {
        Wallet wallet = lockWallet(userId);
        MinigameSession session = requireSession(userId, sessionId, true);
        BungeoppangRecord record = requireAnyRecord(sessionId);
        if (V4.equals(record.rulesVersion())) {
            return finishV4(userId, session, record, wallet, key, submission, receivedAt);
        }
        if (!V2.equals(record.rulesVersion())) { throw versionMismatch(); }
        validateV2Submission(submission);
        if ("COMPLETED".equals(session.status())) { return read(record.result(), MinigameCompleteResponse.class); }
        if (record.rejectionDetail() != null) { return rejected(record); }
        Instant current = now();
        if ("PLAYING".equals(session.status()) && expired(session, current)) {
            invalidate(session, current, "EXPIRED");
            return error(409, "GAME_NOT_ACTIVE", "제출 기한이 지난 미니게임입니다.");
        }
        requirePlaying(session);
        if (current.isBefore(session.startedAt().plusSeconds(60))) {
            return error(422, "TOO_EARLY", "시작 후 60초가 지나야 제출할 수 있습니다.");
        }
        BungeoppangRules.Result score;
        try { score = rules.replay(submission, heats(record)); }
        catch (MinigameException exception) {
            record.reject(write(submission), exception.detail(), exception.index());
            session.invalidate(current);
            activityEnded(session);
            repository.flush();
            return exception;
        }
        long calculated = score.score() / 15;
        long today = earned(userId, current);
        long reward = Math.min(calculated, Math.max(0, BungeoppangRules.DAILY_CAP - today));
        wallet.creditReward(reward);
        session.complete(score.score(), reward, current);
        activityEnded(session);
        if (reward > 0) {
            repository.persist(WalletTransaction.minigameReward(wallet.id(), session.id(), reward,
                    "minigame-reward:" + session.id()));
        }
        rememberTips(userId, submission.path("seenTips"));
        var response = new MinigameCompleteResponse(Long.toString(sessionId), "COMPLETED", score.made(), reward,
                score.score(), score.made(), score.golden(), score.failed(), score.wasted(), score.maxCombo(),
                calculated, reward, today + reward, BungeoppangRules.DAILY_CAP,
                today + reward >= BungeoppangRules.DAILY_CAP);
        record.accept(write(submission), write(response));
        repository.flush();
        return response;
    }

    private Object finishV4(long userId, MinigameSession session, BungeoppangRecord record, Wallet wallet,
            String key, JsonNode submission, Instant receivedAt) {
        if (key == null || !key.matches("[A-Za-z0-9_-]{1,64}")) {
            throw error(400, "INVALID_REQUEST", "완료 중복 방지 키를 확인하세요.");
        }
        BungeoppangV4CompleteDtos.Request request = BungeoppangV4DeliveryContract.parseComplete(submission);
        long sessionId = session.id();
        BungeoppangV4Round round = requireV4Round(sessionId, true);
        String requestHash = BungeoppangV4DeliveryContract.completeRequestHash(sessionId, request);
        var sameKey = repository.v4Receipt(sessionId, "COMPLETE", key);
        if (sameKey.isPresent()) { return replayCompletion(sameKey.get(), requestHash); }
        if ("COMPLETED".equals(session.status())) {
            if (!requestHash.equals(round.finalRequestHash())) {
                throw error(409, "FINAL_RESULT_CONFLICT", "이미 다른 최종 결과가 확정되었습니다.");
            }
            return read(record.result(), BungeoppangV4CompleteDtos.Response.class);
        }
        if (!"PLAYING".equals(session.status()) || round.terminalReason() != null) {
            throw terminalError(session.status());
        }
        if (receivedAt.isBefore(round.playEndsAt())) {
            return error(422, "TOO_EARLY", "플레이 종료 후 같은 요청으로 다시 확인해 주세요.");
        }
        if (receivedAt.isAfter(round.submitDeadline())) {
            // drain 중 늦은 제출이 기한 내 수신 후 잠금을 기다리는 완료를 먼저 무효화하지 않게 expiresAt 이후에만 만료한다.
            Instant current = now();
            if (!current.isBefore(round.expiresAt())) {
                invalidate(session, current, "SUBMISSION_EXPIRED");
                repository.flush();
            }
            return error(409, "GAME_NOT_ACTIVE", "최종 제출 기한이 지났습니다.");
        }
        String calculatedHash = BungeoppangV4DeliveryContract.prefixHash(sessionId, round.configVersion(),
                request.log());
        if (!calculatedHash.equals(request.prefixHash())) {
            throw error(400, "LOG_HASH_MISMATCH", "행동 기록 해시가 일치하지 않습니다.");
        }
        BungeoppangV4Progress progress = repository.v4Progress(sessionId, true)
                .orElseThrow(() -> new IllegalStateException("v4 진행 상태가 없습니다."));
        List<BungeoppangV4DeliveryDtos.Action> accepted = readActions(progress.acceptedLogJson());
        validateFinalPrefix(round, accepted, request.log());

        List<BungeoppangV4DeliveryDtos.Action> suffix = request.log().subList(accepted.size(), request.log().size());
        List<Integer> pendingDeliveries = new ArrayList<>();
        for (int i = 0; i < suffix.size(); i++) {
            if ("DELIVER".equals(suffix.get(i).action())) { pendingDeliveries.add(accepted.size() + i); }
        }
        if (pendingDeliveries.size() > 1) {
            return new MinigameException(422, "LOG_INVALID", "미승인 납품은 한 건만 제출할 수 있습니다.",
                    "TOO_MANY_PENDING_DELIVERIES", pendingDeliveries.get(1));
        }
        if (pendingDeliveries.size() == 1) {
            int deliveryIndex = pendingDeliveries.getFirst();
            BungeoppangV4DeliveryDtos.Action action = request.log().get(deliveryIndex);
            List<BungeoppangV4DeliveryDtos.Action> deliveryLog = List.copyOf(
                    request.log().subList(0, deliveryIndex + 1));
            String deliveryHash = BungeoppangV4DeliveryContract.prefixHash(sessionId, round.configVersion(),
                    deliveryLog);
            var deliveryRequest = new BungeoppangV4DeliveryDtos.Request(V4, deliveryLog.size(), deliveryHash,
                    deliveryLog);
            DeliveryDecision decision = deliverInTransaction(userId, sessionId, action.deliveryKey(),
                    deliveryRequest, receivedAt);
            if (decision.error() != null) {
                return new StoredMinigameResponseException(decision.status(), decision.error());
            }
        }

        List<BungeoppangV4Order> storedOrders = repository.v4Orders(sessionId);
        BungeoppangV4Rules.Result result;
        try {
            result = v4Rules.replay(BungeoppangV4DeliveryContract.domainActions(request.log()), heats(record),
                    storedOrders.stream().map(this::ruleOrder).toList(), config(round).rules());
        } catch (MinigameException exception) {
            throw exception;
        }
        Instant settledAt = now();
        var rewardDate = settledAt.atZone(SEOUL).toLocalDate();
        long calculated = Math.floorDiv(result.score(), config(round).rules().pointsPerCoin());
        long today = earned(userId, settledAt);
        long reward = Math.min(calculated, Math.max(0, BungeoppangRules.DAILY_CAP - today));
        wallet.creditReward(reward);
        session.complete(result.score(), reward, settledAt);
        activityEnded(session);
        if (reward > 0) {
            repository.persist(WalletTransaction.minigameReward(wallet.id(), sessionId, reward,
                    "minigame-reward:" + sessionId));
        }
        int unfinished = (int) result.slots().stream().filter(slot -> !"empty".equals(slot.phase())).count();
        var response = new BungeoppangV4CompleteDtos.Response(Long.toString(sessionId), "COMPLETED", V4,
                round.configVersion(), result.made(), reward, result.score(), result.made(), result.golden(),
                result.failed(), result.wasted(), result.maxCombo(), calculated, reward, today + reward,
                BungeoppangRules.DAILY_CAP, today + reward >= BungeoppangRules.DAILY_CAP,
                result.successfulMade(), result.served(), result.customersServed(), result.specialServed(),
                result.bonusScore(), result.grillDiscarded(), result.trayDiscarded(), result.tray().size(),
                unfinished, rewardDate, settledAt, request.throughSeq(), request.prefixHash());
        round.settle(requestHash, request.throughSeq(), request.prefixHash(), settledAt, rewardDate);
        rememberTips(userId, json.valueToTree(request.seenTips()));
        record.accept(write(request), write(response));
        repository.persist(new BungeoppangV4Receipt(sessionId, "COMPLETE", key, requestHash,
                null, null, "ACCEPTED", 200, write(response), request.throughSeq(), request.prefixHash(),
                settledAt));
        repository.flush();
        return response;
    }

    private DeliveryDecision replayReceipt(BungeoppangV4Receipt receipt, String requestHash) {
        if (!receipt.requestHash().equals(requestHash)) {
            throw error(409, "IDEMPOTENCY_KEY_CONFLICT", "같은 중복 방지 키에 다른 요청을 사용할 수 없습니다.");
        }
        if ("ACCEPTED".equals(receipt.outcome())) {
            return DeliveryDecision.success(read(receipt.responseJson(), BungeoppangV4DeliveryDtos.Response.class));
        }
        return DeliveryDecision.failure(receipt.httpStatus(),
                read(receipt.responseJson(), BungeoppangV4DeliveryDtos.ErrorResponse.class));
    }

    private Object replayCompletion(BungeoppangV4Receipt receipt, String requestHash) {
        if (!receipt.requestHash().equals(requestHash)) {
            throw error(409, "IDEMPOTENCY_KEY_CONFLICT", "같은 중복 방지 키에 다른 요청을 사용할 수 없습니다.");
        }
        if ("ACCEPTED".equals(receipt.outcome())) {
            return read(receipt.responseJson(), BungeoppangV4CompleteDtos.Response.class);
        }
        throw new StoredMinigameResponseException(receipt.httpStatus(),
                read(receipt.responseJson(), BungeoppangV4DeliveryDtos.ErrorResponse.class));
    }

    private DeliveryDecision rejectedDelivery(long sessionId, String key, String requestHash,
            long targetOrderId, BungeoppangV4DeliveryDtos.Request request, BungeoppangV4Round round,
            Instant current, MinigameException exception) {
        String code = "LOG_INVALID".equals(exception.code()) ? "DELIVERY_REJECTED" : exception.code();
        String message = "LOG_INVALID".equals(exception.code())
                ? "납품 기록을 승인하지 못했습니다. 진행 상태를 다시 확인해 주세요."
                : exception.getMessage();
        BungeoppangV4DeliveryDtos.Recovery recovery = new BungeoppangV4DeliveryDtos.Recovery(
                "LOAD_CHECKPOINT", Long.toString(sessionId), round.revision(), round.approvedThroughSeq(),
                round.approvedPrefixHash());
        var body = new BungeoppangV4DeliveryDtos.ErrorResponse(code, message, null,
                exception.detail(), exception.index(), recovery, null);
        repository.persist(new BungeoppangV4Receipt(sessionId, "DELIVERY", key, requestHash,
                targetOrderId, null, "REJECTED", exception.status(), write(body), request.throughSeq(),
                request.prefixHash(), current));
        repository.flush();
        return DeliveryDecision.failure(exception.status(), body);
    }

    private void validateApprovedPrefix(BungeoppangV4Round round,
            List<BungeoppangV4DeliveryDtos.Action> accepted, List<BungeoppangV4DeliveryDtos.Action> requested) {
        if (accepted.size() != round.approvedThroughSeq()
                || !BungeoppangV4DeliveryContract.prefixHash(round.sessionId(), round.configVersion(), accepted)
                        .equals(round.approvedPrefixHash())) {
            throw new IllegalStateException("저장된 승인 prefix가 손상되었습니다.");
        }
        if (requested.size() <= accepted.size()
                || !requested.subList(0, accepted.size()).equals(accepted)) {
            throw new MinigameException(409, "PREFIX_MISMATCH", "승인된 행동 기록을 변경할 수 없습니다.");
        }
    }

    private void validateFinalPrefix(BungeoppangV4Round round,
            List<BungeoppangV4DeliveryDtos.Action> accepted, List<BungeoppangV4DeliveryDtos.Action> requested) {
        if (accepted.size() != round.approvedThroughSeq()
                || !BungeoppangV4DeliveryContract.prefixHash(round.sessionId(), round.configVersion(), accepted)
                        .equals(round.approvedPrefixHash())) {
            throw new IllegalStateException("저장된 승인 prefix가 손상되었습니다.");
        }
        if (requested.size() < accepted.size()
                || !requested.subList(0, accepted.size()).equals(accepted)) {
            throw new MinigameException(409, "PREFIX_MISMATCH", "승인된 행동 기록을 변경할 수 없습니다.");
        }
    }

    private void validateActionClock(Instant current, BungeoppangV4Round round,
            BungeoppangV4DeliveryDtos.Action last) {
        long elapsed = java.time.Duration.between(round.playStartsAt(), current).toMillis();
        long allowed = Math.min(BungeoppangV4Spec.DURATION_MS - 1L, Math.max(-1L, elapsed + 250L));
        if (last.t() > allowed) {
            throw new MinigameException(422, "TIME_AHEAD", "서버 플레이 시각보다 앞선 행동입니다.",
                    "TIME_AHEAD", requestIndex(last.seq()));
        }
    }

    private int requestIndex(int seq) { return Math.max(0, seq - 1); }

    private BungeoppangV4Rules.Order ruleOrder(BungeoppangV4Order order) {
        return new BungeoppangV4Rules.Order(Long.toString(order.orderId()), order.orderIndex(),
                new BungeoppangV4Rules.FillingCounts(order.bean(), order.custard(), order.pizza(),
                        order.chocolate()));
    }

    private BungeoppangV4Responses.Order responseOrder(BungeoppangV4Rules.Order order) {
        return new BungeoppangV4Responses.Order(order.orderId(), order.orderIndex(),
                new BungeoppangV4Responses.FillingCounts(order.items().bean(), order.items().custard(),
                        order.items().pizza(), order.items().chocolate()));
    }

    private List<Long> consumedBreadIds(List<BungeoppangV4Rules.Bread> before,
            List<BungeoppangV4Rules.Bread> after) {
        Set<Long> remaining = new HashSet<>();
        after.forEach(bread -> remaining.add(bread.breadId()));
        return before.stream().map(BungeoppangV4Rules.Bread::breadId)
                .filter(id -> !remaining.contains(id)).toList();
    }

    private BungeoppangV4Responses.Checkpoint checkpoint(long revision, int throughSeq, String prefixHash,
            BungeoppangV4Rules.Result result, BungeoppangV4Responses.Order currentOrder) {
        List<BungeoppangV4Responses.Slot> slots = result.slots().stream()
                .map(slot -> new BungeoppangV4Responses.Slot(slot.slot(), slot.phase(), slot.since(), slot.heat(),
                        slot.filling() == null ? null : slot.filling().wireName(), slot.front(), slot.lastAt()))
                .toList();
        List<BungeoppangV4Responses.TrayBread> tray = result.tray().stream()
                .map(bread -> new BungeoppangV4Responses.TrayBread(bread.breadId(), bread.filling().wireName(),
                        bread.front(), bread.back(), bread.points())).toList();
        var stats = new BungeoppangV4Responses.Stats(result.score(), result.made(), result.successfulMade(),
                result.golden(), result.failed(), result.wasted(), result.grillDiscarded(),
                result.trayDiscarded(), result.combo(), result.maxCombo(), result.served(),
                result.customersServed(), result.specialServed(), result.bonusScore());
        return new BungeoppangV4Responses.Checkpoint(revision, throughSeq, prefixHash, result.heatCursor(),
                result.lastAt(), slots, tray, stats, currentOrder);
    }

    private List<BungeoppangV4DeliveryDtos.Action> acceptedLog(long sessionId) {
        return repository.v4Progress(sessionId, false).map(BungeoppangV4Progress::acceptedLogJson)
                .map(this::readActions).orElse(List.of());
    }

    private BungeoppangV4DeliveryDtos.Lookup deliveryLookup(long sessionId, String key) {
        if (!key.matches("[A-Za-z0-9_-]{1,64}")) {
            throw error(400, "INVALID_REQUEST", "납품 키를 확인하세요.");
        }
        return repository.v4Receipt(sessionId, "DELIVERY", key)
                .map(receipt -> new BungeoppangV4DeliveryDtos.Lookup(key, receipt.outcome(),
                        receipt.httpStatus(), readTree(receipt.responseJson())))
                .orElseGet(() -> new BungeoppangV4DeliveryDtos.Lookup(key, "UNKNOWN", null, null));
    }

    private List<BungeoppangV4DeliveryDtos.Action> readActions(String value) {
        try { return json.readValue(value, new TypeReference<List<BungeoppangV4DeliveryDtos.Action>>() { }); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("저장된 승인 로그 오류", exception); }
    }

    private JsonNode readTree(String value) {
        try { return json.readTree(value); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("저장된 영수증 오류", exception); }
    }

    private void validateV2Submission(JsonNode body) {
        if (body == null || !body.isObject() || !body.has("log")) {
            throw error(400, "INVALID_REQUEST", "요청 필드와 값을 확인하세요.");
        }
        body.fieldNames().forEachRemaining(field -> {
            if (!Set.of("log", "seenTips", "clientScore").contains(field)) {
                throw error(400, "INVALID_REQUEST", "요청 필드와 값을 확인하세요.");
            }
        });
        if (body.has("seenTips") && (!body.path("seenTips").isArray() || body.path("seenTips").size() > 5)) {
            throw error(400, "INVALID_REQUEST", "요청 필드와 값을 확인하세요.");
        }
        if (body.has("clientScore") && (!body.path("clientScore").isIntegralNumber()
                || !body.path("clientScore").canConvertToInt() || body.path("clientScore").intValue() < 0)) {
            throw error(400, "INVALID_REQUEST", "요청 필드와 값을 확인하세요.");
        }
    }

    private void rememberTips(long userId, JsonNode submittedTips) {
        var profile = repository.profile(userId);
        var seen = new TreeSet<>(tips(profile.seenTips()));
        submittedTips.forEach(tip -> {
            if (tip.isTextual() && BungeoppangRules.TIP_KEYS.contains(tip.textValue())) { seen.add(tip.textValue()); }
        });
        profile.remember(String.join(",", seen));
    }

    private MinigameException terminalError(String status) {
        return switch (status) {
            case "ABANDONED" -> error(409, "MINIGAME_ALREADY_ABANDONED", "이미 포기한 미니게임입니다.");
            case "INVALID" -> error(409, "MINIGAME_ALREADY_INVALID", "이미 만료되거나 무효인 미니게임입니다.");
            case "COMPLETED" -> error(409, "MINIGAME_ALREADY_COMPLETED", "이미 완료한 미니게임입니다.");
            default -> error(409, "GAME_NOT_ACTIVE", "진행 중인 미니게임이 아닙니다.");
        };
    }

    public MinigameAbandonResponse abandon(long userId, long sessionId) {
        return transactions.execute(tx -> {
            lockWallet(userId);
            MinigameSession session = requireSession(userId, sessionId, true);
            if ("COMPLETED".equals(session.status())) {
                throw error(409, "MINIGAME_ALREADY_COMPLETED", "이미 보상이 확정된 미니게임입니다.");
            }
            if (!"ABANDONED".equals(session.status())) {
                requirePlaying(session);
                session.abandon(now());
                terminateV4(session.id(), "USER_ABANDONED");
                activityEnded(session);
                repository.flush();
            }
            return new MinigameAbandonResponse(Long.toString(sessionId), session.status(), 0);
        });
    }

    private long earned(long userId, Instant current) {
        var date = current.atZone(SEOUL).toLocalDate();
        return repository.earned(userId, date.atStartOfDay(SEOUL).toInstant(),
                date.plusDays(1).atStartOfDay(SEOUL).toInstant());
    }

    private boolean expired(MinigameSession session, Instant current) {
        var record = repository.record(session.id());
        if (record.isPresent() && hasRound(record.get())) {
            return !current.isBefore(requireV4Round(session.id(), false).expiresAt());
        }
        return !current.isBefore(session.startedAt().plusSeconds(600));
    }

    private void invalidate(MinigameSession session, Instant current, String reason) {
        session.invalidate(current);
        terminateV4(session.id(), reason);
        activityEnded(session);
    }

    /**
     * Every PLAYING-to-terminal transition (complete, abandon, supersede, expiry, rejection) ends the public
     * activity of exactly this session. The world ignores it if a newer session of the user already started.
     */
    private void activityEnded(MinigameSession session) {
        activityEvents.accept(new MinigameActivityChanged(session.userId(), session.id(), null));
    }

    /** v4 and v5 both keep their time origin and terminal reason in the round row. */
    private void terminateV4(long sessionId, String reason) {
        repository.record(sessionId).filter(this::hasRound)
                .ifPresent(ignored -> requireV4Round(sessionId, true).terminate(reason));
    }

    private boolean hasRound(BungeoppangRecord record) {
        return V4.equals(record.rulesVersion()) || V5.equals(record.rulesVersion());
    }

    private void validateStart(String type, String version, String key) {
        if (!BUNGEOPPANG.equals(type)) {
            throw error(400, "UNSUPPORTED_MINIGAME", "지원하지 않는 미니게임입니다.");
        }
        if (!V2.equals(version) && !V4.equals(version) && !(v5Enabled && V5.equals(version))) {
            throw versionMismatch();
        }
        if (key == null || !key.matches("[A-Za-z0-9_-]{1,64}")) {
            throw error(400, "INVALID_REQUEST", "중복 방지 키를 확인하세요.");
        }
    }

    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MILLIS); }
    private List<String> tips(String value) { return value.isEmpty() ? List.of() : Arrays.asList(value.split(",")); }

    private Wallet lockWallet(long userId) {
        return repository.lockWallet(userId).orElseThrow(() ->
                error(503, "MINIGAME_UNAVAILABLE", "지갑 정보를 확인할 수 없습니다."));
    }

    private MinigameSession requireSession(long userId, long sessionId, boolean lock) {
        return repository.session(userId, sessionId, lock).orElseThrow(() ->
                error(404, "MINIGAME_NOT_FOUND", "미니게임을 찾을 수 없습니다."));
    }

    private BungeoppangRecord requireAnyRecord(long sessionId) {
        return repository.record(sessionId).orElseThrow(this::versionMismatch);
    }

    private BungeoppangRecord requireV2Record(long sessionId) {
        BungeoppangRecord record = requireAnyRecord(sessionId);
        if (!V2.equals(record.rulesVersion())) { throw versionMismatch(); }
        return record;
    }

    private BungeoppangV4Round requireV4Round(long sessionId, boolean lock) {
        return repository.v4Round(sessionId, lock).orElseThrow(this::versionMismatch);
    }

    private List<Integer> heats(BungeoppangRecord record) {
        try { return json.readValue(record.heats(), new TypeReference<List<Integer>>() { }); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("저장된 불 세기 오류", exception); }
    }

    private BungeoppangV4Responses.Checkpoint checkpoint(BungeoppangV4Round round) {
        return read(round.checkpointJson(), BungeoppangV4Responses.Checkpoint.class);
    }

    private V4ConfigSnapshot config(BungeoppangV4Round round) {
        return read(round.configJson(), V4ConfigSnapshot.class);
    }

    private BungeoppangV5Responses.Checkpoint v5Checkpoint(BungeoppangV4Round round) {
        return read(round.checkpointJson(), BungeoppangV5Responses.Checkpoint.class);
    }

    private V5ConfigSnapshot v5Config(BungeoppangV4Round round) {
        return read(round.configJson(), V5ConfigSnapshot.class);
    }

    private BungeoppangV5Rules.Order v5Order(BungeoppangV5Order order) {
        return new BungeoppangV5Rules.Order(Long.toString(order.orderId()), order.customerSlot(),
                order.availableAfterSeq(), new BungeoppangV4Rules.FillingCounts(order.bean(), order.custard(),
                        order.pizza(), order.chocolate()));
    }

    private MinigameException rejected(BungeoppangRecord record) {
        return new MinigameException(422, "LOG_INVALID", "입력 기록을 확인할 수 없습니다.",
                record.rejectionDetail(), record.rejectionIndex());
    }

    private void requirePlaying(MinigameSession session) {
        if (!"PLAYING".equals(session.status())) {
            throw error(409, "MINIGAME_ALREADY_" + session.status(), "이미 종료된 미니게임입니다.");
        }
    }

    private String write(Object value) {
        try { return json.writeValueAsString(value); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("미니게임 저장 오류", exception); }
    }

    private <T> T read(String value, Class<T> type) {
        try { return json.readValue(value, type); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("미니게임 조회 오류", exception); }
    }

    private MinigameException versionMismatch() {
        return error(409, "RULES_VERSION_MISMATCH", "지원하지 않는 규칙 버전입니다.");
    }

    private MinigameException error(int status, String code, String message) {
        return new MinigameException(status, code, message);
    }

    private record V4ConfigSnapshot(BungeoppangV4Responses.Rules rules, int startBufferMs,
            int submissionGraceMs, int processingDrainMs) {
    }

    private record V5ConfigSnapshot(BungeoppangV5Responses.Rules rules, int startBufferMs,
            int submissionGraceMs, int processingDrainMs) {
    }

    private record DeliveryDecision(BungeoppangV4DeliveryDtos.Response response, int status,
            BungeoppangV4DeliveryDtos.ErrorResponse error) {
        static DeliveryDecision success(BungeoppangV4DeliveryDtos.Response response) {
            return new DeliveryDecision(response, 200, null);
        }

        static DeliveryDecision failure(int status, BungeoppangV4DeliveryDtos.ErrorResponse error) {
            return new DeliveryDecision(null, status, error);
        }
    }

    private static final class DeliveryBucket {
        private double tokens = 20;
        private long updatedAt = Long.MIN_VALUE;

        synchronized boolean allow(long now) {
            if (updatedAt == Long.MIN_VALUE) { updatedAt = now; }
            long elapsed = Math.max(0, now - updatedAt);
            tokens = Math.min(20, tokens + elapsed * 0.01);
            updatedAt = now;
            if (tokens < 1) { return false; }
            tokens -= 1;
            return true;
        }
    }
}
