package com.ssafy.ontop.ranking.exception;

public final class BungeoppangRankingException extends RuntimeException {
    private final int status;
    private final String code;
    public BungeoppangRankingException(int status, String code, String message) {
        super(message); this.status = status; this.code = code;
    }
    public int status() { return status; }
    public String code() { return code; }
}
