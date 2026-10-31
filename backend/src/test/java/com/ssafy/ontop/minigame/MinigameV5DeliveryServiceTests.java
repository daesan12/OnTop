package com.ssafy.ontop.minigame;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.minigame.domain.BungeoppangProfile;
import com.ssafy.ontop.minigame.domain.BungeoppangRecord;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Progress;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Receipt;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Round;
import com.ssafy.ontop.minigame.domain.BungeoppangV5Order;
import com.ssafy.ontop.minigame.domain.MinigameSession;
import com.ssafy.ontop.minigame.domain.MinigameStartRequest;
import com.ssafy.ontop.minigame.dto.BungeoppangV4CompleteDtos;
import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;
import com.ssafy.ontop.minigame.dto.BungeoppangV5Responses;
import com.ssafy.ontop.minigame.repository.MinigameRepository;
import com.ssafy.ontop.minigame.service.BungeoppangV5DeliveryContract;
import com.ssafy.ontop.minigame.service.BungeoppangV5Spec;
import com.ssafy.ontop.minigame.service.MinigameActivityChanged;
import com.ssafy.ontop.minigame.service.MinigameException;
import com.ssafy.ontop.minigame.service.MinigameService;
import com.ssafy.ontop.minigame.service.StoredMinigameResponseException;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.BeanUtils;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** v5 selected delivery, replacement issue, recovery and final settlement over an in-memory repository. */
class MinigameV5DeliveryServiceTests {
    private static final long USER_ID = 101;
    private static final Instant NOW = Instant.parse("2026-10-28T00:00:00.123Z");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final MinigameRepository repository = mock(MinigameRepository.class);
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    private final Wallet wallet = BeanUtils.instantiateClass(Wallet.class);
    private final Map<Long, MinigameSession> sessions = new HashMap<>();
    private final Map<Long, BungeoppangRecord> records = new HashMap<>();
    private final Map<Long, BungeoppangV4Round> rounds = new HashMap<>();
    private final Map<Long, List<BungeoppangV5Order>> orders = new HashMap<>();
    private final Map<Long, BungeoppangV4Progress> progresses = new HashMap<>();
    private final Map<String, BungeoppangV4Receipt> receipts = new HashMap<>();
    private final Map<String, MinigameStartRequest> startRequests = new HashMap<>();
    private final List<WalletTransaction> ledger = new ArrayList<>();
    private final List<MinigameActivityChanged> activityEvents = new ArrayList<>();
    private final AtomicLong nextSessionId = new AtomicLong(902);
    private final AdjustableClock clock = new AdjustableClock(NOW);

    private MinigameService service;
    private BungeoppangV5Responses.StartResponse started;
    private long id;
    /** The config version stored with the round under test; request hashes are seeded with it. */
    private String config = BungeoppangV5Spec.CONFIG_VERSION;

