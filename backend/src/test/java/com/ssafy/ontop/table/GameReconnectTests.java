package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.reconnect.GameReconnectService.View;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway.Action;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway.GraceExpiration;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot.Phase;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class GameReconnectTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private final TestClock clock = new TestClock();
    private final Engine engine = new Engine();
    private final GameReconnectService service = new GameReconnectService(Optional.of(engine), Optional.of(clock));

    @AfterEach
    void shutdown() {
        service.shutdown();
    }

    @Test
    void 유예_안에_새연결로_최신_본인상태를_복구하고_턴시간을_변경하지않는다() throws Exception {
        Inbox first = connect("first");
        first.await("RESTORED");
        assertThat(service.canControlGame(101, "first", "game-1")).isTrue();
        service.disconnected(101, "first");
        clock.advance(29);
        engine.snapshot = snapshot(101, 4, 8, Phase.PLAYING);
        Inbox second = connect("second");
        View restored = second.await("RESTORED");
        assertThat(restored.gameId()).isEqualTo("game-1");
        assertThat(restored.version()).isEqualTo(8);
        assertThat(restored.state().path("turnDeadline").asText()).isEqualTo("unchanged-engine-deadline");
        assertThat(service.canControlGame(101, "first", "game-1")).isFalse();
        assertThat(service.canControlGame(101, "second", "game-1")).isTrue();
        assertThat(service.canUseLobby(101, "second")).isFalse();
        service.disconnected(101, "first");
        clock.advance(40);
        service.checkTimeouts();
        assertThat(service.canControlGame(101, "second", "game-1")).isTrue();
        assertThat(engine.commands.poll(100, TimeUnit.MILLISECONDS)).isNull();
    }

    @ParameterizedTest
    @ValueSource(ints = {2, 3, 4})
    void 유예가_끝나면_인원에_맞는_만료요청을_한번_보내고_탈락_결과를_읽는다(int count) throws Exception {
        engine.snapshot = snapshot(101, count, 1, Phase.PLAYING);
        connect("first").await("RESTORED");
        service.disconnected(101, "first");
        clock.advance(30);
        service.checkTimeouts();
        GraceExpiration command = engine.commands.poll(5, TimeUnit.SECONDS);
        assertThat(command).isNotNull();
        assertThat(command.gameId()).isEqualTo("game-1");
        assertThat(command.deadline()).isEqualTo(command.disconnectedAt().plusSeconds(30));
        assertThat(command.action()).isEqualTo(count == 2 ? Action.FORFEIT : Action.ELIMINATE);
        Inbox after = connect("after");
        after.await(count == 2 ? "FINISHED" : "ELIMINATED");
        assertThat(service.canControlGame(101, "after", "game-1")).isFalse();
        assertThat(service.canUseLobby(101, "after")).isTrue();
        service.checkTimeouts();
        assertThat(engine.commands.poll(100, TimeUnit.MILLISECONDS)).isNull();
    }

    @Test
    void 재접속하지않아도_만료후_종료가_확인되면_복구기록을_정리한다() throws Exception {
        connect("first").await("RESTORED");
        service.disconnected(101, "first");
        clock.advance(30);
        service.checkTimeouts();
        assertThat(engine.commands.poll(5, TimeUnit.SECONDS)).isNotNull();
        long limit = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        boolean empty;
        do {
            service.checkTimeouts();
            synchronized (service) {
                Object records = org.springframework.test.util.ReflectionTestUtils.getField(service, "users");
                empty = ((java.util.Map<?, ?>) records).isEmpty();
            }
            if (!empty) {
                Thread.sleep(10);
            }
        } while (!empty && System.nanoTime() < limit);
        assertThat(empty).isTrue();
    }

    @Test
    void 만료_ACK뒤에도_엔진이_진행중이라하면_비공개상태와_조작권을_복구하지않는다() throws Exception {
        engine.keepPlaying = true;
        connect("first").await("RESTORED");
        service.disconnected(101, "first");
        clock.advance(30);
        Inbox after = connect("after");
        View expired = after.await("EXPIRED");
        assertThat(expired.state()).isNull();
        assertThat(expired.gameId()).isNull();
        assertThat(service.canControlGame(101, "after", "game-1")).isFalse();
        assertThat(service.canUseLobby(101, "after")).isFalse();
    }

    @Test
    void 만료_오류후_재확인은_같은_요청ID를_쓰고_경기를_새로_만들지않는다() throws Exception {
        connect("first").await("RESTORED");
        service.disconnected(101, "first");
        clock.advance(30);
        engine.failExpiry = true;
        Inbox after = connect("after");
        after.await("UNAVAILABLE");
        GraceExpiration failed = engine.commands.poll(5, TimeUnit.SECONDS);
        assertThat(failed).isNotNull();
        assertThat(service.canControlGame(101, "after", "game-1")).isFalse();
        engine.failExpiry = false;
        service.refresh(101, "after", "retry", after::offer);
        after.await("FINISHED");
        GraceExpiration retried = engine.commands.poll(5, TimeUnit.SECONDS);
        assertThat(retried.eventId()).isEqualTo(failed.eventId());
    }

    @Test
    void 유예중_조회실패후_다시끊겨도_원래_마감시각을_늘리지않는다() throws Exception {
        connect("first").await("RESTORED");
        service.disconnected(101, "first");
        clock.advance(20);
        engine.load = user -> { throw new IllegalStateException("test unavailable"); };
        connect("second").await("UNAVAILABLE");
        service.disconnected(101, "second");
        clock.advance(10);
        engine.load = user -> Optional.of(engine.snapshot);
        connect("third").await("FINISHED");
        assertThat(engine.commands.poll(5, TimeUnit.SECONDS).deadline())
                .isEqualTo(Instant.parse("2026-10-19T00:00:30Z"));
    }

    @Test
    void 끊긴동안_끝난경기는_최신_종료상태를_전달한다() throws Exception {
        connect("first").await("RESTORED");
        service.disconnected(101, "first");
        clock.advance(10);
        engine.snapshot = snapshot(101, 2, 7, Phase.FINISHED);
        View finished = connect("after").await("FINISHED");
        assertThat(finished.version()).isEqualTo(7);
        assertThat(engine.commands.poll(100, TimeUnit.MILLISECONDS)).isNull();
    }

    @Test
    void 다른사용자_상태와_낮은버전은_전송하지않고_재확인할수있다() throws Exception {
        connect("first").await("RESTORED");
        engine.snapshot = snapshot(202, 2, 2, Phase.PLAYING);
        Inbox response = new Inbox();
        service.refresh(101, "first", "forged", response::offer);
        // 실제 출력 대상은 연결 시 등록한 Inbox이므로 새 소비자로 바꿀 수 없다.
        Inbox second = connect("second");
        assertThat(second.await("UNAVAILABLE").state()).isNull();
        engine.snapshot = snapshot(101, 2, 0, Phase.PLAYING);
        service.refresh(101, "second", "stale", second::offer);
        assertThat(second.await("UNAVAILABLE").state()).isNull();
        engine.snapshot = snapshot(101, 2, 3, Phase.PLAYING);
        service.refresh(101, "second", "valid", second::offer);
        second.await("RESTORED");
    }

    @Test
    void 이전연결의_늦은_응답은_새연결에_반영하지않는다() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        engine.load = user -> {
            if (calls.incrementAndGet() == 1) {
                entered.countDown();
                try {
                    release.await();
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(exception);
                }
                return Optional.of(snapshot(101, 2, 1, Phase.PLAYING));
            }
            return Optional.of(snapshot(101, 2, 9, Phase.PLAYING));
        };
        try {
            Inbox old = connect("first");
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            service.disconnected(101, "first");
            Inbox current = connect("second");
            assertThat(current.await("RESTORED").version()).isEqualTo(9);
            release.countDown();
            assertThat(current.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
            assertThat(old.messages).noneMatch(view -> view.status().equals("RESTORED"));
        } finally {
            release.countDown();
        }
    }

    @Test
    void 경기가_없으면_로비를_허용하고_스냅샷은_외부변경에서_보호한다() throws Exception {
        ObjectNode data = mapper.createObjectNode().put("hand", "private-101");
        GameRecoverySnapshot snapshot = new GameRecoverySnapshot(101, "game-1", 2, 0, Phase.PLAYING, data);
        data.put("hand", "mutated");
        ((ObjectNode) snapshot.state()).put("hand", "mutated-again");
        assertThat(snapshot.state().path("hand").asText()).isEqualTo("private-101");
        engine.load = user -> Optional.empty();
        connect("first").await("LOBBY");
        assertThat(service.canUseLobby(101, "first")).isTrue();
        service.disconnected(101, "first");
        clock.advance(30);
        service.checkTimeouts();
        connect("second").await("LOBBY");
        assertThat(engine.commands.poll(100, TimeUnit.MILLISECONDS)).isNull();
    }

    private Inbox connect(String sessionId) {
        Inbox inbox = new Inbox();
        service.connected(101, sessionId, inbox::offer);
        return inbox;
    }

    private GameRecoverySnapshot snapshot(long userId, int count, long version, Phase phase) {
        return new GameRecoverySnapshot(userId, "game-1", count, version, phase,
                mapper.createObjectNode().put("hand", "private-" + userId)
                        .put("turnDeadline", "unchanged-engine-deadline"));
    }

    private static class Inbox {
        private final BlockingQueue<View> messages = new LinkedBlockingQueue<>();

        private void offer(String requestId, View view) {
            messages.add(view);
        }

        private View await(String status) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (true) {
                View view = messages.poll(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                assertThat(view).as(status).isNotNull();
                if (view.status().equals(status)) {
                    return view;
                }
            }
        }
    }

    private class Engine implements GameRecoveryGateway {
        private volatile GameRecoverySnapshot snapshot = snapshot(101, 2, 1, Phase.PLAYING);
        private volatile Function<Long, Optional<GameRecoverySnapshot>> load = user -> Optional.of(snapshot);
        private final BlockingQueue<GraceExpiration> commands = new LinkedBlockingQueue<>();
        private volatile boolean keepPlaying;
        private volatile boolean failExpiry;

        @Override
        public Optional<GameRecoverySnapshot> load(long userId) {
            return load.apply(userId);
        }

        @Override
        public void graceExpired(GraceExpiration command) {
            if (failExpiry) {
                commands.add(command);
                throw new IllegalStateException("test expiry unavailable");
            }
            if (!keepPlaying) {
                snapshot = snapshot(101, snapshot.participantCount(), snapshot.version() + 1,
                        command.action() == Action.FORFEIT ? Phase.FINISHED : Phase.ELIMINATED);
            }
            commands.add(command);
        }
    }

    static class TestClock extends Clock {
        private volatile Instant now = Instant.parse("2026-10-19T00:00:00Z");

        void advance(long seconds) {
            now = now.plusSeconds(seconds);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
