package com.ssafy.ontop.game.engine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.state.GameStateGateway;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GameEngineRouterTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final Instant now = Instant.parse("2026-10-21T00:00:00Z");
    private final GameEngineRouter router = new GameEngineRouter();
    private final OmokEngine first = engine();
    private final OmokEngine second = engine();

    @Test
    void 복구조회중_다음경기가_등록되면_새경기로_다시조회한다() {
        GameEngine switching = mock(GameEngine.class);
        router.register(switching, "old", "table", List.of(101L, 202L));
        var calls = new AtomicInteger();
        when(switching.load(101)).thenAnswer(invocation -> {
            if (calls.getAndIncrement() == 0) {
                router.finished(switching, "old");
                router.register(switching, "new", "table", List.of(101L, 202L));
            }
            return Optional.of(new GameRecoverySnapshot(101, "new", 2, 0,
                    GameRecoverySnapshot.Phase.PLAYING, mapper.createObjectNode()));
        });
        assertThat(router.load(101).orElseThrow().gameId()).isEqualTo("new");
        assertThat(calls.get()).isEqualTo(2);
    }

    @Test
    void 복구조회중_다른게임으로_바뀌면_이전종료상태를_반환하지않는다() {
        GameEngine oldEngine = mock(GameEngine.class);
        GameEngine newEngine = mock(GameEngine.class);
        router.register(oldEngine, "old", "table", List.of(101L, 202L));
        when(oldEngine.load(101)).thenAnswer(invocation -> {
            router.finished(oldEngine, "old");
            router.register(newEngine, "new", "table", List.of(101L, 202L));
            return Optional.of(new GameRecoverySnapshot(101, "old", 2, 1,
                    GameRecoverySnapshot.Phase.FINISHED, mapper.createObjectNode()));
        });
        when(newEngine.load(101)).thenReturn(Optional.of(new GameRecoverySnapshot(101, "new", 2, 0,
                GameRecoverySnapshot.Phase.PLAYING, mapper.createObjectNode())));
        assertThat(router.load(101).orElseThrow().gameId()).isEqualTo("new");
    }

    @Test
    void 두엔진설정이_함께켜져도_공통Gateway는_라우터하나를_선택한다() {
        new ApplicationContextRunner().withUserConfiguration(FirstModule.class, SecondModule.class)
                .run(context -> {
                    assertThat(context).hasNotFailed().hasSingleBean(GameEngineRouter.class);
                    var selected = context.getBean(GameEngineRouter.class);
                    assertThat(context.getBean(GameActionGateway.class)).isSameAs(selected);
                    assertThat(context.getBean(GameStateGateway.class))
                            .isSameAs(selected);
                    assertThat(context.getBean(GameRecoveryGateway.class)).isSameAs(selected);
                    context.getBean("firstModuleEngine", OmokEngine.class).create("a", "a-table", 101, 202);
                    context.getBean("secondModuleEngine", OmokEngine.class).create("b", "b-table", 303, 404);
                    assertThat(selected.load(101).orElseThrow().gameId()).isEqualTo("a");
                    assertThat(selected.load(303).orElseThrow().gameId()).isEqualTo("b");
                });
    }

    @Test
    void 입력과상태를_경기소유엔진으로만_전달한다() {
        first.create("one", "table-one", 101, 202);
        second.create("two", "table-two", 303, 404);
        assertThat(router.apply(move(303, "two")).version()).isEqualTo(1);
        assertThat(first.load(101, "one").orElseThrow().version()).isZero();
        assertThat(router.load(303, "two").orElseThrow().publicState().path("moveCount").asInt()).isEqualTo(1);
        assertThat(router.load(101).orElseThrow().gameId()).isEqualTo("one");
        assertThat(router.load(303).orElseThrow().gameId()).isEqualTo("two");
    }

    @Test
    void 없는경기와_타인입력은_엔진호출전에_차단한다() {
        first.create("one", "table", 101, 202);
        assertThat(router.load(101, "missing")).isEmpty();
        assertThat(router.load(999)).isEmpty();
        assertThatThrownBy(() -> router.apply(move(999, "one")))
                .isInstanceOfSatisfying(GameActionGateway.Rejected.class,
                        error -> assertThat(error.reason()).isEqualTo(GameActionGateway.Rejection.ACCESS_DENIED));
        assertThat(first.load(101, "one").orElseThrow().version()).isZero();
    }

    @Test
    void 엔진간_중복경기ID와_참가자및테이블_중복점유를_거절한다() {
        first.create("one", "table", 101, 202);
        assertThatIllegalStateException().isThrownBy(() -> second.create("one", "other", 303, 404));
        assertThatIllegalStateException().isThrownBy(() -> second.create("two", "table", 303, 404));
        assertThatIllegalStateException().isThrownBy(() -> second.create("two", "other", 101, 404));
        assertThat(second.load(303, "two")).isEmpty();
    }

    @Test
    void 종료후_새경기로_복구대상을_바꾸고_늦은이전종료는_새점유를지우지않는다() {
        first.create("one", "table", 101, 202);
        router.graceExpired(expiration(101, "one"));
        assertThat(router.load(101).orElseThrow().phase()).isEqualTo(GameRecoverySnapshot.Phase.FINISHED);
        second.create("two", "table", 101, 202);
        router.finished(first, "one");
        assertThat(router.load(101).orElseThrow().gameId()).isEqualTo("two");
        assertThatIllegalStateException().isThrownBy(() -> first.create("three", "other", 101, 404));
        assertThat(router.load(101, "one").orElseThrow().publicState().path("status").asText())
                .isEqualTo("FINISHED");
    }

    @Test
    void 다른엔진은_경기점유를_해제할수없다() {
        first.create("one", "table", 101, 202);
        assertThatIllegalStateException().isThrownBy(() -> router.finished(second, "one"));
        assertThatIllegalStateException().isThrownBy(() -> second.create("two", "table", 303, 404));
    }

    @Test
    void 서로다른엔진의_동시생성에도_한사용자는_한경기만_점유한다() throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var a = workers.submit(() -> createAfter(start, first, "one", "table-one", 202));
            var b = workers.submit(() -> createAfter(start, second, "two", "table-two", 303));
            start.countDown();
            assertThat(List.of(a.get(), b.get())).containsExactlyInAnyOrder(true, false);
            assertThat(router.load(101)).isPresent();
        }
    }

    private boolean createAfter(CountDownLatch start, OmokEngine engine, String id, String table, long opponent)
            throws InterruptedException {
        start.await();
        try {
            engine.create(id, table, 101, opponent);
            return true;
        } catch (IllegalStateException expected) {
            return false;
        }
    }

    private OmokEngine engine() {
        return new OmokEngine(mapper, Clock.fixed(now, ZoneOffset.UTC), notice -> { }, router);
    }

    private GameActionCommand move(long user, String game) {
        return new GameActionCommand(user, game, "move-1", 0,
                mapper.createObjectNode().put("x", 7).put("y", 7));
    }

    private GameRecoveryGateway.GraceExpiration expiration(long user, String game) {
        return new GameRecoveryGateway.GraceExpiration(UUID.randomUUID(), user, game, now.minusSeconds(30),
                now, GameRecoveryGateway.Action.FORFEIT);
    }

    @TestConfiguration(proxyBeanMethods = false)
    @Import(GameEngineGateways.class)
    static class FirstModule {
        @Bean
        OmokEngine firstModuleEngine(GameEngineRouter router) {
            return new OmokEngine(new ObjectMapper(), Clock.systemUTC(), notice -> { }, router);
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    @Import(GameEngineGateways.class)
    static class SecondModule {
        @Bean
        OmokEngine secondModuleEngine(GameEngineRouter router) {
            return new OmokEngine(new ObjectMapper(), Clock.systemUTC(), notice -> { }, router);
        }
    }
}
