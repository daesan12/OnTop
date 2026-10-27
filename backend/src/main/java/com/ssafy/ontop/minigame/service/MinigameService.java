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
import com.ssafy.ontop.minigame.domain.MinigameSession;
import com.ssafy.ontop.minigame.domain.MinigameStartRequest;
import com.ssafy.ontop.minigame.dto.BungeoppangStatusResponse;
import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

public class MinigameService {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final String BUNGEOPPANG = "BUNGEOPPANG";
    private static final String V2 = BungeoppangRules.VERSION;
    private static final String V4 = BungeoppangV4Spec.RULES_VERSION;

    private final MinigameRepository repository;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final int startsPerMinute;
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final SecureRandom random = new SecureRandom();
    private final BungeoppangRules rules = new BungeoppangRules();
    private final BungeoppangV4Rules v4Rules = new BungeoppangV4Rules();
    private final ConcurrentHashMap<Long, DeliveryBucket> deliveryRates = new ConcurrentHashMap<>();

    public MinigameService(MinigameRepository repository, PlatformTransactionManager manager, Clock clock) {
        this(repository, manager, clock, 10);
    }

    public MinigameService(MinigameRepository repository, PlatformTransactionManager manager, Clock clock,
            int startsPerMinute) {
        if (startsPerMinute < 1) { throw new IllegalArgumentException("시작 제한은 1 이상이어야 합니다."); }
        this.repository = repository;
        this.transactions = new TransactionTemplate(manager);
        this.transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.clock = clock;
        this.startsPerMinute = startsPerMinute;
    }

    /** Existing v2 entry point retained for binary and test compatibility. */
    public MinigameStartResponse start(long userId, String type, String key) {
        return (MinigameStartResponse) startVersion(userId, type, V2, key);
    }

