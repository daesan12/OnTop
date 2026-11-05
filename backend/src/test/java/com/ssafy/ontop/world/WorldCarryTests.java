package com.ssafy.ontop.world;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldMapProperties;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorldCarryTests {
    @Test
    void 게임_관전_시설_수영_거리와_다른채널을_양쪽에_검사한다() throws Exception {
        for (String user : List.of("a", "b")) {
            for (String activity : List.of("MINIGAME", "BOARD", "WATCH", "SEAT", "SWIM", "CHANNEL", "RANGE", "UI")) {
                try (var pair = pair()) {
                    var registry = pair.registry();
                    switch (activity) {
                        case "MINIGAME" -> registry.minigameActivity(user, 1, Duration.ofSeconds(60));
                        case "BOARD" -> registry.boardGames(Map.of(user, "game"));
                        case "WATCH" -> registry.gameWatches(Map.of(user, new WorldChannelRegistry.GameWatch("game", "table")));
                        case "SEAT" -> registry.tableSeats("one", Map.of(user, new WorldChannelRegistry.TableSeat("table", 1)));
                        case "SWIM" -> registry.move(user, new WorldChannelRegistry.Position(1, 0, .84, 78, 0, false, false, true));
                        case "CHANNEL" -> { registry.leave(user); registry.join(user, "two"); }
                        case "RANGE" -> registry.move(user, new WorldChannelRegistry.Position(1, 10, .84, 78, 0));
                        case "UI" -> registry.interactionBusy(user, true);
                        default -> throw new IllegalStateException();
                    }
                    assertThatThrownBy(() -> registry.pickup("a", "b")).as(user + activity)
                            .isInstanceOf(WorldChannelRegistry.ChannelException.class);
                }
            }
        }
    }

    @Test
    void 미니게임_시작이_겹치면_운반을_해제하고_늦은_던지기를_거절한다() throws Exception {
        try (var pair = pair()) {
            var registry = pair.registry();
            registry.pickup("a", "b");
            String carryId = registry.carryState("a").carryId();

            registry.minigameActivity("b", 1, Duration.ofSeconds(60));

            assertThat(registry.carryState("a")).isNull();
            assertThat(registry.carryState("b")).isNull();
            assertThatThrownBy(() -> registry.throwCarried("a", carryId, 1, 0, 0))
                    .isInstanceOf(WorldChannelRegistry.ChannelException.class);
        }
    }

    private Pair pair() throws Exception {
        var properties = new WorldChannelProperties(List.of(new WorldChannelProperties.Channel("one", "하나", 3),
                new WorldChannelProperties.Channel("two", "둘", 3)));
        var runtime = WorldMapRuntime.load(new WorldMapProperties(WorldMapProperties.Source.GENERATED,
                "../frontend/generated/park/server-map.json", "../frontend/generated/park/manifest.json", true), properties);
        var time = new AtomicLong();
        var registry = new WorldChannelRegistry(properties, Duration.ofNanos(1), time::incrementAndGet, runtime.scene());
        registry.join("a", "one");
        registry.join("b", "one");
        registry.move("a", new WorldChannelRegistry.Position(0, 0, .84, 78, 0));
        registry.move("b", new WorldChannelRegistry.Position(0, 1, .84, 78, 0));
        return new Pair(registry);
    }

    private record Pair(WorldChannelRegistry registry) implements AutoCloseable {
        @Override
        public void close() { registry.clear(); }
    }
}
