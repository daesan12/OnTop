package com.ssafy.ontop.event.asset;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.event.EventAwardExclusions;
import java.time.Clock;
import java.time.LocalDate;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods = false)
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.event.asset.enabled", havingValue = "true")
public class AssetAwardConfiguration {
    @Bean
    AssetAwardRepository assetAwardRepository(JdbcTemplate jdbc) {
        return new AssetAwardRepository(jdbc);
    }

    @Bean
    AssetAwardService assetAwardService(AssetAwardRepository repository,
            AdminAccessPolicy administrators, PlatformTransactionManager transactions,
            @Qualifier("oauthClock") Clock clock,
            @Value("${ASSET_AWARD_WEEK:2026-11-09}") String eventWeek,
            @Value("${EVENT_AWARD_EXCLUDED_USER_IDS:}") String excludedUserIds) {
        return new AssetAwardService(repository, administrators, transactions,
                clock, LocalDate.parse(eventWeek), EventAwardExclusions.parse(excludedUserIds));
    }

    @Bean
    @ConditionalOnProperty(name = "ontop.event.asset.auto-enabled", havingValue = "true")
    AssetAwardScheduler assetAwardScheduler(AssetAwardService awards) {
        return new AssetAwardScheduler(awards);
    }
}
