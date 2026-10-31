package com.ssafy.ontop.game.alkkagi.domain;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

/** 공개 경기 스냅샷과 별도로 소유자에게만 제공하는 카드 저장소. */
final class AlkkagiInventory {
    enum Type { WALL, RELOCATE, POWER_UP, GROW, SHRINK, EXTRA_SHOT, SWAP, DEFEND }
    record Card(String id, Type type) { }
    private final List<LinkedHashMap<String, Card>> hands = List.of(new LinkedHashMap<>(), new LinkedHashMap<>());

    void grant(int actor, Type type) {
        var card = new Card(UUID.randomUUID().toString(), type);
        hands.get(actor).put(card.id(), card);
    }
    Card requireCard(int actor, String id) {
        var card = hands.get(actor).get(id);
        if (card == null) throw new IllegalArgumentException("CARD_NOT_OWNED");
        return card;
    }
    void consume(int actor, String id) { hands.get(actor).remove(id); }
    List<Card> cards(int actor) { return List.copyOf(hands.get(actor).values()); }
}
