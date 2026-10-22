package com.ssafy.ontop.shop;

import com.ssafy.ontop.shop.persistence.ShopItem;
import com.ssafy.ontop.shop.persistence.ShopRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
@Profile("local & db")
@ConditionalOnProperty(name = "ontop.shop.enabled", havingValue = "true")
@EntityScan(basePackageClasses = {ShopItem.class, Wallet.class})
public class ShopConfiguration {
    @Bean
    ShopService shopService(ShopRepository repository, PlatformTransactionManager transactions,
            ApplicationEventPublisher events,
            @Value("${ontop.shop.duplicate-equipment-policy:}") String duplicatePolicy) {
        var policy = duplicatePolicy.isBlank() ? null
                : ShopModels.DuplicateEquipmentPolicy.valueOf(duplicatePolicy);
        return new ShopService(repository, transactions, events, policy);
    }
}
