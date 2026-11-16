package com.ssafy.ontop.game.spotdifference;

import static com.ssafy.ontop.game.spotdifference.SpotDifferenceService.ActionType.NEXT;
import static com.ssafy.ontop.game.spotdifference.SpotDifferenceService.ActionType.READY;
import static com.ssafy.ontop.game.spotdifference.SpotDifferenceService.ActionType.SYNC;
import static com.ssafy.ontop.game.spotdifference.SpotDifferenceService.ActionType.TAP;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.anyInt;
import static org.mockito.Mockito.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.Action;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.Difficulty;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.Difference;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.Phase;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.Puzzle;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.Start;
import com.ssafy.ontop.game.spotdifference.SpotDifferenceService.TapResult;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.web.server.ResponseStatusException;

class SpotDifferenceServiceTests {
    private static final long PLAYER = 1L;
    private final TestClock clock = new TestClock();
    private final SpotDifferenceRewards rewards = mock(SpotDifferenceRewards.class);
    private final SpotDifferenceService game = new SpotDifferenceService(
            IntStream.range(0, 50).mapToObj(i -> new Puzzle("p" + i, "장면 " + i, boxes(50), boxes(100))).toList(),
            rewards, clock);

    @ParameterizedTest
    @EnumSource(Difficulty.class)
    void 배포_카탈로그에서_난이도별_다섯_장면을_고를_수_있다(Difficulty difficulty) throws Exception {
        var catalog = new SpotDifferenceService(new ObjectMapper(), rewards);

        assertThat(catalog.selectScenes(difficulty)).hasSize(SpotDifferenceService.ROUND_COUNT)
                .allSatisfy(scene -> assertThat(scene.answers(difficulty)).hasSize(6));
    }

    @Test
    void 어려움_장면이_다섯_개_미만이면_카탈로그_로드에_실패한다() {
        var catalog = IntStream.range(0, 6).mapToObj(index ->
                new Puzzle("p" + index, "장면 " + index, boxes(50), index < 4 ? boxes(100) : List.of())).toList();

        assertThatThrownBy(() -> new SpotDifferenceService(catalog, rewards, clock))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("requires at least 5 HARD scenes");
    }

    @Test
    void 어려움_필드가_누락된_장면은_잘못된_카탈로그로_보고한다() {
        var catalog = IntStream.range(0, 6).mapToObj(index ->
                new Puzzle("p" + index, "장면 " + index, boxes(50), index == 5 ? null : boxes(100))).toList();

        assertThatThrownBy(() -> new SpotDifferenceService(catalog, rewards, clock))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Invalid shooting pavilion puzzle catalog");
    }

    @ParameterizedTest
    @CsvSource({ "NORMAL, 50, 60", "HARD, 100, 90" })
    void 다섯_장면을_중복_없이_완주하고_서버_정답에_따라_한_번_정산한다(Difficulty mode, int y, int maximum) {
        var request = new Start(mode, UUID.randomUUID());
        var view = game.start(PLAYER, request);
        var id = view.id();
        assertThat(game.start(PLAYER, request).id()).isEqualTo(id);
        when(rewards.settle(PLAYER, id, maximum)).thenReturn(new SpotDifferenceRewards.Receipt(maximum, 5, 1000));
        var scenes = new HashSet<String>();
        for (int round = 1; round <= 5; round++) {
            assertThat(scenes.add(view.scene())).isTrue();
            assertThat(view.phase()).isEqualTo(Phase.WAITING);
            assertThat(view.answers()).isEmpty();
            view = game.act(PLAYER, id, new Action(READY, round, null, null));
            assertThat(view.remainingMs()).isEqualTo(60_000);
            for (int hit = 0; hit < 6; hit++) {
                int x = 15 + hit * 30;
                view = game.act(PLAYER, id, new Action(TAP, round, x, y + 1));
                assertThat(view.tap()).isEqualTo(TapResult.HIT);
                clock.advance(200);
                if (hit == 0) {
                    view = game.act(PLAYER, id, new Action(TAP, round, x, y + 1));
                    assertThat(view.tap()).isEqualTo(TapResult.ALREADY_FOUND);
                    assertThat(view.matched()).hasSize(1);
                }
            }
            assertThat(view.phase()).isEqualTo(Phase.REVIEW);
            assertThat(view.answers()).hasSize(6);
            if (round < 5) {
                assertThat(view.receipt()).isNull();
                view = game.act(PLAYER, id, new Action(NEXT, round, null, null));
                assertThat(game.act(PLAYER, id, new Action(NEXT, round, null, null))).isEqualTo(view);
            }
        }
        assertThat(view.total()).isEqualTo(30);
        assertThat(view.receipt().granted()).isEqualTo(5);
        assertThat(game.act(PLAYER, id, new Action(SYNC, 5, null, null)).receipt()).isEqualTo(view.receipt());
        verify(rewards).settle(anyLong(), any(), anyInt());
    }

