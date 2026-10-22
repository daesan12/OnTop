package com.ssafy.ontop.game.onecard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.onecard.config.OneCardConfiguration;
import com.ssafy.ontop.game.onecard.service.OneCardEngine;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import static org.assertj.core.api.Assertions.*;

class OneCardConfigurationTests {
    private final ApplicationContextRunner contexts=new ApplicationContextRunner()
            .withInitializer(context -> context.getEnvironment().setActiveProfiles("local"))
            .withUserConfiguration(OneCardConfiguration.class).withBean(ObjectMapper.class,ObjectMapper::new)
            .withBean(java.time.Clock.class, () -> java.time.Clock.fixed(
                    java.time.Instant.parse("2026-10-22T00:00:00Z"), java.time.ZoneOffset.UTC))
            .withPropertyValues("ontop.games.onecard.enabled=true");

    @Test
    void 추가정책설정없이_기권손패를제외한다() {
        contexts.run(context -> {
            assertThat(context).hasSingleBean(OneCardEngine.class);
            var engine = context.getBean(OneCardEngine.class);
            engine.create("policy", "table", java.util.List.of(101L,202L,303L));
            var before = engine.load(101,"policy").orElseThrow();
            var now = context.getBean(java.time.Clock.class).instant();
            engine.graceExpired(new com.ssafy.ontop.game.reconnect.GameRecoveryGateway.GraceExpiration(
                    java.util.UUID.randomUUID(), 202, "policy", now.minusSeconds(30), now,
                    com.ssafy.ontop.game.reconnect.GameRecoveryGateway.Action.ELIMINATE));
            var after = engine.load(101,"policy").orElseThrow();
            assertThat(after.publicState().path("drawCount")).isEqualTo(before.publicState().path("drawCount"));
            assertThat(engine.load(202,"policy").orElseThrow().privateState().path("hand")).isEmpty();
        });
    }
    @Test
    void 원카드비활성일때는_엔진을등록하지않는다() {
        contexts.withPropertyValues("ontop.games.onecard.enabled=false")
                .run(context -> assertThat(context).doesNotHaveBean(OneCardEngine.class));
    }
}
