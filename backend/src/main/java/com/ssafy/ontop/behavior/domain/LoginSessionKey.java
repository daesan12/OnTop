package com.ssafy.ontop.behavior.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * 로그인 계열(sid)을 행동 로그에 남길 때 쓰는 키. 인증 쪽이 sid 원문을 로그에서 가리므로 원문 대신 해시를 저장한다.
 * 같은 sid는 항상 같은 키가 되어 한 로그인 동안의 이벤트를 묶을 수 있다.
 */
public final class LoginSessionKey {

    private static final int KEY_LENGTH = 32;

    private LoginSessionKey() {
    }

    public static String of(String sessionId) {
        if (sessionId == null) {
            return null;
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(sessionId.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest).substring(0, KEY_LENGTH);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 지원이 필요합니다.", exception);
        }
    }
}
