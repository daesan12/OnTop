package com.ssafy.ontop.game.start;

import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** 예약과 활성화가 같은 실행 주체를 사용한다. 이 식별자는 다른 실행 주체의 사망 증명이 아니다. */
@Component
@Profile("db")
public class GameRuntimeIdentity {
    private final String instanceId;
    private final UUID bootId = UUID.randomUUID();

    public GameRuntimeIdentity(@Value("${GAME_INSTANCE_ID:single-instance}") String instanceId) {
        if (instanceId == null || !instanceId.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new IllegalArgumentException("경기 실행 인스턴스 설정을 확인하세요.");
        }
        this.instanceId = instanceId;
    }

    public String instanceId() { return instanceId; }
    public UUID bootId() { return bootId; }
}