    @BeforeEach
    void fixture() {
        ReflectionTestUtils.setField(wallet, "id", 1L);
        ReflectionTestUtils.setField(wallet, "balance", 100L);
        ReflectionTestUtils.setField(wallet, "reserved", 10L);
        when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(repository.lockWallet(USER_ID)).thenReturn(Optional.of(wallet));
        when(repository.profile(USER_ID)).thenReturn(new BungeoppangProfile(USER_ID));
        when(repository.firstGame(USER_ID)).thenReturn(true);
        when(repository.startsSince(anyLong(), any())).thenReturn(0L);
        when(repository.playing(USER_ID)).thenAnswer(ignored -> sessions.values().stream()
                .filter(session -> "PLAYING".equals(session.status())).toList());
        when(repository.startRequest(anyLong(), any()))
                .thenAnswer(invocation -> Optional.ofNullable(startRequests.get(invocation.<String>getArgument(1))));
        when(repository.session(anyLong(), anyLong(), anyBoolean()))
                .thenAnswer(invocation -> Optional.ofNullable(sessions.get(invocation.<Long>getArgument(1))));
        when(repository.record(anyLong()))
                .thenAnswer(invocation -> Optional.ofNullable(records.get(invocation.<Long>getArgument(0))));
        when(repository.v4Round(anyLong(), anyBoolean()))
                .thenAnswer(invocation -> Optional.ofNullable(rounds.get(invocation.<Long>getArgument(0))));
        when(repository.v5Orders(anyLong())).thenAnswer(invocation -> List.copyOf(
                orders.getOrDefault(invocation.<Long>getArgument(0), List.of())));
        when(repository.v4Progress(anyLong(), anyBoolean()))
                .thenAnswer(invocation -> Optional.ofNullable(progresses.get(invocation.<Long>getArgument(0))));
        when(repository.v4Receipt(anyLong(), any(), any())).thenAnswer(invocation -> Optional.ofNullable(
                receipts.get(invocation.getArgument(0) + ":" + invocation.getArgument(1) + ":"
                        + invocation.getArgument(2))));
        when(repository.acceptedV4Delivery(anyLong(), anyLong())).thenAnswer(invocation -> receipts.values().stream()
                .filter(receipt -> receipt.sessionId() == invocation.<Long>getArgument(0)
                        && receipt.acceptedOrderId() != null
                        && receipt.acceptedOrderId() == invocation.<Long>getArgument(1))
                .findFirst());
        doAnswer(invocation -> {
            Object entity = invocation.getArgument(0);
            if (entity instanceof MinigameSession session) {
                long sessionId = nextSessionId.getAndIncrement();
                ReflectionTestUtils.setField(session, "id", sessionId);
                sessions.put(sessionId, session);
            } else if (entity instanceof BungeoppangRecord record) {
                records.put((long) ReflectionTestUtils.getField(record, "sessionId"), record);
            } else if (entity instanceof BungeoppangV4Round round) {
                rounds.put(round.sessionId(), round);
            } else if (entity instanceof BungeoppangV5Order order) {
                orders.computeIfAbsent(order.sessionId(), ignored -> new ArrayList<>()).add(order);
            } else if (entity instanceof BungeoppangV4Progress progress) {
                progresses.put(progress.sessionId(), progress);
            } else if (entity instanceof BungeoppangV4Receipt receipt) {
                receipts.put(receipt.sessionId() + ":" + receipt.operation() + ":" + receipt.requestKey(), receipt);
            } else if (entity instanceof MinigameStartRequest request) {
                startRequests.put((String) ReflectionTestUtils.getField(request, "requestKey"), request);
            } else if (entity instanceof WalletTransaction transaction) {
                ledger.add(transaction);
            }
            return null;
        }).when(repository).persist(any());
        service = new MinigameService(repository, manager, clock, 10, true, activityEvents::add);
        started = service.startV5(USER_ID, "BUNGEOPPANG", "v5-start");
        id = Long.parseLong(started.minigameSessionId());
        // Fixed heat 100 and known opening items make every expected value exact.
        ReflectionTestUtils.setField(records.get(id), "heats", "[" + "100,".repeat(2_047) + "100]");
        items(1, 2, 0);
        items(2, 1, 0);
        items(3, 0, 1);
        clock.set(NOW.plusSeconds(40));
    }

    @Test
    void 선택한_주문을_종류별_먼저_만든_빵으로_승인하고_같은_자리에_다음_주문을_발급한다() {
        var request = delivery(twoBeans(), "2", "deliver-two");

        BungeoppangV5Responses.DeliveryResponse approved = service.deliverV5(USER_ID, id, "deliver-two", request);

        assertThat(approved.accepted()).isTrue();
        assertThat(approved.orderId()).isEqualTo("2");
        assertThat(approved.deliveryKey()).isEqualTo("deliver-two");
        assertThat(approved.consumedBreadIds()).containsExactly(1L);
        assertThat(approved.scoreDelta()).isEqualTo(10);
        assertThat(approved.bonusDelta()).isZero();
        assertThat(approved.throughSeq()).isEqualTo(9);
        assertThat(approved.prefixHash()).isEqualTo(request.prefixHash());
        assertThat(approved.replacementOrder().orderId()).isEqualTo("4");
        assertThat(approved.replacementOrder().customerSlot()).isOne();
        assertThat(approved.replacementOrder().availableAfterSeq()).isEqualTo(9);

        var checkpoint = approved.checkpoint();
        assertThat(checkpoint.revision()).isOne();
        assertThat(checkpoint.throughSeq()).isEqualTo(9);
        assertThat(checkpoint.prefixHash()).isEqualTo(request.prefixHash());
        assertThat(checkpoint.tray()).extracting(bread -> bread.breadId()).containsExactly(2L);
        assertThat(checkpoint.stats().score()).isEqualTo(10);
        assertThat(checkpoint.stats().customersServed()).isOne();
        assertThat(checkpoint.activeOrders()).extracting(BungeoppangV5Responses.Order::orderId)
                .containsExactly("1", "3", "4");
        assertThat(checkpoint.activeOrders()).contains(approved.replacementOrder());

        assertThat(orders.get(id)).hasSize(4).last().satisfies(order -> {
            assertThat(order.orderId()).isEqualTo(4);
            assertThat(order.customerSlot()).isOne();
            assertThat(order.availableAfterSeq()).isEqualTo(9);
        });
        assertThat(rounds.get(id).revision()).isOne();
        assertThat(rounds.get(id).approvedThroughSeq()).isEqualTo(9);
        assertThat(rounds.get(id).approvedPrefixHash()).isEqualTo(request.prefixHash());
        assertThat(receipts.get(id + ":DELIVERY:deliver-two").acceptedOrderId()).isEqualTo(2);
        assertThat(wallet.balance()).isEqualTo(100);
        assertThat(ledger).isEmpty();
    }

