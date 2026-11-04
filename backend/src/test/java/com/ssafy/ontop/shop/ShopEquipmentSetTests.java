package com.ssafy.ontop.shop;

import com.ssafy.ontop.inventory.domain.UserItem;
import com.ssafy.ontop.item.domain.EquipSlot;
import com.ssafy.ontop.item.domain.Item;
import com.ssafy.ontop.item.domain.ItemType;
import com.ssafy.ontop.shop.domain.DuplicateEquipmentPolicy;
import com.ssafy.ontop.shop.domain.EquipmentChanged;
import com.ssafy.ontop.shop.dto.ItemResponse;
import com.ssafy.ontop.shop.dto.OwnedItemResponse;
import com.ssafy.ontop.shop.repository.ShopRepository;
import com.ssafy.ontop.shop.service.ShopService;
import com.ssafy.ontop.wallet.domain.Wallet;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 세트 의상(같은 set_code)은 함께 입고 벗고, 옷(상의·하의·신발)은 한 벌로 입으며, 해제는 그 부위를 기본 옷으로 돌린다. */
class ShopEquipmentSetTests {

    private final ShopRepository repository = mock(ShopRepository.class);
    private final List<EquipmentChanged> published = new ArrayList<>();
    private final List<UserItem> holdings = new ArrayList<>();
    private ShopService shop;

    @BeforeEach
    void setUp() {
        when(repository.lockWallet(101)).thenReturn(Optional.of(mock(Wallet.class)));
        when(repository.ownedForUpdate(101)).thenReturn(holdings);
        shop = new ShopService(repository, new Immediate(), event -> published.add((EquipmentChanged) event),
                DuplicateEquipmentPolicy.REJECT);
        // 1~5: 장군 세트, 6: 일반 상의, 7: 일반 머리, 8: 일반 하의
        long id = 1;
        for (EquipSlot slot : EquipSlot.values()) {
            own(id++, slot, "GENERAL");
        }
        own(6, EquipSlot.TOP, null);
        own(7, EquipSlot.HAIR, null);
        own(8, EquipSlot.BOTTOM, null);
    }

    @Test
    void 세트_한_부위를_입으면_세트_전체를_입는다() {
        shop.equip(101, 3);

        assertThat(equipped()).containsExactlyInAnyOrder(1L, 2L, 3L, 4L, 5L);
        assertThat(published).singleElement().satisfies(event -> assertThat(event.itemId()).isEqualTo(3L));
    }

    @Test
    void 세트를_입으면_그_부위의_일반_의상을_벗는다() {
        shop.equip(101, 6);
        shop.equip(101, 7);

        shop.equip(101, 1);

        assertThat(equipped()).containsExactlyInAnyOrder(1L, 2L, 3L, 4L, 5L);
    }

    @Test
    void 세트를_입은_채_일반_의상을_입으면_세트_전체를_벗는다() {
        shop.equip(101, 1);

        var response = shop.equip(101, 6);

        assertThat(equipped()).containsExactly(6L);
        assertThat(response.equipment()).extracting(OwnedItemResponse::userItemId).containsExactly(6L);
    }

    @Test
    void 세트_부위를_해제하면_세트_전체를_벗고_외형만_알린다() {
        shop.equip(101, 1);
        published.clear();

        var response = shop.unequip(101, 4);

        assertThat(equipped()).isEmpty();
        assertThat(response.equipment()).isEmpty();
        assertThat(published).singleElement().satisfies(event -> assertThat(event.itemId()).isNull());
    }

    @Test
    void 일반_의상_해제는_그_부위만_기본_옷으로_돌린다() {
        shop.equip(101, 6);
        shop.equip(101, 7);

        shop.unequip(101, 7);

        assertThat(equipped()).containsExactly(6L);
    }

    @Test
    void 입지_않은_의상_해제는_바꾸지_않고_알리지도_않는다() {
        shop.equip(101, 6);
        published.clear();

        var response = shop.unequip(101, 7);

        assertThat(equipped()).containsExactly(6L);
        assertThat(response.equipment()).extracting(OwnedItemResponse::userItemId).containsExactly(6L);
        assertThat(published).isEmpty();
    }

    @Test
    void 옷은_한_벌로_입어_다른_옷_부위를_벗기고_머리는_둔다() {
        shop.equip(101, 7);
        shop.equip(101, 8);

        shop.equip(101, 6);

        assertThat(equipped()).containsExactlyInAnyOrder(6L, 7L);
    }

    @Test
    void 옷_부위를_해제하면_옷_전체가_기본_옷으로_돌아간다() {
        shop.equip(101, 7);
        shop.equip(101, 6);

        shop.unequip(101, 6);

        assertThat(equipped()).containsExactly(7L);
    }

    @Test
    void 보유하지_않은_의상은_해제할_수_없다() {
        assertThatThrownBy(() -> shop.unequip(101, 99)).isInstanceOf(ShopException.class)
                .hasMessage("보유한 아이템이 없습니다.");
    }

    private void own(long id, EquipSlot slot, String setCode) {
        Item item = mock(Item.class);
        when(item.toItem()).thenReturn(new ItemResponse(id, "ITEM_" + id, "의상" + id, ItemType.EQUIPMENT, slot,
                10, "outfit/test/" + id, setCode));
        UserItem holding = new UserItem(101, item, 1);
        ReflectionTestUtils.setField(holding, "id", id);
        holdings.add(holding);
    }

    private List<Long> equipped() {
        return holdings.stream().filter(UserItem::equipped).map(UserItem::id).toList();
    }

    /** 바로 커밋해 afterCommit 알림을 실행하는 트랜잭션 관리자. */
    private static final class Immediate extends AbstractPlatformTransactionManager {
        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
        }
    }
}
