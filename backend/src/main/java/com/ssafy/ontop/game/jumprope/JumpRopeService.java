package com.ssafy.ontop.game.jumprope;

import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

public class JumpRopeService {
    private static final Pattern REQUEST_KEY = Pattern.compile("[A-Za-z0-9_-]{1,64}");
    static final int TOP_LIMIT = 10;
    static final int MAX_OFFSET = 10_000;

    private final JumpRopeRepository repository;
    private final Clock clock;
    private final SecureRandom random;
    private final JumpRopeRewards rewards;
    /** The rules version of new rounds and of the ranking board. Existing rounds keep the version they started with. */
    private final int rulesVersion;
    private final TransactionTemplate write;
    private final TransactionTemplate read;

    JumpRopeService(JumpRopeRepository repository, PlatformTransactionManager manager, Clock clock, SecureRandom random,
            JumpRopeRewards rewards, int rulesVersion) {
        if (!supports(rulesVersion)) {
            throw new IllegalArgumentException("Unsupported jump rope rules version: " + rulesVersion);
        }
        this.repository = repository;
        this.clock = clock;
        this.random = random;
        this.rewards = rewards;
        this.rulesVersion = rulesVersion;
        write = new TransactionTemplate(manager);
        write.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        read = new TransactionTemplate(manager);
        read.setReadOnly(true);
        read.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }

    public JumpRopeDtos.Round start(long userId, String key) {
        if (key == null || !REQUEST_KEY.matcher(key).matches()) throw invalidKey();
        return write.execute(tx -> {
            if (!repository.lockUser(userId)) throw unauthenticated();
            Instant now = clock.instant();
            Instant startedAt = now.truncatedTo(ChronoUnit.MILLIS).plusMillis(JumpRopeRules.COUNTDOWN_MS);
            var row = repository.start(userId, key, Integer.toUnsignedLong(random.nextInt()), rulesVersion, startedAt,
                    startedAt.plusSeconds(JumpRopeRules.EXPIRY_SECONDS));
            requireLatest(userId, row.id());
            if (row.result() != null) throw new JumpRopeException(409, "JUMP_ROPE_ROUND_FINISHED", "이미 완료한 시작 요청이에요.");
            requireActiveVersionAndWindow(row, now);
            return new JumpRopeDtos.Round(Long.toString(row.id()), row.seed(), row.rulesVersion(),
                    now.truncatedTo(ChronoUnit.MILLIS), row.startedAt(), row.expiresAt(), JumpRopeRules.DURATION_MS);
        });
    }

    /** A log without duck spans, as rules v1 rounds submit it. */
    public JumpRopeDtos.Result complete(long userId, long id, List<Integer> offsets) {
        return complete(userId, id, offsets, null);
    }

    /**
     * Replays the submitted log under the rules version stored on the round, never the one the client implies.
     * A v1 round accepts only jump offsets; a v2 round also requires duck spans (an empty list is valid).
     */
    public JumpRopeDtos.Result complete(long userId, long id, List<Integer> offsets, List<List<Integer>> duckSpans) {
        JumpRopeRules.validateInputs(offsets);
        var inputs = List.copyOf(offsets);
        var spans = duckSpans == null ? null : JumpRopeRulesV2.spans(duckSpans);
        Instant receivedAt = clock.instant();
        return write.execute(tx -> {
            // Use the same wallet-first order as the other reward writers; keep the existing user/round lock order.
            var wallet = rewards.lockWallet(userId);
            if (!repository.lockUser(userId)) throw notFound();
            var row = repository.lockRound(userId, id).orElseThrow(JumpRopeService::notFound);
            requireActiveVersionAndWindow(row, receivedAt);
            boolean v2 = row.rulesVersion() == JumpRopeRulesV2.VERSION;
            if (v2 ? spans == null : spans != null) throw JumpRopeRulesV2.invalidDucks();
            String inputHash = v2 ? hashV2(inputs, spans) : hash(inputs);
            if (row.result() != null) {
                if (!inputHash.equals(row.inputHash())) {
                    throw new JumpRopeException(409, "JUMP_ROPE_INPUT_CONFLICT", "이미 다른 점프 기록으로 결과가 확정됐어요.");
                }
                int granted = wallet.map(locked -> rewards.previous(locked, id)).orElse(0);
                return row.result().withReward(granted);
            }
            requireLatest(userId, id);
            var replay = v2 ? JumpRopeRulesV2.replay(row.seed(), inputs, spans) : JumpRopeRules.replay(inputs);
            if (receivedAt.isBefore(row.startedAt().plus(replay.minimumElapsedUs(), ChronoUnit.MICROS))) {
                throw new JumpRopeException(409, "JUMP_ROPE_NOT_FINISHED", "아직 경기가 끝나지 않았어요.");
            }
            Instant completedAt = receivedAt.truncatedTo(ChronoUnit.MILLIS);
            int calculated = JumpRopeRewards.calculated(replay);
            int granted = calculated == 0 ? 0 : rewards.grant(wallet.orElseThrow(() ->
                    new JumpRopeException(503, "JUMP_ROPE_UNAVAILABLE", "지갑을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.")),
                    id, calculated, completedAt);
            repository.settle(id, replay, completedAt, inputHash);
            if (audit != null) {
                audit.settled(userId, id, row.rulesVersion(), row.startedAt(), replay.minimumElapsedUs(), inputs,
                        inputHash, receivedAt);
            }
            var counts = new JumpRopeDtos.Counts(replay.perfect(), replay.good(), replay.miss());
            return new JumpRopeDtos.Result(Long.toString(id), row.rulesVersion(), replay.score(), counts,
                    replay.reason().wireValue(), completedAt, granted);
        });
    }

