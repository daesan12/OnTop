package com.ssafy.ontop.user.validation;

import com.ssafy.ontop.user.exception.UserOnboardingException;
import java.util.regex.Pattern;

public final class NicknameValidator {

    private static final Pattern FORMAT = Pattern.compile("[가-힣A-Za-z0-9]{2,8}");

    private NicknameValidator() {
    }

    public static void validate(String nickname) {
        if (nickname == null || !FORMAT.matcher(nickname).matches()) {
            throw new UserOnboardingException(UserOnboardingException.Error.INVALID_NICKNAME);
        }
    }
}
