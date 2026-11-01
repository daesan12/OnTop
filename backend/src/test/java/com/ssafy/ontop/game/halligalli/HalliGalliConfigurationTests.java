package com.ssafy.ontop.game.halligalli;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.halligalli.config.HalliGalliConfiguration;
import com.ssafy.ontop.game.halligalli.service.HalliGalliEngine;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class HalliGalliConfigurationTests {
    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(context -> context.getEnvironment().setActiveProfiles("local"))
            .withUserConfiguration(HalliGalliConfiguration.class).withBean(ObjectMapper.class, ObjectMapper::new)
            .withBean(Clock.class, () -> Clock.fixed(Instant.parse("2026-11-01T00:00:00Z"), ZoneOffset.UTC));

    @Test
    void 켜면_엔진과_턴_타이머를_등록하고_결과_연출은_기본_1초다() {
        contexts.withPropertyValues("ontop.games.halligalli.enabled=true").run(context -> {
            assertThat(context).hasSingleBean(HalliGalliEngine.class);
            var engine = context.getBean(HalliGalliEngine.class);
            engine.create("config", "table", List.of(101L, 202L));
            var state = engine.load(101, "config").orElseThrow().publicState();
            assertThat(state.path("gameCode").asText()).isEqualTo("HALLI_GALLI");
            assertThat(state.path("flipTimeLimitMs").asLong()).isEqualTo(5_000);
            assertThat(state.path("resultPauseMs").asLong()).isEqualTo(1_000);
        });
    }

    @Test
    void 결과_연출_시간은_설정값을_따른다() {
        contexts.withPropertyValues("ontop.games.halligalli.enabled=true", "ontop.games.halligalli.result-pause-ms=300")
                .run(context -> {
                    var engine = context.getBean(HalliGalliEngine.class);
                    engine.create("config", "table", List.of(101L, 202L));
                    assertThat(engine.load(101, "config").orElseThrow().publicState().path("resultPauseMs").asLong())
                            .isEqualTo(300);
                });
    }

    @Test
    void 기본값이나_false면_엔진을_등록하지_않는다() {
        contexts.run(context -> assertThat(context).doesNotHaveBean(HalliGalliEngine.class));
        contexts.withPropertyValues("ontop.games.halligalli.enabled=false")
                .run(context -> assertThat(context).doesNotHaveBean(HalliGalliEngine.class));
    }

    @Test
    void 개발_운영_설정은_환경변수가_없으면_꺼져있고_연출은_1초다() {
        for (String profiles : new String[] {"dev,db", "prod,db"}) {
            new ApplicationContextRunner().withInitializer(new ConfigDataApplicationContextInitializer())
                    .withPropertyValues("spring.profiles.active=" + profiles).run(context -> {
                        var environment = context.getEnvironment();
                        assertThat(environment.getProperty("ontop.games.halligalli.enabled")).isEqualTo("false");
                        assertThat(environment.getProperty("ontop.games.halligalli.result-pause-ms")).isEqualTo("1000");
                    });
            new ApplicationContextRunner().withInitializer(new ConfigDataApplicationContextInitializer())
                    .withPropertyValues("spring.profiles.active=" + profiles, "GAME_HALLIGALLI_ENABLED=true",
                            "GAME_HALLIGALLI_RESULT_PAUSE_MS=800").run(context -> {
                        var environment = context.getEnvironment();
                        assertThat(environment.getProperty("ontop.games.halligalli.enabled")).isEqualTo("true");
                        assertThat(environment.getProperty("ontop.games.halligalli.result-pause-ms")).isEqualTo("800");
                    });
        }
    }
}
