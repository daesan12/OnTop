package com.ssafy.ontop.game.mole;

import com.ssafy.ontop.game.mole.domain.MoleRound;
import com.ssafy.ontop.game.mole.domain.MoleRules;
import com.ssafy.ontop.game.mole.dto.MoleDtos;
import com.ssafy.ontop.game.mole.repository.MoleRepository;
import com.ssafy.ontop.game.mole.service.MoleException;
import com.ssafy.ontop.game.mole.service.MoleService;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
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

class MoleServiceTests {
    private static final long USER = 101;
    private static final long SEED = 424242L;

    private final MovingClock clock = new MovingClock(Instant.parse("2026-11-04T03:00:00Z"));
    private final FakeRepository repository = new FakeRepository();
    private Wallet wallet;
    private MoleService service;

    @BeforeEach
    void 준비한다() {
        wallet = Wallet.forSignup(USER, clock.instant());
        ReflectionTestUtils.setField(wallet, "id", 11L);
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        service = new MoleService(repository, manager, clock, new FixedSeed(SEED));
    }

    @Test
    void 시작은_참가비_없이_시드_출현표를_주고_같은_키는_같은_판을_돌려준다() {
        var round = service.start(USER, "round-1");

        assertThat(round.moles()).hasSize(MoleRules.schedule(SEED).size());
        assertThat(round.moles().getFirst().kind()).isEqualTo(MoleRules.schedule(SEED).getFirst().kind().name());
        assertThat(round.rules().keys()).containsExactly("Q", "W", "E", "I", "O", "P");
        assertThat(service.start(USER, "round-1").id()).isEqualTo(round.id());
        assertThat(wallet.balance()).isEqualTo(100);
        assertThat(repository.ledger).isEmpty();
    }

    @Test
    void 새_판을_열면_끝내지_않은_이전_판은_보상_없이_닫는다() {
        var first = service.start(USER, "round-1");
        service.start(USER, "round-2");

        assertThat(repository.rounds.getFirst().status()).isEqualTo(MoleRound.Status.EXPIRED);
        clock.advance(Duration.ofSeconds(91));
        assertThatThrownBy(() -> service.complete(USER, Long.parseLong(first.id()), List.of()))
                .isInstanceOfSatisfying(MoleException.class, e -> assertThat(e.code()).isEqualTo("MOLE_ROUND_EXPIRED"));
    }

    @Test
    void 완료는_서버가_다시_계산한_점수로_45점당_1냥을_지급하고_다시_보내도_한_번만_준다() {
        var round = service.start(USER, "round-1");
        List<MoleDtos.Hit> hits = catchAll();
        MoleRules.Score expected = MoleRules.score(MoleRules.schedule(SEED),
                hits.stream().map(hit -> new MoleRules.Hit(hit.hole(), hit.at())).toList());
        clock.advance(Duration.ofSeconds(93));

        var result = service.complete(USER, Long.parseLong(round.id()), hits);
        var again = service.complete(USER, Long.parseLong(round.id()), List.of());

        assertThat(result.result().score()).isEqualTo(expected.score());
        assertThat(result.result().reward()).isEqualTo(expected.coins()).isEqualTo(expected.score() / 45).isPositive();
        assertThat(again.result()).isEqualTo(result.result());
        assertThat(wallet.balance()).isEqualTo(100 + expected.coins());
        assertThat(repository.ledger).singleElement().satisfies(entry -> {
            assertThat(ReflectionTestUtils.getField(entry, "transactionType")).isEqualTo("MOLE_REWARD");
            assertThat(ReflectionTestUtils.getField(entry, "idempotencyKey")).isEqualTo("mole:reward:" + round.id());
        });
        assertThat(result.bestScore()).isEqualTo(expected.score());
    }

    @Test
    void 미니게임_공통_하루_상한에서_남은_만큼만_지급한다() {
        repository.earnedBefore = 490;
        var round = service.start(USER, "round-1");
        clock.advance(Duration.ofSeconds(92));

        var result = service.complete(USER, Long.parseLong(round.id()), catchAll());

        assertThat(result.result().calculatedReward()).isGreaterThan(10);
        assertThat(result.result().reward()).isEqualTo(10);
        assertThat(wallet.balance()).isEqualTo(110);
    }

    @Test
    void 판이_끝나기_전이나_너무_늦은_완료는_받지_않는다() {
        var round = service.start(USER, "round-1");
        long id = Long.parseLong(round.id());
        clock.advance(Duration.ofSeconds(89));
        assertThatThrownBy(() -> service.complete(USER, id, List.of()))
                .isInstanceOfSatisfying(MoleException.class, e -> assertThat(e.code()).isEqualTo("MOLE_ROUND_NOT_FINISHED"));
        clock.advance(Duration.ofSeconds(32));
        assertThatThrownBy(() -> service.complete(USER, id, List.of()))
                .isInstanceOfSatisfying(MoleException.class, e -> assertThat(e.code()).isEqualTo("MOLE_ROUND_EXPIRED"));
        assertThat(repository.ledger).isEmpty();
    }

