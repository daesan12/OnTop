package com.ssafy.ontop.shop;

import com.ssafy.ontop.inventory.domain.UserItem;
import com.ssafy.ontop.item.domain.Item;
import com.ssafy.ontop.shop.persistence.ShopPurchase;
import com.ssafy.ontop.shop.persistence.ShopRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
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
@EntityScan(basePackageClasses = {Item.class, UserItem.class, ShopPurchase.class, Wallet.class})
public class ShopConfiguration {
    @Bean
    ShopService shopService(ShopRepository repository, PlatformTransactionManager transactions,
            ApplicationEventPublisher events) {
        return new ShopService(repository, transactions, events, ShopModels.DuplicateEquipmentPolicy.REJECT);
    }
}
