package com.ssafy.ontop.minigame.telemetry;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 확정된 두더지·스피드 두더지 판의 타이밍 신호({@link MoleTimingSignals})를 운영자 조회용으로 남긴다.
 * 판정·점수·보상·랭킹과 이용자 응답에는 관여하지 않으며, 저장에 실패해도 판 확정은 그대로다.
 *
 * <p>줄넘기 판 기록(JumpRopeAudit)과 같이 판 확정 트랜잭션이 커밋된 뒤에만 전용 스레드 하나로 넘겨 계산·저장한다.
 * 롤백된 판은 기록하지 않고, 커밋과 저장 사이에 서버가 내려가면 그 판의 기록만 빠진다.
 */
public class MoleTimingAudit implements AutoCloseable {
    private static final Logger log = LoggerFactory.getLogger(MoleTimingAudit.class);

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final ExecutorService writer = Executors.newSingleThreadExecutor(
            Thread.ofPlatform().daemon(true).name("mole-timing-audit").factory());

    public MoleTimingAudit(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    /**
     * 판 확정 직후 확정 트랜잭션 안에서 부른다. 신호 계산과 저장은 그 트랜잭션이 커밋된 뒤로 미룬다.
     * 트랜잭션 밖에서 불리면(동기화가 없으면) 바로 넘긴다.
     *
     * @param game 두더지 게임 경로(whack-a-mole, speed-mole)
     */
    public void settled(String game, long userId, long roundId, int rulesVersion,
            Supplier<MoleTimingSignals.Signals> signals, Instant receivedAt) {
        try {
            Runnable save = () -> submit(roundId, () -> record(game, userId, roundId, rulesVersion, signals, receivedAt));
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        save.run();
                    }
                });
            } else {
                save.run();
            }
        } catch (RuntimeException failure) {
            log.warn("두더지 타이밍 기록을 넘기지 못했습니다. game={} roundId={}", game, roundId, failure);
        }
    }

    /** 커밋 뒤 콜백에서도 불리므로 어떤 실패도 밖으로 내보내지 않는다. */
    private void submit(long roundId, Runnable work) {
        try {
            writer.execute(work);
        } catch (RejectedExecutionException closing) {
            log.debug("두더지 타이밍 기록 저장소가 닫혀 판 기록을 남기지 않습니다. roundId={}", roundId);
        } catch (RuntimeException failure) {
            log.warn("두더지 타이밍 기록을 넘기지 못했습니다. roundId={}", roundId, failure);
        }
    }

    private void record(String game, long userId, long roundId, int rulesVersion,
            Supplier<MoleTimingSignals.Signals> supplier, Instant receivedAt) {
        try {
            var signals = supplier.get();
            jdbc.update("""
                    INSERT IGNORE INTO mole_timing_audits (game, round_id, user_id, rules_version, reaction_count,
                        median_reaction_ms, segments, fast_reaction, steady_timing, received_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000))
                    """, game, roundId, userId, rulesVersion, signals.reactions(), signals.medianReactionMs(),
                    mapper.writeValueAsString(signals.segments()), signals.fastReaction(), signals.steady(),
                    receivedAt.toEpochMilli());
            if (signals.fastReaction() || signals.steady()) {
                log.info("두더지 타이밍 의심 판 기록 game={} roundId={} userId={} medianReactionMs={} steady={}",
                        game, roundId, userId, signals.medianReactionMs(), signals.steady());
            }
        } catch (JsonProcessingException | RuntimeException failure) {
            log.warn("두더지 타이밍 기록을 저장하지 못했습니다. game={} roundId={} reason={}", game, roundId,
                    failure.getMessage());
        }
    }

    @Override
    public void close() {
        writer.shutdown();
    }
}
