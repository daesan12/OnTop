package com.ssafy.ontop.notes.service;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** 유형별 HMAC으로 회원 제한 행과 접수 행을 직접 연결할 수 없게 한다. 비밀키는 전 인스턴스 공통이다. */
public final class NotePrivacy {
    private final byte[] secret;

    public NotePrivacy(String secret) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    public String digest(String type, String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal((type + ":" + value).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("익명 메모 식별정보 처리 실패", exception);
        }
    }
}
