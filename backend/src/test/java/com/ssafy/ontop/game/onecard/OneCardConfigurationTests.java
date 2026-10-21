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
            .withPropertyValues("ontop.games.onecard.enabled=true");

    @Test
    void 기권손패정책미지정은_임의기본값없이활성화를거절한다() {
        contexts.run(context -> assertThat(context).hasFailed());
    }
    @Test
    void 명시정책이있을때만_원카드엔진을활성화한다() {
        contexts.withPropertyValues("ontop.games.onecard.forfeit-hand-policy=REMOVE")
                .run(context -> assertThat(context).hasSingleBean(OneCardEngine.class));
    }
}
