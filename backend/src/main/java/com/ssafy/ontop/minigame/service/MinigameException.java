package com.ssafy.ontop.minigame.service;

public class MinigameException extends RuntimeException {
    private final int status;
    private final String code;

    public MinigameException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public int status() { return status; }
    public String code() { return code; }
}
