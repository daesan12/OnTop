package com.ssafy.ontop.demo;

import com.ssafy.ontop.game.plusminus.domain.PlusMinusRound;
import com.ssafy.ontop.game.plusminus.repository.PlusMinusRepository;
import com.ssafy.ontop.game.plusminus.service.PlusMinusService;
import com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRound;
import com.ssafy.ontop.game.rpsroulette.repository.RpsRouletteRepository;
import com.ssafy.ontop.game.rpsroulette.service.RpsRouletteService;
import com.ssafy.ontop.wallet.domain.Wallet;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.locks.ReentrantLock;
import java.util.random.RandomGenerator;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

/** 테스트 classpath 전용 메모리 저장소. 실제 게임 서비스를 사용하되 DB 원장·롤백 검증을 대신하지 않는다. */
@TestConfiguration(proxyBeanMethods = false)
@Profile("local & stone-rumble-park & !db & !dev & !prod & !production")
@ConditionalOnProperty(name = "ontop.qa-feedback.enabled", havingValue = "true")
class ArcadeParkQa {
    @Bean
    MemoryArcade qaArcadeMemory(StoneRumbleParkApplication.LocalLedger ledger) {
        return new MemoryArcade(ledger);
    }

    @Bean
    RpsRouletteService qaRpsRoulette(MemoryArcade memory) {
        return new RpsRouletteService(memory.rps, memory, Clock.systemUTC(), RandomGenerator.getDefault());
    }

    @Bean
    PlusMinusService qaPlusMinus(MemoryArcade memory) {
        return new PlusMinusService(memory.plus, memory, Clock.systemUTC(), RandomGenerator.getDefault());
    }

    static final class MemoryArcade implements PlatformTransactionManager {
        private final ReentrantLock lock = new ReentrantLock();
        private final StoneRumbleParkApplication.LocalLedger ledger;
        private final Map<Long, Wallet> wallets = new HashMap<>();
        private final List<RpsRouletteRound> rpsRounds = new ArrayList<>();
        private final List<PlusMinusRound> plusRounds = new ArrayList<>();
        private final Map<Long, Long> opening = new HashMap<>();

        MemoryArcade(StoneRumbleParkApplication.LocalLedger ledger) {
            this.ledger = ledger;
        }

        private Optional<Wallet> wallet(long user) {
            if (!java.util.Set.of(101L, 202L, 303L, 404L, 505L, 606L, 707L, 808L, 999L).contains(user)) {
                return Optional.empty();
            }
            Wallet wallet = wallets.computeIfAbsent(user, id -> {
                var created = Wallet.forSignup(id, Instant.now());
                ReflectionTestUtils.setField(created, "id", id);
                return created;
            });
            long balance = ledger.balances.getOrDefault(user, 10000L);
            ReflectionTestUtils.setField(wallet, "balance", balance);
            opening.put(user, balance);
            return Optional.of(wallet);
        }

        @Override
        public TransactionStatus getTransaction(TransactionDefinition definition) {
            lock.lock();
            opening.clear();
            return new SimpleTransactionStatus();
        }

        @Override
        public void commit(TransactionStatus status) {
            try {
                opening.forEach((user, before) -> ledger.creditForQa(user, wallets.get(user).balance() - before));
            } finally {
                lock.unlock();
            }
        }

        @Override
        public void rollback(TransactionStatus status) {
            lock.unlock();
        }

        final RpsRouletteRepository rps = new RpsRouletteRepository(null) {
            @Override public Optional<Wallet> lockWallet(long user) { return wallet(user); }
            @Override public Optional<RpsRouletteRound> findByRequest(long user, String key) {
                return rpsRounds.stream().filter(r -> r.userId() == user && r.requestKey().equals(key)).findFirst();
            }
            @Override public Optional<RpsRouletteRound> lockActive(long user) {
                return rpsRounds.stream().filter(r -> r.userId() == user && r.phase() != RpsRouletteRound.Phase.SETTLED).findFirst();
            }
            @Override public Optional<RpsRouletteRound> lockRound(long user, long id) {
                return rpsRounds.stream().filter(r -> r.userId() == user && r.id() == id).findFirst();
            }
            @Override public Optional<RpsRouletteRound> latest(long user) {
                return rpsRounds.stream().filter(r -> r.userId() == user).max(Comparator.comparingLong(RpsRouletteRound::id));
            }
            @Override public long countPlays(long user, LocalDate date) {
                return rpsRounds.stream().filter(r -> r.userId() == user && r.playDate().equals(date)).count();
            }
            @Override public List<Long> expiredUserIds(Instant now, int limit) {
                return rpsRounds.stream().filter(r -> r.isExpired(now)).map(RpsRouletteRound::userId).distinct().limit(limit).toList();
            }
            @Override public void persist(Object value) {
                if (value instanceof RpsRouletteRound round) {
                    ReflectionTestUtils.setField(round, "id", (long) rpsRounds.size() + 1);
                    rpsRounds.add(round);
                }
            }
            @Override public void flush() { }
        };

        final PlusMinusRepository plus = new PlusMinusRepository(null) {
            @Override public Optional<Wallet> lockWallet(long user) { return wallet(user); }
            @Override public Optional<PlusMinusRound> findByRequest(long user, String key) {
                return plusRounds.stream().filter(r -> r.userId() == user && r.requestKey().equals(key)).findFirst();
            }
            @Override public Optional<PlusMinusRound> latest(long user) {
                return plusRounds.stream().filter(r -> r.userId() == user).max(Comparator.comparingLong(PlusMinusRound::id));
            }
            @Override public long countPlays(long user, LocalDate date) {
                return plusRounds.stream().filter(r -> r.userId() == user && r.playDate().equals(date)).count();
            }
            @Override public void persist(Object value) {
                if (value instanceof PlusMinusRound round) {
                    ReflectionTestUtils.setField(round, "id", (long) plusRounds.size() + 1);
                    plusRounds.add(round);
                }
            }
            @Override public void flush() { }
        };
    }
}
