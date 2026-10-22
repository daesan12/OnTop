package com.ssafy.ontop.user.dto;

import com.ssafy.ontop.user.domain.CharacterGender;

public record UserProfileResponse(long userId, String nickname, CharacterGender characterGender) {
}
