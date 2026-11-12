package com.ssafy.ontop.game.speedmole;

import com.ssafy.ontop.minigame.service.MinigameRewardBudget;
import com.ssafy.ontop.minigame.service.MoleTargets;
import com.ssafy.ontop.wallet.domain.Wallet;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** The wallet is locked before the round; score, shared-budget reward and ledger commit together. */
public class SpeedMoleService {
    private static final String GAME = "speed-mole";
    private final SpeedMoleRepository repository;
    private final Clock clock;
    private final SecureRandom random;
    private final TransactionTemplate write, read;
    private final SpeedMoleRewards rewards;
    public SpeedMoleService(SpeedMoleRepository repository, PlatformTransactionManager manager, Clock clock, SecureRandom random, SpeedMoleRewards rewards) {
        this.repository = repository; this.clock = clock; this.random = random;
        this.rewards = rewards;
        write = new TransactionTemplate(manager);
        write.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        read = new TransactionTemplate(manager);
        read.setReadOnly(true);
        read.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }
    public SpeedMoleDtos.Round start(long user, String key) {
        if (key == null || !key.matches("[A-Za-z0-9_-]{1,64}")) throw new SpeedMoleException(400, "SPEED_MOLE_INVALID_KEY", "시작 요청 키를 확인해 주세요.");
        return write.execute(tx -> {
            rewards.lock(user);
            Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
            var row = repository.start(user, key, Integer.toUnsignedLong(random.nextInt()), now.plusMillis(SpeedMoleRules.COUNTDOWN_MS));
            requireLatest(user, row.id());
            if (!row.status().equals("ACTIVE")) throw new SpeedMoleException(409, "SPEED_MOLE_ROUND_FINISHED", "이미 완료한 시작 요청이에요. 새로 시작해 주세요.");
            if (now.isAfter(row.startedAt().plusMillis(SpeedMoleRules.DURATION_MS + 30_000)))
                throw new SpeedMoleException(409, "SPEED_MOLE_ROUND_EXPIRED", "이 시작 요청은 시간이 지났어요. 새로 시작해 주세요.");
            var targets = new MoleTargets(GAME, row.id(), row.seed()).forStart(8);
            return new SpeedMoleDtos.Round(Long.toString(row.id()), row.seed(), row.version(), now, row.startedAt(),
                    SpeedMoleRules.DURATION_MS, targets);
        });
    }
    public SpeedMoleDtos.Result complete(long user, long id, List<SpeedMoleRules.Tap> taps) {
        var completion = write.execute(tx -> {
            Wallet wallet = rewards.lock(user);
            var row = repository.lock(user, id);
            if (row.status().equals("SETTLED")) {
                return new MoleTargets.Completion<>(result(row, wallet), 0);
            }
            requireLatest(user, id);
            long elapsed = clock.millis() - row.startedAt().toEpochMilli();
            if (row.version() != SpeedMoleRules.VERSION || elapsed > SpeedMoleRules.DURATION_MS + 30_000)
                throw new SpeedMoleException(409, "SPEED_MOLE_ROUND_EXPIRED", "기록 제출 시간이 지났어요. 새 판으로 시작해 주세요.");
            if (elapsed < SpeedMoleRules.DURATION_MS)
                throw new SpeedMoleException(409, "SPEED_MOLE_NOT_FINISHED", "아직 경기가 끝나지 않았어요.");
            SpeedMoleRules.requireTapCount(taps);
            String hiddenId = new MoleTargets(GAME, id, row.seed()).hiddenId();
            var playableTaps = taps.stream().filter(tap -> tap == null || !hiddenId.equals(tap.targetId())).toList();
            var score = SpeedMoleRules.replay(row.seed(), playableTaps);
            Instant completed = clock.instant().truncatedTo(ChronoUnit.MILLIS);
            int granted = rewards.grant(wallet, id, score.score(), completed);
            repository.settle(id, score, completed);
            var result = new SpeedMoleDtos.Result(Long.toString(id), row.version(), score.score(), score.hits(), score.misses(), completed,
                    score.score() / SpeedMoleRules.POINTS_PER_COIN, granted, rewards.earned(user, completed), MinigameRewardBudget.DAILY_CAP);
            return new MoleTargets.Completion<>(result, taps.size() - playableTaps.size());
        });
        return completion.report(GAME, user, id);
    }
    public SpeedMoleDtos.Rankings rankings(long user, int limit, int offset) {
        if (limit < 1 || limit > 100 || offset < 0 || offset > 10_000)
            throw new SpeedMoleException(400, "SPEED_MOLE_INVALID_PAGE", "페이지 범위를 확인해 주세요.");
        return read.execute(tx -> {
            long total = repository.participants();
            return new SpeedMoleDtos.Rankings(1, "ALL_TIME", clock.instant(), total, offset, limit,
                    repository.ranked(limit, offset), repository.me(user), offset + (long) limit < total);
        });
    }
    private SpeedMoleDtos.Result result(SpeedMoleRepository.Row r, Wallet wallet) {
        return new SpeedMoleDtos.Result(Long.toString(r.id()), r.version(), r.score(), r.hits(), r.misses(), r.completedAt(),
                r.score() / SpeedMoleRules.POINTS_PER_COIN, rewards.previous(wallet, r.id()), rewards.earned(wallet.userId(), clock.instant()), MinigameRewardBudget.DAILY_CAP);
    }
    private void requireLatest(long user, long id) {
        if (repository.latestId(user) != id) throw new SpeedMoleException(409, "SPEED_MOLE_ROUND_SUPERSEDED", "다른 창에서 새 판이 시작됐어요. 새 판으로 다시 도전해 주세요.");
    }
}
