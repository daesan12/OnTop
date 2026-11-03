package com.ssafy.ontop.game.plusminus.service;

import com.ssafy.ontop.game.plusminus.domain.PlusMinusRound;
import com.ssafy.ontop.game.plusminus.domain.PlusMinusRules;
import com.ssafy.ontop.game.plusminus.dto.PlusMinusStateResponse;
import com.ssafy.ontop.game.plusminus.repository.PlusMinusRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.random.RandomGenerator;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 참가비를 거는 1인 미니게임. 플레이어 선택이 결과에 영향을 주지 않으므로 START 한 번에 세 칸을 정하고 정산까지 끝낸다.
 * 판정 엔진과 분리해 공통 지갑·원장만 사용하며, 배당은 미니게임 공통 하루 상한에 합산하지 않는다.
 */
public class PlusMinusService {
    private static final String REQUEST_KEY = "[A-Za-z0-9_-]{1,64}";
    private static final PlusMinusStateResponse.Rules RULES = new PlusMinusStateResponse.Rules(PlusMinusRules.FEE,
            PlusMinusRules.DAILY_PLAYS, PlusMinusRules.FIRST_REEL, PlusMinusRules.OPERATOR_REEL,
            PlusMinusRules.SECOND_REEL, PlusMinusRules.POINT_PAYOUT, PlusMinusRules.JACKPOT_FIRST,
            PlusMinusRules.JACKPOT_PAYOUT);

    private final PlusMinusRepository repository;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final RandomGenerator random;

    public PlusMinusService(PlusMinusRepository repository, PlatformTransactionManager manager, Clock clock,
            RandomGenerator random) {
        this.repository = repository;
        this.transactions = new TransactionTemplate(manager);
        this.transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.clock = clock;
        this.random = random;
    }

    public PlusMinusStateResponse status(long userId) {
        requireUser(userId);
        return transactions.execute(status -> {
            Wallet wallet = lockWallet(userId);
            return state(userId, wallet, repository.latest(userId).orElse(null), clock.instant());
        });
    }

    public PlusMinusStateResponse start(long userId, String requestKey) {
        requireUser(userId);
        if (requestKey == null || !requestKey.matches(REQUEST_KEY)) {
            throw new PlusMinusException(400, "PLUS_MINUS_INVALID_REQUEST", "중복 방지 키를 확인해 주세요.");
        }
        return transactions.execute(status -> {
            Wallet wallet = lockWallet(userId);
            Instant now = clock.instant();
            var previous = repository.findByRequest(userId, requestKey);
            if (previous.isPresent()) {
                return state(userId, wallet, previous.get(), now);
            }
            LocalDate today = LocalDate.ofInstant(now, PlusMinusRules.KST);
            if (repository.countPlays(userId, today) >= PlusMinusRules.DAILY_PLAYS) {
                throw new PlusMinusException(409, "PLUS_MINUS_DAILY_LIMIT", "오늘 10판을 모두 했어요. 내일 다시 만나요.");
            }
            if (wallet.balance() - wallet.reserved() < PlusMinusRules.FEE) {
                throw new PlusMinusException(409, "INSUFFICIENT_COINS", "엽전이 부족해요. 참가비 30냥이 필요해요.");
            }
            wallet.debit(PlusMinusRules.FEE);
            PlusMinusRound round = PlusMinusRound.play(userId, requestKey, today, now,
                    random.nextInt(PlusMinusRules.FIRST_REEL.size()),
                    random.nextInt(PlusMinusRules.OPERATOR_REEL.size()),
                    random.nextInt(PlusMinusRules.SECOND_REEL.size()));
            repository.persist(round);
            repository.persist(WalletTransaction.minigameEntryFee(wallet.id(), PlusMinusRules.FEE,
                    "plus-minus:" + userId + ":" + requestKey, now));
            if (round.payout() > 0) {
                wallet.creditReward(round.payout());
                repository.persist(WalletTransaction.plusMinusPayout(wallet.id(), round.payout(),
                        "plus-minus:payout:" + round.id(), now));
            }
            repository.flush();
            return state(userId, wallet, round, now);
        });
    }

    private PlusMinusStateResponse state(long userId, Wallet wallet, PlusMinusRound round, Instant now) {
        int played = (int) repository.countPlays(userId, LocalDate.ofInstant(now, PlusMinusRules.KST));
        return new PlusMinusStateResponse(now, wallet.balance() - wallet.reserved(), played, RULES,
                round == null ? null : view(round));
    }

    private static PlusMinusStateResponse.Round view(PlusMinusRound round) {
        return new PlusMinusStateResponse.Round(Long.toString(round.id()), round.firstCell(), round.operatorCell(),
                round.secondCell(), PlusMinusRules.FIRST_REEL.get(round.firstCell()),
                PlusMinusRules.OPERATOR_REEL.get(round.operatorCell()),
                PlusMinusRules.SECOND_REEL.get(round.secondCell()), round.result(), round.outcome().name(),
                round.payout(), round.playedAt());
    }

    private Wallet lockWallet(long userId) {
        return repository.lockWallet(userId).orElseThrow(() ->
                new PlusMinusException(409, "WALLET_NOT_READY", "지갑을 확인한 뒤 다시 시작해 주세요."));
    }

    private static void requireUser(long userId) {
        if (userId <= 0) {
            throw new PlusMinusException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
    }
}
