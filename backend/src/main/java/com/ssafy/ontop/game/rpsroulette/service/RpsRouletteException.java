package com.ssafy.ontop.game.rpsroulette.service;

public class RpsRouletteException extends RuntimeException {
    private final int status;
    private final String code;

    public RpsRouletteException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public int status() {
        return status;
    }

    public String code() {
        return code;
    }
}
