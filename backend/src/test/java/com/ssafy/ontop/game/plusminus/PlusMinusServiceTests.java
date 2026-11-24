package com.ssafy.ontop.game.plusminus;

import com.ssafy.ontop.game.plusminus.domain.PlusMinusRound;
import com.ssafy.ontop.game.plusminus.domain.PlusMinusRules;
import com.ssafy.ontop.game.plusminus.repository.PlusMinusRepository;
import com.ssafy.ontop.game.plusminus.service.PlusMinusException;
import com.ssafy.ontop.game.plusminus.service.PlusMinusService;
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

class PlusMinusServiceTests {
    private static final long USER = 101;
    private static final int SEVEN = PlusMinusRules.FIRST_REEL.indexOf(7);
    private static final int THREE = PlusMinusRules.FIRST_REEL.indexOf(3);
    private static final int PLUS = 0;
    private static final int MINUS = 1;
    private static final int FIVE = PlusMinusRules.SECOND_REEL.indexOf(5);
    private static final int NINE = PlusMinusRules.SECOND_REEL.indexOf(9);
    private static final int JACKPOT = PlusMinusRules.SECOND_REEL.indexOf(PlusMinusRules.JACKPOT);

    private final MovingClock clock = new MovingClock(Instant.parse("2026-11-03T03:00:00Z"));
    private final ScriptedRandom random = new ScriptedRandom();
    private final FakeRepository repository = new FakeRepository();
    private Wallet wallet;
    private PlusMinusService service;

    @BeforeEach
    void 준비한다() {
        wallet = Wallet.forSignup(USER, clock.instant());
        ReflectionTestUtils.setField(wallet, "id", 11L);
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        service = new PlusMinusService(repository, manager, clock, random);
    }

    @Test
    void START는_참가비를_차감하고_횟수를_기록하며_그_자리에서_지급까지_정산한다() {
        random.queue(SEVEN, PLUS, FIVE);

        var state = service.start(USER, "round-1");

        assertThat(state.round()).satisfies(round -> {
            assertThat(round.first()).isEqualTo(7);
            assertThat(round.operator()).isEqualTo("+");
            assertThat(round.second()).isEqualTo(5);
            assertThat(round.result()).isEqualTo(12);
            assertThat(round.outcome()).isEqualTo("PAID");
            assertThat(round.payout()).isEqualTo(120);
        });
        assertThat(wallet.balance()).isEqualTo(100 - 30 + 120);
        assertThat(state.availableBalance()).isEqualTo(190);
        assertThat(state.playedToday()).isEqualTo(1);
        assertThat(ledger("MINIGAME_ENTRY_FEE")).singleElement()
                .satisfies(entry -> assertThat(field(entry, "balanceDelta")).isEqualTo(-30L));
        assertThat(ledger("PLUS_MINUS_PAYOUT")).singleElement().satisfies(entry -> {
            assertThat(field(entry, "balanceDelta")).isEqualTo(120L);
            assertThat(field(entry, "idempotencyKey")).isEqualTo("plus-minus:payout:" + state.round().id());
        });
    }

    @Test
    void 결과가_0_이하면_참가비만_빠지고_지급_원장이_없다() {
        random.queue(SEVEN, MINUS, NINE);

        var state = service.start(USER, "round-1");

        assertThat(state.round().result()).isEqualTo(-2);
        assertThat(state.round().outcome()).isEqualTo("LOST");
        assertThat(wallet.balance()).isEqualTo(70);
        assertThat(ledger("PLUS_MINUS_PAYOUT")).isEmpty();
    }

    @Test
    void 숫자1이_7이면_JACKPOT_500냥이고_아니면_꽝이다() {
        random.queue(SEVEN, MINUS, JACKPOT, THREE, PLUS, JACKPOT);

        var jackpot = service.start(USER, "round-1");
        var miss = service.start(USER, "round-2");

        assertThat(jackpot.round().outcome()).isEqualTo("JACKPOT");
        assertThat(jackpot.round().second()).isEqualTo(PlusMinusRules.JACKPOT);
        assertThat(jackpot.round().result()).isNull();
        assertThat(jackpot.round().payout()).isEqualTo(500);
        assertThat(miss.round().outcome()).isEqualTo("LOST");
        assertThat(miss.round().payout()).isZero();
        assertThat(wallet.balance()).isEqualTo(100 - 30 + 500 - 30);
    }

