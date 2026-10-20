package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultGateway;
import com.ssafy.ontop.game.result.GameResultService;
import com.ssafy.ontop.game.result.GameResultService.Delivery;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.result.GameResultView.Participant;
import com.ssafy.ontop.game.result.GameResultView.SettlementStatus;
import com.ssafy.ontop.game.result.GameResultView.Status;
import com.ssafy.ontop.table.dto.TableProtocol;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GameResultTests {

    private GameResultService service;
    private final BlockingQueue<Delivery> first = new LinkedBlockingQueue<>();

    @AfterEach
    void close() {
        if (service != null) {
            service.shutdown();
        }
    }

    static GameResultView result(long userId, String gameId, long version, SettlementStatus settlement) {
        return new GameResultView(userId, version, gameId, "DICE", Status.FINISHED, "NORMAL", settlement, 1,
                List.of(new Participant("101", "WIN"), new Participant("202", "LOSE")),
                settlement == SettlementStatus.PENDING ? null : userId == 101 ? 1L : -1L,
                Instant.parse("2026-10-20T00:05:00Z"));
    }

    private void create(Optional<GameResultGateway> gateway) {
        service = new GameResultService(gateway);
        service.connected("first", 101, first::add);
    }

    private Delivery next() throws Exception {
        Delivery delivery = first.poll(3, TimeUnit.SECONDS);
        assertThat(delivery).isNotNull();
        return delivery;
    }

    @Test
    void 확정이벤트는_본인에게만_전송하고_중복과_과거버전은_생략한다() throws Exception {
        create(Optional.empty());
        BlockingQueue<Delivery> other = new LinkedBlockingQueue<>();
        service.connected("other", 202, other::add);
        service.committed(new GameResultCommitted(result(101, "701", 2, SettlementStatus.SETTLED)));
        assertThat(next().result().myCoinDelta()).isEqualTo(1);
        service.committed(new GameResultCommitted(result(101, "701", 2, SettlementStatus.SETTLED)));
        service.committed(new GameResultCommitted(result(101, "701", 1, SettlementStatus.PENDING)));
        assertThat(first.poll(100, TimeUnit.MILLISECONDS)).isNull();
        assertThat(other).isEmpty();
    }

    @Test
    void 명시조회는_같은버전도_요청아이디와_함께_다시보낸다() throws Exception {
        create(Optional.of((user, game) -> Optional.of(result(user, game, 2, SettlementStatus.SETTLED))));
        service.check("first", "query1", "701");
        assertThat(next().requestId()).isEqualTo("query1");
        service.check("first", "query2", "701");
        assertThat(next().requestId()).isEqualTo("query2");
    }

    @Test
    void 미설정과_없는경기를_구분하되_권한없는경기존재는_노출하지않는다() throws Exception {
        create(Optional.empty());
        service.check("first", "q", "701");
        assertThat(next().errorCode()).isEqualTo("GAME_RESULT_NOT_CONFIGURED");
        service.shutdown();
        create(Optional.of((user, game) -> Optional.empty()));
        service.check("first", "q", "701");
        assertThat(next().errorCode()).isEqualTo("GAME_RESULT_ACCESS_DENIED");
    }

    @ParameterizedTest
    @ValueSource(strings = {"user", "game", "exception"})
    void 잘못된대상과_엔진예외는_결과를_노출하지않는다(String problem) throws Exception {
        create(Optional.of((user, game) -> {
            if (problem.equals("exception")) {
                throw new IllegalStateException("비공개 엔진 내용");
            }
            return Optional.of(result(problem.equals("user") ? 202 : user,
                    problem.equals("game") ? "other" : game, 1, SettlementStatus.PENDING));
        }));
        service.check("first", "q", "701");
        Delivery delivery = next();
        assertThat(delivery.errorCode()).isEqualTo(problem.equals("exception")
                ? "GAME_RESULT_UNAVAILABLE" : "GAME_RESULT_INVALID");
        assertThat(delivery.result()).isNull();
    }

    @Test
    void 조회중_정산완료가_도착하면_이전조회로_되돌아가지않는다() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        create(Optional.of((user, game) -> {
            entered.countDown();
            await(release);
            return Optional.of(result(user, game, 1, SettlementStatus.PENDING));
        }));
        try {
            service.check("first", "query", "701");
            assertThat(entered.await(3, TimeUnit.SECONDS)).isTrue();
            service.check("first", "second", "701");
            assertThat(next().errorCode()).isEqualTo("GAME_RESULT_PENDING");
            service.committed(new GameResultCommitted(result(101, "701", 2, SettlementStatus.SETTLED)));
            assertThat(next().result().settlementStatus()).isEqualTo(SettlementStatus.SETTLED);
            release.countDown();
            assertThat(next().errorCode()).isEqualTo("GAME_RESULT_STALE");
        } finally {
            release.countDown();
        }
    }

    @Test
    void 종료된연결의_늦은조회는_같은아이디의_새연결에도_넘기지않는다() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch finished = new CountDownLatch(1);
        create(Optional.of((user, game) -> {
            entered.countDown();
            await(release);
            finished.countDown();
            return Optional.of(result(user, game, 1, SettlementStatus.PENDING));
        }));
        try {
            service.check("first", "old", "701");
            assertThat(entered.await(3, TimeUnit.SECONDS)).isTrue();
            service.disconnected("first");
            BlockingQueue<Delivery> returned = new LinkedBlockingQueue<>();
            service.connected("first", 101, returned::add);
            service.committed(new GameResultCommitted(result(101, "701", 2, SettlementStatus.SETTLED)));
            assertThat(returned.poll(3, TimeUnit.SECONDS).result().version()).isEqualTo(2);
            release.countDown();
            assertThat(finished.await(3, TimeUnit.SECONDS)).isTrue();
            assertThat(returned.poll(200, TimeUnit.MILLISECONDS)).isNull();
            assertThat(first).isEmpty();
        } finally {
            release.countDown();
        }
    }

    @Test
    void 종료한서비스는_이벤트를_전송하지않는다() {
        create(Optional.empty());
        service.shutdown();
        service.committed(new GameResultCommitted(result(101, "701", 1, SettlementStatus.PENDING)));
        assertThat(first).isEmpty();
    }

    @Test
    void 정산대기는_null이고_내부수신자아이디는_JSON에서_제외한다() throws Exception {
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        var json = mapper.valueToTree(result(101, "701", 1, SettlementStatus.PENDING));
        assertThat(json.has("userId")).isFalse();
        assertThat(json.path("myCoinDelta").isNull()).isTrue();
        assertThat(json.path("participants").size()).isEqualTo(2);
    }

    @Test
    void 참가자목록은_복사하고_정산상태와_본인참가_불일치를_거절한다() {
        var participants = new ArrayList<>(List.of(new Participant("101", "WIN"), new Participant("202", "LOSE")));
        GameResultView view = new GameResultView(101, 1, "701", "DICE", Status.FINISHED, "NORMAL",
                SettlementStatus.PENDING, 1, participants, null, Instant.now());
        participants.clear();
        assertThat(view.participants()).hasSize(2);
        assertThatThrownBy(() -> view.participants().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> result(505, "701", 1, SettlementStatus.PENDING))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new GameResultView(101, 1, "701", "DICE", Status.FINISHED, "NORMAL",
                SettlementStatus.PENDING, 1, view.participants(), 1L, Instant.now()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new GameResultView(101, 1, "701", "DICE", Status.INVALID, "INVALID",
                SettlementStatus.SETTLED, 1, view.participants(), 1L, Instant.now()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"gameSessionId\":1}", "{\"gameSessionId\":\" \"}",
            "{\"gameSessionId\":\"701\",\"userId\":101}",
            "{\"gameSessionId\":\"701\",\"settlementStatus\":\"SETTLED\"}"})
    void 결과조회로_사용자나_정산상태를_지정할수없다(String payload) {
        var protocol = new TableProtocol(new ObjectMapper());
        assertThatThrownBy(() -> protocol.parse("{\"requestId\":\"q\",\"type\":\"GAME_RESULT_CHECK\",\"payload\":"
                + payload + "}")).isInstanceOf(TableProtocol.RequestException.class);
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(3, TimeUnit.SECONDS)) {
                throw new IllegalStateException("테스트 대기 만료");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }
}
