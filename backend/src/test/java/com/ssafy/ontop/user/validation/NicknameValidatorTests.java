package com.ssafy.ontop.user.validation;

import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.dto.UserNicknameUpdateRequest;
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

    @ParameterizedTest
    @ValueSource(strings = {"시발", "씨발놈아", "나는병신", "개새끼야", "존나멋짐", "좆밥", "Fuck", "FUCKER", "tlqkf"})
    void 명확한_욕설_비속어를_부분_문자열과_대소문자_무관하게_거절한다(String nickname) {
        assertInappropriate(nickname);
    }

    @ParameterizedTest
    @ValueSource(strings = {"시1발", "씨8발", "병12신", "f1uck", "1시발2", "지0랄"})
    void 숫자를_끼워_넣은_단순_우회도_거절한다(String nickname) {
        assertInappropriate(nickname);
    }

    @ParameterizedTest
    @ValueSource(strings = {"시발점시발", "시발점병신", "등신대등신", "병신시발역"})
    void 허용_단어_밖에_금칙어가_더_있으면_거절한다(String nickname) {
        assertInappropriate(nickname);
    }

    @ParameterizedTest
    @ValueSource(strings = {"시발점", "시발역", "등신대", "시바견", "새끼곰", "미친존재감", "무지개새", "호로록",
            "class", "Passion", "Ashita", "Sussex", "산책자", "온탑고수", "12시발점"})
    void 정상_단어는_오탐하지_않는다(String nickname) {
        assertThatCode(() -> NicknameValidator.validate(nickname)).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"GM시발", "gm병신"})
    void GM_접두어_검사가_욕설_검사보다_먼저다(String nickname) {
        assertThatThrownBy(() -> NicknameValidator.validate(nickname)).isInstanceOfSatisfying(
                UserOnboardingException.class, error -> assertThat(error.error())
                        .isEqualTo(UserOnboardingException.Error.RESERVED_NICKNAME));
    }

    @ParameterizedTest
    @ValueSource(strings = {"시 발", "시.발", "ㅅㅂ", "ㅂㅅ"})
    void 공백_특수문자_자모_우회는_기존_형식_오류로_거절한다(String nickname) {
        assertThatThrownBy(() -> NicknameValidator.validate(nickname)).isInstanceOfSatisfying(
                UserOnboardingException.class, error -> assertThat(error.error())
                        .isEqualTo(UserOnboardingException.Error.INVALID_NICKNAME));
    }

    @ParameterizedTest
    @ValueSource(strings = {"시발", "씨1발"})
    void 온보딩과_닉네임_수정_요청과_도메인이_같은_욕설_오류를_쓴다(String nickname) {
        assertThatThrownBy(() -> new UserOnboardingRequest(nickname, CharacterGender.MALE))
                .isInstanceOfSatisfying(UserOnboardingException.class, error -> assertThat(error.error())
                        .isEqualTo(UserOnboardingException.Error.INAPPROPRIATE_NICKNAME));
        assertThatThrownBy(() -> new UserNicknameUpdateRequest(nickname))
                .isInstanceOfSatisfying(UserOnboardingException.class, error -> assertThat(error.error())
                        .isEqualTo(UserOnboardingException.Error.INAPPROPRIATE_NICKNAME));
        User user = new User(LoginProvider.NAVER, "naver-id", "산책자", CharacterGender.MALE);
        assertThatThrownBy(() -> user.changeNickname(nickname))
                .isInstanceOfSatisfying(UserOnboardingException.class, error -> assertThat(error.error())
                        .isEqualTo(UserOnboardingException.Error.INAPPROPRIATE_NICKNAME));
        assertThat(user.getNickname()).isEqualTo("산책자");
    }

    @org.junit.jupiter.api.Test
    void 이미_저장된_닉네임은_조회와_표시에서_다시_검증하지_않는다() {
        // 새 규칙은 등록·수정 요청에만 적용된다. 기존 행을 읽어 만든 엔티티는 그대로 닉네임을 돌려준다.
        User legacy = new User(LoginProvider.SSAFY, "ssafy-id", "시발", CharacterGender.FEMALE);
        assertThat(legacy.getNickname()).isEqualTo("시발");
    }

    private static void assertInappropriate(String nickname) {
        assertThatThrownBy(() -> NicknameValidator.validate(nickname)).isInstanceOfSatisfying(
                UserOnboardingException.class, error -> {
                    assertThat(error.error()).isEqualTo(UserOnboardingException.Error.INAPPROPRIATE_NICKNAME);
                    assertThat(error.error().code()).isEqualTo("USER_INAPPROPRIATE_NICKNAME");
                    assertThat(error.error().status().value()).isEqualTo(400);
                    // 응답에 금칙어 목록이나 걸린 단어를 노출하지 않는다.
                    assertThat(error.getMessage()).isEqualTo("사용할 수 없는 표현이 포함된 닉네임입니다.");
                });
    }
}