    @Test
    void 같은_키와_본문의_재시도는_최초_응답을_재생하고_주문을_다시_만들지_않는다() {
        var request = delivery(twoBeans(), "1", "deliver-one");
        var first = service.deliverV5(USER_ID, id, "deliver-one", request);
        clock.set(NOW.plusSeconds(50));

        var replay = service.deliverV5(USER_ID, id, "deliver-one", request);

        assertThat(replay).isEqualTo(first);
        assertThat(first.consumedBreadIds()).containsExactly(1L, 2L);
        assertThat(first.scoreDelta()).isEqualTo(20);
        assertThat(orders.get(id)).hasSize(4);
        assertThat(rounds.get(id).revision()).isOne();

        var changed = delivery(append(twoBeans(), pour(9, 26_400, 2)), "1", "deliver-one");
        assertThatThrownBy(() -> service.deliverV5(USER_ID, id, "deliver-one", changed))
                .isInstanceOfSatisfying(MinigameException.class,
                        error -> assertThat(error.code()).isEqualTo("IDEMPOTENCY_KEY_CONFLICT"));
    }

    @Test
    void 이미_납품한_주문과_활성이_아닌_주문과_수량_부족은_상태를_바꾸지_않고_거절한다() {
        var approved = delivery(twoBeans(), "1", "deliver-one");
        service.deliverV5(USER_ID, id, "deliver-one", approved);
        long revision = rounds.get(id).revision();

        var again = delivery(append(approved.log(), deliver(10, 26_450, "1", "again")), "1", "again");
        assertRejected(() -> service.deliverV5(USER_ID, id, "again", again), 409, "ORDER_ALREADY_DELIVERED");

        var unknown = delivery(append(approved.log(), deliver(10, 26_450, "9", "unknown")), "9", "unknown");
        assertRejected(() -> service.deliverV5(USER_ID, id, "unknown", unknown), 409, "STALE_ORDER");

        // The tray is empty after the first delivery, so the custard order cannot be filled.
        var short3 = delivery(append(approved.log(), deliver(10, 26_450, "3", "custard")), "3", "custard");
        assertRejected(() -> service.deliverV5(USER_ID, id, "custard", short3), 422, "DELIVERY_REJECTED");

        assertThat(rounds.get(id).revision()).isEqualTo(revision);
        assertThat(orders.get(id)).hasSize(4);
        assertThat(receipts.get(id + ":DELIVERY:custard").outcome()).isEqualTo("REJECTED");
    }

    @Test
    void 충원_주문은_발급된_뒤에만_납품할_수_있다() {
        var early = delivery(twoBeans(), "4", "early");
        assertRejected(() -> service.deliverV5(USER_ID, id, "early", early), 409, "STALE_ORDER");
        assertThat(orders.get(id)).hasSize(3);
    }

    @Test
    void 같은_revision을_쓴_다른_요청은_승인된_prefix와_충돌로_거절한다() {
        service.deliverV5(USER_ID, id, "deliver-two", delivery(twoBeans(), "2", "deliver-two"));

        var stalePrefix = delivery(twoBeans(), "1", "deliver-one");
        assertRejected(() -> service.deliverV5(USER_ID, id, "deliver-one", stalePrefix), 409, "PREFIX_MISMATCH");
        assertThat(rounds.get(id).revision()).isOne();
        assertThat(orders.get(id)).hasSize(4);
    }

