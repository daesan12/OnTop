package com.ssafy.ontop.game.halligalli.domain;

// id는 경기 안에서 카드 한 장을 구분한다. 기본 덱은 0~55, 벌칙 추가 발행 카드는 56부터 쓴다.
public record FruitCard(int id, FruitType fruit, int count) {

    public FruitCard {
        if (id < 0 || fruit == null || count < 1 || count > 5) {
            throw new IllegalArgumentException("과일 카드 값을 확인해주세요.");
        }
    }
}
