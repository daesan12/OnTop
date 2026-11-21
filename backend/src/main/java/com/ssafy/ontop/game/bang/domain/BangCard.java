package com.ssafy.ontop.game.bang.domain;

import java.util.ArrayList;
import java.util.List;

/** 카드 식별자는 경기 안에서 불변이다. 손패 식별자는 소유자에게만 전송한다. */
public record BangCard(String id, Kind kind, Suit suit, int rank) {
    public enum Suit { HEARTS, DIAMONDS, CLUBS, SPADES }

    public enum Kind {
        BANG, MISSED, BEER, SALOON, DUEL, INDIANS, GATLING, STAGECOACH, WELLS_FARGO,
        GENERAL_STORE, PANIC, CAT_BALOU, BARREL, JAIL, DYNAMITE, MUSTANG, SCOPE,
        VOLCANIC, SCHOFIELD, REMINGTON, REV_CARABINE, WINCHESTER;

        public int range() {
            return switch (this) {
                case VOLCANIC -> 1;
                case SCHOFIELD -> 2;
                case REMINGTON -> 3;
                case REV_CARABINE -> 4;
                case WINCHESTER -> 5;
                default -> 0;
            };
        }

        public boolean equipment() {
            return range() > 0 || switch (this) {
                case BARREL, JAIL, DYNAMITE, MUSTANG, SCOPE -> true;
                default -> false;
            };
        }
    }

    public BangCard {
        if (id == null || id.isBlank() || kind == null || suit == null || rank < 2 || rank > 14) {
            throw new IllegalArgumentException("총잡이 카드 정보를 확인해주세요.");
        }
    }

    public boolean hearts() { return suit == Suit.HEARTS; }

    public boolean explodes() { return suit == Suit.SPADES && rank >= 2 && rank <= 9; }

    public static List<BangCard> deck() {
        List<BangCard> cards = new ArrayList<>();
        add(cards, Kind.BANG, Suit.DIAMONDS, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14);
        add(cards, Kind.BANG, Suit.CLUBS, 2, 3, 4, 5, 6, 7, 8, 9);
        add(cards, Kind.BANG, Suit.HEARTS, 12, 13, 14);
        add(cards, Kind.BANG, Suit.SPADES, 14);
        add(cards, Kind.MISSED, Suit.SPADES, 2, 3, 4, 5, 6, 7, 8);
        add(cards, Kind.MISSED, Suit.CLUBS, 10, 11, 12, 13, 14);
        add(cards, Kind.BEER, Suit.HEARTS, 6, 7, 8, 9, 10, 11);
        add(cards, Kind.PANIC, Suit.HEARTS, 11, 12, 14);
        add(cards, Kind.PANIC, Suit.DIAMONDS, 8);
        add(cards, Kind.CAT_BALOU, Suit.HEARTS, 13);
        add(cards, Kind.CAT_BALOU, Suit.DIAMONDS, 9, 10, 11);
        add(cards, Kind.DUEL, Suit.DIAMONDS, 12);
        add(cards, Kind.DUEL, Suit.SPADES, 11);
        add(cards, Kind.DUEL, Suit.CLUBS, 8);
        add(cards, Kind.INDIANS, Suit.DIAMONDS, 13, 14);
        add(cards, Kind.STAGECOACH, Suit.SPADES, 9, 9);
        add(cards, Kind.GENERAL_STORE, Suit.CLUBS, 9);
        add(cards, Kind.GENERAL_STORE, Suit.SPADES, 12);
        add(cards, Kind.SALOON, Suit.HEARTS, 5);
        add(cards, Kind.WELLS_FARGO, Suit.HEARTS, 3);
        add(cards, Kind.GATLING, Suit.HEARTS, 10);
        add(cards, Kind.BARREL, Suit.SPADES, 12, 13);
        add(cards, Kind.JAIL, Suit.SPADES, 10, 11);
        add(cards, Kind.JAIL, Suit.HEARTS, 4);
        add(cards, Kind.DYNAMITE, Suit.HEARTS, 2);
        add(cards, Kind.MUSTANG, Suit.HEARTS, 8, 9);
        add(cards, Kind.SCOPE, Suit.SPADES, 14);
        add(cards, Kind.VOLCANIC, Suit.SPADES, 10);
        add(cards, Kind.VOLCANIC, Suit.CLUBS, 10);
        add(cards, Kind.SCHOFIELD, Suit.CLUBS, 11, 12);
        add(cards, Kind.SCHOFIELD, Suit.SPADES, 13);
        add(cards, Kind.REMINGTON, Suit.CLUBS, 13);
        add(cards, Kind.REV_CARABINE, Suit.CLUBS, 14);
        add(cards, Kind.WINCHESTER, Suit.SPADES, 8);
        return cards;
    }

    private static void add(List<BangCard> cards, Kind kind, Suit suit, int... ranks) {
        for (int rank : ranks) {
            cards.add(new BangCard("b" + (cards.size() + 1), kind, suit, rank));
        }
    }
}
