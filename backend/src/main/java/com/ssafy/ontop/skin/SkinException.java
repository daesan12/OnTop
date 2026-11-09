package com.ssafy.ontop.skin;

public class SkinException extends RuntimeException {
    private final int status;
    private final String code;
    public SkinException(int status, String code, String message) { super(message); this.status=status; this.code=code; }
    public int status() { return status; }
    public String code() { return code; }
    static SkinException invalid(String message) { return new SkinException(400,"SKIN_INVALID_REQUEST",message); }
}
