package com.ssafy.ontop.game.result.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.result.GameFinished;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

/** 새 오목 이벤트를 기존 저장 입구에서 받아주는지 검사한다. DB 지급 성공 검사가 아니다. */
class OmokAgreedDrawContractTests {
    @Test void 실제엔진의합의무승부이벤트가기존저장검증을통과한다() throws Exception {
        var mapper=new ObjectMapper();var events=new ArrayList<Object>();
        var engine=new OmokEngine(mapper,Clock.fixed(Instant.parse("2026-11-03T00:00:00Z"),ZoneOffset.UTC),events::add);
        engine.create("42","table",101,202);
        engine.apply(new GameActionCommand(101,"42","draw",0,mapper.readTree("{\"kind\":\"drawRequest\"}")));
        engine.apply(new GameActionCommand(202,"42","yes",1,mapper.readTree("{\"kind\":\"drawRespond\",\"requestId\":\"draw\",\"accept\":true}")));
        var event=events.stream().filter(GameFinished.class::isInstance).map(GameFinished.class::cast).findFirst().orElseThrow();
        assertThat(VerifiedGameFinish.validate(event)).isEqualTo(42);
        assertThat(VerifiedGameFinish.invalid(event)).isFalse();
    }
    @Test void 합의무승부에승자나탈락자를끼워넣은결과는거절한다() {
        var event=new GameFinished("42:finished","42","table","OMOK",2,
                List.of(new GameFinished.Participant(101,GameFinished.Result.WIN,null,null),
                        new GameFinished.Participant(202,GameFinished.Result.LOSE,null,null)),
                "AGREED_DRAW",Instant.parse("2026-11-03T00:00:00Z"));
        assertThatThrownBy(()->VerifiedGameFinish.validate(event)).isInstanceOf(IllegalArgumentException.class);
    }
}
