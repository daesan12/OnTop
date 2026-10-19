package com.ssafy.ontop.game.reconnect;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

// 실제 경기 담당이 구현한다. 로비 상태나 시작 검증 결과를 경기 상태로 대신하지 않는다.
public interface GameRecoveryGateway {

    // 해당 계정이 볼 수 있는 최신 상태만 반환한다. 턴·시간을 초기화하거나 정지하지 않는다.
    Optional<GameRecoverySnapshot> load(long userId);

    // eventId 기준 멱등 처리. 해당 경기/참가자가 아직 진행 중일 때만 반영한다.
    // 이미 끝난 경기에는 아무 변경도 하지 않으며, 실제 판정·정산은 경기 담당 책임이다.
    void graceExpired(GraceExpiration command);

    record GraceExpiration(UUID eventId, long userId, String gameId, Instant disconnectedAt,
            Instant deadline, Action action) {
    }

    enum Action {
        FORFEIT, ELIMINATE
    }
}
