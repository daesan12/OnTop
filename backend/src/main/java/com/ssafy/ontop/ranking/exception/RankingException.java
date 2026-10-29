package com.ssafy.ontop.ranking.exception;

public class RankingException extends RuntimeException {
    public enum Error {
        INVALID_LIMIT(400, "INVALID_LIMIT", "limit는 1~100 사이의 정수여야 합니다."),
        STORAGE(503, "RANKING_UNAVAILABLE", "랭킹 정보를 조회할 수 없습니다.");

        private final int status;
        private final String code;
        private final String message;

        Error(int status, String code, String message) {
            this.status = status;
            this.code = code;
            this.message = message;
        }

        public int status() {
            return status;
        }

        public String code() {
            return code;
        }
    }

    private final Error error;

    public RankingException(Error error) {
        super(error.message);
        this.error = error;
    }

    public Error error() {
        return error;
    }
}
