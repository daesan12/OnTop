package com.ssafy.ontop.game.spotdifference;

import com.ssafy.ontop.auth.config.OAuthConfiguration;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceDuelService.Command;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceDuelService.DuelAction;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceDuelService.End;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceDuelService.Outcome;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.Difference;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.Difficulty;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.Phase;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.Puzzle;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.TapResult;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.util.TestPropertyValues;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class SpotDifferenceDuelServiceTests {
    private static final long HOST = 1;
    private static final long GUEST = 2;
    private static final long OTHER = 3;
    private final TestClock clock = new TestClock();
    private final List<Difference> boxes = IntStream.range(0, 6).mapToObj(i ->
            new Difference("정답 " + i, List.of(10 + i * 30, 20, 29 + i * 30, 40))).toList();
    private final SpotDifferenceDuelService duels = new SpotDifferenceDuelService(
            new SpotDifferenceService(IntStream.range(0, 9)
                    .mapToObj(i -> new Puzzle("p" + i, "장면 " + i, boxes, i < 5 ? boxes : List.of())).toList(),
                    mock(SpotDifferenceRewards.class), clock), clock);

    @Test
    void 두_사람만_같은_그림에_들어가고_두_사람이_준비되면_시작한다() {
        var created = duels.create(HOST, Difficulty.HARD);
        var id = created.board().id();

        assertThat(created.duel().joined()).isFalse();
        assertThat(duels.create(HOST, Difficulty.NORMAL).board().id()).isEqualTo(id);
        assertThat(duels.join(GUEST, id).board().scene()).isEqualTo(created.board().scene());
        assertThatThrownBy(() -> duels.join(OTHER, id)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> act(OTHER, id, Command.SYNC, 1)).isInstanceOf(ResponseStatusException.class);
        assertThat(act(HOST, id, Command.READY, 1).board().phase()).isEqualTo(Phase.WAITING);
        clock.advance(2);
        assertThat(act(HOST, id, Command.SYNC, 1).board().phase()).isEqualTo(Phase.WAITING);
        var scheduled = act(GUEST, id, Command.READY, 1);
        assertThat(scheduled.board().phase()).isEqualTo(Phase.WAITING);
        assertThat(scheduled.duel().startInMs()).isEqualTo(1_000L);
        assertThat(act(HOST, id, Command.SYNC, 1).duel().startInMs()).isEqualTo(1_000L);
        clock.advance(1);

        var host = act(HOST, id, Command.SYNC, 1);
        assertThat(host.board().phase()).isEqualTo(Phase.PLAYING);
        assertThat(host.board().remainingMs()).isEqualTo(60_000);
        assertThat(host.board().answers()).isEmpty();
        assertThat(duels.current(GUEST).match().board()).isEqualTo(host.board());
    }

    @Test
    void 동시_정답은_한_명만_득점하고_중복_요청으로_점수를_다시_주지_않는다() throws Exception {
        var id = open();
        ready(id, 1);
        var command = new DuelAction(Command.TAP, 1, 15, 25, UUID.randomUUID());

        try (var pool = Executors.newFixedThreadPool(2)) {
            var start = new CountDownLatch(1);
            var one = pool.submit(() -> {
                start.await();
                return duels.act(HOST, id, command);
            });
            var two = pool.submit(() -> {
                start.await();
                return duels.act(GUEST, id, command);
            });
            start.countDown();
            assertThat(List.of(one.get().board().tap(), two.get().board().tap()))
                    .containsExactlyInAnyOrder(TapResult.HIT, TapResult.ALREADY_FOUND);
        }

        var host = duels.act(HOST, id, command);
        var guest = duels.act(GUEST, id, command);
        assertThat(host.board().total() + guest.board().total()).isEqualTo(1);
        assertThat(host.board().matched()).containsExactly(boxes.getFirst());
        assertThat(guest.board().matched()).isEqualTo(host.board().matched());
        assertThat(host.duel().opponentMatches().size()).isEqualTo(guest.board().total());
    }

    @Test
    void 오답은_누른_사람만_천_밀리초_동안_막는다() {
        var id = open();
        ready(id, 1);
        var missAction = new DuelAction(Command.TAP, 1, 0, 25, UUID.randomUUID());

        var missed = duels.act(HOST, id, missAction);
        clock.advanceMillis(999);
        assertThat(duels.act(HOST, id, missAction).board().cooldownMs()).isEqualTo(1);
        var blocked = tap(HOST, id, 1, 0);
        var unaffected = tap(GUEST, id, 1, 1);
        clock.advanceMillis(1);
        var recovered = tap(HOST, id, 1, 0);

        assertThat(missed.board().tap()).isEqualTo(TapResult.MISS);
        assertThat(missed.board().cooldownMs()).isEqualTo(1_000);
        assertThat(blocked.board().tap()).isEqualTo(TapResult.WAIT);
        assertThat(unaffected.board().tap()).isEqualTo(TapResult.HIT);
        assertThat(recovered.board().tap()).isEqualTo(TapResult.HIT);
    }

    @Test
    void 어려움_장면을_다섯_문제_진행하고_동점이면_먼저_도달한_사람이_이긴다() {
        var id = open();
        var scenes = new HashSet<String>();
        for (int round = 1; round <= 5; round++) {
            ready(id, round);
            var start = act(HOST, id, Command.SYNC, round).board();
            assertThat(start.scene()).isIn("p0", "p1", "p2", "p3", "p4");
            assertThat(scenes.add(start.scene())).isTrue();
            if (round > 1) {
                assertThat(tap(HOST, id, round - 1, 0).board().tap()).isNull();
            }
            for (int index = 0; index < 6; index++) {
                tap(index < 3 ? HOST : GUEST, id, round, index);
            }
            assertThat(act(HOST, id, Command.SYNC, round).board().phase()).isEqualTo(Phase.REVIEW);
            clock.advance(4);
        }

        var host = duels.current(HOST).match();
        var guest = duels.current(GUEST).match();
        assertThat(host.board().total()).isEqualTo(15);
        assertThat(host.duel().opponentTotal()).isEqualTo(15);
        assertThat(host.duel().end()).isEqualTo(End.COMPLETED);
        assertThat(host.duel().outcome()).isEqualTo(Outcome.WIN);
        assertThat(guest.duel().outcome()).isEqualTo(Outcome.LOSS);
        assertThat(host.board().receipt()).isNull();
    }

    @Test
    void 시간_종료_뒤_정답_입력을_막고_기권_결과를_다시_조회할_수_있다() {
        var id = open();
        ready(id, 1);
        clock.advance(30);
        act(HOST, id, Command.SYNC, 1);
        act(GUEST, id, Command.SYNC, 1);
        clock.advance(30);

        var result = tap(HOST, id, 1, 0);
        act(GUEST, id, Command.LEAVE, 1);

        assertThat(result.board().phase()).isEqualTo(Phase.REVIEW);
        assertThat(result.board().total()).isZero();
        assertThat(result.board().answers()).containsExactlyElementsOf(boxes);
        assertThat(duels.current(GUEST).match()).isNull();
        assertThat(duels.current(HOST).match().duel().outcome()).isEqualTo(Outcome.WIN);
        assertThat(duels.current(HOST).match().duel().end()).isEqualTo(End.LEFT);
    }

    @Test
    void 연결이_끊겼다가_돌아오면_복귀하고_45초_동안_돌아오지_않으면_종료한다() {
        var id = open();
        ready(id, 1);
        clock.advance(30);
        act(HOST, id, Command.SYNC, 1);

        assertThat(duels.current(GUEST).match().board().id()).isEqualTo(id);
        clock.advance(40);
        act(HOST, id, Command.SYNC, 1);
        clock.advance(5);
        var host = duels.current(HOST).match();

        assertThat(host.duel().end()).isEqualTo(End.DISCONNECTED);
        assertThat(host.duel().outcome()).isEqualTo(Outcome.WIN);
        assertThat(duels.current(GUEST).match().duel().outcome()).isEqualTo(Outcome.LOSS);
    }

    @Test
    void 예약된_정리는_요청_없이_만료된_방을_지우고_같은_참가자의_새_방을_보존한다() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().setActiveProfiles("dev", "db");
            TestPropertyValues.of("ontop.minigames.enabled=true").applyTo(context);
            context.register(OAuthConfiguration.class);
            context.registerBean(SpotDifferenceDuelService.class, () -> duels);
            context.refresh();
            var tasks = context.getBean(ScheduledAnnotationBeanPostProcessor.class).getScheduledTasks();
            assertThat(tasks).hasSize(1);
            var cleanup = tasks.iterator().next().getTask().getRunnable();
            var expired = open();
            act(HOST, expired, Command.LEAVE, 1);
            clock.advance(1);
            var current = duels.create(HOST, Difficulty.HARD).board().id();
            clock.advance(SpotDifferenceService.RUN_LIFETIME.toSeconds() - 1);

            cleanup.run();

            var rooms = (Map<?, ?>) ReflectionTestUtils.getField(duels, "duels");
            var participants = (Map<?, ?>) ReflectionTestUtils.getField(duels, "active");
            assertThat(rooms.keySet()).isEqualTo(Set.of(current));
            assertThat(participants.keySet()).isEqualTo(Set.of(HOST));
            assertThat(duels.current(HOST).match().board().id()).isEqualTo(current);
        }
    }

    private UUID open() {
        var id = duels.create(HOST, Difficulty.HARD).board().id();
        duels.join(GUEST, id);
        return id;
    }

    private void ready(UUID id, int round) {
        act(HOST, id, Command.READY, round);
        act(GUEST, id, Command.READY, round);
        clock.advance(1);
    }

    private SpotDifferenceDuelService.DuelView act(long user, UUID id, Command type, int round) {
        return duels.act(user, id, new DuelAction(type, round, null, null, null));
    }

    private SpotDifferenceDuelService.DuelView tap(long user, UUID id, int round, int answer) {
        return duels.act(user, id, new DuelAction(Command.TAP, round, 15 + answer * 30, 25, UUID.randomUUID()));
    }

    private static final class TestClock extends Clock {
        private Instant time = Instant.parse("2026-11-16T12:00:00Z");

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return Clock.fixed(time, zone);
        }

        @Override
        public Instant instant() {
            return time;
        }

        void advance(long seconds) {
            time = time.plusSeconds(seconds);
        }

        void advanceMillis(long millis) {
            time = time.plusMillis(millis);
        }
    }
}