    @Test
    void 같은_키로_다시_START해도_한_번만_차감하고_같은_판을_돌려준다() {
        random.queue(SEVEN, PLUS, FIVE, THREE, MINUS, NINE);
        var first = service.start(USER, "round-1");

        var second = service.start(USER, "round-1");

        assertThat(second.round()).isEqualTo(first.round());
        assertThat(wallet.balance()).isEqualTo(190);
        assertThat(ledger("MINIGAME_ENTRY_FEE")).hasSize(1);
        assertThat(ledger("PLUS_MINUS_PAYOUT")).hasSize(1);
    }

    @Test
    void 예전_일일_횟수를_넘겨도_새_판을_시작할_수_있다() {
        repository.extraPlays = 110;
        random.queue(THREE, MINUS, NINE);
        var response = service.start(USER, "unlimited");
        assertThat(response.round().id()).isNotNull();
        assertThat(response.rules().dailyPlays()).isZero();
        assertThat(wallet.balance()).isEqualTo(70);
    }

    @Test
    void 참가비가_모자라면_차감하지_않는다() {
        wallet.debit(80);

        assertThatThrownBy(() -> service.start(USER, "round-1"))
                .isInstanceOfSatisfying(PlusMinusException.class,
                        error -> assertThat(error.code()).isEqualTo("INSUFFICIENT_COINS"));
        assertThat(wallet.balance()).isEqualTo(20);
        assertThat(repository.rounds).isEmpty();
    }

    @Test
    void 잘못된_키와_없는_지갑은_거절한다() {
        assertThatThrownBy(() -> service.start(USER, "bad:key"))
                .isInstanceOfSatisfying(PlusMinusException.class,
                        error -> assertThat(error.code()).isEqualTo("PLUS_MINUS_INVALID_REQUEST"));
        assertThatThrownBy(() -> service.start(202, "round-1"))
                .isInstanceOfSatisfying(PlusMinusException.class,
                        error -> assertThat(error.code()).isEqualTo("WALLET_NOT_READY"));
    }

    @Test
    void 상태_조회는_릴_구성과_가장_최근_판을_돌려준다() {
        assertThat(service.status(USER).round()).isNull();
        random.queue(SEVEN, PLUS, FIVE);
        var played = service.start(USER, "round-1");

        var state = service.status(USER);

        assertThat(state.round()).isEqualTo(played.round());
        assertThat(state.rules().fee()).isEqualTo(30);
        assertThat(state.rules().dailyPlays()).isZero();
        assertThat(state.rules().secondReel()).isEqualTo(PlusMinusRules.SECOND_REEL);
        assertThat(state.playedToday()).isEqualTo(1);
    }

    private List<WalletTransaction> ledger(String type) {
        return repository.ledger.stream().filter(entry -> type.equals(field(entry, "transactionType"))).toList();
    }

    private static Object field(Object target, String name) {
        return ReflectionTestUtils.getField(target, name);
    }

    private final class FakeRepository extends PlusMinusRepository {
        private final List<PlusMinusRound> rounds = new ArrayList<>();
        private final List<WalletTransaction> ledger = new ArrayList<>();
        private long extraPlays;

        private FakeRepository() {
            super(null);
        }

        @Override
        public Optional<Wallet> lockWallet(long userId) {
            return userId == USER ? Optional.of(wallet) : Optional.empty();
        }

        @Override
        public Optional<PlusMinusRound> findByRequest(long userId, String requestKey) {
            return rounds.stream().filter(r -> r.userId() == userId && r.requestKey().equals(requestKey)).findFirst();
        }

        @Override
        public Optional<PlusMinusRound> latest(long userId) {
            return rounds.stream().filter(r -> r.userId() == userId).max(Comparator.comparingLong(PlusMinusRound::id));
        }

        @Override
        public long countPlays(long userId, LocalDate playDate) {
            return extraPlays + rounds.stream().filter(r -> r.userId() == userId
                    && r.playDate().equals(playDate)).count();
        }

        @Override
        public void persist(Object entity) {
            if (entity instanceof PlusMinusRound round) {
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

    /** nextInt(bound)는 큐에 넣은 값을 돌려준다. */
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
