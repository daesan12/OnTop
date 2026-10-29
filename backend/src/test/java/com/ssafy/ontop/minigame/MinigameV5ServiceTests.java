package com.ssafy.ontop.minigame;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.minigame.domain.BungeoppangProfile;
import com.ssafy.ontop.minigame.domain.BungeoppangRecord;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Progress;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Round;
import com.ssafy.ontop.minigame.domain.BungeoppangV5Order;
import com.ssafy.ontop.minigame.domain.MinigameSession;
import com.ssafy.ontop.minigame.domain.MinigameStartRequest;
import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;
import com.ssafy.ontop.minigame.dto.BungeoppangV5Responses;
import com.ssafy.ontop.minigame.repository.MinigameRepository;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules.FillingCounts;
import com.ssafy.ontop.minigame.service.BungeoppangV5DeliveryContract;
import com.ssafy.ontop.minigame.service.BungeoppangV5Rules;
import com.ssafy.ontop.minigame.service.BungeoppangV5Spec;
import com.ssafy.ontop.minigame.service.MinigameActivityChanged;
import com.ssafy.ontop.minigame.service.MinigameException;
import com.ssafy.ontop.minigame.service.MinigameService;
import com.ssafy.ontop.wallet.domain.Wallet;
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
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MinigameV5ServiceTests {
    private static final long USER_ID = 101;
    private static final Instant NOW = Instant.parse("2026-10-28T00:00:00.123Z");
    /** Same date form as the Spring HTTP mapper: ISO-8601 strings. */
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules()
            .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private final MinigameRepository repository = mock(MinigameRepository.class);
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    private final Wallet wallet = BeanUtils.instantiateClass(Wallet.class);
    private final Map<Long, MinigameSession> sessions = new HashMap<>();
    private final Map<Long, BungeoppangRecord> records = new HashMap<>();
    private final Map<Long, BungeoppangV4Round> rounds = new HashMap<>();
    private final Map<Long, List<BungeoppangV5Order>> orders = new HashMap<>();
    private final Map<Long, BungeoppangV4Progress> progresses = new HashMap<>();
    private final Map<String, MinigameStartRequest> startRequests = new HashMap<>();
    private final AtomicLong nextSessionId = new AtomicLong(902);
    private final AdjustableClock clock = new AdjustableClock(NOW);
    private final List<MinigameActivityChanged> activityEvents = new ArrayList<>();

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
        when(repository.v5Orders(anyLong()))
                .thenAnswer(invocation -> orders.getOrDefault(invocation.<Long>getArgument(0), List.of()));
        when(repository.v4Progress(anyLong(), anyBoolean()))
                .thenAnswer(invocation -> Optional.ofNullable(progresses.get(invocation.<Long>getArgument(0))));
        doAnswer(invocation -> {
            Object entity = invocation.getArgument(0);
            if (entity instanceof MinigameSession session) {
                long id = nextSessionId.getAndIncrement();
                ReflectionTestUtils.setField(session, "id", id);
                sessions.put(id, session);
            } else if (entity instanceof BungeoppangRecord record) {
                records.put((long) ReflectionTestUtils.getField(record, "sessionId"), record);
            } else if (entity instanceof BungeoppangV4Round round) {
                rounds.put(round.sessionId(), round);
            } else if (entity instanceof BungeoppangV5Order order) {
                orders.computeIfAbsent(order.sessionId(), ignored -> new ArrayList<>()).add(order);
            } else if (entity instanceof BungeoppangV4Progress progress) {
                progresses.put(progress.sessionId(), progress);
            } else if (entity instanceof MinigameStartRequest request) {
                startRequests.put((String) ReflectionTestUtils.getField(request, "requestKey"), request);
            }
            return null;
        }).when(repository).persist(any());
        service = new MinigameService(repository, manager, clock, 10, true, activityEvents::add);
    }

    @Test
    void v5_시작은_저장한_playEndsAt까지_이용_상태를_한번만_알리고_재시도는_알리지_않는다() {
        var started = service.startV5(USER_ID, "BUNGEOPPANG", "v5-start");
        service.startV5(USER_ID, "BUNGEOPPANG", "v5-start");

        long sessionId = Long.parseLong(started.minigameSessionId());
        assertThat(activityEvents).containsExactly(
                new MinigameActivityChanged(USER_ID, sessionId, NOW.plusMillis(124_500)));
        assertThat(started.timing().playEndsAt()).isEqualTo(NOW.plusMillis(124_500));
    }

    @Test
    void 새_판_시작은_이전_판_해제_뒤에_새_판_시작을_알린다() {
        long first = Long.parseLong(service.startV5(USER_ID, "BUNGEOPPANG", "v5-one").minigameSessionId());
        long second = Long.parseLong(service.startV5(USER_ID, "BUNGEOPPANG", "v5-two").minigameSessionId());

        assertThat(activityEvents).containsExactly(
                new MinigameActivityChanged(USER_ID, first, NOW.plusMillis(124_500)),
                new MinigameActivityChanged(USER_ID, first, null),
                new MinigameActivityChanged(USER_ID, second, NOW.plusMillis(124_500)));
        assertThat(second).isGreaterThan(first);
    }

    @Test
    void 포기와_만료는_그_판만_한번_해제하고_이미_끝난_판은_다시_알리지_않는다() {
        long abandoned = Long.parseLong(service.startV5(USER_ID, "BUNGEOPPANG", "v5-one").minigameSessionId());
        service.abandon(USER_ID, abandoned);
        service.abandon(USER_ID, abandoned);
        assertThat(activityEvents).endsWith(new MinigameActivityChanged(USER_ID, abandoned, null));
        assertThat(activityEvents).filteredOn(event -> event.activeUntil() == null).hasSize(1);

        long expiring = Long.parseLong(service.startV5(USER_ID, "BUNGEOPPANG", "v5-two").minigameSessionId());
        clock.set(NOW.plusMillis(149_500));
        load(expiring);
        load(expiring);
        assertThat(activityEvents).endsWith(new MinigameActivityChanged(USER_ID, expiring, null));
        assertThat(activityEvents).filteredOn(event -> event.activeUntil() == null).hasSize(2);
    }

    @Test
    void v5_신규_판_시작은_120초_시간과_2048개_불과_서로_다른_자리의_첫_주문_3건을_반환한다() {
        BungeoppangV5Responses.StartResponse started = service.startV5(USER_ID, "BUNGEOPPANG", "v5-start");
        long sessionId = Long.parseLong(started.minigameSessionId());

        assertThat(started.rulesVersion()).isEqualTo("v5");
        assertThat(started.configVersion()).isEqualTo(BungeoppangV5Spec.CONFIG_VERSION).isEqualTo("v5-20261029.1");
        assertThat(started.rules().durationMs()).isEqualTo(120_000);
        assertThat(started.rules().rushFromMs()).isEqualTo(90_000);
        assertThat(started.status()).isEqualTo("PLAYING");
        assertThat(started.phase()).isEqualTo("WAITING_START");
        assertThat(started.issuedAt()).isEqualTo(NOW);
        assertThat(started.startedAt()).isEqualTo(NOW.plusMillis(4_500));
        assertThat(started.timing().countdownStartsAt()).isEqualTo(NOW.plusMillis(1_000));
        assertThat(started.timing().playStartsAt()).isEqualTo(NOW.plusMillis(4_500));
        assertThat(started.timing().playEndsAt()).isEqualTo(NOW.plusMillis(124_500));
        assertThat(started.timing().submitDeadline()).isEqualTo(NOW.plusMillis(139_500));
        assertThat(started.timing().expiresAt()).isEqualTo(NOW.plusMillis(149_500));
        assertThat(started.heats()).hasSize(2_048).allMatch(heat -> heat >= 85 && heat <= 115);
        assertThat(started.rules()).isEqualTo(BungeoppangV5Spec.rules());
        assertThat(started.rules().heatAssignment()).isEqualTo("FILL");
        assertThat(started.rules().maxActiveOrders()).isEqualTo(3);
        assertThat(started.isFirstGame()).isTrue();

        BungeoppangV5Responses.Checkpoint checkpoint = started.checkpoint();
        assertThat(checkpoint.revision()).isZero();
        assertThat(checkpoint.throughSeq()).isZero();
        assertThat(checkpoint.prefixHash())
                .isEqualTo(BungeoppangV5Spec.initialPrefixHash(sessionId, BungeoppangV5Spec.CONFIG_VERSION));
        assertThat(checkpoint.heatCursor()).isZero();
        assertThat(checkpoint.lastAt()).isNull();
        assertThat(checkpoint.tray()).isEmpty();
        assertThat(checkpoint.slots()).hasSize(6).allSatisfy(slot -> {
            assertThat(slot.phase()).isEqualTo("empty");
            assertThat(slot.since()).isZero();
            assertThat(slot.heat()).isEqualTo(100);
        });
        assertThat(checkpoint.activeOrders()).extracting(BungeoppangV5Responses.Order::orderId)
                .containsExactly("1", "2", "3");
        assertThat(checkpoint.activeOrders()).extracting(BungeoppangV5Responses.Order::customerSlot)
                .containsExactly(0, 1, 2);
        assertThat(checkpoint.activeOrders()).allSatisfy(order -> {
            assertThat(order.availableAfterSeq()).isZero();
            int total = order.items().bean() + order.items().custard() + order.items().pizza()
                    + order.items().chocolate();
            assertThat(total).isBetween(1, 4);
        });
        assertThat(checkpoint.activeOrders().getFirst().items())
                .isEqualTo(new com.ssafy.ontop.minigame.dto.BungeoppangV4Responses.FillingCounts(2, 0, 0, 0));

        assertThat(orders.get(sessionId)).hasSize(3).allSatisfy(order -> {
            assertThat(order.availableAfterSeq()).isZero();
            assertThat(order.issuedAt()).isEqualTo(NOW);
        });
        assertThat(rounds.get(sessionId).configVersion()).isEqualTo(BungeoppangV5Spec.CONFIG_VERSION);
        assertThat(rounds.get(sessionId).approvedPrefixHash()).isEqualTo(checkpoint.prefixHash());
        assertThat(progresses.get(sessionId).acceptedLogJson()).isEqualTo("[]");
        assertThat(records.get(sessionId).rulesVersion()).isEqualTo("v5");
        assertThat(startRequests).containsKey("v5-start");
    }

    @Test
    void 시작_checkpoint는_저장된_불과_주문으로_빈_로그를_재계산한_결과와_같다() throws Exception {
        BungeoppangV5Responses.StartResponse started = service.startV5(USER_ID, "BUNGEOPPANG", "v5-start");
        long sessionId = Long.parseLong(started.minigameSessionId());
        List<BungeoppangV5Rules.Order> stored = orders.get(sessionId).stream()
                .map(order -> new BungeoppangV5Rules.Order(Long.toString(order.orderId()), order.customerSlot(),
                        order.availableAfterSeq(), new FillingCounts(order.bean(), order.custard(), order.pizza(),
                                order.chocolate())))
                .toList();

        var replayed = BungeoppangV5Spec.checkpoint(0, 0,
                BungeoppangV5Spec.initialPrefixHash(sessionId, started.configVersion()),
                new BungeoppangV5Rules().replay(List.of(), started.heats(), stored,
                        BungeoppangV5Spec.calculationRules(started.rules())));

        assertThat(started.checkpoint()).isEqualTo(replayed);
        assertThat(BungeoppangV5DeliveryContract.prefixHash(sessionId, started.configVersion(),
                List.<BungeoppangV4DeliveryDtos.Action>of())).isEqualTo(started.checkpoint().prefixHash());
    }

    @Test
    void 시작_응답_JSON은_FE_serviceV5가_검사하는_문자열_ID와_필드를_가진다() throws Exception {
        JsonNode body = JSON.valueToTree(service.startV5(USER_ID, "BUNGEOPPANG", "v5-start"));

        assertThat(body.path("minigameSessionId").isTextual()).isTrue();
        assertThat(body.path("minigameType").textValue()).isEqualTo("BUNGEOPPANG");
        assertThat(body.path("startedAt").textValue()).isEqualTo("2026-10-28T00:00:04.623Z");
        assertThat(body.path("timing").path("playEndsAt").textValue()).isEqualTo("2026-10-28T00:02:04.623Z");
        assertThat(body.path("rules").path("heatAssignment").textValue()).isEqualTo("FILL");
        assertThat(body.path("heats").size()).isEqualTo(body.path("rules").path("heatListLength").intValue());
        JsonNode first = body.path("checkpoint").path("activeOrders").get(0);
        assertThat(first.path("orderId").isTextual()).isTrue();
        assertThat(first.path("customerSlot").isInt()).isTrue();
        assertThat(first.path("availableAfterSeq").isInt()).isTrue();
        assertThat(body.path("checkpoint").path("slots").get(0).has("filling")).isTrue();
        assertThat(body.path("checkpoint").path("slots").get(0).path("filling").isNull()).isTrue();
        assertThat(body.path("checkpoint").has("currentOrder")).isFalse();
    }

    @Test
    void 같은_키_재시도는_세션과_주문을_새로_만들지_않고_최초_응답을_재생한다() {
        BungeoppangV5Responses.StartResponse first = service.startV5(USER_ID, "BUNGEOPPANG", "v5-start");
        clock.set(NOW.plusSeconds(20));

        BungeoppangV5Responses.StartResponse replay = service.startV5(USER_ID, "BUNGEOPPANG", "v5-start");

        assertThat(replay).isEqualTo(first);
        assertThat(sessions).hasSize(1);
        assertThat(rounds).hasSize(1);
        assertThat(orders.get(Long.parseLong(first.minigameSessionId()))).hasSize(3);
    }

    @Test
    void 같은_시작_키를_다른_규칙_버전에_쓰면_충돌하고_v5_판은_바뀌지_않는다() {
        BungeoppangV5Responses.StartResponse created = service.startV5(USER_ID, "BUNGEOPPANG", "v5-start");

        assertThatThrownBy(() -> service.startV4(USER_ID, "BUNGEOPPANG", "v5-start"))
                .isInstanceOfSatisfying(MinigameException.class, error -> {
                    assertThat(error.status()).isEqualTo(409);
                    assertThat(error.code()).isEqualTo("IDEMPOTENCY_KEY_CONFLICT");
                });
        assertThat(service.startV5(USER_ID, "BUNGEOPPANG", "v5-start")).isEqualTo(created);
        assertThat(sessions).hasSize(1);
    }

    @Test
    void v5가_꺼져_있으면_시작과_로비는_기존처럼_규칙_버전_불일치이고_아무것도_저장하지_않는다() {
        service = new MinigameService(repository, manager, clock, 10);

        assertThat(service.v5Enabled()).isFalse();
        assertThatThrownBy(() -> service.startV5(USER_ID, "BUNGEOPPANG", "v5-start"))
                .isInstanceOfSatisfying(MinigameException.class, error -> {
                    assertThat(error.status()).isEqualTo(409);
                    assertThat(error.code()).isEqualTo("RULES_VERSION_MISMATCH");
                });
        assertThatThrownBy(() -> service.statusV5(USER_ID))
                .isInstanceOfSatisfying(MinigameException.class,
                        error -> assertThat(error.code()).isEqualTo("RULES_VERSION_MISMATCH"));
        assertThat(sessions).isEmpty();
        assertThat(orders).isEmpty();
    }

    @Test
    void 재접속_조회는_시작과_같은_checkpoint_주문_시간을_서버_시각과_함께_복구한다() {
        BungeoppangV5Responses.StartResponse started = service.startV5(USER_ID, "BUNGEOPPANG", "v5-start");
        long sessionId = Long.parseLong(started.minigameSessionId());
        clock.set(NOW.plusSeconds(30));

        var first = (BungeoppangV5Responses.SessionResponse) service.loadSession(USER_ID, sessionId, true, true, null);
        var again = (BungeoppangV5Responses.SessionResponse) service.loadSession(USER_ID, sessionId, false, true, null);

        assertThat(first.rulesVersion()).isEqualTo("v5");
        assertThat(first.configVersion()).isEqualTo(started.configVersion());
        assertThat(first.status()).isEqualTo("PLAYING");
        assertThat(first.phase()).isEqualTo("PLAYING");
        assertThat(first.serverNow()).isEqualTo(NOW.plusSeconds(30));
        assertThat(first.timing()).isEqualTo(started.timing());
        assertThat(first.checkpoint()).isEqualTo(started.checkpoint());
        assertThat(first.acceptedLog()).isEmpty();
        assertThat(first.issuedOrders()).isEqualTo(started.checkpoint().activeOrders());
        assertThat(first.rules()).isEqualTo(started.rules());
        assertThat(first.heats()).isEqualTo(started.heats());
        assertThat(first.issuedAt()).isEqualTo(NOW);
        assertThat(first.isFirstGame()).isTrue();
        assertThat(again.checkpoint()).isEqualTo(first.checkpoint());
        assertThat(again.issuedOrders()).isEqualTo(first.issuedOrders());
        assertThat(again.heats()).isNull();
    }

    @Test
    void 조회_단계는_서버_시각으로_시작대기_진행_완료대기를_구분한다() {
        long sessionId = Long.parseLong(service.startV5(USER_ID, "BUNGEOPPANG", "v5-start").minigameSessionId());

        assertThat(phase(sessionId)).isEqualTo("WAITING_START");
        clock.set(NOW.plusMillis(1_000));
        assertThat(phase(sessionId)).isEqualTo("COUNTDOWN");
        clock.set(NOW.plusMillis(4_500));
        assertThat(phase(sessionId)).isEqualTo("PLAYING");
        clock.set(NOW.plusMillis(124_499));
        assertThat(phase(sessionId)).isEqualTo("PLAYING");
        clock.set(NOW.plusMillis(124_500));
        assertThat(phase(sessionId)).isEqualTo("AWAITING_COMPLETION");
    }

    @Test
    void v5_판은_expiresAt에_만료되고_판_원본의_종료_사유를_남긴다() {
        long sessionId = Long.parseLong(service.startV5(USER_ID, "BUNGEOPPANG", "v5-start").minigameSessionId());

        clock.set(NOW.plusMillis(149_499));
        assertThat(load(sessionId).status()).isEqualTo("PLAYING");
        clock.set(NOW.plusMillis(149_500));
        var expired = load(sessionId);

        assertThat(expired.status()).isEqualTo("INVALID");
        assertThat(expired.endReason()).isEqualTo("EXPIRED");
        assertThat(rounds.get(sessionId).terminalReason()).isEqualTo("EXPIRED");
        assertThat(expired.checkpoint()).isNull();
        assertThat(expired.issuedOrders()).isEmpty();
    }

    @Test
    void 새_v5_시작은_진행_중인_판을_포기로_닫고_포기는_판_원본도_종료한다() {
        long first = Long.parseLong(service.startV5(USER_ID, "BUNGEOPPANG", "v5-one").minigameSessionId());
        long second = Long.parseLong(service.startV5(USER_ID, "BUNGEOPPANG", "v5-two").minigameSessionId());

        assertThat(sessions.get(first).status()).isEqualTo("ABANDONED");
        assertThat(rounds.get(first).terminalReason()).isEqualTo("SUPERSEDED");
        assertThat(sessions.get(second).status()).isEqualTo("PLAYING");

        assertThat(service.abandon(USER_ID, second).status()).isEqualTo("ABANDONED");
        assertThat(rounds.get(second).terminalReason()).isEqualTo("USER_ABANDONED");
    }

    @Test
    void v5_로비는_v5_규칙_버전과_진행_중인_판을_알린다() {
        long sessionId = Long.parseLong(service.startV5(USER_ID, "BUNGEOPPANG", "v5-start").minigameSessionId());

        var lobby = service.statusV5(USER_ID);

        assertThat(lobby.rulesVersion()).isEqualTo("v5");
        assertThat(lobby.dailyCap()).isEqualTo(100);
        assertThat(lobby.activeSessionId()).isEqualTo(Long.toString(sessionId));
        assertThat(lobby.supportedRulesVersions()).containsExactly("v2", "v4", "v5");
    }

    @Test
    void v5_판은_v4_납품_경로와_v4_완료_본문을_받지_않는다() {
        long sessionId = Long.parseLong(service.startV5(USER_ID, "BUNGEOPPANG", "v5-start").minigameSessionId());
        var deliver = new BungeoppangV4DeliveryDtos.Request("v5", 1, "0".repeat(64),
                List.of(new BungeoppangV4DeliveryDtos.Action(1, "DELIVER", 0, null, null, null, "1", "key")));
        var v4Complete = JSON.createObjectNode().put("rulesVersion", "v4").put("throughSeq", 0)
                .put("prefixHash", "0".repeat(64));
        v4Complete.putArray("log");

        assertThatThrownBy(() -> service.deliver(USER_ID, sessionId, "key", deliver))
                .isInstanceOfSatisfying(MinigameException.class,
                        error -> assertThat(error.code()).isEqualTo("RULES_VERSION_MISMATCH"));
        assertThatThrownBy(() -> service.complete(USER_ID, sessionId, "done", v4Complete))
                .isInstanceOfSatisfying(MinigameException.class,
                        error -> assertThat(error.code()).isEqualTo("INVALID_REQUEST"));
        assertThat(sessions.get(sessionId).status()).isEqualTo("PLAYING");
    }

    private String phase(long sessionId) {
        return load(sessionId).phase();
    }

    private BungeoppangV5Responses.SessionResponse load(long sessionId) {
        return (BungeoppangV5Responses.SessionResponse) service.loadSession(USER_ID, sessionId, false, false, null);
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
