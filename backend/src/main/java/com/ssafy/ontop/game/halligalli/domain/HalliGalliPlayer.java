package com.ssafy.ontop.game.halligalli.domain;

import java.util.ArrayDeque;
import java.util.Collection;
import java.util.List;

// 소유 경기의 잠금 안에서만 변경한다. drawPile 앞쪽이 다음에 공개할 카드, faceUpPile 뒤쪽이 맨 위 카드다.
final class HalliGalliPlayer {
    private final long userId;
    private final ArrayDeque<FruitCard> drawPile = new ArrayDeque<>();
    private final ArrayDeque<FruitCard> faceUpPile = new ArrayDeque<>();
    private boolean eliminated;

    HalliGalliPlayer(long userId, List<FruitCard> cards) {
        this.userId = userId;
        drawPile.addAll(cards);
    }

    long userId() {
        return userId;
    }

    int drawCount() {
        return drawPile.size();
    }

    int faceUpCount() {
        return faceUpPile.size();
    }

    int cardCount() {
        return drawPile.size() + faceUpPile.size();
    }

    FruitCard topCard() {
        return faceUpPile.peekLast();
    }

    boolean isEliminated() {
        return eliminated;
    }

    boolean canFlip() {
        return !eliminated && !drawPile.isEmpty();
    }

    void flip() {
        faceUpPile.addLast(drawPile.removeFirst());
    }

    void receiveBottom(Collection<FruitCard> cards) {
        drawPile.addAll(cards);
    }

    // 벌칙은 뒷면 더미 맨 위부터 낸다. 공개 더미는 종 판정에 쓰이므로 건드리지 않는다.
    FruitCard payPenalty() {
        return drawPile.pollFirst();
    }

    List<FruitCard> surrenderFaceUp() {
        List<FruitCard> cards = List.copyOf(faceUpPile);
        faceUpPile.clear();
        return cards;
    }

    void eliminate() {
        eliminated = true;
    }
}