    @Test
    void 판정_규칙이_바뀌기_전에_시작한_판은_보상_없이_끝낸다() {
        var round = service.start(USER, "round-1");
        ReflectionTestUtils.setField(repository.rounds.getFirst(), "rulesVersion", MoleRules.RULES_VERSION - 1);
        clock.advance(Duration.ofSeconds(93));

        assertThatThrownBy(() -> service.complete(USER, Long.parseLong(round.id()), catchAll()))
                .isInstanceOfSatisfying(MoleException.class, e -> assertThat(e.code()).isEqualTo("MOLE_ROUND_EXPIRED"));
        assertThat(repository.ledger).isEmpty();
    }

    @Test
    void 잘못된_요청은_400_없는_판은_404다() {
        assertThatThrownBy(() -> service.start(USER, "bad key"))
                .isInstanceOfSatisfying(MoleException.class, e -> assertThat(e.status()).isEqualTo(400));
        var round = service.start(USER, "round-1");
        List<MoleDtos.Hit> flood = Collections.nCopies(MoleRules.MAX_HITS + 1, new MoleDtos.Hit(0, 1000));
        assertThatThrownBy(() -> service.complete(USER, Long.parseLong(round.id()), flood))
                .isInstanceOfSatisfying(MoleException.class, e -> assertThat(e.status()).isEqualTo(400));
        assertThatThrownBy(() -> service.complete(USER, 999, List.of()))
                .isInstanceOfSatisfying(MoleException.class, e -> assertThat(e.status()).isEqualTo(404));
    }

    @Test
    void 상태는_오늘_합계와_최고_점수와_최근_판을_보여_준다() {
        repository.earnedBefore = 120;
        var round = service.start(USER, "round-1");
        clock.advance(Duration.ofSeconds(95));
        var settled = service.complete(USER, Long.parseLong(round.id()), catchAll());

        var state = service.status(USER);

        assertThat(state.todayEarned()).isEqualTo(120 + settled.result().reward());
        assertThat(state.dailyCap()).isEqualTo(500);
        assertThat(state.bestScore()).isEqualTo(settled.result().score());
        assertThat(state.last()).isEqualTo(settled.result());
    }

    private static List<MoleDtos.Hit> catchAll() {
        List<MoleDtos.Hit> hits = new ArrayList<>();
        for (MoleRules.Mole mole : MoleRules.schedule(SEED)) {
            if (mole.kind() == MoleRules.Kind.DECOY) {
                continue;
            }
            for (int tap = 0; tap < mole.hits(); tap++) {
                hits.add(new MoleDtos.Hit(mole.hole(), mole.appearAt() + 120 + tap * 90));
            }
        }
        return hits;
    }

    private final class FakeRepository extends MoleRepository {
        private final List<MoleRound> rounds = new ArrayList<>();
        private final List<WalletTransaction> ledger = new ArrayList<>();
        private long earnedBefore;

        private FakeRepository() {
            super(null);
        }

        @Override
        public Optional<Wallet> lockWallet(long userId) {
            return userId == USER ? Optional.of(wallet) : Optional.empty();
        }

        @Override
        public Optional<MoleRound> findByRequest(long userId, String requestKey) {
            return rounds.stream().filter(r -> r.userId() == userId
                    && ReflectionTestUtils.getField(r, "requestKey").equals(requestKey)).findFirst();
        }

        @Override
        public Optional<MoleRound> findRound(long userId, long roundId) {
            return rounds.stream().filter(r -> r.userId() == userId && r.id() == roundId).findFirst();
        }

        @Override
        public List<MoleRound> activeRounds(long userId) {
            return rounds.stream().filter(r -> r.userId() == userId && r.status() == MoleRound.Status.ACTIVE).toList();
        }

        @Override
        public Optional<MoleRound> latestSettled(long userId) {
            return rounds.stream().filter(r -> r.status() == MoleRound.Status.SETTLED)
                    .reduce((first, second) -> second);
        }

        @Override
        public int bestScore(long userId) {
            return rounds.stream().filter(r -> r.status() == MoleRound.Status.SETTLED)
                    .mapToInt(MoleRound::score).max().orElse(0);
        }

        @Override
        public long earned(long userId, Instant from, Instant until) {
            return earnedBefore + ledger.stream().mapToLong(entry ->
                    (long) ReflectionTestUtils.getField(entry, "balanceDelta")).sum();
        }

        @Override
        public void persist(Object entity) {
            if (entity instanceof MoleRound round) {
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

    private record FixedSeed(long seed) implements RandomGenerator {
        @Override
        public long nextLong() {
            return seed;
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
