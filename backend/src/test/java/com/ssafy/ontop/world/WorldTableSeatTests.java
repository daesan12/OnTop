package com.ssafy.ontop.world;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChannelRegistry.TableSeat;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class WorldTableSeatTests {
    @Test
    void 좌표가_고정돼도_좌석_변경은_버전을_올리고_방송하며_같은_좌석은_반복하지_않는다() throws Exception {
        AtomicLong clock = new AtomicLong();
        var registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("a", "A", 4),
                new WorldChannelProperties.Channel("b", "B", 4))), Duration.ofMillis(50), clock::get);
        registry.join("user", "a");
        registry.join("other", "b");
        var before = registry.worldState("a");
        long otherVersion = registry.worldState("b").version();
        registry.tableSeats("a", Map.of("user", new TableSeat("table-a", 4),
                "other", new TableSeat("table-b", 1)));
        var seated = registry.worldState("a");
        assertThat(seated.version()).isEqualTo(before.version() + 1);
        assertThat(seated.avatars().getFirst().tableSeat()).isEqualTo(new TableSeat("table-a", 4));
        assertThat(before.avatars().getFirst().tableSeat()).isNull();
        assertThat(registry.worldState("b").version()).isEqualTo(otherVersion);
        clock.set(100_000_000L);
        var patches = registry.advance(Set.of("user", "other"));
        var patch = patches.stream().filter(world -> world.channelId().equals("a")).findFirst().orElseThrow();
        assertThat(patch.avatars().getFirst().position()).isEqualTo(before.avatars().getFirst().position());
        registry.tableSeats("a", Map.of("user", new TableSeat("table-a", 4)));
        assertThat(registry.worldState("a").version()).isEqualTo(seated.version());

        registry.tableSeats("a", Map.of());
        var standing = registry.worldState("a");
        assertThat(standing.version()).isEqualTo(seated.version() + 1);
        var json = new ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_NULL).valueToTree(standing);
        assertThat(json.at("/avatars/0").has("tableSeat")).isTrue();
        assertThat(json.at("/avatars/0/tableSeat").isNull()).isTrue();
        registry.disconnect("user");
        registry.join("user", "a");
        assertThat(registry.worldState("a").avatars().getFirst().tableSeat()).isNull();
        registry.clear();
    }
}
