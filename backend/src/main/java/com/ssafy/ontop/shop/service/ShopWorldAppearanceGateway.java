package com.ssafy.ontop.shop.service;

import com.ssafy.ontop.shop.domain.EquipmentChanged;
import com.ssafy.ontop.shop.repository.ShopRepository;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.service.WorldAppearanceGateway;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import com.ssafy.ontop.config.RuntimeProfiles;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Component
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.shop.enabled", havingValue = "true")
public class ShopWorldAppearanceGateway implements WorldAppearanceGateway {
    private final ShopRepository repository;
    private final TransactionTemplate reads;
    private final ObjectProvider<TableHub> hubs;

    public ShopWorldAppearanceGateway(ShopRepository repository, PlatformTransactionManager transactions,
            ObjectProvider<TableHub> hubs) {
        this.repository = repository;
        this.hubs = hubs;
        reads = new TransactionTemplate(transactions);
        reads.setReadOnly(true);
        reads.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        reads.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    }

    @Override
    public List<Equipment> equipment(long userId) {
        return reads.execute(status -> repository.equipped(userId).stream().map(holding -> {
            var item = holding.toOwnedItem().item();
            return new Equipment(item.itemId(), item.itemCode(), item.equipSlot().name(), item.imageKey());
        }).toList());
    }

    @EventListener
    public void equipmentCommitted(EquipmentChanged event) {
        TableHub hub = hubs.getIfAvailable();
        if (hub != null) {
            hub.refreshAppearance(event.userId());
        }
    }
}
