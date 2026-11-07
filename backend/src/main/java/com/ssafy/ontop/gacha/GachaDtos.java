package com.ssafy.ontop.gacha;

import java.time.Instant;
import java.util.List;
import io.swagger.v3.oas.annotations.media.Schema;

public final class GachaDtos {
    private GachaDtos() { }
    @Schema(name="GachaPrize") public record Prize(int grade, int initial, int remaining, long value) { }
    @Schema(name="GachaMachine") public record Machine(String roundId, long version, int remaining, List<Prize> prizes,
                         Instant refillEndsAt) { }
    @Schema(name="GachaBox") public record Box(int grade, long quantity) { }
    @Schema(name="GachaInventory") public record Inventory(long tickets, List<Box> boxes, long balance, long availableBalance) { }
    @Schema(name="GachaProduct") public record Product(String code, String name, int grade, String compatibility, String imageKey,
                          List<Long> itemIds) { }
    @Schema(name="GachaState") public record State(boolean enabled, long ticketPrice, Machine machine, Inventory inventory,
                        List<Product> products, Instant serverNow) { }
    @Schema(name="GachaResult") public record Result(String operationId, String kind, String roundId, int grade, Product product,
                         boolean duplicate, long paidCoins, long awardedCoins, Inventory inventory,
                         Instant completedAt) { }
    @Schema(name="GachaEvent") public record Event(String eventId, Machine machine, Winner winner, Instant confirmedAt) { }
    @Schema(name="GachaWinner") public record Winner(String userId, String nickname, String winningRoundId) { }
    @Schema(name="GachaBuyRequest") public record BuyRequest(String operationId) { }
    @Schema(name="GachaDrawRequest") public record DrawRequest(String operationId,String roundId) { }
    @Schema(name="GachaOpenRequest") public record OpenRequest(String operationId,int grade) { }
}
