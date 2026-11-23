package com.ssafy.ontop.game.rummikub;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.rummikub.config.RummikubConfiguration;
import com.ssafy.ontop.game.rummikub.service.RummikubEngine;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class RummikubConfigurationTests {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withInitializer(context -> context.getEnvironment().setActiveProfiles("local"))
            .withBean(ObjectMapper.class, ObjectMapper::new)
            .withUserConfiguration(RummikubConfiguration.class);

    @Test
    void 명시적으로_켜지_않은_기본_월드에_게임_게이트웨이를_추가하지_않는다() {
        runner.run(context -> {
            assertThat(context).doesNotHaveBean(RummikubEngine.class).doesNotHaveBean(GameEngineRouter.class);
            assertThat(context).doesNotHaveBean("rummikubTimer");
        });
    }

    @Test
    void 활성화하면_공통_라우터와_엔진을_함께_등록한다() {
        runner.withPropertyValues("ontop.games.rummikub.enabled=true").run(context -> {
            assertThat(context).hasSingleBean(RummikubEngine.class).hasSingleBean(GameEngineRouter.class);
            assertThat(context).hasBean("rummikubTimer");
        });
    }

    @Test
    void 비활성화하면_게임과_타이머를_등록하지_않는다() {
        runner.withPropertyValues("ontop.games.rummikub.enabled=false").run(context -> {
            assertThat(context).doesNotHaveBean(RummikubEngine.class).doesNotHaveBean("rummikubTimer");
        });
    }
}
