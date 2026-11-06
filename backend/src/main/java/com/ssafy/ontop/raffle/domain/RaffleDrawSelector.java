package com.ssafy.ontop.raffle.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.function.IntUnaryOperator;
import java.util.function.LongPredicate;

/**
 * Each purchased ticket has one chance until its owner wins. A winning owner's
 * other tickets are removed before the next prize is selected.
 */
public final class RaffleDrawSelector {
    private final IntUnaryOperator randomIndex;

    public RaffleDrawSelector(IntUnaryOperator randomIndex) {
        this.randomIndex = randomIndex;
    }

    public Selection select(List<Ticket> purchasedTickets, int slotCount, LongPredicate excludedUser) {
        List<Ticket> eligible = new ArrayList<>();
        int excludedTickets = 0;
        for (Ticket ticket : purchasedTickets) {
            if (excludedUser.test(ticket.userId())) {
                excludedTickets++;
            } else {
                eligible.add(ticket);
            }
        }
        List<Ticket> selected = new ArrayList<>();
        while (selected.size() < slotCount && !eligible.isEmpty()) {
            int index = randomIndex.applyAsInt(eligible.size());
            if (index < 0 || index >= eligible.size()) {
                throw new IllegalStateException("추첨 난수 범위가 올바르지 않습니다.");
            }
            Ticket winner = eligible.get(index);
            selected.add(winner);
            eligible.removeIf(ticket -> ticket.userId() == winner.userId());
        }
        return new Selection(List.copyOf(selected), purchasedTickets.size(), excludedTickets);
    }

    public record Ticket(long id, long userId, int number) {}

    public record Selection(List<Ticket> winners, int candidateCount, int excludedTicketCount) {}
}
