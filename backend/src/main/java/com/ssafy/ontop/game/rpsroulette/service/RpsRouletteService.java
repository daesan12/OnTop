package com.ssafy.ontop.game.rpsroulette.service;

import com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRound;
import com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRound.Phase;
import com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRules;
import com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRules.Hand;
import com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRules.Result;
import com.ssafy.ontop.game.rpsroulette.dto.RpsRouletteStateResponse;
import com.ssafy.ontop.game.rpsroulette.repository.RpsRouletteRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HexFormat;
import java.util.List;
import java.util.random.RandomGenerator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 참가비를 거는 1인 미니게임. START에서 참가비와 하루 판 수를 확정하고, 공개된 손은 이탈해도 결과를 적용한다.
 * 판정 엔진과 분리해 공통 지갑·원장만 사용하며, 배당은 미니게임 공통 하루 상한에 합산하지 않는다.
 */
public class RpsRouletteService {
    private static final Logger log = LoggerFactory.getLogger(RpsRouletteService.class);
    private static final String REQUEST_KEY = "[A-Za-z0-9_-]{1,64}";
    private static final int SWEEP_BATCH = 50;
    private static final RpsRouletteStateResponse.Rules RULES = new RpsRouletteStateResponse.Rules(
            RpsRouletteRules.FEES, RpsRouletteRules.DAILY_PLAYS,
            RpsRouletteRules.MULTIPLIER_TENTHS.stream().map(tenths -> tenths / 10.0).toList(),
            RpsRouletteRules.ROULETTE, RpsRouletteRules.DUEL_LIMIT.toMillis(),
            RpsRouletteRules.DECIDE_LIMIT.toMillis(), RpsRouletteRules.GRACE.toMillis());

    private final RpsRouletteRepository repository;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final RandomGenerator random;

    public RpsRouletteService(RpsRouletteRepository repository, PlatformTransactionManager manager, Clock clock,
            RandomGenerator random) {
        this.repository = repository;
        this.transactions = new TransactionTemplate(manager);
        this.transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.clock = clock;
        this.random = random;
    }

    public RpsRouletteStateResponse status(long userId) {
        requireUser(userId);
        return transactions.execute(status -> {
            Wallet wallet = lockWallet(userId);
            Instant now = clock.instant();
            repository.lockActive(userId).ifPresent(round -> resolveExpired(round, wallet, now));
            return state(userId, wallet, repository.latest(userId).orElse(null), now);
        });
    }

    public RpsRouletteStateResponse start(long userId, String requestKey, Integer fee) {
        requireUser(userId);
        if (requestKey == null || !requestKey.matches(REQUEST_KEY) || fee == null || !RpsRouletteRules.isFee(fee)) {
            throw new RpsRouletteException(400, "RPS_INVALID_REQUEST", "참가비와 요청을 확인해 주세요.");
        }
        return transactions.execute(status -> {
            Wallet wallet = lockWallet(userId);
            Instant now = clock.instant();
            var previous = repository.findByRequest(userId, requestKey);
            if (previous.isPresent()) {
                if (previous.get().fee() != fee) {
                    throw new RpsRouletteException(409, "IDEMPOTENCY_KEY_CONFLICT", "이미 다른 참가비로 시작한 요청이에요.");
                }
                return state(userId, wallet, previous.get(), now);
            }
            var active = repository.lockActive(userId);
            active.ifPresent(round -> resolveExpired(round, wallet, now));
            if (active.isPresent() && active.get().phase() != Phase.SETTLED) {
                throw new RpsRouletteException(409, "RPS_ROUND_IN_PROGRESS", "진행 중인 판을 먼저 끝내 주세요.");
            }
            LocalDate today = LocalDate.ofInstant(now, RpsRouletteRules.KST);
            if (repository.countPlays(userId, today) >= RpsRouletteRules.DAILY_PLAYS) {
                throw new RpsRouletteException(409, "RPS_DAILY_LIMIT", "오늘 15판을 모두 했어요. 내일 다시 만나요.");
            }
            if (wallet.balance() - wallet.reserved() < fee) {
                throw new RpsRouletteException(409, "INSUFFICIENT_COINS", "엽전이 부족해요. 참가비를 확인해 주세요.");
            }
            wallet.debit(fee);
            RpsRouletteRound round = RpsRouletteRound.start(userId, requestKey, fee, today, now, randomHand(), salt());
            repository.persist(round);
            repository.persist(WalletTransaction.minigameEntryFee(wallet.id(), fee,
                    "rps-roulette:" + userId + ":" + requestKey, now));
            repository.flush();
            return state(userId, wallet, round, now);
        });
    }

    public RpsRouletteStateResponse hand(long userId, long roundId, Integer seq, String hand) {
        Hand player = parseHand(hand);
        return act(userId, roundId, seq, Phase.DUEL, (round, wallet, now) -> reveal(round, wallet, player, false, now));
    }

    public RpsRouletteStateResponse challenge(long userId, long roundId, Integer seq) {
        return act(userId, roundId, seq, Phase.DECIDE, (round, wallet, now) -> {
            if (round.stakeLevel() >= RpsRouletteRules.MAX_CHALLENGES) {
                throw new RpsRouletteException(409, "RPS_INVALID_PHASE", "도전은 두 번까지만 할 수 있어요.");
            }
            round.challenge(now, randomHand(), salt());
        });
    }

    public RpsRouletteStateResponse stop(long userId, long roundId, Integer seq) {
        return act(userId, roundId, seq, Phase.DECIDE, (round, wallet, now) -> spin(round, wallet, now));
    }

