package com.ssafy.ontop.game.skewer.coop.domain;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/** 대기 방의 표시 정보와 비밀번호. 해시는 공개 상태나 결과에 포함하지 않는다. */
public final class SkewerCoopRoomAccess {
    public static final class PasswordRejected extends IllegalArgumentException {
        private final boolean limited;
        public PasswordRejected(boolean limited) {
            super(limited ? "비밀번호를 여러 번 확인했어요. 30초 후 다시 시도해주세요." : "비밀번호가 맞지 않아요.");
            this.limited = limited;
        }
        public String code() { return limited ? "SKEWER_COOP_PASSWORD_THROTTLED" : "SKEWER_COOP_PASSWORD_INVALID"; }
    }
    private static final BCryptPasswordEncoder PASSWORDS = new BCryptPasswordEncoder();
    private final String name;
    private final String hostNickname;
    private final String passwordHash;

    public SkewerCoopRoomAccess(String name, String hostNickname, String password) {
        if (name == null || name.isBlank() || name.strip().length() > 24
                || name.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("가게 이름은 1~24자로 입력해주세요.");
        }
        validatePassword(password);
        this.name = name.strip();
        this.hostNickname = hostNickname;
        this.passwordHash = password.isEmpty() ? null : PASSWORDS.encode(password);
    }

    public static void validatePassword(String password) {
        if (password == null || !password.isEmpty() && !password.matches("[A-Za-z0-9]{4,20}")) {
            throw new IllegalArgumentException("비밀번호는 영문·숫자 4~20자로 입력해주세요.");
        }
    }

    public String name() { return name; }
    public String hostNickname() { return hostNickname; }
    public boolean locked() { return passwordHash != null; }
    public boolean accepts(String password) {
        return passwordHash == null || PASSWORDS.matches(password, passwordHash);
    }
}
