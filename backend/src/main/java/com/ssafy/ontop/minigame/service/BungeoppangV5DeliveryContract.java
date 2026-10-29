package com.ssafy.ontop.minigame.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.minigame.dto.BungeoppangV4CompleteDtos;
import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;
import java.util.List;

/**
 * Strict v5 log parser and prefix hash. The action tuple and per-action fields are the v4 wire format;
 * only the version, log limit and hash seed {@code BUNGEOPPANG/v5} differ.
 */
public final class BungeoppangV5DeliveryContract {
    /** A 3600-action log does not fit the v4 256 KiB limit. */
    public static final int MAX_BODY_BYTES = 1024 * 1024;

    private BungeoppangV5DeliveryContract() {
    }

    public static BungeoppangV4DeliveryDtos.Request parse(JsonNode body) {
        return BungeoppangV4DeliveryContract.parse(body, BungeoppangV5Spec.RULES_VERSION,
                BungeoppangV5Spec.rules().maxLogEntries());
    }

    public static BungeoppangV4CompleteDtos.Request parseComplete(JsonNode body) {
        return BungeoppangV4DeliveryContract.parseComplete(body, BungeoppangV5Spec.RULES_VERSION,
                BungeoppangV5Spec.rules().maxLogEntries());
    }

    public static List<BungeoppangV4Rules.Action> domainActions(List<BungeoppangV4DeliveryDtos.Action> actions) {
        return BungeoppangV4DeliveryContract.domainActions(actions);
    }

    public static String prefixHash(long sessionId, String configVersion,
            List<BungeoppangV4DeliveryDtos.Action> actions) {
        return BungeoppangV4DeliveryContract.prefixHash(BungeoppangV5Spec.RULES_VERSION, sessionId,
                configVersion, actions);
    }
}