    @Test
    void 타인과_시간이_지난_정답_입력을_차단하고_미완주_보상은_지급하지_않는다() {
        var id = game.start(PLAYER, new Start(Difficulty.NORMAL, UUID.randomUUID())).id();
        assertThatThrownBy(() -> game.act(2, id, new Action(READY, 1, null, null)))
                .isInstanceOf(ResponseStatusException.class);
        game.act(PLAYER, id, new Action(READY, 1, null, null));
        var miss = game.act(PLAYER, id, new Action(TAP, 1, 0, 0));
        assertThat(miss.tap()).isEqualTo(TapResult.MISS);
        assertThat(miss.remainingMs()).isEqualTo(60_000);
        assertThat(miss.total()).isZero();
        assertThat(miss.cooldownMs()).isEqualTo(1_000);
        clock.advance(999);
        assertThat(game.act(PLAYER, id, new Action(TAP, 1, 15, 51)).tap()).isEqualTo(TapResult.WAIT);
        clock.advance(1);
        assertThat(game.act(PLAYER, id, new Action(TAP, 1, 15, 51)).tap()).isEqualTo(TapResult.HIT);
        clock.advance(58_999);
        assertThat(game.act(PLAYER, id, new Action(SYNC, 1, null, null)).remainingMs()).isEqualTo(1);
        clock.advance(1);
        var review = game.act(PLAYER, id, new Action(TAP, 1, 15, 51));
        assertThat(review.phase()).isEqualTo(Phase.REVIEW);
        assertThat(review.total()).isEqualTo(1);
        assertThat(review.answers()).hasSize(6);
        clock.advance(900_000);
        assertThatThrownBy(() -> game.act(PLAYER, id, new Action(NEXT, 1, null, null)))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(rewards);
    }

    @Test
    void 완주한_판은_라운드_결과와_지급_엽전을_한_번_남기고_다음_판으로_바꿔도_다시_남기지_않는다() {
        var log = new CapturingLog();
        var logged = loggedGame(log);
        var id = logged.start(PLAYER, new Start(Difficulty.NORMAL, UUID.randomUUID())).id();
        when(rewards.settle(PLAYER, id, 60)).thenReturn(new SpotDifferenceRewards.Receipt(60, 60, 900));
        for (int round = 1; round <= 5; round++) {
            logged.act(PLAYER, id, new Action(READY, round, null, null));
            if (round == 1) {
                logged.act(PLAYER, id, new Action(TAP, round, 0, 0));
                clock.advance(1000);
            }
            for (int hit = 0; hit < 6; hit++) {
                logged.act(PLAYER, id, new Action(TAP, round, 15 + hit * 30, 51));
                clock.advance(round == 1 ? 300 : 200);
            }
            if (round < 5) logged.act(PLAYER, id, new Action(NEXT, round, null, null));
        }
        logged.start(PLAYER, new Start(Difficulty.HARD, UUID.randomUUID()));

        assertThat(log.events).singleElement().satisfies(event -> {
            assertThat(event.type()).isEqualTo(BehaviorEventType.GAME_PLAY_STATS);
            assertThat(event.userId()).isEqualTo(PLAYER);
            assertThat(event.gameId()).isEqualTo(id.toString());
            assertThat(event.props()).containsEntry("gameCode", "SPOT_DIFFERENCE")
                    .containsEntry("difficulty", "NORMAL").containsEntry("endReason", "COMPLETED")
                    .containsEntry("roundsStarted", 5).containsEntry("roundsCleared", 5)
                    .containsEntry("found", 30).containsEntry("misses", 1)
                    // 2~5라운드는 0.2초 간격으로 여섯 개: 마지막이 READY 뒤 1초.
                    .containsEntry("fastestClearMs", 1000L).containsEntry("reward", 60);
        });
    }

    @Test
    void 새_판으로_바꾸거나_만료된_판도_찾은_만큼_남긴다() {
        var log = new CapturingLog();
        var logged = loggedGame(log);
        var first = logged.start(PLAYER, new Start(Difficulty.HARD, UUID.randomUUID())).id();
        logged.act(PLAYER, first, new Action(READY, 1, null, null));
        logged.act(PLAYER, first, new Action(TAP, 1, 15, 101));
        clock.advance(200);
        logged.act(PLAYER, first, new Action(TAP, 1, 45, 101));
        clock.advance(1_000);
        var second = logged.start(PLAYER, new Start(Difficulty.NORMAL, UUID.randomUUID())).id();
        Instant lastAction = clock.instant();
        logged.act(PLAYER, second, new Action(READY, 1, null, null));
        clock.advance(15 * 60_000);
        logged.start(2L, new Start(Difficulty.NORMAL, UUID.randomUUID()));

        assertThat(log.events).extracting(event -> event.props().get("endReason"))
                .containsExactly("RESTARTED", "EXPIRED");
        assertThat(log.events.getFirst().props()).containsEntry("difficulty", "HARD")
                .containsEntry("roundsStarted", 1).containsEntry("roundsCleared", 0).containsEntry("found", 2)
                .containsEntry("misses", 0).containsEntry("durationMs", 1_200L)
                .doesNotContainKeys("fastestClearMs", "reward");
        assertThat(log.events.getLast().occurredAt()).isEqualTo(lastAction);
        verifyNoInteractions(rewards);
    }

    private SpotDifferenceService loggedGame(CapturingLog log) {
        return new SpotDifferenceService(
                IntStream.range(0, 50).mapToObj(i -> new Puzzle("p" + i, "장면 " + i, boxes(50), boxes(100))).toList(),
                rewards, clock, log);
    }

    private static final class CapturingLog implements BehaviorLog {
        private final List<BehaviorEvent> events = new java.util.ArrayList<>();

        @Override
        public void record(java.util.function.Supplier<BehaviorEvent> event) {
            events.add(event.get());
        }

        @Override
        public void recordPosition(java.util.function.Supplier<com.ssafy.ontop.behavior.domain.PositionSample> sample) {
        }
    }

    private static List<Difference> boxes(int y) {
        return IntStream.range(0, 6).mapToObj(i -> new Difference("정답 " + i,
                List.of(10 + i * 30, y, 29 + i * 30, y + 20))).toList();
    }

    private static final class TestClock extends Clock {
        private Instant time = Instant.parse("2026-11-15T12:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(time, zone); }
        @Override public Instant instant() { return time; }
        void advance(long millis) { time = time.plusMillis(millis); }
    }
}
