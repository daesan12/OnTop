package com.ssafy.ontop.feedback.domain;

import java.text.Normalizer;

/** 소리함 FE validation.ts와 동일하게 UTF-16 코드 단위로 길이를 계산한다. */
public record FeedbackText(String value) {

    public FeedbackText {
        if (value == null || value.length() > 600) {
            throw new IllegalArgumentException("소리함 의견은 5~600자여야 합니다.");
        }
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFC);
        StringBuilder cleaned = new StringBuilder(normalized.length());
        normalized.codePoints().filter(code -> !isRemoved(code)).forEach(cleaned::appendCodePoint);
        value = trimLikeJavaScript(cleaned.toString());
        if (value.length() < 5 || value.length() > 600) {
            throw new IllegalArgumentException("소리함 의견은 5~600자여야 합니다.");
        }
    }

    private static boolean isRemoved(int code) {
        // FE는 줄바꿈·탭·CR 및 C1 영역을 보존하며 FORMAT 문자만 추가로 제거한다.
        return code <= 0x08 || code == 0x0B || code == 0x0C || code >= 0x0E && code <= 0x1F
                || code == 0x7F || Character.getType(code) == Character.FORMAT;
    }

    private static String trimLikeJavaScript(String text) {
        int start = 0;
        int end = text.length();
        while (start < end && isTrimmed(text.charAt(start))) {
            start++;
        }
        while (end > start && isTrimmed(text.charAt(end - 1))) {
            end--;
        }
        return text.substring(start, end);
    }

    private static boolean isTrimmed(char code) {
        return code >= 0x09 && code <= 0x0D || code == 0x20 || code == 0xA0 || code == 0x1680
                || code >= 0x2000 && code <= 0x200A || code == 0x2028 || code == 0x2029 || code == 0x202F
                || code == 0x205F || code == 0x3000 || code == 0xFEFF;
    }

    @Override
    public String toString() { return "FeedbackText[redacted]"; }
}
