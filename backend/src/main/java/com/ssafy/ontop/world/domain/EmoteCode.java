package com.ssafy.ontop.world.domain;

public record EmoteCode(String value) {

    public EmoteCode {
        if (value == null || !value.matches("[A-Z][A-Z0-9_]{0,31}")) {
            throw new IllegalArgumentException("감정표현 코드를 확인해주세요.");
        }
    }
}
