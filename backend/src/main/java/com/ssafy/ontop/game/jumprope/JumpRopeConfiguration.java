package com.ssafy.ontop.game.jumprope;

import com.ssafy.ontop.config.RuntimeProfiles;
import java.security.SecureRandom;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.minigames.enabled", havingValue = "true")
public class JumpRopeConfiguration {
    @Bean
    JumpRopeService jumpRopeService(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        return new JumpRopeService(new JumpRopeRepository(jdbc), manager, Clock.systemUTC(), new SecureRandom());
    }
}
