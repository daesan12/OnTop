package com.ssafy.ontop.notes.service;

import java.time.Instant;

public final class NoteException extends RuntimeException {
    private final int status;
    private final String code;
    private final Instant nextAllowedAt;

    public NoteException(int status, String code, String message) {
        this(status, code, message, null);
    }

    public NoteException(int status, String code, String message, Instant nextAllowedAt) {
        super(message);
        this.status = status;
        this.code = code;
        this.nextAllowedAt = nextAllowedAt;
    }

    public int status() { return status; }
    public String code() { return code; }
    public Instant nextAllowedAt() { return nextAllowedAt; }
}
