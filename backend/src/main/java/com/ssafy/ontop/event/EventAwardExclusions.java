package com.ssafy.ontop.event;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.regex.Pattern;

/** Reviewed member IDs that must not receive an event prize (for example, confirmed automation). */
public final class EventAwardExclusions {
    private static final Pattern GAME_CODE = Pattern.compile("[A-Z][A-Z0-9_]{1,23}");

    private EventAwardExclusions() {}

    public static Set<Long> parse(String value) {
        return parseIds(value, "EVENT_AWARD_EXCLUDED_USER_IDS");
    }

    /** Parses game-scoped exclusions such as MG_MOLE:10,20;MG_SPEED_MOLE:30. */
    public static Map<String, Set<Long>> parseByGame(String value) {
        if (value == null || value.isBlank()) {
            return Map.of();
        }
        try {
            Map<String, Set<Long>> exclusions = new LinkedHashMap<>();
            for (String entry : value.split(";")) {
                String trimmed = entry.trim();
                int separator = trimmed.indexOf(':');
                if (separator <= 0 || separator == trimmed.length() - 1) {
                    throw new IllegalArgumentException("게임 코드와 회원 ID 목록이 필요합니다.");
                }
                String gameCode = trimmed.substring(0, separator).trim();
                if (!GAME_CODE.matcher(gameCode).matches() || exclusions.containsKey(gameCode)) {
                    throw new IllegalArgumentException("게임 코드를 확인하세요.");
                }
                exclusions.put(gameCode, parseIds(trimmed.substring(separator + 1),
                        "MINIGAME_AWARD_EXCLUDED_USER_IDS"));
            }
            return Map.copyOf(exclusions);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(
                    "MINIGAME_AWARD_EXCLUDED_USER_IDS 형식을 확인하세요. 예: MG_MOLE:10,20;MG_SPEED_MOLE:30",
                    exception);
        }
    }

    private static Set<Long> parseIds(String value, String variableName) {
        if (value == null || value.isBlank()) {
            return Set.of();
        }
        try {
            Set<Long> ids = Arrays.stream(value.split(","))
                    .map(String::trim)
                    .filter(token -> !token.isEmpty())
                    .map(Long::parseLong)
                    .collect(Collectors.toUnmodifiableSet());
            if (ids.isEmpty() || ids.stream().anyMatch(id -> id <= 0)) {
                throw new IllegalArgumentException("이벤트 제외 회원은 양수 ID여야 합니다.");
            }
            return ids;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException(variableName + " 형식을 확인하세요.", exception);
        }
    }
}
