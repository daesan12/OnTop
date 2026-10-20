package com.ssafy.ontop.world.domain;

public record ChatText(String value) {

    public ChatText {
        if (value == null || value.codePoints().anyMatch(code -> Character.isISOControl(code)
                || code == 0x2028 || code == 0x2029
                || (code >= 0xD800 && code <= 0xDFFF))) {
            throw new IllegalArgumentException("한 줄의 일반 텍스트가 필요합니다.");
        }
        value = value.strip();
        if (value.isBlank() || value.codePointCount(0, value.length()) > 200) {
            throw new IllegalArgumentException("채팅은 1~200자여야 합니다.");
        }
    }
}
