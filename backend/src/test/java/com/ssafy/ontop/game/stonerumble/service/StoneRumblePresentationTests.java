package com.ssafy.ontop.game.stonerumble.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.state.GameStateChanged;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class StoneRumblePresentationTests {
    @Test
    void 입력_시작과_발사는_사십밀리초_내_묶어_공개하고_작은_조향은_전송을_늘리지_않는다() {
        var mapper = new ObjectMapper();
        var clock = new TestClock();
        var events = new ArrayList<Object>();
        var engine = new StoneRumbleEngine(mapper, clock, events::add, new GameEngineRouter());
        engine.create("game", "table", List.of(101L, 202L));
        for (long id : List.of(101L, 202L)) {
            engine.apply(new GameActionCommand(id, "game", "ready-" + id,
                    engine.load(id, "game").orElseThrow().version(),
                    mapper.createObjectNode().put("kind", "scene_ready").put("ready", true)));
        }
        clock.now = 4200;
        engine.tick();
        events.clear();
        var input = mapper.createObjectNode().put("kind", "control").put("seq", 1)
                .put("x", 1).put("z", 0).put("aimX", 0).put("aimZ", 1)
                .put("jump", false).put("fire", true).put("slide", false);
        engine.apply(new GameActionCommand(101, "game", "fire",
                engine.load(101, "game").orElseThrow().version(), input));
        clock.now = 4220;
        engine.tick();
        assertThat(events).isEmpty();
        clock.now = 4240;
        engine.tick();
        assertThat(events.stream().filter(GameStateChanged.class::isInstance)).hasSize(1);
        assertThat(engine.load(101, "game").orElseThrow().publicState().path("pigeons")).hasSize(1);
        engine.apply(new GameActionCommand(101, "game", "same-direction",
                engine.load(101, "game").orElseThrow().version(), input.deepCopy().put("seq", 2).put("fire", false)));
        clock.now = 4260;
        engine.apply(new GameActionCommand(101, "game", "small-turn",
                engine.load(101, "game").orElseThrow().version(),
                input.deepCopy().put("seq", 3).put("z", .01).put("fire", false)));
        clock.now = 4280;
        engine.tick();
        assertThat(events.stream().filter(GameStateChanged.class::isInstance)).hasSize(1);
        clock.now = 4340;
        engine.tick();
        assertThat(events.stream().filter(GameStateChanged.class::isInstance)).hasSize(2);
    }

    private static final class TestClock extends Clock {
        long now;
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(now); }
    }
}
