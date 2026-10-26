package com.ssafy.ontop.minigame.dto;

import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

/** Wire DTOs for the v4 delivery approval and durable recovery contract. */
public final class BungeoppangV4DeliveryDtos {
    private BungeoppangV4DeliveryDtos() {
    }

    @Schema(name = "BungeoppangV4Action")
    public record Action(int seq, String action, int t, Integer slot, String filling,
            Long breadId, String orderId, String deliveryKey) {
    }

    @Schema(name = "BungeoppangV4DeliveryRequest")
    public record Request(String rulesVersion, int throughSeq, String prefixHash, List<Action> log) {
    }

    @Schema(name = "BungeoppangV4DeliveryResponse")
    public record Response(String minigameSessionId, String deliveryKey, String orderId,
            boolean accepted, Instant acceptedAt, int throughSeq, String prefixHash,
            List<Long> consumedBreadIds, long scoreDelta, long bonusDelta,
            BungeoppangV4Responses.Order nextOrder, BungeoppangV4Responses.Checkpoint checkpoint) {
    }

    @Schema(name = "BungeoppangV4DeliveryLookup")
    public record Lookup(String deliveryKey, String outcome, Integer httpStatus, JsonNode response) {
    }

    @Schema(name = "BungeoppangV4Recovery")
    public record Recovery(String action, String minigameSessionId, long checkpointRevision,
            int acceptedThroughSeq, String acceptedPrefixHash) {
    }

    @Schema(name = "BungeoppangV4ErrorResponse")
    public record ErrorResponse(String code, String message, Object details, String detail,
            Integer index, Recovery recovery, Long retryAfterMs) {
    }
}
