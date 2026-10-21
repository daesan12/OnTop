package com.ssafy.ontop.game.onecard.domain;

import java.util.ArrayList;
import java.util.List;

public record OneCard(String id, String suit, String rank) {
    public static final List<String> SUITS = List.of("hearts", "diamonds", "clubs", "spades");
    public static List<OneCard> deck() {
        List<OneCard> cards = new ArrayList<>();
        for (String suit : SUITS) {
            for (String rank : List.of("A","2","3","4","5","6","7","8","9","10","J","Q","K")) {
                cards.add(new OneCard(suit + "-" + rank, suit, rank));
            }
        }
        cards.add(new OneCard("joker-black", null, "joker-black"));
        cards.add(new OneCard("joker-color", null, "joker-color"));
        return cards;
    }
    public boolean joker() { return suit == null; }
    public boolean initial() { return List.of("4","5","6","8","9","10").contains(rank); }
    public int attack() {
        return switch (rank) {
            case "2" -> 2;
            case "A" -> suit.equals("spades") ? 5 : 3;
            case "joker-black" -> 5;
            case "joker-color" -> 7;
            default -> 0;
        };
    }
    public boolean canPlay(OneCard top, String activeSuit, int attackTotal, OneCard lastAttack) {
        if (attackTotal == 0) { return joker() || rank.equals(top.rank) || suit.equals(activeSuit); }
        return switch (lastAttack.rank) {
            case "2" -> rank.equals("2") || joker()
                    || (rank.equals("A") || rank.equals("3")) && java.util.Objects.equals(suit, lastAttack.suit);
            case "A" -> lastAttack.suit.equals("spades") ? joker() : rank.equals("A") || joker();
            case "joker-black" -> rank.equals("joker-color");
            default -> false;
        };
    }
}
