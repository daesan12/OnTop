package com.ssafy.ontop.world.winter.community;

public final class WinterCommunityException extends RuntimeException {
    private final int status;
    private final String code;

    public WinterCommunityException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public int status() { return status; }
    public String code() { return code; }
}
