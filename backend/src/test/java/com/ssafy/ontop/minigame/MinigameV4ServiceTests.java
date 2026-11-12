package com.ssafy.ontop.minigame;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.minigame.domain.BungeoppangProfile;
import com.ssafy.ontop.minigame.domain.BungeoppangRecord;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Order;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Progress;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Receipt;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Round;
import com.ssafy.ontop.minigame.domain.MinigameSession;
import com.ssafy.ontop.minigame.domain.MinigameStartRequest;
import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;
import com.ssafy.ontop.minigame.dto.BungeoppangV4CompleteDtos;
import com.ssafy.ontop.minigame.service.BungeoppangV4DeliveryContract;
import com.ssafy.ontop.minigame.repository.MinigameRepository;
import com.ssafy.ontop.minigame.service.BungeoppangV4Spec;
import com.ssafy.ontop.minigame.service.MinigameActivityChanged;
import com.ssafy.ontop.minigame.service.MinigameException;
import com.ssafy.ontop.minigame.service.MinigameService;
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
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
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
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MinigameV4ServiceTests {
    private static final long USER_ID = 101;
    private static final Instant NOW = Instant.parse("2026-10-27T00:00:00.123Z");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final MinigameRepository repository = mock(MinigameRepository.class);
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    private final Wallet wallet = BeanUtils.instantiateClass(Wallet.class);
    private final Map<Long, MinigameSession> sessions = new HashMap<>();
    private final Map<Long, BungeoppangRecord> records = new HashMap<>();
    private final Map<Long, BungeoppangV4Round> rounds = new HashMap<>();
    private final Map<Long, List<BungeoppangV4Order>> orders = new HashMap<>();
    private final Map<Long, BungeoppangV4Progress> progresses = new HashMap<>();
    private final Map<String, BungeoppangV4Receipt> receipts = new HashMap<>();
    private final AtomicReference<MinigameStartRequest> receipt = new AtomicReference<>();
    private final AtomicLong nextSessionId = new AtomicLong(902);

    private MinigameService service;

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
        when(repository.playing(USER_ID)).thenReturn(List.of());
        when(repository.startRequest(USER_ID, "v4-start"))
                .thenAnswer(ignored -> Optional.ofNullable(receipt.get()));
        when(repository.session(anyLong(), anyLong(), anyBoolean()))
                .thenAnswer(invocation -> Optional.ofNullable(sessions.get(invocation.getArgument(1))));
        when(repository.record(anyLong()))
                .thenAnswer(invocation -> Optional.ofNullable(records.get(invocation.getArgument(0))));
        when(repository.v4Round(anyLong(), anyBoolean()))
                .thenAnswer(invocation -> Optional.ofNullable(rounds.get(invocation.getArgument(0))));
        when(repository.v4Orders(anyLong()))
                .thenAnswer(invocation -> orders.getOrDefault(invocation.getArgument(0), List.of()));
        when(repository.v4Progress(anyLong(), anyBoolean()))
                .thenAnswer(invocation -> Optional.ofNullable(progresses.get(invocation.getArgument(0))));
        when(repository.v4Receipt(anyLong(), any(), any()))
                .thenAnswer(invocation -> Optional.ofNullable(receipts.get(invocation.getArgument(0) + ":"
                        + invocation.getArgument(1) + ":" + invocation.getArgument(2))));
        when(repository.acceptedV4Delivery(anyLong(), anyLong())).thenAnswer(invocation -> receipts.values().stream()
                .filter(value -> value.sessionId() == (long) invocation.getArgument(0)
                        && value.acceptedOrderId() != null
                        && value.acceptedOrderId() == (long) invocation.getArgument(1)).findFirst());
        doAnswer(invocation -> {
            Object entity = invocation.getArgument(0);
            if (entity instanceof MinigameSession session) {
                long id = nextSessionId.getAndIncrement();
                ReflectionTestUtils.setField(session, "id", id);
                sessions.put(id, session);
            } else if (entity instanceof BungeoppangRecord record) {
                long id = (long) ReflectionTestUtils.getField(record, "sessionId");
                records.put(id, record);
            } else if (entity instanceof BungeoppangV4Round round) {
                rounds.put(round.sessionId(), round);
            } else if (entity instanceof BungeoppangV4Order order) {
                orders.computeIfAbsent(order.sessionId(), ignored -> new ArrayList<>()).add(order);
            } else if (entity instanceof BungeoppangV4Progress progress) {
                progresses.put(progress.sessionId(), progress);
            } else if (entity instanceof BungeoppangV4Receipt delivery) {
                receipts.put(delivery.sessionId() + ":" + delivery.operation() + ":" + delivery.requestKey(), delivery);
            } else if (entity instanceof MinigameStartRequest request) {
                receipt.set(request);
            }
            return null;
        }).when(repository).persist(any());
        service = new MinigameService(repository, manager, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void v4_시작은_설정_시각_512개불_첫주문을_한번만_생성한다() {
        BungeoppangV4Responses.StartResponse first =
                service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");
        BungeoppangV4Responses.StartResponse replay =
                service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");

        assertThat(replay).isEqualTo(first);
        assertThat(first.rulesVersion()).isEqualTo("v4");
        assertThat(first.configVersion()).isEqualTo(BungeoppangV4Spec.CONFIG_VERSION);
        assertThat(first.status()).isEqualTo("PLAYING");
        assertThat(first.phase()).isEqualTo("WAITING_START");
        assertThat(first.issuedAt()).isEqualTo(NOW);
        assertThat(first.startedAt()).isEqualTo(NOW.plusMillis(4_500));
        assertThat(first.timing().countdownStartsAt()).isEqualTo(NOW.plusMillis(1_000));
        assertThat(first.timing().playStartsAt()).isEqualTo(NOW.plusMillis(4_500));
        assertThat(first.timing().playEndsAt()).isEqualTo(NOW.plusMillis(64_500));
        assertThat(first.timing().submitDeadline()).isEqualTo(NOW.plusMillis(79_500));
        assertThat(first.timing().expiresAt()).isEqualTo(NOW.plusMillis(89_500));
        assertThat(first.heats()).hasSize(512).allMatch(heat -> heat >= 85 && heat <= 115);
        assertThat(first.checkpoint().currentOrder()).isEqualTo(BungeoppangV4Spec.firstOrder());
        assertThat(orders.get(Long.parseLong(first.minigameSessionId()))).singleElement()
                .satisfies(order -> {
                    assertThat(order.orderIndex()).isZero();
                    assertThat(order.bean()).isEqualTo(2);
                    assertThat(order.custard()).isZero();
                    assertThat(order.pizza()).isZero();
                    assertThat(order.chocolate()).isZero();
                });
        assertThat(sessions).hasSize(1);
        assertThat(records).hasSize(1);
        assertThat(rounds).hasSize(1);
    }

    @Test
    void 같은_시작키를_v2와_v4에서_다르게_쓰면_충돌하고_기존_v4는_바뀌지_않는다() {
        BungeoppangV4Responses.StartResponse created =
                service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");

        assertThatThrownBy(() -> service.start(USER_ID, "BUNGEOPPANG", "v4-start"))
                .isInstanceOfSatisfying(MinigameException.class, error -> {
                    assertThat(error.status()).isEqualTo(409);
                    assertThat(error.code()).isEqualTo("IDEMPOTENCY_KEY_CONFLICT");
                });
        assertThat(service.startV4(USER_ID, "BUNGEOPPANG", "v4-start")).isEqualTo(created);
        assertThat(sessions).hasSize(1);
    }

    @Test
    void 시간이_흘러도_같은_시작키는_최초_원점과_원본을_그대로_재생한다() {
        AdjustableClock adjustableClock = new AdjustableClock(NOW);
        service = new MinigameService(repository, manager, adjustableClock);
        BungeoppangV4Responses.StartResponse first =
                service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");

        adjustableClock.set(NOW.plusSeconds(30));
        BungeoppangV4Responses.StartResponse replay =
                service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");

        assertThat(replay).isEqualTo(first);
        assertThat(replay.issuedAt()).isEqualTo(NOW);
        assertThat(replay.timing().playStartsAt()).isEqualTo(NOW.plusMillis(4_500));
        assertThat(sessions).hasSize(1);
        assertThat(rounds).hasSize(1);
        assertThat(orders.get(Long.parseLong(first.minigameSessionId()))).hasSize(1);
    }

    @Test
    void v2_활성판이_있어도_v4_시작전에_종료하여_회원당_활성판은_하나만_남긴다() {
        MinigameSession v2 = new MinigameSession(USER_ID, NOW.minusSeconds(30));
        ReflectionTestUtils.setField(v2, "id", 901L);
        sessions.put(901L, v2);
        records.put(901L, new BungeoppangRecord(901, List.of(100).toString(), false));
        when(repository.playing(USER_ID)).thenReturn(List.of(v2));

        BungeoppangV4Responses.StartResponse created =
                service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");

        assertThat(v2.status()).isEqualTo("ABANDONED");
        assertThat(created.status()).isEqualTo("PLAYING");
        assertThat(sessions.values()).filteredOn(session -> session.status().equals("PLAYING"))
                .singleElement().extracting(MinigameSession::id)
                .isEqualTo(Long.parseLong(created.minigameSessionId()));
    }

    @Test
    void v4_활성판에서_v2를_시작하면_v4를_종료하고_활성판은_하나만_남긴다() {
        when(repository.playing(USER_ID)).thenAnswer(ignored -> sessions.values().stream()
                .filter(session -> session.status().equals("PLAYING"))
                .sorted(java.util.Comparator.comparingLong(MinigameSession::id))
                .toList());
        BungeoppangV4Responses.StartResponse v4 =
                service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");

        var v2 = service.start(USER_ID, "BUNGEOPPANG", "v2-next");
        long v4Id = Long.parseLong(v4.minigameSessionId());

        assertThat(sessions.get(v4Id).status()).isEqualTo("ABANDONED");
        assertThat(rounds.get(v4Id).terminalReason()).isEqualTo("SUPERSEDED");
        assertThat(v2.rulesVersion()).isEqualTo("v2");
        assertThat(sessions.values()).filteredOn(session -> session.status().equals("PLAYING"))
                .singleElement().extracting(MinigameSession::id)
                .isEqualTo(Long.parseLong(v2.minigameSessionId()));
    }

    @Test
    void v4_조회는_기본적으로_미래원본을_숨기고_includeSource에서만_고정원본을_준다() {
        BungeoppangV4Responses.StartResponse created =
                service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");
        long id = Long.parseLong(created.minigameSessionId());

        var normal = (BungeoppangV4Responses.SessionResponse) service.loadSession(USER_ID, id, false);
        var source = (BungeoppangV4Responses.SessionResponse) service.loadSession(USER_ID, id, true);

        assertThat(normal.rules()).isNull();
        assertThat(normal.heats()).isNull();
        assertThat(normal.issuedAt()).isNull();
        assertThat(normal.isFirstGame()).isNull();
        assertThat(normal.issuedOrders()).containsExactly(BungeoppangV4Spec.firstOrder());
        assertThat(normal.acceptedLog()).isEmpty();
        assertThat(normal.result()).isNull();
        assertThat(normal.deliveryLookup()).isNull();
        assertThat(source.rules()).isEqualTo(created.rules());
        assertThat(source.heats()).isEqualTo(created.heats());
        assertThat(source.issuedAt()).isEqualTo(created.issuedAt());
        assertThat(source.isFirstGame()).isTrue();
    }

    @Test
    void v4_완료는_전용_멱등키와_계약을_요구하고_v2로_재해석하지_않는다() {
        BungeoppangV4Responses.StartResponse created =
                service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");
        long id = Long.parseLong(created.minigameSessionId());

        assertThatThrownBy(() -> service.complete(USER_ID, id, BungeoppangFixtures.body("{\"log\":[]}")))
                .isInstanceOfSatisfying(MinigameException.class, error -> {
                    assertThat(error.status()).isEqualTo(400);
                    assertThat(error.code()).isEqualTo("INVALID_REQUEST");
                });
        assertThat(wallet.balance()).isEqualTo(100);
        assertThat(wallet.reserved()).isEqualTo(10);
        verify(repository, never()).persist(any(com.ssafy.ontop.wallet.domain.WalletTransaction.class));
    }

    @Test
    void v4_명시적_포기는_USER_ABANDONED_사유로_종결한다() {
        var activityEvents = new ArrayList<MinigameActivityChanged>();
        service = new MinigameService(repository, manager, Clock.fixed(NOW, ZoneOffset.UTC), 10, false,
                activityEvents::add);
        BungeoppangV4Responses.StartResponse created =
                service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");
        long id = Long.parseLong(created.minigameSessionId());

        assertThat(service.abandon(USER_ID, id).status()).isEqualTo("ABANDONED");
        assertThat(activityEvents).containsExactly(
                new MinigameActivityChanged(USER_ID, id, created.timing().playEndsAt()),
                new MinigameActivityChanged(USER_ID, id, null));
        var response = (BungeoppangV4Responses.SessionResponse) service.loadSession(USER_ID, id, false);

        assertThat(response.status()).isEqualTo("ABANDONED");
        assertThat(response.endReason()).isEqualTo("USER_ABANDONED");
        assertThat(response.checkpoint()).isNull();
    }

    @Test
    void v4_납품은_승인prefix_다음주문_checkpoint_영수증을_한번만_저장한다() {
        AdjustableClock adjustableClock = new AdjustableClock(NOW);
        service = new MinigameService(repository, manager, adjustableClock);
        var started = service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");
        long id = Long.parseLong(started.minigameSessionId());
        ReflectionTestUtils.setField(records.get(id), "heats", "[" + "100,".repeat(511) + "100]");
        adjustableClock.set(NOW.plusSeconds(31));
        var request = delivery(id, "delivery-one");

        var first = service.deliver(USER_ID, id, "delivery-one", request);
        var replay = service.deliver(USER_ID, id, "delivery-one", request);

        assertThat(replay).isEqualTo(first);
        assertThat(first).satisfies(response -> {
            assertThat(response.scoreDelta()).isEqualTo(20);
            assertThat(response.bonusDelta()).isZero();
            assertThat(response.consumedBreadIds()).containsExactly(1L, 2L);
            assertThat(response.checkpoint().revision()).isOne();
            assertThat(response.checkpoint().throughSeq()).isEqualTo(9);
            assertThat(response.checkpoint().stats().score()).isEqualTo(20);
            assertThat(response.nextOrder().orderIndex()).isOne();
        });
        assertThat(orders.get(id)).hasSize(2);
        assertThat(receipts).hasSize(1);
        assertThat(progresses.get(id).acceptedLogJson()).contains("DELIVER", "delivery-one");
        assertThat(wallet.balance()).isEqualTo(100);
        assertThat(wallet.reserved()).isEqualTo(10);
        verify(repository, never()).persist(any(com.ssafy.ontop.wallet.domain.WalletTransaction.class));
    }

    @Test
    void v4_납품_거부는_상태를_바꾸지_않고_같은키로_최초거부를_재생한다() {
        AdjustableClock adjustableClock = new AdjustableClock(NOW);
        service = new MinigameService(repository, manager, adjustableClock);
        var started = service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");
        long id = Long.parseLong(started.minigameSessionId());
        adjustableClock.set(NOW.plusSeconds(10));
        var actions = List.of(new BungeoppangV4DeliveryDtos.Action(1, "DELIVER", 1000,
                null, null, null, "1", "not-ready"));
        var request = new BungeoppangV4DeliveryDtos.Request("v4", 1,
                BungeoppangV4DeliveryContract.prefixHash(id, BungeoppangV4Spec.CONFIG_VERSION, actions), actions);

        for (int i = 0; i < 2; i++) {
            assertThatThrownBy(() -> service.deliver(USER_ID, id, "not-ready", request))
                    .isInstanceOfSatisfying(com.ssafy.ontop.minigame.service.StoredMinigameResponseException.class,
                            error -> {
                                assertThat(error.status()).isEqualTo(422);
                                assertThat(error.body().code()).isEqualTo("DELIVERY_REJECTED");
                                assertThat(error.body().detail()).isEqualTo("ORDER_NOT_READY");
                            });
        }
        assertThat(rounds.get(id).approvedThroughSeq()).isZero();
        assertThat(orders.get(id)).hasSize(1);
        assertThat(receipts).hasSize(1);
        adjustableClock.set(NOW.plusSeconds(65));
        assertThatThrownBy(() -> service.complete(USER_ID, id, "complete-one",
                completeBody(id, actions, 0)))
                .isInstanceOfSatisfying(com.ssafy.ontop.minigame.service.StoredMinigameResponseException.class,
                        error -> assertThat(error.body().code()).isEqualTo("DELIVERY_REJECTED"));
        assertThat(sessions.get(id).status()).isEqualTo("PLAYING");
        assertThat(wallet.balance()).isEqualTo(100);
    }

    @Test
    void v4_완료는_서버점수로_한번만_정산하고_같은본문을_재생한다() {
        AdjustableClock clock = new AdjustableClock(NOW);
        var activityEvents = new ArrayList<MinigameActivityChanged>();
        service = new MinigameService(repository, manager, clock, 10, false, activityEvents::add);
        var started = service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");
        long id = Long.parseLong(started.minigameSessionId());
        ReflectionTestUtils.setField(records.get(id), "heats", "[" + "100,".repeat(511) + "100]");
        clock.set(NOW.plusSeconds(31));
        var delivery = delivery(id, "delivery-one");
        service.deliver(USER_ID, id, "delivery-one", delivery);
        JsonNode body = completeBody(id, delivery.log(), 999_999L);
        assertThat(activityEvents).containsExactly(
                new MinigameActivityChanged(USER_ID, id, started.timing().playEndsAt()));
        assertThat(started.timing().playEndsAt()).isEqualTo(NOW.plusMillis(64_500));
        clock.set(NOW.plusSeconds(65));

        var first = (BungeoppangV4CompleteDtos.Response) service.complete(USER_ID, id, "complete-one", body);
        clock.set(NOW.plusSeconds(65 + 86_400));
        var sameKey = service.complete(USER_ID, id, "complete-one", body);
        var anotherKey = service.complete(USER_ID, id, "complete-two", body);

        assertThat(sameKey).isEqualTo(first);
        assertThat(anotherKey).isEqualTo(first);
        assertThat(first).satisfies(response -> {
            assertThat(response.score()).isEqualTo(20);
            assertThat(response.served()).isEqualTo(2);
            assertThat(response.coinsCalculated()).isEqualTo(4);
            assertThat(response.coinsGranted()).isEqualTo(4);
            assertThat(response.rewardAmount()).isEqualTo(4);
            assertThat(response.rewardDate()).isEqualTo(java.time.LocalDate.of(2026, 10, 27));
            assertThat(response.finalThroughSeq()).isEqualTo(9);
        });
        assertThat(wallet.balance()).isEqualTo(104);
        assertThat(wallet.reserved()).isEqualTo(10);
        assertThat(sessions.get(id).status()).isEqualTo("COMPLETED");
        assertThat(rounds.get(id).terminalReason()).isEqualTo("VERIFIED");
        // Replayed completions return the stored result without a second end event.
        assertThat(activityEvents).containsExactly(
                new MinigameActivityChanged(USER_ID, id, started.timing().playEndsAt()),
                new MinigameActivityChanged(USER_ID, id, null));
        assertThat(((BungeoppangV4Responses.SessionResponse) service.loadSession(USER_ID, id, false)).result())
                .isEqualTo(first);

        JsonNode changed = completeBody(id, delivery.log(), 1L);
        assertThatThrownBy(() -> service.complete(USER_ID, id, "complete-one", changed))
                .isInstanceOfSatisfying(MinigameException.class, error -> {
                    assertThat(error.status()).isEqualTo(409);
                    assertThat(error.code()).isEqualTo("IDEMPOTENCY_KEY_CONFLICT");
                });
    }

    @Test
    void v4_완료가_먼저_온_마지막_납품을_같은_트랜잭션에서_승인한다() {
        AdjustableClock clock = new AdjustableClock(NOW);
        service = new MinigameService(repository, manager, clock);
        var started = service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");
        long id = Long.parseLong(started.minigameSessionId());
        ReflectionTestUtils.setField(records.get(id), "heats", "[" + "100,".repeat(511) + "100]");
        var pending = delivery(id, "delivery-lost");
        clock.set(NOW.plusSeconds(65));

        var result = (BungeoppangV4CompleteDtos.Response) service.complete(USER_ID, id, "complete-one",
                completeBody(id, pending.log(), 20L));

        assertThat(result).extracting(BungeoppangV4CompleteDtos.Response::score,
                BungeoppangV4CompleteDtos.Response::coinsGranted).containsExactly(20L, 4L);
        assertThat(orders.get(id)).hasSize(2);
        assertThat(receipts).containsKeys(id + ":DELIVERY:delivery-lost", id + ":COMPLETE:complete-one");
        assertThat(progresses.get(id).acceptedLogJson()).contains("delivery-lost");
    }

    @Test
    void v4_너무_이른_완료는_상태를_소비하지_않고_종료후_재시도된다() {
        AdjustableClock clock = new AdjustableClock(NOW);
        service = new MinigameService(repository, manager, clock);
        var started = service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");
        long id = Long.parseLong(started.minigameSessionId());
        JsonNode body = completeBody(id, List.of(), 0L);

        clock.set(NOW.plusSeconds(64));
        assertThatThrownBy(() -> service.complete(USER_ID, id, "complete-one", body))
                .isInstanceOfSatisfying(MinigameException.class, error -> {
                    assertThat(error.status()).isEqualTo(422);
                    assertThat(error.code()).isEqualTo("TOO_EARLY");
                });
        assertThat(sessions.get(id).status()).isEqualTo("PLAYING");
        assertThat(receipts).isEmpty();

        clock.set(NOW.plusSeconds(65));
        assertThat(service.complete(USER_ID, id, "complete-one", body))
                .isInstanceOf(BungeoppangV4CompleteDtos.Response.class);
        assertThat(sessions.get(id).status()).isEqualTo("COMPLETED");
    }

    @Test
    void v4_drain중_늦은완료는_판을_바꾸지_않고_expiresAt_이후에만_무보상_만료한다() {
        AdjustableClock clock = new AdjustableClock(NOW);
        service = new MinigameService(repository, manager, clock);
        var started = service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");
        long id = Long.parseLong(started.minigameSessionId());
        BungeoppangV4Round round = rounds.get(id);
        JsonNode body = completeBody(id, List.of(), 0L);

        clock.set(round.submitDeadline().plusMillis(1));
        assertThatThrownBy(() -> service.complete(USER_ID, id, "complete-late", body))
                .isInstanceOfSatisfying(MinigameException.class, error -> {
                    assertThat(error.status()).isEqualTo(409);
                    assertThat(error.code()).isEqualTo("GAME_NOT_ACTIVE");
                });
        assertThat(sessions.get(id).status()).isEqualTo("PLAYING");
        assertThat(round.terminalReason()).isNull();

        clock.set(round.expiresAt());
        assertThatThrownBy(() -> service.complete(USER_ID, id, "complete-late", body))
                .isInstanceOf(MinigameException.class);
        assertThat(sessions.get(id).status()).isEqualTo("INVALID");
        assertThat(round.terminalReason()).isEqualTo("SUBMISSION_EXPIRED");
        assertThat(wallet.balance()).isEqualTo(100);
        assertThat(receipts).isEmpty();
    }

    @Test
    void v4_기한내_수신후_잠금을_기다린_완료는_drain중_늦은요청보다_늦게_처리돼도_정산된다() {
        AdjustableClock clock = new AdjustableClock(NOW);
        service = new MinigameService(repository, manager, clock);
        var started = service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");
        long id = Long.parseLong(started.minigameSessionId());
        BungeoppangV4Round round = rounds.get(id);
        JsonNode body = completeBody(id, List.of(), 0L);
        AtomicBoolean waiting = new AtomicBoolean(true);
        // 기한 내 수신한 완료가 잠금을 기다리는 동안 drain 중 도착한 다른 완료가 먼저 잠금을 얻는다.
        when(manager.getTransaction(any())).thenAnswer(invocation -> {
            if (waiting.getAndSet(false)) {
                clock.set(round.submitDeadline().plusSeconds(5));
                assertThatThrownBy(() -> service.complete(USER_ID, id, "complete-late", body))
                        .isInstanceOfSatisfying(MinigameException.class,
                                error -> assertThat(error.code()).isEqualTo("GAME_NOT_ACTIVE"));
            }
            return new SimpleTransactionStatus();
        });
        clock.set(round.submitDeadline());

        assertThat(service.complete(USER_ID, id, "complete-in-time", body))
                .isInstanceOf(BungeoppangV4CompleteDtos.Response.class);
        assertThat(sessions.get(id).status()).isEqualTo("COMPLETED");
        assertThat(round.terminalReason()).isEqualTo("VERIFIED");
        assertThat(receipts).containsOnlyKeys(id + ":COMPLETE:complete-in-time");
    }

    @Test
    void v4_보상은_정산시각_KST날짜의_미니게임전체_합산_잔여한도만_지급한다() {
        when(repository.earned(USER_ID, Instant.parse("2026-10-26T15:00:00Z"), Instant.parse("2026-10-27T15:00:00Z")))
                .thenReturn(999L);

        var result = settleAt(Instant.parse("2026-10-27T14:58:50Z"), Instant.parse("2026-10-27T14:59:59.999Z"));

        assertThat(result.rewardDate()).isEqualTo(java.time.LocalDate.of(2026, 10, 27));
        assertThat(result).extracting(BungeoppangV4CompleteDtos.Response::coinsCalculated,
                BungeoppangV4CompleteDtos.Response::coinsGranted, BungeoppangV4CompleteDtos.Response::todayEarned,
                BungeoppangV4CompleteDtos.Response::capReached).containsExactly(4L, 1L, 1000L, true);
        assertThat(wallet.balance()).isEqualTo(101);
        verify(repository).persist(any(WalletTransaction.class));
    }

    @Test
    void v4_KST자정_이후_정산은_다음날로_귀속하고_한도소진이면_0냥으로_완료한다() {
        when(repository.earned(USER_ID, Instant.parse("2026-10-27T15:00:00Z"), Instant.parse("2026-10-28T15:00:00Z")))
                .thenReturn(1000L);

        var result = settleAt(Instant.parse("2026-10-27T14:59:00Z"), Instant.parse("2026-10-27T15:00:05Z"));

        assertThat(result.status()).isEqualTo("COMPLETED");
        assertThat(result.rewardDate()).isEqualTo(java.time.LocalDate.of(2026, 10, 28));
        assertThat(result).extracting(BungeoppangV4CompleteDtos.Response::coinsCalculated,
                BungeoppangV4CompleteDtos.Response::coinsGranted, BungeoppangV4CompleteDtos.Response::todayEarned,
                BungeoppangV4CompleteDtos.Response::capReached).containsExactly(4L, 0L, 1000L, true);
        assertThat(wallet.balance()).isEqualTo(100);
        verify(repository, never()).persist(any(WalletTransaction.class));
    }

    private BungeoppangV4CompleteDtos.Response settleAt(Instant issuedAt, Instant settledAt) {
        AdjustableClock clock = new AdjustableClock(issuedAt);
        service = new MinigameService(repository, manager, clock);
        long id = Long.parseLong(service.startV4(USER_ID, "BUNGEOPPANG", "v4-start").minigameSessionId());
        ReflectionTestUtils.setField(records.get(id), "heats", "[" + "100,".repeat(511) + "100]");
        clock.set(settledAt);
        return (BungeoppangV4CompleteDtos.Response) service.complete(USER_ID, id, "complete-one",
                completeBody(id, delivery(id, "delivery-one").log(), 20L));
    }

    private BungeoppangV4DeliveryDtos.Request delivery(long sessionId, String key) {
        var actions = List.of(
                new BungeoppangV4DeliveryDtos.Action(1, "POUR", 0, 0, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(2, "FILL", 300, 0, "bean", null, null, null),
                new BungeoppangV4DeliveryDtos.Action(3, "TURN", 6700, 0, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(4, "TURN", 13100, 0, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(5, "POUR", 13200, 1, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(6, "FILL", 13500, 1, "bean", null, null, null),
                new BungeoppangV4DeliveryDtos.Action(7, "TURN", 19900, 1, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(8, "TURN", 26300, 1, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(9, "DELIVER", 26400, null, null, null, "1", key));
        return new BungeoppangV4DeliveryDtos.Request("v4", actions.size(),
                BungeoppangV4DeliveryContract.prefixHash(sessionId, BungeoppangV4Spec.CONFIG_VERSION, actions),
                actions);
    }

    private JsonNode completeBody(long sessionId, List<BungeoppangV4DeliveryDtos.Action> actions,
            long clientScore) {
        var body = JSON.createObjectNode();
        body.put("rulesVersion", "v4");
        body.put("throughSeq", actions.size());
        body.put("prefixHash", BungeoppangV4DeliveryContract.prefixHash(
                sessionId, BungeoppangV4Spec.CONFIG_VERSION, actions));
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
            return Clock.fixed(instant, zone);
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
