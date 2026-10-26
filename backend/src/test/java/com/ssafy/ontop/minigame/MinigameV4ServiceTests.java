package com.ssafy.ontop.minigame;

import com.ssafy.ontop.minigame.domain.BungeoppangProfile;
import com.ssafy.ontop.minigame.domain.BungeoppangRecord;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Order;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Round;
import com.ssafy.ontop.minigame.domain.MinigameSession;
import com.ssafy.ontop.minigame.domain.MinigameStartRequest;
import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import com.ssafy.ontop.minigame.repository.MinigameRepository;
import com.ssafy.ontop.minigame.service.BungeoppangV4Spec;
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

    private final MinigameRepository repository = mock(MinigameRepository.class);
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    private final Wallet wallet = BeanUtils.instantiateClass(Wallet.class);
    private final Map<Long, MinigameSession> sessions = new HashMap<>();
    private final Map<Long, BungeoppangRecord> records = new HashMap<>();
    private final Map<Long, BungeoppangV4Round> rounds = new HashMap<>();
    private final Map<Long, List<BungeoppangV4Order>> orders = new HashMap<>();
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
    void v4는_Story1에서_v2_완료로_재해석하거나_보상을_지급하지_않는다() {
        BungeoppangV4Responses.StartResponse created =
                service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");
        long id = Long.parseLong(created.minigameSessionId());

        assertThatThrownBy(() -> service.complete(USER_ID, id, BungeoppangFixtures.body("{\"log\":[]}")))
                .isInstanceOfSatisfying(MinigameException.class, error -> {
                    assertThat(error.status()).isEqualTo(409);
                    assertThat(error.code()).isEqualTo("RULES_VERSION_MISMATCH");
                });
        assertThat(wallet.balance()).isEqualTo(100);
        assertThat(wallet.reserved()).isEqualTo(10);
        verify(repository, never()).persist(any(com.ssafy.ontop.wallet.domain.WalletTransaction.class));
    }

    @Test
    void v4_명시적_포기는_USER_ABANDONED_사유로_종결한다() {
        BungeoppangV4Responses.StartResponse created =
                service.startV4(USER_ID, "BUNGEOPPANG", "v4-start");
        long id = Long.parseLong(created.minigameSessionId());

        assertThat(service.abandon(USER_ID, id).status()).isEqualTo("ABANDONED");
        var response = (BungeoppangV4Responses.SessionResponse) service.loadSession(USER_ID, id, false);

        assertThat(response.status()).isEqualTo("ABANDONED");
        assertThat(response.endReason()).isEqualTo("USER_ABANDONED");
        assertThat(response.checkpoint()).isNull();
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
