package com.ssafy.ontop.game.skewer.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(requiredProperties = {"id", "game", "fee", "availableBalance"})
public record SkewerAdmissionResponse(String id, String game, int fee, long availableBalance) {
}
