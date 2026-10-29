package com.ssafy.ontop.history.exception;

public class GameHistoryException extends RuntimeException {
    private final Error error;

    public GameHistoryException(Error error) {
        super(error.message());
        this.error = error;
    }

    public Error error() {
        return error;
    }

    public enum Error {
        CURSOR(400, "INVALID_CURSOR", "cursor는 양수 경기 ID여야 합니다."),
        SIZE(400, "INVALID_SIZE", "size는 1~100이어야 합니다."),
        GAME(400, "UNSUPPORTED_GAME", "지원하지 않는 게임 코드입니다."),
        STORAGE(503, "HISTORY_UNAVAILABLE", "경기 내역을 조회할 수 없습니다.");

        private final int status;
        private final String code;
        private final String message;

        Error(int status, String code, String message) {
            this.status = status;
            this.code = code;
            this.message = message;
        }

        public int status() { return status; }
        public String code() { return code; }
        public String message() { return message; }
    }
}