    /** 마감이 지난 판을 회원별 트랜잭션으로 끝낸다. 한 회원의 실패가 다른 회원 정리를 막지 않는다. */
    public void sweep() {
        Instant now = clock.instant();
        List<Long> users;
        try {
            users = transactions.execute(status -> repository.expiredUserIds(now, SWEEP_BATCH));
        } catch (RuntimeException exception) {
            // 예외가 타이머 밖으로 나가면 이후 정리가 멈추므로 여기서 기록하고 다음 주기를 기다린다.
            log.warn("가위바위보 룰렛 마감 판 조회 실패", exception);
            return;
        }
        if (users == null) {
            return;
        }
        for (long userId : users.stream().distinct().toList()) {
            try {
                transactions.executeWithoutResult(status -> repository.lockWallet(userId).ifPresent(wallet ->
                        repository.lockActive(userId).ifPresent(round -> resolveExpired(round, wallet,
                                clock.instant()))));
            } catch (RuntimeException exception) {
                log.warn("가위바위보 룰렛 마감 정리 실패: userId={}", userId, exception);
            }
        }
    }

    private interface Action {
        void apply(RpsRouletteRound round, Wallet wallet, Instant now);
    }

    private RpsRouletteStateResponse act(long userId, long roundId, Integer seq, Phase phase, Action action) {
        requireUser(userId);
        if (roundId <= 0 || seq == null || seq <= 0) {
            throw new RpsRouletteException(400, "RPS_INVALID_REQUEST", "판 정보를 확인해 주세요.");
        }
        return transactions.execute(status -> {
            Wallet wallet = lockWallet(userId);
            Instant now = clock.instant();
            RpsRouletteRound round = repository.lockRound(userId, roundId).orElseThrow(() ->
                    new RpsRouletteException(404, "RPS_ROUND_NOT_FOUND", "판을 찾지 못했어요."));
            resolveExpired(round, wallet, now);
            // 이미 반영된 순번의 재전송이거나 마감 처리로 앞서간 판은 다시 적용하지 않고 현재 상태로 맞춘다.
            if (seq != round.seq()) {
                return state(userId, wallet, round, now);
            }
            if (round.phase() != phase) {
                throw new RpsRouletteException(409, "RPS_INVALID_PHASE", "지금은 할 수 없는 행동이에요.");
            }
            action.apply(round, wallet, now);
            repository.flush();
            return state(userId, wallet, round, now);
        });
    }

    private void resolveExpired(RpsRouletteRound round, Wallet wallet, Instant now) {
        while (round.isExpired(now)) {
            if (round.phase() == Phase.DUEL) {
                reveal(round, wallet, randomHand(), true, now);
            } else {
                spin(round, wallet, now);
            }
        }
        repository.flush();
    }

    private void reveal(RpsRouletteRound round, Wallet wallet, Hand player, boolean auto, Instant now) {
        Result result = round.reveal(player, auto, now, randomHand(), salt());
        if (result == Result.WIN && round.canSpinNow()) {
            spin(round, wallet, now);
        }
    }

    private void spin(RpsRouletteRound round, Wallet wallet, Instant now) {
        round.pay(random.nextInt(RpsRouletteRules.ROULETTE.size()), now);
        wallet.creditReward(round.payout());
        repository.persist(WalletTransaction.rpsRoulettePayout(wallet.id(), round.payout(),
                "rps-roulette:payout:" + round.id(), now));
    }

    private RpsRouletteStateResponse state(long userId, Wallet wallet, RpsRouletteRound round, Instant now) {
        int played = (int) repository.countPlays(userId, LocalDate.ofInstant(now, RpsRouletteRules.KST));
        return new RpsRouletteStateResponse(now, wallet.balance() - wallet.reserved(), played, RULES,
                round == null ? null : view(round));
    }

    private static RpsRouletteStateResponse.Round view(RpsRouletteRound round) {
        boolean duel = round.phase() == Phase.DUEL;
        var last = round.lastDuelNo() == null ? null : new RpsRouletteStateResponse.LastDuel(round.lastDuelNo(),
                round.lastPlayerHand().name(), round.lastMachineHand().name(), round.lastSalt(),
                round.lastResult().name(), round.lastAuto());
        Integer cell = round.rouletteCell();
        return new RpsRouletteStateResponse.Round(Long.toString(round.id()), round.fee(), round.phase().name(),
                round.seq(), round.stakeLevel(),
                RpsRouletteRules.MULTIPLIER_TENTHS.get(round.stakeLevel()) / 10.0, round.challenging(),
                round.duelNo(), duel ? round.commitment() : null, round.inputEndsAt(), round.deadlineAt(), last,
                round.outcome() == null ? null : round.outcome().name(), cell,
                cell == null ? null : RpsRouletteRules.ROULETTE.get(cell), round.payout(), round.startedAt(),
                round.settledAt());
    }

    private Wallet lockWallet(long userId) {
        return repository.lockWallet(userId).orElseThrow(() ->
                new RpsRouletteException(409, "WALLET_NOT_READY", "지갑을 확인한 뒤 다시 시작해 주세요."));
    }

    private Hand randomHand() {
        return Hand.values()[random.nextInt(Hand.values().length)];
    }

    private String salt() {
        byte[] bytes = new byte[16];
        random.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    private static Hand parseHand(String hand) {
        for (Hand candidate : Hand.values()) {
            if (candidate.name().equals(hand)) {
                return candidate;
            }
        }
        throw new RpsRouletteException(400, "RPS_INVALID_REQUEST", "바위·가위·보 중 하나를 골라 주세요.");
    }

    private static void requireUser(long userId) {
        if (userId <= 0) {
            throw new RpsRouletteException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
    }
}
