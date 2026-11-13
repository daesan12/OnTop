package com.ssafy.ontop.game.mole.config;

import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.mole.domain.MoleRound;
import com.ssafy.ontop.game.mole.repository.MoleRepository;
import com.ssafy.ontop.game.mole.service.MoleService;
import jakarta.persistence.EntityManager;
import java.security.SecureRandom;
import java.time.Clock;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.minigames.enabled", havingValue = "true")
@EntityScan(basePackageClasses = MoleRound.class)
public class MoleConfiguration {
    @Bean
    MoleService moleService(EntityManager entities, PlatformTransactionManager manager,
            ObjectProvider<BehaviorLog> behaviorLogs) {
        return new MoleService(new MoleRepository(entities), manager, Clock.systemUTC(), new SecureRandom(),
                behaviorLogs.getIfAvailable(BehaviorLog::disabled));
    }
}
