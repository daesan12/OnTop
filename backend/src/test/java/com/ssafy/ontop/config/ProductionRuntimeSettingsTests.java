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
                            "ontop.games.bridge.enabled", "ontop.games.ledger.enabled",
                            "ontop.games.halligalli.enabled", "ontop.minigames.enabled",
                            "ontop.shop.enabled", "ontop.notes.enabled", "ontop.feedback.enabled",
                            "springdoc.api-docs.enabled", "springdoc.swagger-ui.enabled"}) {
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
                        "GAME_BRIDGE_ENABLED=true", "GAME_LEDGER_ENABLED=true", "GAME_HALLIGALLI_ENABLED=true",
                        "MINIGAMES_ENABLED=true",
                        "BUNGEOPPANG_V5_ENABLED=true",
                        "SHOP_ENABLED=true", "NOTES_ENABLED=true",
                        "DB_MIGRATION_LOCATIONS=classpath:db/migration,classpath:db/shop,classpath:db/minigame,classpath:db/notes")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    var environment = context.getEnvironment();
                    for (String key : new String[] {"ontop.game-start.enabled", "ontop.games.omok.enabled",
                            "ontop.games.farkle.enabled", "ontop.games.onecard.enabled",
                            "ontop.games.bridge.enabled", "ontop.games.ledger.enabled",
                            "ontop.games.halligalli.enabled", "ontop.minigames.enabled",
                            "ontop.minigames.bungeoppang-v5-enabled", "ontop.shop.enabled",
                            "ontop.notes.enabled"}) {
                        assertThat(environment.getProperty(key)).as(key).isEqualTo("true");
                    }
                    assertThat(environment.getProperty("spring.flyway.locations"))
                            .isEqualTo("classpath:db/migration,classpath:db/shop,classpath:db/minigame,classpath:db/notes");
                });
    }

    @Test
    void 개발DB의_메모와_소리함은_기본으로_꺼져있고_서버_환경변수로만_켠다() {
        new ApplicationContextRunner().withInitializer(new ConfigDataApplicationContextInitializer())
                .withPropertyValues("spring.profiles.active=dev,db")
                .run(context -> {
                    var environment = context.getEnvironment();
                    assertThat(environment.getProperty("ontop.notes.enabled")).isEqualTo("false");
                    assertThat(environment.getProperty("ontop.feedback.enabled")).isEqualTo("false");
                    assertThat(environment.getProperty("ontop.notes.privacy-secret")).isEmpty();
                    assertThat(environment.getProperty("ontop.feedback.administrator-ids")).isEmpty();
                });
        new ApplicationContextRunner().withInitializer(new ConfigDataApplicationContextInitializer())
                .withPropertyValues("spring.profiles.active=dev,db", "NOTES_ENABLED=true", "FEEDBACK_ENABLED=true",
                        "NOTES_PRIVACY_SECRET=synthetic-dev-runtime-settings-key-only", "ADMIN_READ_IDS=101,202")
                .run(context -> {
                    var environment = context.getEnvironment();
                    assertThat(environment.getProperty("ontop.notes.enabled")).isEqualTo("true");
                    assertThat(environment.getProperty("ontop.feedback.enabled")).isEqualTo("true");
                    assertThat(environment.getProperty("ontop.notes.privacy-secret"))
                            .isEqualTo("synthetic-dev-runtime-settings-key-only");
                    // 관리자 조회 권한과 소리함 관리자 목록은 같은 ADMIN_READ_IDS에서 온다.
                    assertThat(environment.getProperty("ontop.admin.read-ids")).isEqualTo("101,202");
                    assertThat(environment.getProperty("ontop.feedback.administrator-ids")).isEqualTo("101,202");
                    assertThat(environment.getProperty("spring.flyway.locations"))
                            .isEqualTo("classpath:db/migration,classpath:db/minigame");
                });
    }

    @Test
    void 개발DB의_기존_미니게임_마이그레이션_경로는_유지한다() {
        new ApplicationContextRunner().withInitializer(new ConfigDataApplicationContextInitializer())
                .withPropertyValues("spring.profiles.active=dev,db")
                .run(context -> assertThat(context.getEnvironment().getProperty("spring.flyway.locations"))
                        .isEqualTo("classpath:db/migration,classpath:db/minigame"));
    }

    @Test
    void 줄넘기_신규_판_규칙_버전은_기본_1이고_환경변수로만_2로_바꾼다() {
        for (String profiles : new String[] {"dev,db", "prod,db"}) {
            var runner = new ApplicationContextRunner().withInitializer(new ConfigDataApplicationContextInitializer())
                    .withPropertyValues("spring.profiles.active=" + profiles);
            runner.run(context -> assertThat(context.getEnvironment()
                    .getProperty("ontop.minigames.jump-rope-rules-version")).as(profiles).isEqualTo("1"));
            runner.withPropertyValues("JUMP_ROPE_RULES_VERSION=2").run(context -> assertThat(context.getEnvironment()
                    .getProperty("ontop.minigames.jump-rope-rules-version")).as(profiles).isEqualTo("2"));
        }
    }

    @Test
    void 개발_붕어빵_v5는_환경변수로만_명시적으로_켠다() {
        var runner = new ApplicationContextRunner().withInitializer(new ConfigDataApplicationContextInitializer())
                .withPropertyValues("spring.profiles.active=dev,db");
        runner.run(context -> assertThat(context.getEnvironment()
                .getProperty("ontop.minigames.bungeoppang-v5-enabled")).isEqualTo("false"));
        runner.withPropertyValues("BUNGEOPPANG_V5_ENABLED=true").run(context -> assertThat(context.getEnvironment()
                .getProperty("ontop.minigames.bungeoppang-v5-enabled")).isEqualTo("true"));
    }
}