    public JumpRopeDtos.Rankings rankings(long userId, int limit, int offset) {
        if (limit < 1 || limit > TOP_LIMIT || offset < 0 || offset > MAX_OFFSET) {
            throw new JumpRopeException(400, "JUMP_ROPE_INVALID_PAGE", "페이지 범위를 확인해 주세요.");
        }
        return read.execute(tx -> {
            long total = repository.participants(rulesVersion);
            return new JumpRopeDtos.Rankings(rulesVersion, "ALL_TIME", clock.instant(), total, offset, limit,
                    repository.ranked(rulesVersion, limit, offset), repository.me(rulesVersion, userId),
                    offset + (long) limit < total);
        });
    }

    static boolean supports(int version) {
        return version == JumpRopeRules.VERSION || version == JumpRopeRulesV2.VERSION;
    }

    private void requireLatest(long userId, long id) {
        if (repository.latestId(userId) != id) {
            throw new JumpRopeException(409, "JUMP_ROPE_ROUND_SUPERSEDED", "새 판이 시작돼 이전 기록을 제출할 수 없어요.");
        }
    }

    /** An active round of any supported version still completes after the version of new rounds changes. */
    private static void requireActiveVersionAndWindow(JumpRopeRepository.Row row, Instant at) {
        if (at.isAfter(row.expiresAt()) || (row.result() == null && !supports(row.rulesVersion()))) {
            throw new JumpRopeException(409, "JUMP_ROPE_ROUND_EXPIRED", "기록 제출 시간이 지났거나 규칙 버전이 바뀌었어요.");
        }
    }

    /** Rules v1: the jump offsets as big-endian int32 values. Unchanged so settled v1 rounds keep their hash. */
    static String hash(List<Integer> inputs) {
        ByteBuffer bytes = ByteBuffer.allocate(Integer.BYTES * inputs.size());
        inputs.forEach(bytes::putInt);
        return sha256(bytes.array());
    }

    /** Rules v2: version 2, jump count, jumps, span count, then each span's start and end, all big-endian int32. */
    static String hashV2(List<Integer> inputs, List<JumpRopeRulesV2.DuckSpan> spans) {
        ByteBuffer bytes = ByteBuffer.allocate(Integer.BYTES * (3 + inputs.size() + 2 * spans.size()));
        bytes.putInt(JumpRopeRulesV2.VERSION).putInt(inputs.size());
        inputs.forEach(bytes::putInt);
        bytes.putInt(spans.size());
        spans.forEach(span -> bytes.putInt(span.startUs()).putInt(span.endUs()));
        return sha256(bytes.array());
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    private static JumpRopeException notFound() {
        return new JumpRopeException(404, "JUMP_ROPE_ROUND_NOT_FOUND", "내 경기 기록을 찾을 수 없어요.");
    }

    static JumpRopeException invalidKey() {
        return new JumpRopeException(400, "JUMP_ROPE_INVALID_KEY", "Idempotency-Key를 한 개 확인해 주세요.");
    }

    static JumpRopeException unauthenticated() {
        return new JumpRopeException(401, "UNAUTHENTICATED", "로그인이 필요해요.");
    }

    /** 운영자 조회용 판 기록. 저장소가 없는 환경(테스트·기록 비활성)에서는 남기지 않는다. */
    private JumpRopeAudit audit;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void audit(JumpRopeAudit audit) {
        this.audit = audit;
    }
}
