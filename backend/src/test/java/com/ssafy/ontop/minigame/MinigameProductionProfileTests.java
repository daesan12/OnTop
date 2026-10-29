package com.ssafy.ontop.minigame;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import com.ssafy.ontop.minigame.config.MinigameConfiguration;
import com.ssafy.ontop.minigame.config.MinigameOpenApiCustomizer;
import com.ssafy.ontop.minigame.config.MinigamePreflightFilter;
import com.ssafy.ontop.minigame.controller.MinigameController;
import com.ssafy.ontop.minigame.repository.MinigameRepository;
import com.ssafy.ontop.minigame.service.MinigameService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.transaction.PlatformTransactionManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class MinigameProductionProfileTests {
    @ParameterizedTest
    @ValueSource(strings = {"prod,db", "production,db"})
    void 운영DB프로필에서_붕어빵서비스와_HTTP를_등록하고_개발문서는_제외한다(String profiles) {
        new ApplicationContextRunner().withPropertyValues("spring.profiles.active=" + profiles,
                "ontop.minigames.enabled=true")
                .withBean(ObjectMapper.class, ObjectMapper::new)
                .withBean(AuthExchangeOriginPolicy.class, () -> mock(AuthExchangeOriginPolicy.class))
                .withBean(EntityManager.class, () -> mock(EntityManager.class))
                .withBean(PlatformTransactionManager.class, () -> mock(PlatformTransactionManager.class))
                .withUserConfiguration(MinigameController.class, MinigameConfiguration.class,
                        MinigameRepository.class, MinigamePreflightFilter.class, MinigameOpenApiCustomizer.class)
                .run(context -> assertThat(context).hasNotFailed()
                        .hasSingleBean(MinigameController.class).hasSingleBean(MinigameConfiguration.class)
                        .hasSingleBean(MinigameRepository.class).hasSingleBean(MinigameService.class)
                        .hasSingleBean(MinigamePreflightFilter.class)
                        .doesNotHaveBean(MinigameOpenApiCustomizer.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"dev,prod,db", "dev,production,db", "local,prod,db", "local,production,db"})
    void 운영프로필을_개발프로필과_섞으면_미니게임을_등록하지_않는다(String profiles) {
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
