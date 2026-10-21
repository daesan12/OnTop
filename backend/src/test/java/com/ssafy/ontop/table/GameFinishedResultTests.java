package com.ssafy.ontop.table;

import com.ssafy.ontop.game.bridge.service.BridgeGameFinished;
import com.ssafy.ontop.game.farkle.service.FarkleGameFinished;
import com.ssafy.ontop.game.omok.service.OmokGameFinished;
import com.ssafy.ontop.game.onecard.service.OneCardGameFinished;
import com.ssafy.ontop.game.result.GameFinishedResultListener;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultService;
import com.ssafy.ontop.game.result.GameResultService.Delivery;
import com.ssafy.ontop.game.result.GameResultView.SettlementStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class GameFinishedResultTests {
    private GameResultService service;
    private final LinkedBlockingQueue<Delivery> received = new LinkedBlockingQueue<>();

    @AfterEach void close() { if (service != null) { service.shutdown(); } }

    @ParameterizedTest
    @ValueSource(strings = {"OMOK", "DICE", "ONE_CARD", "LIAR_BRIDGE"})
    void 네엔진종료가_참가본인결과만_자동조회한다(String code) throws Exception {
        var reads = new AtomicInteger();
        service = new GameResultService(Optional.of((user, game) -> {
            reads.incrementAndGet();
            return Optional.of(GameResultTests.result(user, game, 1, SettlementStatus.PENDING));
        }));
        service.connected("first", 101, received::add);
        var spectator = new LinkedBlockingQueue<Delivery>();
        service.connected("spectator", 303, spectator::add);
        var listener = new GameFinishedResultListener(service);
        var at = Instant.parse("2026-10-21T00:00:00Z");
        var players = List.of(101L, 202L);
        switch (code) {
            case "OMOK" -> listener.finished(new OmokGameFinished("701", "table-1", 10, 101, 202, 101L, "FIVE", at));
            case "DICE" -> listener.finished(new FarkleGameFinished("701", "table-1", 10, players,
                    List.of(2000L, 0L), 101L, "TARGET_SCORE", at));
            case "ONE_CARD" -> listener.finished(new OneCardGameFinished("701", "table-1", 10, players,
                    List.of(101L), "EMPTY_HAND", at));
            case "LIAR_BRIDGE" -> listener.finished(new BridgeGameFinished("701", "table-1", 10, players,
                    List.of(101L), "GOAL", at));
            default -> throw new AssertionError(code);
        }
        var result = received.poll(3, TimeUnit.SECONDS);
        assertThat(result).isNotNull();
        assertThat(result.requestId()).isNull();
        assertThat(result.result().myCoinDelta()).isNull();
        assertThat(reads).hasValue(1);
        assertThat(spectator).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"empty", "exception", "user", "game", "missing"})
    void 미저장_실패_잘못된대상은_가짜결과와자동오류를보내지않는다(String mode) throws Exception {
        var read = new CountDownLatch(1);
        service = new GameResultService(mode.equals("missing") ? Optional.empty() : Optional.of((user, game) -> {
            read.countDown();
            if (mode.equals("exception")) { throw new IllegalStateException("private detail"); }
            if (mode.equals("empty")) { return Optional.empty(); }
            return Optional.of(GameResultTests.result(mode.equals("user") ? 202 : user,
                    mode.equals("game") ? "other" : game, 1, SettlementStatus.PENDING));
        }));
        service.connected("first", 101, received::add);
        service.finished("701", List.of(101L, 202L));
        if (!mode.equals("missing")) { assertThat(read.await(3, TimeUnit.SECONDS)).isTrue(); }
        assertThat(received.poll(100, TimeUnit.MILLISECONDS)).isNull();
        service.committed(new GameResultCommitted(GameResultTests.result(101, "701", 2, SettlementStatus.SETTLED)));
        assertThat(received.poll(3, TimeUnit.SECONDS).result().myCoinDelta()).isEqualTo(1);
    }

    @Test
    void 늦은자동조회가_최신커밋을덮거나_중복전송하지않는다() throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var reads = new AtomicInteger();
        service = new GameResultService(Optional.of((user, game) -> {
            reads.incrementAndGet(); entered.countDown();
            try { assertThat(release.await(3, TimeUnit.SECONDS)).isTrue(); }
            catch (InterruptedException exception) { throw new IllegalStateException(exception); }
            return Optional.of(GameResultTests.result(user, game, 1, SettlementStatus.PENDING));
        }));
        service.connected("first", 101, received::add);
        service.finished("701", List.of(101L));
        assertThat(entered.await(3, TimeUnit.SECONDS)).isTrue();
        service.finished("701", List.of(101L));
        service.committed(new GameResultCommitted(GameResultTests.result(101, "701", 2, SettlementStatus.SETTLED)));
        assertThat(received.poll(3, TimeUnit.SECONDS).result().version()).isEqualTo(2);
        release.countDown();
        assertThat(received.poll(150, TimeUnit.MILLISECONDS)).isNull();
        assertThat(reads).hasValue(1);
    }

    @Test
    void 끊긴연결의느린자동결과는_새연결에섞이지않는다() throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        service = new GameResultService(Optional.of((user, game) -> {
            entered.countDown();
            try { assertThat(release.await(3, TimeUnit.SECONDS)).isTrue(); }
            catch (InterruptedException exception) { throw new IllegalStateException(exception); }
            return Optional.of(GameResultTests.result(user, game, 1, SettlementStatus.PENDING));
        }));
        service.connected("same-session", 101, received::add);
        service.finished("701", List.of(101L));
        assertThat(entered.await(3, TimeUnit.SECONDS)).isTrue();
        service.disconnected("same-session");
        var returned = new LinkedBlockingQueue<Delivery>();
        service.connected("same-session", 101, returned::add);
        release.countDown();
        assertThat(received.poll(150, TimeUnit.MILLISECONDS)).isNull();
        assertThat(returned).isEmpty();
    }
}
