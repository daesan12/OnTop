package com.ssafy.ontop.game.rpsroulette.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/** {@code seq}는 화면이 본 판 순번이다. 이미 지난 순번은 다시 적용하지 않고 현재 상태를 돌려준다. */
@Schema(requiredProperties = {"seq"})
public record RpsRouletteActionRequest(Integer seq,
        @Schema(allowableValues = {"ROCK", "SCISSORS", "PAPER"}, description = "hands 요청에서만 사용") String hand) {
}
