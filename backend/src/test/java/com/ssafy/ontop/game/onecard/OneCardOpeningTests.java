package com.ssafy.ontop.game.onecard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.onecard.domain.ForfeitHandPolicy;
import com.ssafy.ontop.game.onecard.service.OneCardEngine;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OneCardOpeningTests {
    @Test
    void 분배_중에는_입력을_거절하고_분배_완료_뒤_첫_차례_30초를_보장한다() {
        var at = Instant.parse("2026-11-01T00:00:00Z");
        var now = new AtomicReference<>(at);
        Clock clock = new Clock() {
            @Override public ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        var mapper = new ObjectMapper();
        var engine = new OneCardEngine(mapper, clock, ignored -> { }, new GameEngineRouter(),
                cards -> { }, count -> 0, ForfeitHandPolicy.REMOVE, true);
        engine.create("opening", "table", List.of(101L, 202L));
        var state = engine.load(101, "opening").orElseThrow();
        Instant until = Instant.parse(state.publicState().path("dealEndsAt").asText());
        var command = new GameActionCommand(101, "opening", "draw", 0, mapper.valueToTree(Map.of("kind", "draw")));

        assertThat(until).isEqualTo(at.plusMillis(2_655));
        assertThat(Instant.parse(state.publicState().path("turnDeadline").asText())).isEqualTo(until.plusSeconds(30));
        assertThatThrownBy(() -> engine.apply(command)).isInstanceOf(Rejected.class);
        assertThat(engine.load(101, "opening").orElseThrow().version()).isZero();
        engine.create("opening", "table", List.of(101L, 202L));
        assertThat(engine.load(101, "opening").orElseThrow().publicState().path("dealEndsAt").asText())
                .isEqualTo(until.toString());

        now.set(until);
        engine.apply(command);

        assertThat(engine.load(101, "opening").orElseThrow().version()).isOne();
    }
}
