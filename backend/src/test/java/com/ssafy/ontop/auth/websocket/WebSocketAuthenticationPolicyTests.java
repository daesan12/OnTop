package com.ssafy.ontop.auth.websocket;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class WebSocketAuthenticationPolicyTests {
    private final WebApplicationContextRunner context = new WebApplicationContextRunner()
            .withUserConfiguration(WebSocketAuthenticationPolicy.class);

    @Test
    void 비인증은_명시적인_local과_허용된_개발보조_프로필에서만_시작한다() {
        for (String profiles : List.of("local", "local,db", "local,visual-test", "local,db,visual-test")) {
            context.withPropertyValues("spring.profiles.active=" + profiles, "ontop.websocket.authenticated=false")
                    .run(application -> assertThat(application).hasNotFailed());
        }
    }

    @Test
    void 비local과_local운영혼합_프로필은_비인증으로_시작하지_못한다() {
        for (String profiles : List.of("", "dev", "prod", "test", "local,dev", "local,prod", "LOCAL")) {
            context.withPropertyValues("spring.profiles.active=" + profiles, "ontop.websocket.authenticated=false")
                    .run(application -> assertThat(application).hasFailed()
                            .getFailure().hasRootCauseInstanceOf(IllegalStateException.class)
                            .hasStackTraceContaining("명시적인 local 개발 환경"));
        }
    }

    @Test
    void 기본값은_local과_비local_모두_인증_활성이다() {
        for (String profiles : List.of("local", "dev", "prod")) {
            context.withPropertyValues("spring.profiles.active=" + profiles)
                    .run(application -> assertThat(application).hasNotFailed());
        }
    }
}
