package com.ssafy.ontop.world;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class WorldPublicTablesActivityTests {
    @Test void 의자설정변경은_이동하지않은사용자의_승인좌표와입력순번을덮어쓰지않는다() {
        var registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("one", "하나", 4))));
        try {
            registry.join("101", "one");
            var approved = new WorldChannelRegistry.Position(100, 1, .8, 0, 0);
            registry.move("101", approved);
            registry.tables("one", List.of(new WorldChannelRegistry.PublicTable("table", "table-5", 3)));
            assertThat(registry.worldState("one").avatars().getFirst().position()).isEqualTo(approved);
        } finally { registry.clear(); }
    }

    @Test void 공개테이블과게임활동은_채널별전체상태로_늦은입장과복귀에도유지된다() {
        var registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("one", "하나", 4),
                new WorldChannelProperties.Channel("two", "둘", 4))));
        try {
            registry.tables("one", List.of(new WorldChannelRegistry.PublicTable("server-table", "table-5", 4)));
            registry.join("101", "one"); registry.join("102", "two");
            registry.boardGames(Map.of("101", "game-1"));
            registry.join("103", "one");
            assertThat(registry.worldState("one").tables().getFirst().chairCount()).isEqualTo(4);
            assertThat(registry.worldState("two").tables()).isEmpty();
            assertThat(registry.worldState("one").avatars().getFirst().activity()).isEqualTo("GAME");
            assertThat(registry.worldState("two").avatars().getFirst().activity()).isNull();
            registry.disconnect("101"); registry.join("101", "one");
            assertThat(registry.worldState("one").avatars().stream().filter(a -> a.userId().equals("101"))
                    .findFirst().orElseThrow().activity()).isEqualTo("GAME");
            registry.boardGames(Map.of());
            assertThat(registry.worldState("one").avatars()).allSatisfy(a -> assertThat(a.activity()).isNull());
            registry.minigameActivity("103", 10, Duration.ofSeconds(60));
            assertThat(registry.worldState("one").avatars().stream().filter(a -> a.userId().equals("103"))
                    .findFirst().orElseThrow().activity()).isEqualTo("BUNGEOPPANG");
        } finally { registry.clear(); }
    }
}
