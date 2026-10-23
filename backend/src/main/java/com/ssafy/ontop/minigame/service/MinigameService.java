package com.ssafy.ontop.minigame.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.minigame.domain.BungeoppangRecord;
import com.ssafy.ontop.minigame.domain.MinigameSession;
import com.ssafy.ontop.minigame.domain.MinigameStartRequest;
import com.ssafy.ontop.minigame.dto.BungeoppangStatusResponse;
import com.ssafy.ontop.minigame.dto.MinigameAbandonResponse;
import com.ssafy.ontop.minigame.dto.MinigameCompleteResponse;
import com.ssafy.ontop.minigame.dto.MinigameStartResponse;
import com.ssafy.ontop.minigame.dto.MinigameStatusResponse;
import com.ssafy.ontop.minigame.repository.MinigameRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;
import java.util.TreeSet;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

public class MinigameService {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private final MinigameRepository repository;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final int startsPerMinute;
    private final ObjectMapper json = new ObjectMapper();
    private final SecureRandom random = new SecureRandom();
    private final BungeoppangRules rules = new BungeoppangRules();

    public MinigameService(MinigameRepository repository, PlatformTransactionManager manager, Clock clock) {
        this(repository, manager, clock, 10);
    }

    public MinigameService(MinigameRepository repository, PlatformTransactionManager manager, Clock clock,
            int startsPerMinute) {
        if (startsPerMinute < 1) { throw new IllegalArgumentException("시작 제한은 1 이상이어야 합니다."); }
        this.repository = repository;
        this.transactions = new TransactionTemplate(manager);
        this.transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.clock = clock;
        this.startsPerMinute = startsPerMinute;
    }

    public MinigameStartResponse start(long userId, String type, String key) {
        if (!"BUNGEOPPANG".equals(type)) {
            throw error(400, "UNSUPPORTED_MINIGAME", "지원하지 않는 미니게임입니다.");
        }
        if (key == null || !key.matches("[A-Za-z0-9_-]{1,64}")) {
            throw error(400, "INVALID_REQUEST", "중복 방지 키를 확인하세요.");
        }
        return transactions.execute(tx -> {
            lockWallet(userId);
            var previous = repository.startRequest(userId, key);
            MinigameSession session;
            BungeoppangRecord record;
            if (previous.isPresent()) {
                session = requireSession(userId, previous.get().sessionId(), false);
                record = requireRecord(session.id());
            } else {
                Instant now = now();
                if (repository.startsSince(userId, now.minusSeconds(60)) >= startsPerMinute) {
                    throw error(429, "TOO_MANY_STARTS", "잠시 후 다시 시작하세요.");
                }
                repository.playing(userId).forEach(s -> {
                    if (expired(s, now)) { s.invalidate(now); }
                    else { s.abandon(now); }
                });
                boolean first = repository.firstGame(userId);
                session = new MinigameSession(userId, now);
                repository.persist(session);
                List<Integer> heats = random.ints(64, 85, 116).boxed().toList();
                record = new BungeoppangRecord(session.id(), write(heats), first);
                repository.persist(record);
                repository.persist(new MinigameStartRequest(userId, key, session.id()));
                repository.flush();
            }
            return new MinigameStartResponse(Long.toString(session.id()), session.minigameType(), "PLAYING",
                    session.startedAt(), record.rulesVersion(), heats(record), record.firstGame());
        });
    }

    public BungeoppangStatusResponse status(long userId) {
        return transactions.execute(tx -> {
            lockWallet(userId);
            Instant now = now();
            repository.playing(userId).stream().filter(s -> expired(s, now)).forEach(s -> s.invalidate(now));
            return new BungeoppangStatusResponse(earned(userId, now), BungeoppangRules.DAILY_CAP,
                    repository.firstGame(userId), tips(repository.profile(userId).seenTips()), BungeoppangRules.VERSION);
        });
    }

    public MinigameStatusResponse load(long userId, long sessionId) {
        return transactions.execute(tx -> {
            lockWallet(userId);
            var session = requireSession(userId, sessionId, true);
            Instant now = now();
            if (session.status().equals("PLAYING") && expired(session, now)) { session.invalidate(now); }
            return new MinigameStatusResponse(Long.toString(session.id()), session.status(), session.score(),
                    session.rewardAmount(), session.startedAt(), session.endedAt());
        });
    }

    public MinigameCompleteResponse complete(long userId, long sessionId, JsonNode submission) {
        // 거부 자료도 커밋해야 하므로 예외는 트랜잭션 밖으로 나간 뒤 던진다.
        Object result = transactions.execute(tx -> finish(userId, sessionId, submission));
        if (result instanceof MinigameException failure) { throw failure; }
        return (MinigameCompleteResponse) result;
    }

