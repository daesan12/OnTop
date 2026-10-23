package com.ssafy.ontop.wallet.exception;

import org.springframework.http.HttpStatus;

public class WalletQueryException extends RuntimeException {

    public enum Error {
        INVALID_PAGE(HttpStatus.BAD_REQUEST, "WALLET_INVALID_PAGE_REQUEST", "cursor는 양수, size는 1~100이어야 합니다."),
        NOT_READY(HttpStatus.CONFLICT, "WALLET_NOT_READY", "지갑 초기화가 필요합니다."),
        STORAGE(HttpStatus.SERVICE_UNAVAILABLE, "WALLET_UNAVAILABLE", "지갑 정보를 조회할 수 없습니다.");

        private final HttpStatus status;
        private final String code;
        private final String message;

        Error(HttpStatus status, String code, String message) {
            this.status = status;
            this.code = code;
            this.message = message;
        }

        public HttpStatus status() {
            return status;
        }

        public String code() {
            return code;
        }
    }

    private final Error error;

    public WalletQueryException(Error error) {
        super(error.message);
        this.error = error;
    }

    public Error error() {
        return error;
    }
}
