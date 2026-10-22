package com.ssafy.ontop.auth.websocket;

import java.util.Arrays;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class WebSocketAuthenticationPolicy {

    public WebSocketAuthenticationPolicy(@Value("${ontop.websocket.authenticated:true}") boolean authenticated,
            Environment environment) {
        Set<String> active = Set.copyOf(Arrays.asList(environment.getActiveProfiles()));
        if (!authenticated && (!active.contains("local")
                || !Set.of("local", "db", "visual-test").containsAll(active))) {
            throw new IllegalStateException("WebSocket 비인증 모드는 명시적인 local 개발 환경에서만 허용됩니다.");
        }
    }
}