    @Test
    void 연속_납품은_다음_주문_ID와_비운_자리를_이어서_발급한다() {
        var first = delivery(twoBeans(), "2", "deliver-two");
        service.deliverV5(USER_ID, id, "deliver-two", first);
        items(4, 1, 0);

        var log = append(first.log(), deliver(10, 26_450, "4", "deliver-four"));
        var second = service.deliverV5(USER_ID, id, "deliver-four", delivery(log, "4", "deliver-four"));

        assertThat(second.consumedBreadIds()).containsExactly(2L);
        assertThat(second.replacementOrder().orderId()).isEqualTo("5");
        assertThat(second.replacementOrder().customerSlot()).isOne();
        assertThat(second.replacementOrder().availableAfterSeq()).isEqualTo(10);
        assertThat(second.checkpoint().revision()).isEqualTo(2);
        assertThat(second.checkpoint().activeOrders()).extracting(BungeoppangV5Responses.Order::orderId)
                .containsExactly("1", "3", "5");
    }

    @Test
    void 납품_뒤_재접속은_마지막_승인_checkpoint와_로그와_발급_주문_전체를_복구한다() {
        var request = delivery(twoBeans(), "2", "deliver-two");
        var approved = service.deliverV5(USER_ID, id, "deliver-two", request);

        var recovered = (BungeoppangV5Responses.SessionResponse) service.loadSession(USER_ID, id, false, true, null);

        assertThat(recovered.checkpoint()).isEqualTo(approved.checkpoint());
        assertThat(recovered.acceptedLog()).hasSize(9);
        assertThat(BungeoppangV5DeliveryContract.prefixHash(id, started.configVersion(), request.log()))
                .isEqualTo(recovered.checkpoint().prefixHash());
        assertThat(recovered.issuedOrders()).extracting(BungeoppangV5Responses.Order::orderId)
                .containsExactly("1", "2", "3", "4");
        assertThat(recovered.issuedOrders().getLast().availableAfterSeq()).isEqualTo(9);
    }

    @Test
    void 납품_뒤_같은_시작_키를_재시도해도_최초_시작_checkpoint를_돌려준다() {
        // Opening items were overwritten after the start, so compare against a start rebuilt from the same source.
        var before = service.startV5(USER_ID, "BUNGEOPPANG", "v5-start");
        service.deliverV5(USER_ID, id, "deliver-two", delivery(twoBeans(), "2", "deliver-two"));

        var retried = service.startV5(USER_ID, "BUNGEOPPANG", "v5-start");

        assertThat(retried).isEqualTo(before);
        assertThat(retried.checkpoint().throughSeq()).isZero();
        assertThat(retried.checkpoint().revision()).isZero();
        assertThat(retried.checkpoint().activeOrders()).extracting(BungeoppangV5Responses.Order::orderId)
                .containsExactly("1", "2", "3");
        assertThat(rounds.get(id).revision()).isOne();
    }

    @Test
    void 완료는_서버_점수로_한번만_정산하고_말풍선을_한번_해제한다() {
        var request = delivery(twoBeans(), "1", "deliver-one");
        service.deliverV5(USER_ID, id, "deliver-one", request);
        clock.set(NOW.plusMillis(125_000));
        JsonNode body = completeBody(request.log(), 999_999);

        var first = (BungeoppangV4CompleteDtos.Response) service.complete(USER_ID, id, "done-one", body);
        var sameKey = service.complete(USER_ID, id, "done-one", body);
        var anotherKey = service.complete(USER_ID, id, "done-two", body);

        assertThat(sameKey).isEqualTo(first);
        assertThat(anotherKey).isEqualTo(first);
        assertThat(first.rulesVersion()).isEqualTo("v5");
        assertThat(first.configVersion()).isEqualTo(BungeoppangV5Spec.CONFIG_VERSION);
        assertThat(first.score()).isEqualTo(20);
        assertThat(first.coinsCalculated()).isOne();
        assertThat(first.coinsGranted()).isOne();
        assertThat(first.rewardAmount()).isOne();
        assertThat(first.customersServed()).isOne();
        assertThat(first.finalThroughSeq()).isEqualTo(9);
        assertThat(first.verifiedCompletedCount()).isEqualTo(first.made());
        assertThat(wallet.balance()).isEqualTo(101);
        assertThat(ledger).hasSize(1);
        assertThat(sessions.get(id).status()).isEqualTo("COMPLETED");
        assertThat(rounds.get(id).terminalReason()).isEqualTo("VERIFIED");
        assertThat(activityEvents).filteredOn(event -> event.activeUntil() == null)
                .containsExactly(new MinigameActivityChanged(USER_ID, id, null));
        var loaded = (BungeoppangV5Responses.SessionResponse) service.loadSession(USER_ID, id, false);
        assertThat(loaded.result()).isEqualTo(first);
    }

