package com.ssafy.ontop.game.mole.service;

import com.ssafy.ontop.game.mole.domain.MoleRound;
import com.ssafy.ontop.game.mole.domain.MoleRules;
import com.ssafy.ontop.game.mole.dto.MoleDtos;
import com.ssafy.ontop.game.mole.repository.MoleRepository;
import com.ssafy.ontop.minigame.service.MinigameRewardBudget;
import com.ssafy.ontop.minigame.service.MoleTargets;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.random.RandomGenerator;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 참가비 없이 실력으로 엽전을 버는 1인 미니게임. 서버가 시드로 출현표를 정하고, 완료 때 타격 기록을 다시 계산해
 * 40점당 1냥(규칙 3)을 미니게임 공통 하루 상한 안에서 지급한다. 판정 엔진과 분리해 공통 지갑·원장만 사용한다.
 */
public class MoleService {
    private static final String GAME = "whack-a-mole";
    private static final String REQUEST_KEY = "[A-Za-z0-9_-]{1,64}";
    /** 완료 요청은 90초 판에 시작 카운트다운과 네트워크 지연을 더한 시간 안에 와야 한다. */
    static final long LATE_GRACE_MS = 30_000;
    static final MoleDtos.Rules RULES = new MoleDtos.Rules(MoleRules.DURATION_MS, MoleRules.PHASE_MS, MoleRules.KEYS,
            MoleRules.POINTS_PER_COIN, MoleRules.NORMAL_POINTS, MoleRules.GOLD_POINTS, MoleRules.DECOY_PENALTY,
            MoleRules.RAPID_POINTS, MoleRules.COMBO_STEPS, MoleRules.COMBO_TENTHS);

    private final MoleRepository repository;
    private final TransactionTemplate transactions;
    /** 참가자 수·목록·내 순위를 한 스냅샷에서 읽는다. */
    private final TransactionTemplate reads;
    private final Clock clock;
    private final RandomGenerator random;

    public MoleService(MoleRepository repository, PlatformTransactionManager manager, Clock clock,
            RandomGenerator random) {
        this.repository = repository;
        this.transactions = new TransactionTemplate(manager);
        this.transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.reads = new TransactionTemplate(manager);
        this.reads.setReadOnly(true);
        this.reads.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        this.clock = clock;
        this.random = random;
    }

    /** 현재 규칙의 회원별 최고 기록 전체 랭킹. 스피드 두더지 랭킹과 같은 페이지 방식이다. */
    public MoleDtos.Rankings rankings(long userId, int limit, int offset) {
        requireUser(userId);
        if (limit < 1 || limit > 100 || offset < 0 || offset > 10_000) {
            throw new MoleException(400, "MOLE_INVALID_REQUEST", "페이지 범위를 확인해 주세요.");
        }
        return reads.execute(status -> {
            long total = repository.participants();
            return new MoleDtos.Rankings(MoleRules.RULES_VERSION, "ALL_TIME", clock.instant(), total, offset, limit,
                    repository.ranked(limit, offset), repository.myRanking(userId).orElse(null),
                    offset + (long) limit < total);
        });
    }

    public MoleDtos.State status(long userId) {
        requireUser(userId);
        return transactions.execute(status -> {
            Instant now = clock.instant();
            return new MoleDtos.State(now, earnedToday(userId, now), MinigameRewardBudget.DAILY_CAP,
                    repository.bestScore(userId), RULES, repository.latestSettled(userId).map(MoleService::result)
                    .orElse(null));
        });
    }

    /** 같은 키는 같은 판을 돌려준다. 새 판을 열면 끝내지 않은 이전 판은 보상 없이 닫는다. */
    public MoleDtos.Round start(long userId, String requestKey) {
        requireUser(userId);
        if (requestKey == null || !requestKey.matches(REQUEST_KEY)) {
            throw new MoleException(400, "MOLE_INVALID_REQUEST", "중복 방지 키를 확인해 주세요.");
        }
        return transactions.execute(status -> {
            lockWallet(userId);
            Instant now = clock.instant();
            var previous = repository.findByRequest(userId, requestKey);
            if (previous.isPresent()) {
                return round(previous.get());
            }
            repository.activeRounds(userId).forEach(active -> active.expire(now));
            MoleRound round = MoleRound.start(userId, requestKey, random.nextLong(), now);
            repository.persist(round);
            repository.flush();
            return round(round);
        });
    }

