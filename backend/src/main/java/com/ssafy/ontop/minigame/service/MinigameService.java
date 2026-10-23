package com.ssafy.ontop.minigame.service;

import com.ssafy.ontop.minigame.domain.MinigameSession;
import com.ssafy.ontop.minigame.domain.MinigameStartRequest;
import com.ssafy.ontop.minigame.dto.MinigameAbandonResponse;
import com.ssafy.ontop.minigame.dto.MinigameCompleteResponse;
import com.ssafy.ontop.minigame.dto.MinigameStartResponse;
import com.ssafy.ontop.minigame.dto.MinigameStatusResponse;
import com.ssafy.ontop.minigame.repository.MinigameRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.OptionalLong;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

public class MinigameService {
    private static final long MAX_SAFE_INTEGER = 9007199254740991L;
    private final MinigameRepository repository;
    private final TransactionTemplate transactions;
    private final ObjectProvider<VerifiedMinigameResultSource> results;
    private final Clock clock;

    public MinigameService(MinigameRepository repository, PlatformTransactionManager manager,
            ObjectProvider<VerifiedMinigameResultSource> results, Clock clock) {
        this.repository = repository;
        this.transactions = new TransactionTemplate(manager);
        this.transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.results = results;
        this.clock = clock;
    }

    public MinigameStartResponse start(long userId, String type, String key) {
        if (!"BUNGEOPPANG".equals(type)) {
            throw error(400, "UNSUPPORTED_MINIGAME", "지원하지 않는 미니게임입니다.");
        }
        if (key == null || !key.matches("[A-Za-z0-9_-]{1,64}")) {
            throw error(400, "INVALID_REQUEST", "미니게임 종류와 중복 방지 키를 확인하세요.");
        }
        return transactions.execute(status -> {
            lockWallet(userId);
            var previous = repository.startRequest(userId, key);
            MinigameSession session;
            if (previous.isPresent()) {
                session = requireSession(userId, previous.get().sessionId(), false);
            } else {
                session = new MinigameSession(userId, clock.instant().truncatedTo(ChronoUnit.MILLIS));
                repository.persist(session);
                repository.persist(new MinigameStartRequest(userId, key, session.id()));
                repository.flush();
            }
            // 재요청도 최초 생성 응답을 재현하며 현재 상태는 상태 조회 API가 제공한다.
            return new MinigameStartResponse(Long.toString(session.id()), session.minigameType(), "PLAYING",
                    session.startedAt());
        });
    }

    public MinigameStatusResponse load(long userId, long sessionId) {
        return transactions.execute(status -> {
            var session = requireSession(userId, sessionId, false);
            return new MinigameStatusResponse(Long.toString(session.id()), session.status(), session.score(),
                    session.rewardAmount(), session.startedAt(), session.endedAt());
        });
    }

    public MinigameCompleteResponse complete(long userId, long sessionId) {
        return transactions.execute(status -> {
            // 상점과 같은 지갑 행 → 세션 순서로 잠근다. 완료/포기는 최종 상태 하나만 확정한다.
            Wallet wallet = lockWallet(userId);
            var session = requireSession(userId, sessionId, true);
            if (session.status().equals("COMPLETED")) {
                return completed(session);
            }
            if (session.status().equals("ABANDONED")) {
                throw error(409, "MINIGAME_ALREADY_ABANDONED", "이미 포기한 미니게임입니다.");
            }
            requirePlaying(session);
            var source = results.getIfAvailable();
            OptionalLong verified = source == null ? OptionalLong.empty()
                    : source.findCompletedCount(userId, sessionId);
            if (verified.isEmpty()) {
                throw error(409, "MINIGAME_NOT_VERIFIED", "서버에서 확인된 플레이 결과가 필요합니다.");
            }
            long count = verified.getAsLong();
            if (count < 0 || count > MAX_SAFE_INTEGER) {
                throw error(409, "MINIGAME_NOT_VERIFIED", "서버 플레이 결과를 확인할 수 없습니다.");
            }
            if (count % 3 != 0) {
                throw error(409, "MINIGAME_POLICY_REQUIRED", "남은 붕어빵 처리 정책 확인이 필요합니다.");
            }
            long reward = count / 3 * 2;
            wallet.creditReward(reward);
            session.complete(count, reward, clock.instant().truncatedTo(ChronoUnit.MILLIS));
            if (reward > 0) {
                repository.persist(WalletTransaction.minigameReward(wallet.id(), session.id(), reward,
                        "minigame-reward:" + session.id()));
            }
            repository.flush();
            return completed(session);
        });
    }

    public MinigameAbandonResponse abandon(long userId, long sessionId) {
        return transactions.execute(status -> {
            lockWallet(userId);
            var session = requireSession(userId, sessionId, true);
            if (session.status().equals("COMPLETED")) {
                throw error(409, "MINIGAME_ALREADY_COMPLETED", "이미 보상이 확정된 미니게임입니다.");
            }
            if (!session.status().equals("ABANDONED")) {
                requirePlaying(session);
                session.abandon(clock.instant().truncatedTo(ChronoUnit.MILLIS));
                repository.flush();
            }
            return new MinigameAbandonResponse(Long.toString(session.id()), session.status(), 0);
        });
    }

    private Wallet lockWallet(long userId) {
        return repository.lockWallet(userId).orElseThrow(() ->
                error(503, "MINIGAME_UNAVAILABLE", "지갑 정보를 확인할 수 없습니다."));
    }

    private MinigameSession requireSession(long userId, long sessionId, boolean lock) {
        return repository.session(userId, sessionId, lock).orElseThrow(() ->
                error(404, "MINIGAME_NOT_FOUND", "미니게임을 찾을 수 없습니다."));
    }

    private void requirePlaying(MinigameSession session) {
        if (!session.status().equals("PLAYING")) {
            throw error(409, "MINIGAME_ALREADY_FINISHED", "이미 종료된 미니게임입니다.");
        }
    }

    private MinigameCompleteResponse completed(MinigameSession session) {
        return new MinigameCompleteResponse(Long.toString(session.id()), session.status(), session.score(),
                session.rewardAmount());
    }

    private MinigameException error(int status, String code, String message) {
        return new MinigameException(status, code, message);
    }
}