    @Test
    void 완료에_남은_미승인_납품_한_건은_같은_트랜잭션에서_승인하고_충원_주문까지_재계산한다() {
        clock.set(NOW.plusMillis(125_000));
        var log = append(twoBeans(), deliver(9, 26_400, "1", "last-delivery"));

        var result = (BungeoppangV4CompleteDtos.Response) service.complete(USER_ID, id, "done",
                completeBody(log, 0));

        assertThat(result.score()).isEqualTo(20);
        assertThat(result.customersServed()).isOne();
        assertThat(receipts).containsKey(id + ":DELIVERY:last-delivery");
        assertThat(orders.get(id)).hasSize(4);
        assertThat(wallet.balance()).isEqualTo(101);
    }

    @Test
    void 일일_상한이_차면_0냥으로_완료하고_원장을_남기지_않는다() {
        when(repository.earned(eq(USER_ID), any(), any())).thenReturn(500L);
        var request = delivery(twoBeans(), "1", "deliver-one");
        service.deliverV5(USER_ID, id, "deliver-one", request);
        clock.set(NOW.plusMillis(125_000));

        var result = (BungeoppangV4CompleteDtos.Response) service.complete(USER_ID, id, "done",
                completeBody(request.log(), 0));

        assertThat(result.coinsCalculated()).isOne();
        assertThat(result.coinsGranted()).isZero();
        assertThat(result.capReached()).isTrue();
        assertThat(wallet.balance()).isEqualTo(100);
        assertThat(ledger).isEmpty();
    }

    @Test
    void 종료_전_완료는_상태를_소비하지_않고_기한_뒤_완료는_만료하며_말풍선을_해제한다() {
        var body = completeBody(twoBeans(), 0);
        assertRejected(() -> {
            Object result = service.complete(USER_ID, id, "early", body);
            if (result instanceof RuntimeException failure) { throw failure; }
        }, 422, "TOO_EARLY");
        assertThat(sessions.get(id).status()).isEqualTo("PLAYING");

        clock.set(NOW.plusMillis(149_500));
        assertRejected(() -> service.complete(USER_ID, id, "late", body), 409, "GAME_NOT_ACTIVE");
        assertThat(sessions.get(id).status()).isEqualTo("INVALID");
        assertThat(rounds.get(id).terminalReason()).isEqualTo("SUBMISSION_EXPIRED");
        assertThat(wallet.balance()).isEqualTo(100);
        assertThat(activityEvents).last().isEqualTo(new MinigameActivityChanged(USER_ID, id, null));
    }

    @Test
    void 신규_2분_판은_119999ms_납품을_받고_120000ms_납품은_서버_시각_검증에서_거절한다() {
        clock.set(NOW.plusMillis(124_500));

        var over = delivery(append(twoBeans(), deliver(9, 120_000, "1", "over")), "1", "over");
        assertRejected(() -> service.deliverV5(USER_ID, id, "over", over), 422, "TIME_AHEAD");
        assertThat(rounds.get(id).revision()).isZero();
        assertThat(orders.get(id)).hasSize(3);

        var edge = delivery(append(twoBeans(), deliver(9, 119_999, "1", "edge")), "1", "edge");
        var approved = service.deliverV5(USER_ID, id, "edge", edge);
        assertThat(approved.scoreDelta()).isEqualTo(20);
        assertThat(approved.checkpoint().lastAt()).isEqualTo(119_999);
    }

