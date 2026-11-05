package com.ssafy.ontop.user.validation;

import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.dto.UserOnboardingRequest;
import com.ssafy.ontop.user.exception.UserOnboardingException;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NicknameValidatorTests {

    @ParameterizedTest
    @ValueSource(strings = {"가나", "가나다라마바사아", "OnTop123", "AB", "가A1", "게임GM", "온탑GM"})
    void 두_API가_같은_정상_형식을_허용한다(String nickname) {
        assertThatCode(() -> NicknameValidator.validate(nickname)).doesNotThrowAnyException();
        assertThatCode(() -> new UserOnboardingRequest(nickname, CharacterGender.MALE)).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "가", "123456789", "가 나", " OnTop", "OnTop ", "가!", "😀😀", "ㄱㄴ", "éé"})
    void 두_API가_같은_오류로_잘못된_형식을_거절한다(String nickname) {
        assertThatThrownBy(() -> NicknameValidator.validate(nickname)).isInstanceOfSatisfying(
                UserOnboardingException.class, error -> assertThat(error.error())
                        .isEqualTo(UserOnboardingException.Error.INVALID_NICKNAME));
        assertThatThrownBy(() -> new UserOnboardingRequest(nickname, CharacterGender.MALE))
                .isInstanceOf(UserOnboardingException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"GM", "gm123", "Gm관리자", "gM사칭"})
    void GM으로_시작하는_닉네임을_대소문자와_무관하게_거절한다(String nickname) {
        assertThatThrownBy(() -> NicknameValidator.validate(nickname)).isInstanceOfSatisfying(
                UserOnboardingException.class, error -> assertThat(error.error())
                        .isEqualTo(UserOnboardingException.Error.RESERVED_NICKNAME));
        assertThatThrownBy(() -> new UserOnboardingRequest(nickname, CharacterGender.MALE))
                .isInstanceOf(UserOnboardingException.class);
    }
}
