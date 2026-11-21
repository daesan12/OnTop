package com.ssafy.ontop.game.quoridor.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.engine.GameEngineGateways;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.quoridor.service.QuoridorEngine;
import java.security.SecureRandom;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@ConditionalOnProperty(name = "ontop.games.quoridor.enabled", havingValue = "true", matchIfMissing = true)
@Import(GameEngineGateways.class)
public class QuoridorConfiguration {
    @Bean
    QuoridorEngine quoridorEngine(ObjectMapper mapper, ApplicationEventPublisher events, GameEngineRouter router) {
        return new QuoridorEngine(mapper, Clock.systemUTC(), events::publishEvent, router, new SecureRandom());
    }
}
