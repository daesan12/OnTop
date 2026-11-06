package com.ssafy.ontop.game.skewer;

import com.ssafy.ontop.game.skewer.coop.controller.SkewerCoopController;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopEngine;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopSettlementService;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.user.service.UserProfileService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class SkewerCoopActivationTests {
    private WebApplicationContextRunner runner(String profiles) {
        return new WebApplicationContextRunner()
                .withInitializer(new ConfigDataApplicationContextInitializer())
                .withInitializer(context -> {
                    // 입장 기능은 대역으로 고정하고 프로필에 따른 컨트롤러 등록만 검사한다.
                    context.getBeanFactory().registerSingleton("engine", mock(SkewerCoopEngine.class));
                    context.getBeanFactory().registerSingleton("hub", mock(TableHub.class));
                    context.getBeanFactory().registerSingleton("settlements", mock(SkewerCoopSettlementService.class));
                    context.getBeanFactory().registerSingleton("profiles", mock(UserProfileService.class));
                })
                .withPropertyValues("spring.profiles.active=" + profiles,
                        "SKEWER_COOP_JOURNAL_PATH=/unused/skewer-activation-test")
                .withUserConfiguration(SkewerCoopController.class);
    }

    @Test
    void 기본_DEV는_미니게임_migration을_읽지만_협동_API는_등록하지_않는다() {
        runner("dev,db").run(context -> {
            assertThat(context).hasNotFailed().doesNotHaveBean(SkewerCoopController.class);
            assertThat(context.getEnvironment().getProperty("spring.flyway.locations"))
                    .isEqualTo("classpath:db/migration,classpath:db/minigame");
            assertThat(context.getEnvironment().getProperty("ontop.games.skewer-coop.enabled", Boolean.class, false))
                    .isFalse();
        });
    }

    @Test
    void 협동_프로필을_추가하면_방_API가_등록된다() {
        runner("dev,db,skewer-coop").run(context -> {
            assertThat(context).hasNotFailed().hasSingleBean(SkewerCoopController.class);
            assertThat(context.getEnvironment().getProperty("ontop.games.skewer-coop.enabled", Boolean.class))
                    .isTrue();
        });
    }

    @Test
    void 협동_프로필이_있어도_명시적으로_끄면_방_API는_등록하지_않는다() {
        runner("dev,db,skewer-coop").withPropertyValues("ontop.games.skewer-coop.enabled=false")
                .run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(SkewerCoopController.class));
    }
}
