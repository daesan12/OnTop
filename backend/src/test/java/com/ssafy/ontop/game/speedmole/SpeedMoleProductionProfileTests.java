package com.ssafy.ontop.game.speedmole;

import jakarta.persistence.EntityManager;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class SpeedMoleProductionProfileTests {
    private final ApplicationContextRunner runner=new ApplicationContextRunner()
            .withUserConfiguration(SpeedMoleController.class,SpeedMoleConfiguration.class)
            .withBean(JdbcTemplate.class,()->mock(JdbcTemplate.class))
            .withBean(PlatformTransactionManager.class,()->mock(PlatformTransactionManager.class))
            .withBean(EntityManager.class,()->mock(EntityManager.class));

    @ParameterizedTest
    @ValueSource(strings={"prod,db","production,db"})
    void production_db_enables_the_existing_server_verified_game(String profiles) {
        runner.withPropertyValues("spring.profiles.active="+profiles,"ontop.minigames.enabled=true")
                .run(context->assertThat(context).hasNotFailed().hasSingleBean(SpeedMoleController.class)
                        .hasSingleBean(SpeedMoleService.class));
    }

    @ParameterizedTest
    @ValueSource(strings={"prod,db","production,db"})
    void disabled_server_does_not_create_the_game_service(String profiles) {
        runner.withPropertyValues("spring.profiles.active="+profiles,"ontop.minigames.enabled=false")
                .run(context->assertThat(context).hasNotFailed().hasSingleBean(SpeedMoleController.class)
                        .doesNotHaveBean(SpeedMoleService.class));
    }

    @ParameterizedTest
    @ValueSource(strings={"prod","production","dev,prod,db","local,production,db"})
    void missing_db_or_mixed_profiles_do_not_expose_game_beans(String profiles) {
        runner.withPropertyValues("spring.profiles.active="+profiles,"ontop.minigames.enabled=true")
                .run(context->assertThat(context).hasNotFailed().doesNotHaveBean(SpeedMoleController.class)
                        .doesNotHaveBean(SpeedMoleService.class));
    }
}
