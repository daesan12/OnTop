package com.ssafy.ontop.minigame.service;

public class MinigameException extends RuntimeException {
    private final int status;
    private final String code;
    private final String detail;
    private final Integer index;

    public MinigameException(int status, String code, String message) {
        this(status, code, message, null, null);
    }

    public MinigameException(int status, String code, String message, String detail, Integer index) {
        super(message);
        this.status = status;
        this.code = code;
        this.detail = detail;
        this.index = index;
    }

    public int status() { return status; }
    public String code() { return code; }
    public String detail() { return detail; }
    public Integer index() { return index; }
}