    @Test
    void 신규_2분_판은_playEndsAt_전_완료를_거절하고_120000ms_행동이_든_최종_로그는_정산하지_않는다() {
        var edge = completeBody(append(twoBeans(), pour(9, 119_999, 2)), 0);
        clock.set(NOW.plusMillis(124_499));
        assertRejected(() -> service.complete(USER_ID, id, "edge", edge), 422, "TOO_EARLY");

        clock.set(NOW.plusMillis(124_500));
        var over = completeBody(append(twoBeans(), pour(9, 120_000, 2)), 0);
        assertThatThrownBy(() -> service.complete(USER_ID, id, "over", over))
                .isInstanceOfSatisfying(MinigameException.class, error -> {
                    assertThat(error.code()).isEqualTo("LOG_INVALID");
                    assertThat(error.detail()).isEqualTo("BAD_ENTRY");
                    assertThat(error.index()).isEqualTo(8);
                });
        assertThat(sessions.get(id).status()).isEqualTo("PLAYING");
        assertThat(ledger).isEmpty();

        var result = (BungeoppangV4CompleteDtos.Response) service.complete(USER_ID, id, "edge", edge);
        assertThat(result.configVersion()).isEqualTo("v5-20261029.1");
        assertThat(result.finalThroughSeq()).isEqualTo(9);
        assertThat(result.unfinishedGrillCount()).isOne();
        assertThat(service.complete(USER_ID, id, "edge", edge)).isEqualTo(result);
    }

    @Test
    void 신규_2분_판의_가속은_저장된_90초부터_적용된다() {
        clock.set(NOW.plusMillis(4_500 + 92_200));
        var log = rushBread(twoBeans(), 88_000, "rush");

        var approved = service.deliverV5(USER_ID, id, "rush", delivery(log, "1", "rush"));

        // FILL 88300 → TURN 92000: 1700 ms at 8 s per side and 2000 ms at 6 s per side.
        assertThat(approved.checkpoint().slots().get(2).front()).isEqualTo(54);
    }

    @Test
    void 기존_3분_판은_저장된_180초_규칙으로_120초_뒤_행동과_150초_가속을_인정하고_한번만_정산한다() throws Exception {
        String storedConfig = legacyRound();
        clock.set(NOW.plusMillis(4_500 + 152_200));
        var request = delivery(rushBread(twoBeans(), 148_000, "legacy-rush"), "1", "legacy-rush");

        var approved = service.deliverV5(USER_ID, id, "legacy-rush", request);

        assertThat(approved.scoreDelta()).isEqualTo(20);
        assertThat(approved.checkpoint().slots().get(2).front()).isEqualTo(54);
        assertThat(approved.prefixHash()).isEqualTo(BungeoppangV5DeliveryContract.prefixHash(id,
                BungeoppangV5Spec.LEGACY_CONFIG_VERSION, request.log()));
        var recovered = (BungeoppangV5Responses.SessionResponse) service.loadSession(USER_ID, id, false, true, null);
        assertThat(recovered.checkpoint()).isEqualTo(approved.checkpoint());
        assertThat(recovered.acceptedLog()).hasSize(12);

        var body = completeBody(request.log(), 0);
        clock.set(NOW.plusMillis(184_499));
        assertRejected(() -> service.complete(USER_ID, id, "legacy-done", body), 422, "TOO_EARLY");
        assertThat(sessions.get(id).status()).isEqualTo("PLAYING");

        clock.set(NOW.plusMillis(184_500));
        var first = (BungeoppangV4CompleteDtos.Response) service.complete(USER_ID, id, "legacy-done", body);
        assertThat(service.complete(USER_ID, id, "legacy-done", body)).isEqualTo(first);
        assertThat(service.complete(USER_ID, id, "legacy-done-2", body)).isEqualTo(first);

        assertThat(first.configVersion()).isEqualTo(BungeoppangV5Spec.LEGACY_CONFIG_VERSION);
        assertThat(first.score()).isEqualTo(20);
        assertThat(first.coinsGranted()).isOne();
        assertThat(first.unfinishedGrillCount()).isOne();
        assertThat(first.finalThroughSeq()).isEqualTo(12);
        assertThat(wallet.balance()).isEqualTo(101);
        assertThat(ledger).hasSize(1);
        assertThat(rounds.get(id).configVersion()).isEqualTo(BungeoppangV5Spec.LEGACY_CONFIG_VERSION);
        assertThat(rounds.get(id).configJson()).isEqualTo(storedConfig);
    }