    public BungeoppangV4Responses.StartResponse startV4(long userId, String type, String key) {
        return (BungeoppangV4Responses.StartResponse) startVersion(userId, type, V4, key);
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
                }
            }

            boolean firstGame = repository.firstGame(userId);
            BungeoppangV4Responses.Timing timing = V4.equals(requestedVersion)
                    ? BungeoppangV4Spec.timing(issuedAt) : null;
            MinigameSession session = new MinigameSession(userId,
                    timing == null ? issuedAt : timing.playStartsAt());
            repository.persist(session);
            repository.flush();

            int heatCount = V4.equals(requestedVersion) ? BungeoppangV4Spec.rules().heatListLength() : 64;
            List<Integer> heats = random.ints(heatCount, 85, 116).boxed().toList();
            BungeoppangRecord record = new BungeoppangRecord(session.id(), requestedVersion, write(heats), firstGame);
            repository.persist(record);
            if (V4.equals(requestedVersion)) {
                persistV4Source(session.id(), issuedAt, timing);
            }
            repository.persist(new MinigameStartRequest(userId, key, session.id()));
            repository.flush();
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

    private Object startResponse(MinigameSession session, BungeoppangRecord record) {
        if (V2.equals(record.rulesVersion())) {
            return new MinigameStartResponse(Long.toString(session.id()), session.minigameType(), "PLAYING",
                    session.startedAt(), record.rulesVersion(), heats(record), record.firstGame());
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
            if (!V4.equals(record.rulesVersion())) { throw versionMismatch(); }
            return v4SessionResponse(session, record, current, includeSource, includeProgress, deliveryKey);
        });
    }

    private BungeoppangV4Responses.SessionResponse v4SessionResponse(MinigameSession session,
            BungeoppangRecord record, Instant current, boolean includeSource, boolean includeProgress,
            String deliveryKey) {
        BungeoppangV4Round round = requireV4Round(session.id(), false);
        boolean active = "PLAYING".equals(session.status());
        boolean progress = active || includeProgress;
        List<BungeoppangV4DeliveryDtos.Action> accepted = progress ? acceptedLog(session.id()) : List.of();
        Object lookup = deliveryKey == null ? null : deliveryLookup(session.id(), deliveryKey);
        return new BungeoppangV4Responses.SessionResponse(Long.toString(session.id()), V4,
                round.configVersion(), session.status(), BungeoppangV4Spec.phase(session.status(), current, round),
                session.score(), session.rewardAmount(), session.endedAt(), active ? null : round.terminalReason(),
                current, session.startedAt(), BungeoppangV4Spec.timing(round),
                progress ? checkpoint(round) : null, new ArrayList<>(accepted),
                progress ? repository.v4Orders(session.id()).stream().map(BungeoppangV4Spec::order).toList() : List.of(),
                null, lookup, includeSource ? config(round).rules() : null,
                includeSource ? heats(record) : null, includeSource ? round.issuedAt() : null,
                includeSource ? record.firstGame() : null);
    }

    public BungeoppangV4DeliveryDtos.Response deliver(long userId, long sessionId, String key,
            BungeoppangV4DeliveryDtos.Request request) {
        if (!deliveryRates.computeIfAbsent(userId, ignored -> new DeliveryBucket()).allow(clock.millis())) {
            throw error(429, "TOO_MANY_REQUESTS", "납품 요청이 너무 많습니다. 잠시 후 다시 시도하세요.");
        }
        DeliveryDecision decision = transactions.execute(tx -> deliverInTransaction(userId, sessionId, key, request));
        if (decision.error() != null) {
            throw new StoredMinigameResponseException(decision.status(), decision.error());
        }
        return decision.response();
    }

    private DeliveryDecision deliverInTransaction(long userId, long sessionId, String key,
            BungeoppangV4DeliveryDtos.Request request) {
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
        if (!current.isBefore(round.submitDeadline())) {
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
            validateActionClock(current, round, last);
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
        Object result = transactions.execute(tx -> finish(userId, sessionId, submission));
        if (result instanceof MinigameException failure) { throw failure; }
        return (MinigameCompleteResponse) result;
    }

    private Object finish(long userId, long sessionId, JsonNode submission) {
        Wallet wallet = lockWallet(userId);
        MinigameSession session = requireSession(userId, sessionId, true);
        BungeoppangRecord record = requireV2Record(sessionId);
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
            repository.flush();
            return exception;
        }
        long calculated = score.score() / 15;
        long today = earned(userId, current);
        long reward = Math.min(calculated, Math.max(0, BungeoppangRules.DAILY_CAP - today));
        wallet.creditReward(reward);
        session.complete(score.score(), reward, current);
        if (reward > 0) {
            repository.persist(WalletTransaction.minigameReward(wallet.id(), session.id(), reward,
                    "minigame-reward:" + session.id()));
        }
        var profile = repository.profile(userId);
        var seen = new TreeSet<>(tips(profile.seenTips()));
        submission.path("seenTips").forEach(tip -> {
            if (tip.isTextual() && BungeoppangRules.TIP_KEYS.contains(tip.textValue())) { seen.add(tip.textValue()); }
        });
        profile.remember(String.join(",", seen));
        var response = new MinigameCompleteResponse(Long.toString(sessionId), "COMPLETED", score.made(), reward,
                score.score(), score.made(), score.golden(), score.failed(), score.wasted(), score.maxCombo(),
                calculated, reward, today + reward, BungeoppangRules.DAILY_CAP,
                today + reward >= BungeoppangRules.DAILY_CAP);
        record.accept(write(submission), write(response));
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
        if (record.isPresent() && V4.equals(record.get().rulesVersion())) {
            return !current.isBefore(requireV4Round(session.id(), false).expiresAt());
        }
        return !current.isBefore(session.startedAt().plusSeconds(600));
    }

    private void invalidate(MinigameSession session, Instant current, String reason) {
        session.invalidate(current);
        terminateV4(session.id(), reason);
    }

    private void terminateV4(long sessionId, String reason) {
        repository.record(sessionId).filter(record -> V4.equals(record.rulesVersion()))
                .ifPresent(ignored -> requireV4Round(sessionId, true).terminate(reason));
    }

    private void validateStart(String type, String version, String key) {
        if (!BUNGEOPPANG.equals(type)) {
            throw error(400, "UNSUPPORTED_MINIGAME", "지원하지 않는 미니게임입니다.");
        }
        if (!V2.equals(version) && !V4.equals(version)) { throw versionMismatch(); }
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
