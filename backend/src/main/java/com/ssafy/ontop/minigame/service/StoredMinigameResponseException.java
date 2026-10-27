package com.ssafy.ontop.minigame.service;

import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;

/** Replays the first durable business decision without re-running game mutation. */
public final class StoredMinigameResponseException extends MinigameException {
    private final BungeoppangV4DeliveryDtos.ErrorResponse body;

    public StoredMinigameResponseException(int status, BungeoppangV4DeliveryDtos.ErrorResponse body) {
        super(status, body.code(), body.message(), body.detail(), body.index());
        this.body = body;
    }

    public BungeoppangV4DeliveryDtos.ErrorResponse body() { return body; }
}
