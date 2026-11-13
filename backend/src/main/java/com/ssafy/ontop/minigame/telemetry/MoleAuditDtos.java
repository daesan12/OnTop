package com.ssafy.ontop.minigame.telemetry;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

public final class MoleAuditDtos {
    private MoleAuditDtos() {
    }

    public enum Input {
        KEYBOARD, POINTER, TOUCH
    }

    public enum Outcome {
        HIT, RAPID, MISS, DECOY, IGNORED, HONEYPOT
    }

    @Schema(name = "MoleAuditTap")
    public record Tap(int sequence, int clientAtMs, int hole, Input input, Outcome outcome, Integer spawnId,
                      Integer appearedAtMs, String targetId) {
    }

    @Schema(name = "MoleAuditBatch")
    public record Batch(List<Tap> taps) {
    }

    @Schema(name = "MoleAuditEntry")
    public record Entry(int sequence, int clientAtMs, int hole, Input input, Outcome outcome, Integer spawnId,
                        Integer appearedAtMs, Instant receivedAt) {
    }

    @Schema(name = "MoleAuditRound")
    public record Round(String roundId, String userId, Instant startedAt, String status, int observedTaps,
                        int honeypotTaps, int completionHoneypotTaps) {
    }

    @Schema(name = "MoleAuditDistribution")
    public record Distribution(int count, Integer median, Integer p10, Integer p90) {
    }

    @Schema(name = "MoleAuditComparison")
    public record Comparison(int rounds, int honeypotTaps, int completionHoneypotTaps,
                             Distribution first, Distribution rapid) {
    }

    @Schema(name = "MoleAuditDetail")
    public record Detail(Round selected, List<Entry> timeline, List<Round> recent, Comparison member,
                         Comparison reference) {
    }
}
