package com.ssafy.ontop.game.result.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.alkkagi.service.AlkkagiEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.UUID;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.assertThat;

/** 밀리초보다 정밀한 실제 시계에서도 종료 이벤트가 DB 수신 검증을 통과해야 한다. */
class AlkkagiDepartureTimestampTests {
    @ParameterizedTest
    @ValueSource(strings={"EXPLICIT_LEAVE","DISCONNECT_TIMEOUT","LOGOUT","MEMBER_DEACTIVATED"})
    void 이탈과_종료는_같은_밀리초_판정시각을_사용한다(String reason) {
        Instant now=Instant.parse("2026-11-02T03:00:00.123456789Z");
        var router=new GameEngineRouter();
        var events=new ArrayList<Object>();
        var engine=new AlkkagiEngine(new ObjectMapper(),Clock.fixed(now,ZoneOffset.UTC),events::add,router);
        engine.create("7","table",101,202);
        if(reason.equals("EXPLICIT_LEAVE")) {
            router.forfeit(new GameForfeitCommand(101,"7","quit"));
        } else {
            router.graceExpired(new GameRecoveryGateway.GraceExpiration(UUID.randomUUID(),101,"7",
                    now.minusSeconds(30),now,GameRecoveryGateway.Action.FORFEIT,GameDepartureReason.valueOf(reason)));
        }
        var finished=(GameFinished)events.stream().filter(GameFinished.class::isInstance).findFirst().orElseThrow();
        assertThat(VerifiedGameFinish.validate(finished)).isEqualTo(7);
        assertThat(finished.participants().getFirst().result()).isEqualTo(GameFinished.Result.FORFEIT);
        assertThat(finished.participants().getFirst().leftAt()).isEqualTo(finished.endedAt());
        assertThat(finished.participants().getLast().result()).isEqualTo(GameFinished.Result.WIN);
    }
}
