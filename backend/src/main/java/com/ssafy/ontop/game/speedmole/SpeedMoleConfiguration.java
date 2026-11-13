package com.ssafy.ontop.game.speedmole;

import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.config.RuntimeProfiles;
import java.security.SecureRandom;
import java.time.Clock;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import jakarta.persistence.EntityManager;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.minigames.enabled", havingValue = "true")
public class SpeedMoleConfiguration {
    @Bean SpeedMoleService speedMoleService(JdbcTemplate jdbc, PlatformTransactionManager manager,
            EntityManager entities, ObjectProvider<BehaviorLog> behaviorLogs) {
        return new SpeedMoleService(new SpeedMoleRepository(jdbc), manager, Clock.systemUTC(), new SecureRandom(),
                new SpeedMoleRewards(entities), behaviorLogs.getIfAvailable(BehaviorLog::disabled));
    }
}
