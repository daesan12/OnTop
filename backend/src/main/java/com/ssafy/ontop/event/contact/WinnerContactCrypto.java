package com.ssafy.ontop.event.contact;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Ciphertext is a fresh 12-byte nonce followed by AES-GCM ciphertext and tag. */
public final class WinnerContactCrypto {
    private static final int NONCE_LENGTH = 12;
    private static final int TAG_BITS = 128;
    private final Map<String, SecretKeySpec> keys;
    private final String activeKeyId;
    private final SecureRandom random;

    public WinnerContactCrypto(String activeKeyId, String configuredKeys) {
        this(activeKeyId, configuredKeys, new SecureRandom());
    }

    WinnerContactCrypto(String activeKeyId, String configuredKeys, SecureRandom random) {
        this.random = Objects.requireNonNull(random);
        if (activeKeyId == null || !activeKeyId.matches("[A-Za-z0-9._-]{1,80}")) {
            throw new IllegalArgumentException("연락처 암호화 활성 키 ID를 설정해야 합니다.");
        }
        this.activeKeyId = activeKeyId;
        Map<String, SecretKeySpec> parsed = new HashMap<>();
        if (configuredKeys == null || configuredKeys.isBlank()) {
            throw new IllegalArgumentException("연락처 암호화 키를 설정해야 합니다.");
        }
        for (String entry : configuredKeys.split(",")) {
            int separator = entry.indexOf('=');
            if (separator <= 0 || separator == entry.length() - 1) {
                throw new IllegalArgumentException("연락처 암호화 키 설정 형식이 잘못되었습니다.");
            }
            String id = entry.substring(0, separator).trim();
            if (!id.matches("[A-Za-z0-9._-]{1,80}") || parsed.containsKey(id)) {
                throw new IllegalArgumentException("연락처 암호화 키 ID가 유효하지 않습니다.");
            }
            byte[] raw;
            try {
                raw = Base64.getDecoder().decode(entry.substring(separator + 1).trim());
            } catch (IllegalArgumentException exception) {
                throw new IllegalArgumentException("연락처 암호화 키 형식이 잘못되었습니다.");
            }
            if (raw.length != 32) {
                throw new IllegalArgumentException("연락처 암호화 키는 32바이트여야 합니다.");
            }
            parsed.put(id, new SecretKeySpec(raw, "AES"));
            Arrays.fill(raw, (byte) 0);
        }
        if (!parsed.containsKey(activeKeyId)) {
            throw new IllegalArgumentException("활성 연락처 암호화 키가 키 목록에 없습니다.");
        }
        this.keys = Map.copyOf(parsed);
    }

    public String activeKeyId() {
        return activeKeyId;
    }

    public byte[] encrypt(long userId, LocalDate week, String phone) {
        byte[] nonce = new byte[NONCE_LENGTH];
        random.nextBytes(nonce);
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, keys.get(activeKeyId), new GCMParameterSpec(TAG_BITS, nonce));
            cipher.updateAAD(aad(userId, week));
            byte[] encrypted = cipher.doFinal(phone.getBytes(StandardCharsets.US_ASCII));
            byte[] result = Arrays.copyOf(nonce, nonce.length + encrypted.length);
            System.arraycopy(encrypted, 0, result, nonce.length, encrypted.length);
            return result;
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("연락처 암호화에 실패했습니다.", exception);
        }
    }

    public String decrypt(long userId, LocalDate week, String keyId, byte[] encrypted) {
        SecretKeySpec key = keys.get(keyId);
        if (key == null || encrypted == null || encrypted.length <= NONCE_LENGTH + TAG_BITS / 8) {
            throw new IllegalStateException("연락처 복호화 키나 암호문이 유효하지 않습니다.");
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key,
                    new GCMParameterSpec(TAG_BITS, encrypted, 0, NONCE_LENGTH));
            cipher.updateAAD(aad(userId, week));
            return new String(cipher.doFinal(encrypted, NONCE_LENGTH,
                    encrypted.length - NONCE_LENGTH), StandardCharsets.US_ASCII);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("연락처 복호화에 실패했습니다.", exception);
        }
    }

    private byte[] aad(long userId, LocalDate week) {
        return (userId + ":" + week).getBytes(StandardCharsets.US_ASCII);
    }
}