    public MoleDtos.Settlement complete(long userId, long roundId, List<MoleDtos.Hit> hits) {
        requireUser(userId);
        if (roundId <= 0 || (hits != null && (hits.size() > MoleRules.MAX_HITS || hits.stream().anyMatch(Objects::isNull)))) {
            throw new MoleException(400, "MOLE_INVALID_REQUEST", "타격 기록을 확인해 주세요.");
        }
        var completion = transactions.execute(status -> {
            Wallet wallet = lockWallet(userId);
            Instant now = clock.instant();
            MoleRound round = repository.findRound(userId, roundId).orElseThrow(() ->
                    new MoleException(404, "MOLE_ROUND_NOT_FOUND", "판을 찾을 수 없어요."));
            if (round.status() == MoleRound.Status.SETTLED) {
                return new MoleTargets.Completion<>(settlement(userId, round, now), 0);
            }
            long elapsed = now.toEpochMilli() - round.startedAt().toEpochMilli();
            // 판정 규칙이 바뀌기 전에 시작한 판은 같은 출현표를 다시 만들 수 없어 보상 없이 끝낸다.
            if (round.status() == MoleRound.Status.EXPIRED || elapsed > MoleRules.DURATION_MS + LATE_GRACE_MS
                    || round.rulesVersion() != MoleRules.RULES_VERSION) {
                throw new MoleException(409, "MOLE_ROUND_EXPIRED", "시간이 지나 끝난 판이에요. 새로 시작해 주세요.");
            }
            if (elapsed < MoleRules.DURATION_MS) {
                throw new MoleException(409, "MOLE_ROUND_NOT_FINISHED", "아직 끝나지 않은 판이에요.");
            }
            var hiddenIds = new MoleTargets(GAME, round.id(), round.seed()).hiddenIds(MoleRules.KEYS.size());
            List<MoleRules.Hit> taps = hits == null ? List.of() : hits.stream()
                    .filter(hit -> !hiddenIds.contains(hit.targetId()))
                    .map(hit -> new MoleRules.Hit(hit.hole(), hit.at())).toList();
            int hiddenTaps = hits == null ? 0 : hits.size() - taps.size();
            MoleRules.Score score = MoleRules.score(MoleRules.schedule(round.seed()), taps);
            int granted = MinigameRewardBudget.grant(score.coins(), earnedToday(userId, now));
            if (granted > 0) {
                wallet.creditReward(granted);
                repository.persist(WalletTransaction.moleReward(wallet.id(), granted,
                        "mole:reward:" + round.id(), now));
            }
            round.settle(score, granted, now);
            repository.flush();
            return new MoleTargets.Completion<>(settlement(userId, round, now), hiddenTaps);
        });
        return completion.report(GAME, userId, roundId);
    }

    private MoleDtos.Settlement settlement(long userId, MoleRound round, Instant now) {
        return new MoleDtos.Settlement(result(round), earnedToday(userId, now), MinigameRewardBudget.DAILY_CAP,
                repository.bestScore(userId));
    }

    private long earnedToday(long userId, Instant now) {
        LocalDate today = LocalDate.ofInstant(now, MinigameRewardBudget.KST);
        return repository.earned(userId, today.atStartOfDay(MinigameRewardBudget.KST).toInstant(),
                today.plusDays(1).atStartOfDay(MinigameRewardBudget.KST).toInstant());
    }

    private static MoleDtos.Round round(MoleRound round) {
        List<MoleDtos.Mole> moles = MoleRules.schedule(round.seed()).stream()
                .map(mole -> new MoleDtos.Mole(mole.id(), mole.hole(), mole.kind().name(), mole.hits(),
                        mole.appearAt(), mole.leaveAt()))
                .toList();
        var targets = new MoleTargets(GAME, round.id(), round.seed()).forStart(MoleRules.KEYS.size());
        return new MoleDtos.Round(Long.toString(round.id()), round.startedAt(), RULES, moles, targets);
    }

    private static MoleDtos.Result result(MoleRound round) {
        return new MoleDtos.Result(Long.toString(round.id()), round.score(), round.maxCombo(), round.caught(),
                round.calculatedReward(), round.reward(), round.settledAt());
    }

    private Wallet lockWallet(long userId) {
        return repository.lockWallet(userId).orElseThrow(() ->
                new MoleException(409, "WALLET_NOT_READY", "지갑을 확인한 뒤 다시 시작해 주세요."));
    }

    private static void requireUser(long userId) {
        if (userId <= 0) {
            throw new MoleException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
    }
}
