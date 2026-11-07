package com.ssafy.ontop.event.asset;

final class AssetAwardException extends RuntimeException {
    private final int status;
    private final String code;

    AssetAwardException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    int status() { return status; }
    String code() { return code; }
}
