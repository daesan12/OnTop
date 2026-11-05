package com.ssafy.ontop.user.validation;

import com.ssafy.ontop.user.exception.UserOnboardingException;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

public final class NicknameValidator {

    private static final Pattern FORMAT = Pattern.compile("[가-힣A-Za-z0-9]{2,8}");
    private static final String RESERVED_GAME_MASTER_PREFIX = "GM";
    private static final Pattern WORD = Pattern.compile("[가-힣a-z0-9]+");
    private static final Pattern DIGITS = Pattern.compile("[0-9]");
    private static final List<String> FORBIDDEN = load("/nickname/forbidden-words.txt");
    private static final List<String> ALLOWED = load("/nickname/allowed-words.txt");

    private NicknameValidator() {
    }

    public static void validate(String nickname) {
        if (nickname == null || !FORMAT.matcher(nickname).matches()) {
            throw new UserOnboardingException(UserOnboardingException.Error.INVALID_NICKNAME);
        }
        if (nickname.regionMatches(true, 0, RESERVED_GAME_MASTER_PREFIX, 0,
                RESERVED_GAME_MASTER_PREFIX.length())) {
            throw new UserOnboardingException(UserOnboardingException.Error.RESERVED_NICKNAME);
        }
        if (containsForbiddenWord(nickname)) {
            throw new UserOnboardingException(UserOnboardingException.Error.INAPPROPRIATE_NICKNAME);
        }
    }

    /**
     * 형식 검증을 통과한 닉네임만 받는다. 영문은 소문자로 비교하고, 숫자를 끼워 넣은 단순 우회(시1발)를 막기 위해
     * 숫자를 뺀 형태도 함께 검사한다. 금칙어 등장 위치가 허용 단어(시발점 등) 안에 완전히 포함될 때만 예외로 본다.
     * 허용 단어 밖에 금칙어가 하나라도 더 있으면(시발점시발) 거절한다.
     */
    static boolean containsForbiddenWord(String nickname) {
        String lower = nickname.toLowerCase(Locale.ROOT);
        if (hasUncoveredForbiddenWord(lower)) {
            return true;
        }
        String withoutDigits = DIGITS.matcher(lower).replaceAll("");
        return !withoutDigits.equals(lower) && hasUncoveredForbiddenWord(withoutDigits);
    }

    private static boolean hasUncoveredForbiddenWord(String value) {
        for (String word : FORBIDDEN) {
            for (int at = value.indexOf(word); at >= 0; at = value.indexOf(word, at + 1)) {
                if (!coveredByAllowedWord(value, at, at + word.length())) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean coveredByAllowedWord(String value, int start, int end) {
        for (String allowed : ALLOWED) {
            for (int at = value.indexOf(allowed); at >= 0 && at <= start; at = value.indexOf(allowed, at + 1)) {
                if (at + allowed.length() >= end) {
                    return true;
                }
            }
        }
        return false;
    }

    // 목록 누락·형식 오류는 기동 실패로 드러낸다. 조용히 필터 없이 동작하지 않는다.
    private static List<String> load(String resource) {
        InputStream stream = NicknameValidator.class.getResourceAsStream(resource);
        if (stream == null) {
            throw new IllegalStateException("닉네임 단어 목록을 찾을 수 없습니다: " + resource);
        }
        List<String> words = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String word = line.strip();
                if (word.isEmpty() || word.startsWith("#")) {
                    continue;
                }
                word = word.toLowerCase(Locale.ROOT);
                if (!WORD.matcher(word).matches()) {
                    throw new IllegalStateException("닉네임 단어 목록 형식 오류: " + resource);
                }
                words.add(word);
            }
        } catch (IOException exception) {
            throw new IllegalStateException("닉네임 단어 목록을 읽을 수 없습니다: " + resource, exception);
        }
        return List.copyOf(words);
    }
}
