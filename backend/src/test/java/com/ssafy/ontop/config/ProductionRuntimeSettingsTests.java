package com.ssafy.ontop.config;

import com.ssafy.ontop.game.start.LocalGameStartGateway;
import com.ssafy.ontop.table.websocket.TableDevController;
import com.ssafy.ontop.world.controller.ChannelAccessFilter;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class ProductionRuntimeSettingsTests {
    @Test
    void 운영DB설정은_기본적으로_기능을_자동활성화하지_않고_로컬_경로를_제외한다() {
        new ApplicationContextRunner().withInitializer(new ConfigDataApplicationContextInitializer())
                .withPropertyValues("spring.profiles.active=prod,db", "ontop.start-rehearsal.enabled=true")
                .withUserConfiguration(LocalGameStartGateway.class, TableDevController.class,
                        ChannelAccessFilter.class)
                .run(context -> {
                    assertThat(context).hasNotFailed()
                            .doesNotHaveBean(LocalGameStartGateway.class).doesNotHaveBean(TableDevController.class)
                            .doesNotHaveBean(ChannelAccessFilter.class);
                    var environment = context.getEnvironment();
                    for (String key : new String[] {"ontop.game-start.enabled", "ontop.games.omok.enabled",
                            "ontop.games.farkle.enabled", "ontop.games.onecard.enabled",
                            "ontop.games.bridge.enabled", "ontop.games.ledger.enabled", "ontop.minigames.enabled",
                            "ontop.shop.enabled", "ontop.notes.enabled", "springdoc.api-docs.enabled", "springdoc.swagger-ui.enabled"}) {
                        assertThat(environment.getProperty(key)).as(key).isEqualTo("false");
                    }
                    assertThat(environment.getProperty("spring.flyway.locations"))
                            .isEqualTo("classpath:db/migration");
                    assertThat(environment.getProperty("server.address")).isNull();
                });
    }

    @Test
    void 운영_기능값은_명시한_환경변수와_마이그레이션_위치로만_바뀐다() {
        new ApplicationContextRunner().withInitializer(new ConfigDataApplicationContextInitializer())
                .withPropertyValues("spring.profiles.active=prod,db", "GAME_START_ENABLED=true",
                        "GAME_OMOK_ENABLED=true", "GAME_FARKLE_ENABLED=true", "GAME_ONECARD_ENABLED=true",
                        "GAME_BRIDGE_ENABLED=true", "GAME_LEDGER_ENABLED=true", "MINIGAMES_ENABLED=true",
                        "BUNGEOPPANG_V5_ENABLED=true",
                        "SHOP_ENABLED=true", "NOTES_ENABLED=true",
                        "DB_MIGRATION_LOCATIONS=classpath:db/migration,classpath:db/shop,classpath:db/minigame,classpath:db/notes")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    var environment = context.getEnvironment();
                    for (String key : new String[] {"ontop.game-start.enabled", "ontop.games.omok.enabled",
                            "ontop.games.farkle.enabled", "ontop.games.onecard.enabled",
                            "ontop.games.bridge.enabled", "ontop.games.ledger.enabled", "ontop.minigames.enabled",
                            "ontop.minigames.bungeoppang-v5-enabled", "ontop.shop.enabled",
                            "ontop.notes.enabled"}) {
                        assertThat(environment.getProperty(key)).as(key).isEqualTo("true");
                    }
                    assertThat(environment.getProperty("spring.flyway.locations"))
                            .isEqualTo("classpath:db/migration,classpath:db/shop,classpath:db/minigame,classpath:db/notes");
                });
    }

    @Test
    void 개발DB의_기존_미니게임_마이그레이션_경로는_유지한다() {
        new ApplicationContextRunner().withInitializer(new ConfigDataApplicationContextInitializer())
                .withPropertyValues("spring.profiles.active=dev,db")
                .run(context -> assertThat(context.getEnvironment().getProperty("spring.flyway.locations"))
                        .isEqualTo("classpath:db/migration,classpath:db/minigame"));
    }
}
