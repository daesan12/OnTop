package com.ssafy.ontop.shop.domain;

/** itemId는 행동 로그용이다. 외형 동기화는 userId만 사용한다. */
public record EquipmentChanged(long userId, Long itemId) {

    public EquipmentChanged(long userId) {
        this(userId, null);
    }
}
