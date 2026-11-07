package com.ssafy.ontop.shop.config;

import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.inventory.domain.UserItem;
import com.ssafy.ontop.item.domain.Item;
import com.ssafy.ontop.shop.domain.DuplicateEquipmentPolicy;
import com.ssafy.ontop.shop.domain.ShopPurchase;
import com.ssafy.ontop.shop.repository.ShopRepository;
import com.ssafy.ontop.shop.service.ShopService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import com.ssafy.ontop.config.RuntimeProfiles;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.shop.enabled", havingValue = "true")
@EntityScan(basePackageClasses = {Item.class, UserItem.class, ShopPurchase.class})
public class ShopConfiguration {
    @Bean
    ShopService shopService(ShopRepository repository, PlatformTransactionManager transactions,
            ApplicationEventPublisher events, BehaviorLog behaviorLog,
            org.springframework.beans.factory.ObjectProvider<com.ssafy.ontop.gacha.GachaRepository> products) {
        var service = new ShopService(repository, transactions, events, DuplicateEquipmentPolicy.REJECT, behaviorLog);
        service.configureProductBundles(() -> {
            var catalog = products.getIfAvailable();
            return catalog == null ? java.util.Map.of() : catalog.bundles();
        });
        return service;
    }
}