    @Test
    void 기존_3분_판의_같은_로그는_2분_규칙과_달리_평시로_익는다() throws Exception {
        legacyRound();
        clock.set(NOW.plusMillis(4_500 + 92_200));

        var approved = service.deliverV5(USER_ID, id, "rush",
                delivery(rushBread(twoBeans(), 88_000, "rush"), "1", "rush"));

        // The legacy rush starts at 150 s, so all 3700 ms cook at 8 s per side.
        assertThat(approved.checkpoint().slots().get(2).front()).isEqualTo(46);
    }

    @Test
    void 기존_3분_판의_시작_재시도와_재접속은_저장된_규칙_시간_해시를_그대로_돌려준다() throws Exception {
        legacyRound();

        var retried = service.startV5(USER_ID, "BUNGEOPPANG", "v5-start");

        assertThat(retried.configVersion()).isEqualTo(BungeoppangV5Spec.LEGACY_CONFIG_VERSION);
        assertThat(retried.rules()).isEqualTo(BungeoppangV5Spec.legacyRules());
        assertThat(retried.timing().playEndsAt()).isEqualTo(NOW.plusMillis(184_500));
        assertThat(retried.timing().expiresAt()).isEqualTo(NOW.plusMillis(209_500));
        assertThat(retried.checkpoint().prefixHash())
                .isEqualTo(BungeoppangV5Spec.initialPrefixHash(id, BungeoppangV5Spec.LEGACY_CONFIG_VERSION))
                .isNotEqualTo(BungeoppangV5Spec.initialPrefixHash(id, BungeoppangV5Spec.CONFIG_VERSION));

        // A new round would have expired at 149.5 s; the legacy round keeps its stored deadline.
        clock.set(NOW.plusMillis(150_000));
        var recovered = (BungeoppangV5Responses.SessionResponse) service.loadSession(USER_ID, id, true, true, null);
        assertThat(recovered.status()).isEqualTo("PLAYING");
        assertThat(recovered.phase()).isEqualTo("PLAYING");
        assertThat(recovered.configVersion()).isEqualTo(BungeoppangV5Spec.LEGACY_CONFIG_VERSION);
        assertThat(recovered.rules()).isEqualTo(BungeoppangV5Spec.legacyRules());
        assertThat(recovered.timing()).isEqualTo(retried.timing());
        assertThat(recovered.checkpoint().prefixHash()).isEqualTo(retried.checkpoint().prefixHash());
    }

    private void items(long orderId, int bean, int custard) {
        BungeoppangV5Order order = orders.get(id).stream().filter(candidate -> candidate.orderId() == orderId)
                .findFirst().orElseThrow();
        ReflectionTestUtils.setField(order, "bean", bean);
        ReflectionTestUtils.setField(order, "custard", custard);
        ReflectionTestUtils.setField(order, "pizza", 0);
        ReflectionTestUtils.setField(order, "chocolate", 0);
    }

    /**
     * Rewrites the started round into the row the previous release stored for a three-minute round: the legacy
     * config version and rules snapshot, 180 s timing and an opening hash seeded with the legacy version.
     * Returns the stored config JSON.
     */
    private String legacyRound() throws Exception {
        BungeoppangV4Round current = rounds.get(id);
        var opening = JSON.readValue(current.checkpointJson(), BungeoppangV5Responses.Checkpoint.class);
        String hash = BungeoppangV5Spec.initialPrefixHash(id, BungeoppangV5Spec.LEGACY_CONFIG_VERSION);
        var checkpoint = new BungeoppangV5Responses.Checkpoint(0, 0, hash, opening.heatCursor(), opening.lastAt(),
                opening.slots(), opening.tray(), opening.stats(), opening.activeOrders());
        String storedConfig = JSON.writeValueAsString(Map.of("rules", BungeoppangV5Spec.legacyRules(),
                "startBufferMs", 1_000, "submissionGraceMs", 15_000, "processingDrainMs", 10_000));
        Instant end = current.playStartsAt().plusMillis(180_000);
        rounds.put(id, new BungeoppangV4Round(id, BungeoppangV5Spec.LEGACY_CONFIG_VERSION, storedConfig,
                current.issuedAt(), current.countdownStartsAt(), current.playStartsAt(), end,
                end.plusMillis(15_000), end.plusMillis(25_000), hash, JSON.writeValueAsString(checkpoint)));
        config = BungeoppangV5Spec.LEGACY_CONFIG_VERSION;
        return storedConfig;
    }

