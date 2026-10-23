package com.ssafy.ontop.user.dto;

import com.ssafy.ontop.user.domain.CharacterGender;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(requiredProperties = {"userId", "nickname", "characterGender"})
public record UserProfileResponse(
        @Schema(description = "내부 회원 ID", example = "1") long userId,
        @Schema(example = "미지") String nickname,
        @Schema(example = "FEMALE") CharacterGender characterGender) {
}
