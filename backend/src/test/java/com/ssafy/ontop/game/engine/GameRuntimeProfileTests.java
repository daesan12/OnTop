package com.ssafy.ontop.game.engine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.bridge.config.BridgeConfiguration;
import com.ssafy.ontop.game.bridge.service.BridgeEngine;
import com.ssafy.ontop.game.farkle.config.FarkleConfiguration;
import com.ssafy.ontop.game.farkle.service.FarkleEngine;
import com.ssafy.ontop.game.omok.config.OmokConfiguration;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.onecard.config.OneCardConfiguration;
import com.ssafy.ontop.game.onecard.service.OneCardEngine;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.result.GameFinishedResultListener;
import com.ssafy.ontop.game.result.GameResultService;
import com.ssafy.ontop.game.start.CommittedGameStartService;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.start.GameStartResult;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class GameRuntimeProfileTests {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withBean(ObjectMapper.class, () -> new ObjectMapper().findAndRegisterModules())
            .withUserConfiguration(OmokConfiguration.class, FarkleConfiguration.class, OneCardConfiguration.class,
                    BridgeConfiguration.class, CommittedGameStartService.class, GameReconnectService.class,
                    GameResultService.class, GameFinishedResultListener.class);

    @Test
    void 기본dev는_시작과_엔진을_자동활성화하지_않는다() {
        runner.withPropertyValues("spring.profiles.active=dev").run(context -> {
            assertThat(context).hasNotFailed().doesNotHaveBean(CommittedGameStartService.class)
                    .doesNotHaveBean(GameEngineRouter.class).hasSingleBean(GameReconnectService.class)
                    .hasSingleBean(GameResultService.class).hasSingleBean(GameFinishedResultListener.class);
        });
    }

    @Test
    void dev환경변수로_네엔진과_연결부를_켜도_기동시예약은_실행하지_않는다() {
        var calls = new AtomicInteger();
        enabled("dev").withBean(GameStartGateway.class, () -> new GameStartGateway() {
            @Override public GameStartResult startGame(GameStartCommand command) {
                calls.incrementAndGet();
                throw new AssertionError("기동 중 예약 금지");
            }
            @Override public GameStartResult findStartResult(UUID id) {
                throw new AssertionError("기동 중 결과 조회 금지");
            }
        }).run(context -> {
            assertThat(context).hasNotFailed().hasSingleBean(CommittedGameStartService.class)
                    .hasSingleBean(OmokEngine.class).hasSingleBean(FarkleEngine.class)
                    .hasSingleBean(OneCardEngine.class).hasSingleBean(BridgeEngine.class)
                    .hasSingleBean(GameEngineRouter.class).hasSingleBean(GameReconnectService.class)
                    .hasSingleBean(GameResultService.class).hasSingleBean(GameFinishedResultListener.class);
            assertThat(context.getEnvironment().getActiveProfiles()).containsExactly("dev");
            assertThat(calls).hasValue(0);
        });
    }

    @Test
    void dev시작옵션을_켰는데_DB예약Gateway가_없으면_기동에_실패한다() {
        enabled("dev").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).hasRootCauseInstanceOf(
                    org.springframework.beans.factory.NoSuchBeanDefinitionException.class)
                    .hasStackTraceContaining("GameStartGateway");
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"prod,db", "production,db"})
    void 운영DB프로필에서_경기엔진과_시작_결과_재접속을_등록한다(String profiles) {
        enabled(profiles).withPropertyValues("ontop.game-start.enabled=true", "ontop.games.omok.enabled=true",
                "ontop.games.farkle.enabled=true", "ontop.games.onecard.enabled=true",
                "ontop.games.bridge.enabled=true")
                .withBean(GameStartGateway.class, () -> new GameStartGateway() {
            @Override public GameStartResult startGame(GameStartCommand command) {
                throw new AssertionError("기동 중 예약 금지");
            }
            @Override public GameStartResult findStartResult(UUID id) {
                throw new AssertionError("기동 중 결과 조회 금지");
            }
        }).run(context -> assertThat(context).hasNotFailed()
                .hasSingleBean(CommittedGameStartService.class).hasSingleBean(GameEngineRouter.class)
                .hasSingleBean(OmokEngine.class).hasSingleBean(FarkleEngine.class)
                .hasSingleBean(OneCardEngine.class).hasSingleBean(BridgeEngine.class)
                .hasSingleBean(GameReconnectService.class).hasSingleBean(GameResultService.class)
                .hasSingleBean(GameFinishedResultListener.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"prod", "production", "dev,prod", "dev,production", "local,prod", "local,production"})
    void 운영DB가_없거나_개발프로필과_섞이면_경기기능을_등록하지_않는다(String profiles) {
        enabled(profiles).withPropertyValues("ontop.game-start.enabled=true", "ontop.games.omok.enabled=true",
                "ontop.games.farkle.enabled=true", "ontop.games.onecard.enabled=true", "ontop.games.bridge.enabled=true")
                .run(context -> assertThat(context).hasNotFailed()
                .doesNotHaveBean(CommittedGameStartService.class).doesNotHaveBean(GameEngineRouter.class)
                .doesNotHaveBean(OmokEngine.class).doesNotHaveBean(FarkleEngine.class)
                .doesNotHaveBean(OneCardEngine.class).doesNotHaveBean(BridgeEngine.class)
                .doesNotHaveBean(GameReconnectService.class).doesNotHaveBean(GameResultService.class)
                .doesNotHaveBean(GameFinishedResultListener.class));
    }

    private ApplicationContextRunner enabled(String profiles) {
        return runner.withPropertyValues("spring.profiles.active=" + profiles,
                "GAME_START_ENABLED=true", "GAME_OMOK_ENABLED=true", "GAME_FARKLE_ENABLED=true",
                "GAME_ONECARD_ENABLED=true", "GAME_BRIDGE_ENABLED=true");
    }
}
