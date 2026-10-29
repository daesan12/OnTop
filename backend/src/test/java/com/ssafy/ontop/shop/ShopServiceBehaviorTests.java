package com.ssafy.ontop.shop;

import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.domain.PositionSample;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.inventory.domain.UserItem;
import com.ssafy.ontop.item.domain.Item;
import com.ssafy.ontop.item.domain.ItemType;
import com.ssafy.ontop.shop.domain.DuplicateEquipmentPolicy;
import com.ssafy.ontop.shop.domain.ShopPurchase;
import com.ssafy.ontop.shop.dto.ItemResponse;
import com.ssafy.ontop.shop.dto.PurchaseResponse;
import com.ssafy.ontop.shop.repository.ShopRepository;
import com.ssafy.ontop.shop.service.ShopService;
import com.ssafy.ontop.wallet.domain.Wallet;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ShopServiceBehaviorTests {

    private final List<BehaviorEvent> events = new ArrayList<>();
    private final ShopRepository repository = mock(ShopRepository.class);
    private final CommitSwitch transactions = new CommitSwitch();
    private ShopService shop;

    @BeforeEach
    void setUp() {
        Wallet wallet = mock(Wallet.class);
        when(wallet.id()).thenReturn(1L);
        when(wallet.balance()).thenReturn(100L);
        when(repository.lockWallet(101)).thenReturn(Optional.of(wallet));
        Item item = mock(Item.class);
        when(item.toItem()).thenReturn(new ItemResponse(7, "TEA", "차", ItemType.CONSUMABLE, null, 10, "tea"));
        when(repository.saleItem(7)).thenReturn(Optional.of(item));
        when(repository.holding(101, 7)).thenReturn(Optional.empty());
        when(repository.receipt(101, "key-1")).thenReturn(Optional.empty());
        doAnswer(invocation -> {
            if (invocation.getArgument(0) instanceof UserItem holding) {
                ReflectionTestUtils.setField(holding, "id", 5L);
            }
            return null;
        }).when(repository).persist(any());
        shop = new ShopService(repository, transactions, event -> { }, DuplicateEquipmentPolicy.REJECT,
                new CapturingLog());
    }

    @Test
    void 새_구매는_커밋된_뒤에_한_번_기록한다() {
        PurchaseResponse purchase = shop.purchase(101, 7, 2, "key-1");

        assertThat(events).singleElement().satisfies(event -> {
            assertThat(event.type()).isEqualTo(BehaviorEventType.SHOP_PURCHASED);
            assertThat(event.userId()).isEqualTo(101L);
            assertThat(event.props())
                    .containsEntry("itemId", 7L)
                    .containsEntry("quantity", 2)
                    .containsEntry("purchaseId", purchase.purchaseId());
        });
    }

    @Test
    void 같은_구매_키_재요청은_기존_영수증만_돌려주고_기록하지_않는다() {
        PurchaseResponse saved = new PurchaseResponse("purchase-1", 7, 2, 10, 20, 80, 5);
        ShopPurchase receipt = mock(ShopPurchase.class);
        when(receipt.toPurchase()).thenReturn(saved);
        when(repository.receipt(101, "key-1")).thenReturn(Optional.of(receipt));

        assertThat(shop.purchase(101, 7, 2, "key-1")).isEqualTo(saved);

        assertThat(events).isEmpty();
    }

    @Test
    void 커밋이_실패하면_기록하지_않는다() {
        transactions.failCommit = true;

        assertThatThrownBy(() -> shop.purchase(101, 7, 2, "key-1")).isInstanceOf(IllegalStateException.class);

        assertThat(events).isEmpty();
    }

    private final class CapturingLog implements BehaviorLog {
        @Override
        public void record(Supplier<BehaviorEvent> event) {
            events.add(event.get());
        }

        @Override
        public void recordPosition(Supplier<PositionSample> sample) {
        }
    }

    /** 실제 동기화 콜백(afterCommit)을 실행하는 최소 트랜잭션 관리자. */
    private static final class CommitSwitch extends AbstractPlatformTransactionManager {
        private boolean failCommit;

        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            if (failCommit) {
                throw new IllegalStateException("커밋 실패");
            }
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
        }
    }
}
