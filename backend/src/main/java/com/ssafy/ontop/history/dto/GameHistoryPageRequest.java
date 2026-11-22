package com.ssafy.ontop.history.dto;

import com.ssafy.ontop.history.exception.GameHistoryException;
import java.util.Set;

public record GameHistoryPageRequest(Long cursor, int size, String gameCode) {
    public static final Set<String> GAME_CODES = Set.of("OMOK", "DICE", "ONE_CARD", "LIAR_BRIDGE", "DICE_LEDGER", "HALLI_GALLI", "DAVINCI_CODE", "ALKKAGI");

    public GameHistoryPageRequest {
        if (cursor != null && cursor <= 0) {
            throw new GameHistoryException(GameHistoryException.Error.CURSOR);
        }
        if (size < 1 || size > 100) {
            throw new GameHistoryException(GameHistoryException.Error.SIZE);
        }
        if (gameCode != null && !GAME_CODES.contains(gameCode)) {
            throw new GameHistoryException(GameHistoryException.Error.GAME);
        }
    }

    public static GameHistoryPageRequest parse(String cursor, String size, String gameCode) {
        Long after = cursor == null ? null : positive(cursor, GameHistoryException.Error.CURSOR);
        long count = size == null ? 20 : positive(size, GameHistoryException.Error.SIZE);
        if (count > 100) {
            throw new GameHistoryException(GameHistoryException.Error.SIZE);
        }
        return new GameHistoryPageRequest(after, (int) count, gameCode);
    }

    private static long positive(String value, GameHistoryException.Error error) {
        if (value.matches("[0-9]{1,19}")) {
            try {
                long number = Long.parseLong(value);
                if (number > 0) {
                    return number;
                }
            } catch (NumberFormatException exception) {
                // 입력 원문이나 내부 파싱 예외를 응답에 노출하지 않는다.
            }
        }
        throw new GameHistoryException(error);
    }
}
