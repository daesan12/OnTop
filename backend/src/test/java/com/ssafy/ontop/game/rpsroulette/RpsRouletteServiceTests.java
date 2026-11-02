package com.ssafy.ontop.game.rpsroulette;

import com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRound;
import com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRules;
import com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRules.Hand;
import com.ssafy.ontop.game.rpsroulette.repository.RpsRouletteRepository;
import com.ssafy.ontop.game.rpsroulette.service.RpsRouletteException;
import com.ssafy.ontop.game.rpsroulette.service.RpsRouletteService;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Deque;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.random.RandomGenerator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RpsRouletteServiceTests {
    private static final long USER = 101;
    private static final String ZERO_SALT = "00000000000000000000000000000000";
    private static final int ROCK = 0;
    private static final int SCISSORS = 1;
    private static final int PAPER = 2;

    private final MovingClock clock = new MovingClock(Instant.parse("2026-11-01T03:00:00Z"));
    private final ScriptedRandom random = new ScriptedRandom();
    private final FakeRepository repository = new FakeRepository();
    private Wallet wallet;
    private RpsRouletteService service;

    @BeforeEach
    void 준비한다() {
        wallet = Wallet.forSignup(USER, clock.instant());
        ReflectionTestUtils.setField(wallet, "id", 11L);
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        service = new RpsRouletteService(repository, manager, clock, random);
    }

    @Test
    void START는_참가비와_하루_판을_차감하고_기계_손은_커밋만_공개한다() {
        random.queue(SCISSORS);

        var state = service.start(USER, "round-1", 20);

        assertThat(wallet.balance()).isEqualTo(80);
        assertThat(state.availableBalance()).isEqualTo(80);
        assertThat(state.playedToday()).isEqualTo(1);
        assertThat(state.round().phase()).isEqualTo("DUEL");
        assertThat(state.round().commitment()).isEqualTo(RpsRouletteRules.commitment(1, Hand.SCISSORS, ZERO_SALT));
        assertThat(state.round().lastDuel()).isNull();
        assertThat(state.round().inputEndsAt()).isEqualTo(clock.instant().plusSeconds(5));
        assertThat(ledger("MINIGAME_ENTRY_FEE")).singleElement()
                .satisfies(entry -> assertThat(field(entry, "balanceDelta")).isEqualTo(-20L));
    }

    @Test
    void 같은_키로_다시_START해도_한_번만_차감한다() {
        var first = service.start(USER, "round-1", 10);

        var second = service.start(USER, "round-1", 10);

        assertThat(second.round().id()).isEqualTo(first.round().id());
        assertThat(wallet.balance()).isEqualTo(90);
        assertThat(ledger("MINIGAME_ENTRY_FEE")).hasSize(1);
    }

    @Test
    void 미리_정한_기계_손으로_판정하고_지면_꽝이다() {
        random.queue(PAPER);
        var start = service.start(USER, "round-1", 10);

        var state = service.hand(USER, id(start), 1, "ROCK");

        assertThat(state.round().phase()).isEqualTo("SETTLED");
        assertThat(state.round().outcome()).isEqualTo("LOST");
        assertThat(state.round().payout()).isZero();
        assertThat(state.round().lastDuel().machineHand()).isEqualTo("PAPER");
        assertThat(RpsRouletteRules.commitment(1, Hand.PAPER, state.round().lastDuel().salt()))
                .isEqualTo(start.round().commitment());
        assertThat(wallet.balance()).isEqualTo(90);
    }

    @Test
    void 비기면_엽전_없이_같은_판에서_다시_대결한다() {
        random.queue(ROCK);
        var start = service.start(USER, "round-1", 10);
        random.queue(PAPER);

        var state = service.hand(USER, id(start), 1, "ROCK");

        assertThat(state.round().phase()).isEqualTo("DUEL");
        assertThat(state.round().duelNo()).isEqualTo(2);
        assertThat(state.round().lastDuel().result()).isEqualTo("DRAW");
        assertThat(state.round().commitment()).isEqualTo(RpsRouletteRules.commitment(2, Hand.PAPER, ZERO_SALT));
        assertThat(wallet.balance()).isEqualTo(90);
    }

    @Test
    void 이기고_멈추면_참가비_칸_배수만큼_지급한다() {
        random.queue(SCISSORS);
        var start = service.start(USER, "round-1", 10);
        random.queue(ROCK);
        var won = service.hand(USER, id(start), 1, "ROCK");
        random.queue(RpsRouletteRules.ROULETTE.indexOf(7));

        var state = service.stop(USER, id(start), won.round().seq());

        assertThat(state.round().outcome()).isEqualTo("PAID");
        assertThat(state.round().rouletteValue()).isEqualTo(7);
        assertThat(state.round().payout()).isEqualTo(70);
        assertThat(wallet.balance()).isEqualTo(160);
        assertThat(ledger("RPS_ROULETTE_PAYOUT")).singleElement().satisfies(entry -> {
            assertThat(field(entry, "balanceDelta")).isEqualTo(70L);
            assertThat(field(entry, "idempotencyKey")).isEqualTo("rps-roulette:payout:" + id(start));
        });
    }

    @Test
    void 두_번_도전에_성공하면_2배로_바로_룰렛을_돌린다() {
        random.queue(SCISSORS);
        var start = service.start(USER, "round-1", 30);
        random.queue(ROCK);
        var first = service.hand(USER, id(start), 1, "ROCK");
        random.queue(PAPER);
        var challenge = service.challenge(USER, id(start), first.round().seq());
        random.queue(ROCK);
        var second = service.hand(USER, id(start), challenge.round().seq(), "SCISSORS");
        random.queue(ROCK);
        var last = service.challenge(USER, id(start), second.round().seq());
        random.queue(ROCK, RpsRouletteRules.ROULETTE.indexOf(10));

        var state = service.hand(USER, id(start), last.round().seq(), "PAPER");

        assertThat(second.round().multiplier()).isEqualTo(1.5);
        assertThat(state.round().stakeLevel()).isEqualTo(2);
        assertThat(state.round().outcome()).isEqualTo("PAID");
        assertThat(state.round().payout()).isEqualTo(600);
        assertThat(wallet.balance()).isEqualTo(670);
    }

    @Test
    void 도전에_지면_이전_승리와_상관없이_꽝이다() {
        random.queue(SCISSORS);
        var start = service.start(USER, "round-1", 10);
        random.queue(ROCK);
        var won = service.hand(USER, id(start), 1, "ROCK");
        random.queue(ROCK);
        var challenge = service.challenge(USER, id(start), won.round().seq());

        var state = service.hand(USER, id(start), challenge.round().seq(), "SCISSORS");

        assertThat(state.round().outcome()).isEqualTo("LOST");
        assertThat(state.round().payout()).isZero();
        assertThat(ledger("RPS_ROULETTE_PAYOUT")).isEmpty();
    }

    @Test
    void 대결_마감이_지나면_서버가_무작위_손을_대신_낸다() {
        random.queue(SCISSORS);
        service.start(USER, "round-1", 10);
        clock.advance(Duration.ofSeconds(7));
        random.queue(ROCK);

        var state = service.status(USER);

        assertThat(state.round().phase()).isEqualTo("DECIDE");
        assertThat(state.round().lastDuel().auto()).isTrue();
        assertThat(state.round().lastDuel().playerHand()).isEqualTo("ROCK");
        assertThat(state.round().inputEndsAt()).isEqualTo(clock.instant().plusSeconds(10));
    }

    @Test
    void 선택_마감이_지나면_현재_배수로_자동으로_멈춘다() {
        random.queue(SCISSORS);
        var start = service.start(USER, "round-1", 10);
        random.queue(ROCK);
        service.hand(USER, id(start), 1, "ROCK");
        clock.advance(Duration.ofSeconds(12));
        random.queue(1);

        var state = service.status(USER);

        assertThat(state.round().outcome()).isEqualTo("PAID");
        assertThat(state.round().payout()).isEqualTo(10);
        assertThat(wallet.balance()).isEqualTo(100);
    }

    @Test
    void 정리_작업은_이탈한_회원의_판도_끝낸다() {
        random.queue(PAPER);
        service.start(USER, "round-1", 10);
        clock.advance(Duration.ofSeconds(7));
        random.queue(ROCK);

        service.sweep();

        assertThat(repository.rounds.getFirst().outcome()).isEqualTo(RpsRouletteRound.Outcome.LOST);
    }

    @Test
    void 지난_순번의_재전송은_다시_적용하지_않는다() {
        random.queue(SCISSORS);
        var start = service.start(USER, "round-1", 10);
        random.queue(ROCK);
        var first = service.hand(USER, id(start), 1, "ROCK");

        var replay = service.hand(USER, id(start), 1, "PAPER");

        assertThat(replay.round().seq()).isEqualTo(first.round().seq());
        assertThat(replay.round().lastDuel().playerHand()).isEqualTo("ROCK");
        assertThat(replay.round().phase()).isEqualTo("DECIDE");
    }

    @Test
    void 진행_중인_판이_있으면_새로_시작하지_않는다() {
        service.start(USER, "round-1", 10);

        assertThatThrownBy(() -> service.start(USER, "round-2", 10))
                .isInstanceOfSatisfying(RpsRouletteException.class,
                        error -> assertThat(error.code()).isEqualTo("RPS_ROUND_IN_PROGRESS"));
        assertThat(wallet.balance()).isEqualTo(90);
    }

    @Test
    void 하루_15판을_모두_하면_시작하지_않는다() {
        repository.extraPlays = 15;

        assertThatThrownBy(() -> service.start(USER, "round-1", 10))
                .isInstanceOfSatisfying(RpsRouletteException.class,
                        error -> assertThat(error.code()).isEqualTo("RPS_DAILY_LIMIT"));
        assertThat(wallet.balance()).isEqualTo(100);
    }

    @Test
    void 사용_가능_잔액이_부족하면_예약금을_쓰지_않는다() {
        wallet.reserveGameEntry(95, clock.instant());

        assertThatThrownBy(() -> service.start(USER, "round-1", 10))
                .isInstanceOfSatisfying(RpsRouletteException.class,
                        error -> assertThat(error.code()).isEqualTo("INSUFFICIENT_COINS"));
        assertThat(repository.ledger).isEmpty();
    }

    @Test
    void 정해진_참가비가_아니면_지갑에_접근하지_않는다() {
        assertThatThrownBy(() -> service.start(USER, "round-1", 15))
                .isInstanceOfSatisfying(RpsRouletteException.class,
                        error -> assertThat(error.code()).isEqualTo("RPS_INVALID_REQUEST"));
        assertThat(repository.walletLocks).isZero();
    }

    private static long id(com.ssafy.ontop.game.rpsroulette.dto.RpsRouletteStateResponse state) {
        return Long.parseLong(state.round().id());
    }

    private List<WalletTransaction> ledger(String type) {
        return repository.ledger.stream().filter(entry -> type.equals(field(entry, "transactionType"))).toList();
    }

    private static Object field(Object target, String name) {
        return ReflectionTestUtils.getField(target, name);
    }

    private final class FakeRepository extends RpsRouletteRepository {
        private final List<RpsRouletteRound> rounds = new ArrayList<>();
        private final List<WalletTransaction> ledger = new ArrayList<>();
        private long extraPlays;
        private int walletLocks;

        private FakeRepository() {
            super(null);
        }

        @Override
        public Optional<Wallet> lockWallet(long userId) {
            walletLocks++;
            return userId == USER ? Optional.of(wallet) : Optional.empty();
        }

        @Override
        public Optional<RpsRouletteRound> findByRequest(long userId, String requestKey) {
            return rounds.stream().filter(r -> r.userId() == userId && r.requestKey().equals(requestKey)).findFirst();
        }

        @Override
        public Optional<RpsRouletteRound> lockActive(long userId) {
            return rounds.stream().filter(r -> r.userId() == userId
                    && r.phase() != RpsRouletteRound.Phase.SETTLED).findFirst();
        }

        @Override
        public Optional<RpsRouletteRound> lockRound(long userId, long roundId) {
            return rounds.stream().filter(r -> r.userId() == userId && r.id() == roundId).findFirst();
        }

        @Override
        public Optional<RpsRouletteRound> latest(long userId) {
            return rounds.stream().filter(r -> r.userId() == userId)
                    .max(Comparator.comparingLong(RpsRouletteRound::id));
        }

        @Override
        public long countPlays(long userId, LocalDate playDate) {
            return extraPlays + rounds.stream().filter(r -> r.userId() == userId
                    && r.playDate().equals(playDate)).count();
        }

        @Override
        public List<Long> expiredUserIds(Instant now, int limit) {
            return rounds.stream().filter(r -> r.isExpired(now)).map(RpsRouletteRound::userId).toList();
        }

        @Override
        public void persist(Object entity) {
            if (entity instanceof RpsRouletteRound round) {
                ReflectionTestUtils.setField(round, "id", (long) rounds.size() + 1);
                rounds.add(round);
            } else {
                ledger.add((WalletTransaction) entity);
            }
        }

        @Override
        public void flush() {
        }
    }

    /** nextInt(bound)는 큐에 넣은 값을, salt는 0 바이트를 돌려준다. */
    private static final class ScriptedRandom implements RandomGenerator {
        private final Deque<Integer> values = new ArrayDeque<>();

        void queue(int... next) {
            Arrays.stream(next).forEach(values::add);
        }

        @Override
        public int nextInt(int bound) {
            Integer value = values.poll();
            return value == null ? 0 : value;
        }

        @Override
        public void nextBytes(byte[] bytes) {
            Arrays.fill(bytes, (byte) 0);
        }

        @Override
        public long nextLong() {
            return 0;
        }
    }

    private static final class MovingClock extends Clock {
        private Instant now;

        private MovingClock(Instant now) {
            this.now = Objects.requireNonNull(now);
        }

        void advance(Duration duration) {
            now = now.plus(duration);
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
            return now;
        }
    }
}
