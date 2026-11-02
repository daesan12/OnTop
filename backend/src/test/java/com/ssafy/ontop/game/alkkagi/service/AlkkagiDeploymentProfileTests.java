package com.ssafy.ontop.game.alkkagi.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.alkkagi.config.AlkkagiConfiguration;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class AlkkagiDeploymentProfileTests {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(AlkkagiConfiguration.class)
            .withBean(ObjectMapper.class, ObjectMapper::new);

    @Test
    void 개발_설정파일은_기본_활성화하고_명시적_false를_존중한다() {
        var configured = runner.withInitializer(new ConfigDataApplicationContextInitializer())
                .withPropertyValues("spring.profiles.active=dev");
        configured.run(context -> assertThat(context).hasNotFailed().hasSingleBean(AlkkagiEngine.class));
        configured.withPropertyValues("ontop.games.alkkagi.enabled=false")
                .run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(AlkkagiEngine.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"local", "dev", "dev,db"})
    void 명시적으로_켠_개발환경은_실제엔진을_등록한다(String profiles) {
        runner.withPropertyValues("spring.profiles.active=" + profiles, "ontop.games.alkkagi.enabled=true")
                .run(context -> assertThat(context).hasNotFailed().hasSingleBean(AlkkagiEngine.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"prod,db", "production,db", "local,prod", "dev,prod", "dev,production"})
    void 운영과_혼합프로필은_등록하지_않는다(String profiles) {
        runner.withPropertyValues("spring.profiles.active=" + profiles, "ontop.games.alkkagi.enabled=true")
                .run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(AlkkagiEngine.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"local", "dev", "dev,db"})
    void 기본값과_명시적_비활성화에서는_엔진을_등록하지_않는다(String profiles) {
        runner.withPropertyValues("spring.profiles.active=" + profiles)
                .run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(AlkkagiEngine.class));
        runner.withPropertyValues("spring.profiles.active=" + profiles, "ontop.games.alkkagi.enabled=false")
                .run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(AlkkagiEngine.class));
    }
}
