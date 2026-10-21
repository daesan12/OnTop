package com.ssafy.ontop.shop;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
@Profile("local & db")
@ConditionalOnProperty(name = "ontop.shop.enabled", havingValue = "true")
public class ShopConfiguration {
    @Bean
    ShopService shopService(JdbcTemplate jdbc, PlatformTransactionManager transactions,
            ApplicationEventPublisher events,
            @Value("${ontop.shop.duplicate-equipment-policy:}") String duplicatePolicy) {
        var policy = duplicatePolicy.isBlank() ? null
                : ShopModels.DuplicateEquipmentPolicy.valueOf(duplicatePolicy);
        return new ShopService(jdbc, transactions, events, policy);
    }
}