    private Object finish(long userId, long sessionId, JsonNode submission) {
        // 공통 잠금 순서 지갑 → 세션. 일일 상한도 같은 회원의 지갑 잠금 아래 계산한다.
        Wallet wallet = lockWallet(userId);
        var session = requireSession(userId, sessionId, true);
        var record = requireRecord(sessionId);
        if (session.status().equals("COMPLETED")) { return read(record.result(), MinigameCompleteResponse.class); }
        if (record.rejectionDetail() != null) { return rejected(record); }
        Instant now = now();
        if (session.status().equals("PLAYING") && expired(session, now)) {
            session.invalidate(now);
            return error(409, "GAME_NOT_ACTIVE", "제출 기한이 지난 미니게임입니다.");
        }
        requirePlaying(session);
        if (now.isBefore(session.startedAt().plusSeconds(60))) {
            return error(422, "TOO_EARLY", "시작 후 60초가 지나야 제출할 수 있습니다.");
        }
        BungeoppangRules.Result score;
        try { score = rules.replay(submission, heats(record)); }
        catch (MinigameException exception) {
            record.reject(write(submission), exception.detail(), exception.index());
            session.invalidate(now);
            repository.flush();
            return exception;
        }
        long calculated = score.score() / 15;
        long today = earned(userId, now);
        long reward = Math.min(calculated, Math.max(0, BungeoppangRules.DAILY_CAP - today));
        wallet.creditReward(reward);
        session.complete(score.score(), reward, now);
        if (reward > 0) {
            repository.persist(WalletTransaction.minigameReward(wallet.id(), session.id(), reward,
                    "minigame-reward:" + session.id()));
        }
        var profile = repository.profile(userId);
        var seen = new TreeSet<>(tips(profile.seenTips()));
        submission.path("seenTips").forEach(tip -> {
            if (tip.isTextual() && BungeoppangRules.TIP_KEYS.contains(tip.textValue())) { seen.add(tip.textValue()); }
        });
        profile.remember(String.join(",", seen));
        var response = new MinigameCompleteResponse(Long.toString(sessionId), "COMPLETED", score.made(), reward,
                score.score(), score.made(), score.golden(), score.failed(), score.wasted(), score.maxCombo(),
                calculated, reward, today + reward, BungeoppangRules.DAILY_CAP,
                today + reward >= BungeoppangRules.DAILY_CAP);
        record.accept(write(submission), write(response));
        repository.flush();
        return response;
    }

    public MinigameAbandonResponse abandon(long userId, long sessionId) {
        return transactions.execute(tx -> {
            lockWallet(userId);
            var session = requireSession(userId, sessionId, true);
            if (session.status().equals("COMPLETED")) {
                throw error(409, "MINIGAME_ALREADY_COMPLETED", "이미 보상이 확정된 미니게임입니다.");
            }
            if (!session.status().equals("ABANDONED")) {
                requirePlaying(session);
                session.abandon(now());
                repository.flush();
            }
            return new MinigameAbandonResponse(Long.toString(sessionId), session.status(), 0);
        });
    }

    private long earned(long userId, Instant now) {
        var date = now.atZone(SEOUL).toLocalDate();
        return repository.earned(userId, date.atStartOfDay(SEOUL).toInstant(),
                date.plusDays(1).atStartOfDay(SEOUL).toInstant());
    }
    private boolean expired(MinigameSession session, Instant now) {
        return !now.isBefore(session.startedAt().plusSeconds(600));
    }
    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MILLIS); }
    private List<String> tips(String value) { return value.isEmpty() ? List.of() : Arrays.asList(value.split(",")); }
    private Wallet lockWallet(long userId) {
        return repository.lockWallet(userId).orElseThrow(() ->
                error(503, "MINIGAME_UNAVAILABLE", "지갑 정보를 확인할 수 없습니다."));
    }
    private MinigameSession requireSession(long userId, long sessionId, boolean lock) {
        return repository.session(userId, sessionId, lock).orElseThrow(() ->
                error(404, "MINIGAME_NOT_FOUND", "미니게임을 찾을 수 없습니다."));
    }
    private BungeoppangRecord requireRecord(long sessionId) {
        var record = repository.record(sessionId).orElseThrow(() ->
                error(409, "RULES_VERSION_MISMATCH", "새 판을 시작하세요."));
        if (!BungeoppangRules.VERSION.equals(record.rulesVersion())) {
            throw error(409, "RULES_VERSION_MISMATCH", "새 판을 시작하세요.");
        }
        return record;
    }
    private List<Integer> heats(BungeoppangRecord record) {
        try { return json.readValue(record.heats(), new TypeReference<List<Integer>>() { }); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("저장된 불 세기 오류", exception); }
    }
    private MinigameException rejected(BungeoppangRecord record) {
        return new MinigameException(422, "LOG_INVALID", "입력 기록을 확인할 수 없습니다.",
                record.rejectionDetail(), record.rejectionIndex());
    }
    private void requirePlaying(MinigameSession session) {
        if (!session.status().equals("PLAYING")) {
            throw error(409, "MINIGAME_ALREADY_" + session.status(), "이미 종료된 미니게임입니다.");
        }
    }
    private String write(Object value) {
        try { return json.writeValueAsString(value); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("미니게임 저장 오류", exception); }
    }
    private <T> T read(String value, Class<T> type) {
        try { return json.readValue(value, type); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("미니게임 조회 오류", exception); }
    }
    private MinigameException error(int status, String code, String message) {
        return new MinigameException(status, code, message);
    }
}
