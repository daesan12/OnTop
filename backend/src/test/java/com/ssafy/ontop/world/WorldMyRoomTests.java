package com.ssafy.ontop.world;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorldMyRoomTests {
    private WorldChannelRegistry registry() {
        return new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("one", "하나", 4),
                new WorldChannelProperties.Channel("two", "둘", 4))));
    }
    @Test void 마이룸은_채널내_표시만_바꾸고_중복요청_퇴장_재접속을_정리한다() {
        var r = registry();
        try {
            assertThatThrownBy(() -> r.myRoom("101", true)).hasMessageContaining("입장");
            r.join("101", "one"); r.join("202", "two");
            var before = r.positionOf("101");
            long version = r.myRoom("101", true).version();
            assertThat(r.worldState("one").avatars().getFirst().myRoomOpen()).isTrue();
            assertThat(r.worldState("one").avatars().getFirst().activity()).isNull();
            assertThat(r.worldState("two").avatars().getFirst().activity()).isNull();
            assertThat(r.myRoom("101", true).version()).isEqualTo(version);
            r.join("102", "one");
            assertThat(r.worldState("one").avatars().getFirst().myRoomOpen()).isTrue();
            assertThat(r.positionOf("101")).isEqualTo(before);
            r.myRoom("101", false);
            assertThat(r.worldState("one").avatars().getFirst().myRoomOpen()).isNull();
            assertThat(r.worldState("one").avatars().getFirst().activity()).isNull();
            r.myRoom("101", true); r.disconnect("101"); r.join("101", "one");
            assertThat(r.worldState("one").avatars()).allSatisfy(a -> assertThat(a.myRoomOpen()).isNull());
            r.myRoom("101", true); r.leave("101"); r.join("101", "two");
            assertThat(r.worldState("two").avatars()).allSatisfy(a -> assertThat(a.myRoomOpen()).isNull());
        } finally { r.clear(); }
    }
    @Test void 경기_관전_조리_착석은_마이룸_표시를_대체하고_종료후_되살리지않는다() {
        var r = registry();
        try {
            r.join("101", "one");
            r.myRoom("101", true); r.boardGames(Map.of("101", "game"));
            assertThatThrownBy(() -> r.myRoom("101", true)).hasMessageContaining("활동");
            r.boardGames(Map.of());
            assertThat(r.worldState("one").avatars().getFirst().activity()).isNull();
            assertThat(r.worldState("one").avatars().getFirst().myRoomOpen()).isNull();
            r.myRoom("101", true); r.gameWatches(Map.of("101", new WorldChannelRegistry.GameWatch("g", "t")));
            assertThatThrownBy(() -> r.myRoom("101", true)).hasMessageContaining("활동");
            r.gameWatches(Map.of());
            assertThat(r.worldState("one").avatars().getFirst().activity()).isNull();
            assertThat(r.worldState("one").avatars().getFirst().myRoomOpen()).isNull();
            r.myRoom("101", true); r.minigameActivity("101", 1, Duration.ofSeconds(30));
            assertThatThrownBy(() -> r.myRoom("101", true)).hasMessageContaining("활동");
            r.minigameActivity("101", 1, Duration.ZERO);
            assertThat(r.worldState("one").avatars().getFirst().activity()).isNull();
            assertThat(r.worldState("one").avatars().getFirst().myRoomOpen()).isNull();
            r.myRoom("101", true);
            r.tableSeats("one", Map.of("101", new WorldChannelRegistry.TableSeat("table", 1)));
            assertThatThrownBy(() -> r.myRoom("101", true)).hasMessageContaining("활동");
            r.tableSeats("one", Map.of());
            assertThat(r.worldState("one").avatars().getFirst().activity()).isNull();
            assertThat(r.worldState("one").avatars().getFirst().myRoomOpen()).isNull();
        } finally { r.clear(); }
    }
}
