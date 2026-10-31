package com.ssafy.ontop.game.skewer.service;

public class SkewerAdmissionException extends RuntimeException {
    private final int status;
    private final String code;

    public SkewerAdmissionException(int status, String code, String message) {
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
