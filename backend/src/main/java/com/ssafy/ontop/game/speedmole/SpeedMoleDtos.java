package com.ssafy.ontop.game.speedmole;

import java.time.Instant;
import java.util.List;
import io.swagger.v3.oas.annotations.media.Schema;

public final class SpeedMoleDtos {
    private SpeedMoleDtos() { }
    @Schema(name = "SpeedMoleRound")
    public record Round(String id, long seed, int rulesVersion, Instant serverNow, Instant startedAt, int durationMs) { }
    @Schema(name = "SpeedMoleComplete")
    public record Complete(List<SpeedMoleRules.Tap> taps) { }
    @Schema(name = "SpeedMoleResult")
    public record Result(String id, int rulesVersion, int score, int hits, int misses, Instant completedAt) { }
    @Schema(name = "SpeedMoleRankingItem")
    public record Item(long rank, String userId, String nickname, int score, int hits, int misses, Instant completedAt) { }
    @Schema(name = "SpeedMoleRankings")
    public record Rankings(int rulesVersion, String period, Instant updatedAt, long totalParticipants,
                           int offset, int limit, List<Item> items, Item me, boolean hasMore) { }
}
