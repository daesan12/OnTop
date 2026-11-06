package com.ssafy.ontop.raffle.domain;

import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RaffleDrawSelectorTests {
    @Test
    void 당첨자는_남은_응모권이_제외되고_GM_응모권도_추첨하지_않는다() {
        var selector = new RaffleDrawSelector(bound -> 0);
        var tickets = List.of(
                new RaffleDrawSelector.Ticket(1, 10, 101),
                new RaffleDrawSelector.Ticket(2, 10, 102),
                new RaffleDrawSelector.Ticket(3, 99, 103),
                new RaffleDrawSelector.Ticket(4, 20, 104));

        var result = selector.select(tickets, 8, userId -> userId == 99);

        assertThat(result.winners()).extracting(RaffleDrawSelector.Ticket::id).containsExactly(1L, 4L);
        assertThat(result.candidateCount()).isEqualTo(4);
        assertThat(result.excludedTicketCount()).isOne();
    }
}