    /** One more bean on slot 2: POUR at {@code from}, FILL 300 ms later, TURN at from + 4000, then DELIVER 1. */
    private static List<BungeoppangV4DeliveryDtos.Action> rushBread(List<BungeoppangV4DeliveryDtos.Action> log,
            int from, String key) {
        int seq = log.size();
        var next = new ArrayList<>(log);
        next.add(pour(seq + 1, from, 2));
        next.add(fill(seq + 2, from + 300, 2));
        next.add(turn(seq + 3, from + 4_000, 2));
        next.add(deliver(seq + 4, from + 4_100, "1", key));
        return next;
    }

    /** Two golden bean breads (front 80, back 80) on slots 0 and 1, finished at 26.3s. */
    private static List<BungeoppangV4DeliveryDtos.Action> twoBeans() {
        return List.of(
                pour(1, 0, 0), fill(2, 300, 0), turn(3, 6_700, 0), turn(4, 13_100, 0),
                pour(5, 13_200, 1), fill(6, 13_500, 1), turn(7, 19_900, 1), turn(8, 26_300, 1));
    }

    private BungeoppangV4DeliveryDtos.Request delivery(List<BungeoppangV4DeliveryDtos.Action> cooking,
            String orderId, String key) {
        var log = new ArrayList<>(cooking);
        BungeoppangV4DeliveryDtos.Action last = log.getLast();
        if (!"DELIVER".equals(last.action())) {
            log.add(deliver(log.size() + 1, last.t() + 100, orderId, key));
        }
        return new BungeoppangV4DeliveryDtos.Request("v5", log.size(),
                BungeoppangV5DeliveryContract.prefixHash(id, config, log), List.copyOf(log));
    }

    private JsonNode completeBody(List<BungeoppangV4DeliveryDtos.Action> actions, long clientScore) {
        var body = JSON.createObjectNode();
        body.put("rulesVersion", "v5");
        body.put("throughSeq", actions.size());
        body.put("prefixHash", BungeoppangV5DeliveryContract.prefixHash(id, config, actions));
        var log = body.putArray("log");
        actions.forEach(action -> {
            var node = log.addObject().put("seq", action.seq()).put("action", action.action()).put("t", action.t());
            if (action.slot() != null) { node.put("slot", action.slot()); }
            if (action.filling() != null) { node.put("filling", action.filling()); }
            if (action.breadId() != null) { node.put("breadId", action.breadId()); }
            if (action.orderId() != null) { node.put("orderId", action.orderId()); }
            if (action.deliveryKey() != null) { node.put("deliveryKey", action.deliveryKey()); }
        });
        body.putArray("seenTips").add("START");
        body.put("clientScore", clientScore);
        return body;
    }

    private static void assertRejected(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, int status,
            String code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(MinigameException.class, error -> {
            assertThat(error.status()).isEqualTo(status);
            String actual = error instanceof StoredMinigameResponseException stored ? stored.body().code() : error.code();
            assertThat(actual).isEqualTo(code);
        });
    }

    private static List<BungeoppangV4DeliveryDtos.Action> append(List<BungeoppangV4DeliveryDtos.Action> log,
            BungeoppangV4DeliveryDtos.Action action) {
        var next = new ArrayList<>(log);
        next.add(action);
        return next;
    }

    private static BungeoppangV4DeliveryDtos.Action pour(int seq, int t, int slot) {
        return new BungeoppangV4DeliveryDtos.Action(seq, "POUR", t, slot, null, null, null, null);
    }

    private static BungeoppangV4DeliveryDtos.Action fill(int seq, int t, int slot) {
        return new BungeoppangV4DeliveryDtos.Action(seq, "FILL", t, slot, "bean", null, null, null);
    }

    private static BungeoppangV4DeliveryDtos.Action turn(int seq, int t, int slot) {
        return new BungeoppangV4DeliveryDtos.Action(seq, "TURN", t, slot, null, null, null, null);
    }

    private static BungeoppangV4DeliveryDtos.Action deliver(int seq, int t, String orderId, String key) {
        return new BungeoppangV4DeliveryDtos.Action(seq, "DELIVER", t, null, null, null, orderId, key);
    }

    private static final class AdjustableClock extends Clock {
        private Instant instant;

        private AdjustableClock(Instant instant) {
            this.instant = instant;
        }

        void set(Instant instant) {
            this.instant = instant;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
