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
import java.util.ArrayList;
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
    void 수동기권전의느린조회가_기권후탈락상태와로비권한을덮지못한다() throws Exception {
        Inbox inbox = connect("first");
        inbox.await("RESTORED");
        var oldRead = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var completed = new CountDownLatch(1);
        var calls = new AtomicInteger();
        engine.load = user -> {
            if (calls.incrementAndGet() == 1) {
                var old = engine.snapshot;
                oldRead.countDown();
                try { release.await(5, TimeUnit.SECONDS); }
                catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
                finally { completed.countDown(); }
                return Optional.of(old);
            }
            return Optional.of(engine.snapshot);
        };
        service.refresh(101, "first", "old", (id, view) -> { });
        assertThat(oldRead.await(5, TimeUnit.SECONDS)).isTrue();
        engine.snapshot = snapshot(101, 3, 2, Phase.ELIMINATED);
        service.forfeitResolved(101, "first");
        assertThat(inbox.await("ELIMINATED").version()).isEqualTo(2);
        release.countDown();
        assertThat(completed.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(inbox.messages.poll(200, TimeUnit.MILLISECONDS)).isNull();
        assertThat(service.canControlGame(101, "first", "game-1")).isFalse();
        assertThat(service.canUseLobby(101, "first")).isTrue();
        assertThat(service.canForfeitGame(101, "first", "game-1")).isTrue();
        assertThat(service.canForfeitGame(101, "other", "game-1")).isFalse();
        assertThat(service.canForfeitGame(101, "first", "another-game")).isFalse();
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
        // 실제 타이머도 같은 Clock을 읽는다. 만료 시각 전에 오류를 주입해 정상 만료와의 경합을 막는다.
        engine.failExpiry = true;
        clock.advance(30);
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

    @Test
    void 첫조회중로그아웃해도늦은조회가재접속유예를만들지않는다() throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        engine.load = user -> {
            entered.countDown();
            try {
                assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            } catch (InterruptedException exception) {
                throw new IllegalStateException(exception);
            }
            return Optional.of(engine.snapshot);
        };
        connect("first");
        assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
        service.disconnected(101, "first", com.ssafy.ontop.game.result.GameDepartureReason.LOGOUT);
        release.countDown();
        GraceExpiration command = engine.commands.poll(5, TimeUnit.SECONDS);
        assertThat(command).isNotNull();
        assertThat(command.deadline()).isEqualTo(command.disconnectedAt());
        assertThat(command.reason()).isEqualTo(com.ssafy.ontop.game.result.GameDepartureReason.LOGOUT);
        connect("returned").await("FINISHED");
        assertThat(service.canControlGame(101, "returned", "game-1")).isFalse();
    }

    @Test
    void 즉시기권실패도같은이벤트와사유로재시도하며기존연결종료는새연결을건드리지않는다() throws Exception {
        connect("first").await("RESTORED");
        engine.failExpiry = true;
        service.disconnected(101, "first", com.ssafy.ontop.game.result.GameDepartureReason.MEMBER_DEACTIVATED);
        GraceExpiration failed = engine.commands.poll(5, TimeUnit.SECONDS);
        assertThat(failed).isNotNull();
        Inbox unavailable = connect("retrying");
        unavailable.await("UNAVAILABLE");
        service.refresh(101, "retrying", "retry-failure", unavailable::offer);
        unavailable.await("UNAVAILABLE");
        engine.failExpiry = false;
        connect("returned").await("FINISHED");
        // 실패는 타이머/조회 경합에 따라 여러 번 재시도할 수 있다. 모든 시도는 같은 명령이어야 한다.
        var attempts = new ArrayList<GraceExpiration>();
        attempts.add(failed);
        engine.commands.drainTo(attempts);
        assertThat(attempts).hasSizeGreaterThanOrEqualTo(3)
                .allSatisfy(command -> assertThat(command).isEqualTo(failed));
        assertThat(engine.successfulExpirations.get()).isEqualTo(1);
        service.disconnected(101, "first", com.ssafy.ontop.game.result.GameDepartureReason.LOGOUT);
        assertThat(service.canUseLobby(101, "returned")).isTrue();
        assertThat(engine.commands.poll(100, TimeUnit.MILLISECONDS)).isNull();
        assertThat(engine.successfulExpirations.get()).isEqualTo(1);
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
        private final AtomicInteger successfulExpirations = new AtomicInteger();
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
            successfulExpirations.incrementAndGet();
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
