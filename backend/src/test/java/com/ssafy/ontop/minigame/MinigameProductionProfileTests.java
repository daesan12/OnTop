package com.ssafy.ontop.minigame;

import com.ssafy.ontop.minigame.config.MinigameConfiguration;
import com.ssafy.ontop.minigame.config.MinigameOpenApiCustomizer;
import com.ssafy.ontop.minigame.config.MinigamePreflightFilter;
import com.ssafy.ontop.minigame.controller.MinigameController;
import com.ssafy.ontop.minigame.repository.MinigameRepository;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class MinigameProductionProfileTests {
    @ParameterizedTest
    @ValueSource(strings = {"dev,prod,db", "dev,production,db", "local,prod,db", "local,production,db"})
    void 운영프로필과_함께_켜면_개발_미니게임을_등록하지_않는다(String profiles) {
        new ApplicationContextRunner().withPropertyValues("spring.profiles.active=" + profiles,
                "ontop.minigames.enabled=true")
                .withUserConfiguration(MinigameController.class, MinigameConfiguration.class,
                        MinigameRepository.class, MinigamePreflightFilter.class, MinigameOpenApiCustomizer.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean(MinigameController.class)
                            .doesNotHaveBean(MinigameConfiguration.class).doesNotHaveBean(MinigameRepository.class)
                            .doesNotHaveBean(MinigamePreflightFilter.class).doesNotHaveBean(MinigameOpenApiCustomizer.class);
                });
    }
}
