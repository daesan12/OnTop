package com.ssafy.ontop.game.rpsroulette.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(requiredProperties = {"fee"})
public record RpsRouletteStartRequest(@Schema(allowableValues = {"10", "20", "30"}) Integer fee) {
}
