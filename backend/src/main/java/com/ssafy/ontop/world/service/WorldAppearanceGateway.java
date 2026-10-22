package com.ssafy.ontop.world.service;

import java.util.List;

/** 저장된 공개 외형만 조회한다. 가격·수량·보유 레코드 ID는 광장에 노출하지 않는다. */
public interface WorldAppearanceGateway {
    List<Equipment> equipment(long userId);

    record Equipment(long itemId, String itemCode, String equipSlot, String imageKey) { }
}
