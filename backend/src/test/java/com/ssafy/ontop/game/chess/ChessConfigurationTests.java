package com.ssafy.ontop.game.chess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.chess.config.ChessConfiguration;
import com.ssafy.ontop.game.chess.service.ChessEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class ChessConfigurationTests {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withInitializer(context -> context.getEnvironment().setActiveProfiles("local"))
            .withBean(ObjectMapper.class, ObjectMapper::new)
            .withUserConfiguration(ChessConfiguration.class);

    @Test
    void 설정이_없으면_체스_엔진과_라우터와_타이머를_등록하지_않는다() {
        runner.run(context -> {
            assertThat(context).doesNotHaveBean(ChessEngine.class).doesNotHaveBean(GameEngineRouter.class);
            assertThat(context).doesNotHaveBean("chessTimer");
        });
    }

    @Test
    void 명시적으로_활성화하면_공통_라우터와_체스_엔진과_타이머를_함께_등록한다() {
        runner.withPropertyValues("ontop.games.chess.enabled=true").run(context -> {
            assertThat(context).hasSingleBean(ChessEngine.class).hasSingleBean(GameEngineRouter.class);
            assertThat(context).hasBean("chessTimer");
        });
    }

    @Test
    void 명시적으로_비활성화하면_체스_빈을_등록하지_않는다() {
        runner.withPropertyValues("ontop.games.chess.enabled=false").run(context -> {
            assertThat(context).doesNotHaveBean(ChessEngine.class).doesNotHaveBean(GameEngineRouter.class);
            assertThat(context).doesNotHaveBean("chessTimer");
        });
    }
}
