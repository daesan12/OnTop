package com.ssafy.ontop.game.jumprope;

final class JumpRopeException extends RuntimeException {
    private final int status;
    private final String code;

    JumpRopeException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    int status() { return status; }
    String code() { return code; }
}
