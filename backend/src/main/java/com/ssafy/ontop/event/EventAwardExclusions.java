package com.ssafy.ontop.event;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/** Reviewed member IDs that must not receive an event prize (for example, confirmed automation). */
public final class EventAwardExclusions {
    private EventAwardExclusions() {}

    public static Set<Long> parse(String value) {
        if (value == null || value.isBlank()) {
            return Set.of();
        }
        try {
            Set<Long> ids = Arrays.stream(value.split(","))
                    .map(String::trim)
                    .filter(token -> !token.isEmpty())
                    .map(Long::parseLong)
                    .collect(Collectors.toUnmodifiableSet());
            if (ids.stream().anyMatch(id -> id <= 0)) {
                throw new IllegalArgumentException("이벤트 제외 회원은 양수 ID여야 합니다.");
            }
            return ids;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("EVENT_AWARD_EXCLUDED_USER_IDS 형식을 확인하세요.", exception);
        }
    }
}
