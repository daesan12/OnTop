package com.ssafy.ontop.game.halligalli.domain;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.random.RandomGenerator;

public final class HalliGalliDeck {
    public static final int STANDARD_SIZE = 56;

    // 과일 개수 1~5개짜리 카드의 과일별 장수. 56장·과일 4종×14장은 확인했고,
    // 개수별 분포(5·3·3·2·1)는 공식 룰북 대조 전이라 이 표 한 곳에서만 바꾼다.
    private static final List<Integer> COPIES_BY_COUNT = List.of(5, 3, 3, 2, 1);
    private static final List<FruitCard> STANDARD = build();

    private HalliGalliDeck() {
    }

    public static List<FruitCard> standard() {
        return STANDARD;
    }

    public static List<FruitCard> shuffled(RandomGenerator random) {
        List<FruitCard> cards = new ArrayList<>(STANDARD);
        Collections.shuffle(cards, random);
        return cards;
    }

    // 좌석 순서로 한 장씩 돌린다. 56장이 나누어떨어지지 않으면(3인 19·19·18) 앞 좌석이 한 장 더 받는다.
    public static List<List<FruitCard>> deal(List<FruitCard> cards, int playerCount) {
        if (cards == null || playerCount < 2 || playerCount > 4) {
            throw new IllegalArgumentException("배분할 카드와 참가 인원을 확인해주세요.");
        }
        List<List<FruitCard>> hands = new ArrayList<>();
        for (int seat = 0; seat < playerCount; seat++) {
            hands.add(new ArrayList<>());
        }
        for (int index = 0; index < cards.size(); index++) {
            hands.get(index % playerCount).add(cards.get(index));
        }
        return hands.stream().map(List::copyOf).toList();
    }

    // 벌칙 부족분은 기본 덱 56장 중 한 장을 균등하게 골라 같은 과일·개수로 새로 발행한다.
    public static FruitCard issue(int sequence, RandomGenerator random) {
        if (sequence < 0 || random == null) {
            throw new IllegalArgumentException("추가 발행 순번을 확인해주세요.");
        }
        FruitCard template = STANDARD.get(random.nextInt(STANDARD_SIZE));
        return new FruitCard(STANDARD_SIZE + sequence, template.fruit(), template.count());
    }

    private static List<FruitCard> build() {
        List<FruitCard> cards = new ArrayList<>();
        for (FruitType fruit : FruitType.values()) {
            for (int count = 1; count <= COPIES_BY_COUNT.size(); count++) {
                for (int copy = 0; copy < COPIES_BY_COUNT.get(count - 1); copy++) {
                    cards.add(new FruitCard(cards.size(), fruit, count));
                }
            }
        }
        if (cards.size() != STANDARD_SIZE) {
            throw new IllegalStateException("할리갈리 기본 덱은 56장이어야 합니다.");
        }
        return List.copyOf(cards);
    }
}
