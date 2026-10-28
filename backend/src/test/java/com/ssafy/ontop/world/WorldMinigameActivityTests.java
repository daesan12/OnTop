package com.ssafy.ontop.world;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class WorldMinigameActivityTests {
    private final AtomicLong time = new AtomicLong(1);
    private final WorldChannelRegistry registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
            new Channel("one", "하나", 3), new Channel("two", "둘", 3))), Duration.ofMillis(50), time::get);

    @AfterEach
    void close() {
        registry.clear();
    }

    @Test
    void 늦게_입장한_사용자도_활동을_받고_다른_채널에는_보이지_않는다() {
        registry.join("101", "one");
        var started = registry.minigameActivity("101", 10, Duration.ofSeconds(60));
        assertThat(started.avatars().getFirst().activity()).isEqualTo("BUNGEOPPANG");

        registry.join("102", "one");
        registry.join("103", "two");
        assertThat(activity("one", "101")).isEqualTo("BUNGEOPPANG");
        assertThat(activity("one", "102")).isNull();
        assertThat(registry.worldState("two").avatars()).allMatch(avatar -> avatar.activity() == null);

        var ended = registry.minigameActivity("101", 10, Duration.ZERO);
        assertThat(ended.avatars().getFirst().activity()).isNull();
    }

    @Test
    void 이전_판의_늦은_종료는_새_판을_지우지_않고_끝난_판의_늦은_시작도_무시한다() {
        registry.join("101", "one");
        registry.minigameActivity("101", 10, Duration.ofSeconds(60));
        // A is superseded by B in one transaction: A's end then B's start, or B first on a racing thread.
        assertThat(registry.minigameActivity("101", 11, Duration.ofSeconds(60))).isNull();
        assertThat(registry.minigameActivity("101", 10, Duration.ZERO)).isNull();
        assertThat(registry.minigameActivity("101", 10, Duration.ofSeconds(60))).isNull();
        assertThat(activity("one", "101")).isEqualTo("BUNGEOPPANG");

        assertThat(registry.minigameActivity("101", 11, Duration.ZERO)).isNotNull();
        assertThat(registry.minigameActivity("101", 11, Duration.ZERO)).isNull();
        assertThat(registry.minigameActivity("101", 11, Duration.ofSeconds(60))).isNull();
        assertThat(activity("one", "101")).isNull();
    }

    @Test
    void 종료가_시작보다_먼저_도착해도_그_판은_다시_켜지지_않는다() {
        registry.join("101", "one");
        assertThat(registry.minigameActivity("101", 20, Duration.ZERO)).isNull();
        assertThat(registry.minigameActivity("101", 20, Duration.ofSeconds(60))).isNull();
        assertThat(activity("one", "101")).isNull();
    }

    @Test
    void v5_180초_진행_중에는_유지되고_서버_종료_시각에_만료를_방송한다() {
        registry.join("101", "one");
        // v5: 1s start buffer + 3.5s countdown + 180s play from the start commit.
        registry.minigameActivity("101", 10, Duration.ofMillis(184_500));

        advanceTo(Duration.ofSeconds(120));
        assertThat(activity("one", "101")).isEqualTo("BUNGEOPPANG");
        advanceTo(Duration.ofMillis(184_400));
        assertThat(activity("one", "101")).isEqualTo("BUNGEOPPANG");

        var expired = advanceTo(Duration.ofMillis(184_500));
        assertThat(expired).singleElement().satisfies(state ->
                assertThat(state.avatars().getFirst().activity()).isNull());
        assertThat(registry.minigameActivity("101", 10, Duration.ofSeconds(60))).isNull();
    }

    @Test
    void v4_종료_시각은_그대로_쓰고_먼_미래는_200초로_자르며_지난_시각은_켜지_않는다() {
        registry.join("101", "one");
        registry.join("102", "one");
        registry.minigameActivity("101", 10, Duration.ofMillis(64_500));
        registry.minigameActivity("102", 20, Duration.ofHours(1));

        advanceTo(Duration.ofMillis(64_400));
        assertThat(activity("one", "101")).isEqualTo("BUNGEOPPANG");
        advanceTo(Duration.ofMillis(64_500));
        assertThat(activity("one", "101")).isNull();
        advanceTo(Duration.ofMillis(199_900));
        assertThat(activity("one", "102")).isEqualTo("BUNGEOPPANG");
        advanceTo(WorldChannelRegistry.MAX_MINIGAME_ACTIVITY);
        assertThat(activity("one", "102")).isNull();

        assertThat(registry.minigameActivity("101", 30, Duration.ofSeconds(-5))).isNull();
        assertThat(activity("one", "101")).isNull();
    }

    @Test
    void 재접속과_채널_이동_뒤에도_진행_중인_판의_활동을_복구한다() {
        registry.join("101", "one");
        registry.minigameActivity("101", 10, Duration.ofSeconds(60));

        registry.disconnect("101");
        registry.join("101", "one");
        assertThat(activity("one", "101")).isEqualTo("BUNGEOPPANG");

        registry.leave("101");
        registry.join("101", "two");
        assertThat(activity("two", "101")).isEqualTo("BUNGEOPPANG");
        assertThat(registry.worldState("one").avatars()).isEmpty();

        registry.disconnect("101");
        assertThat(registry.minigameActivity("101", 10, Duration.ZERO)).isNull();
        registry.join("101", "one");
        assertThat(activity("one", "101")).isNull();
    }

    @Test
    void 월드_밖에서_시작한_판도_입장하면_보인다() {
        assertThat(registry.minigameActivity("101", 10, Duration.ofSeconds(60))).isNull();
        registry.join("101", "one");
        assertThat(activity("one", "101")).isEqualTo("BUNGEOPPANG");
    }

    @Test
    void 공개_착석과_활동은_한_아바타에_함께_유지된다() {
        registry.join("101", "one");
        registry.tableSeats("one", Map.of("101", new WorldChannelRegistry.TableSeat("one-table-1", 2)));
        registry.minigameActivity("101", 10, Duration.ofSeconds(60));

        var avatar = registry.worldState("one").avatars().getFirst();
        assertThat(avatar.tableSeat()).isEqualTo(new WorldChannelRegistry.TableSeat("one-table-1", 2));
        assertThat(avatar.activity()).isEqualTo("BUNGEOPPANG");
        registry.minigameActivity("101", 10, Duration.ZERO);
        assertThat(registry.worldState("one").avatars().getFirst().tableSeat()).isNotNull();
    }

    private String activity(String channelId, String userId) {
        return registry.worldState(channelId).avatars().stream().filter(avatar -> avatar.userId().equals(userId))
                .findFirst().orElseThrow().activity();
    }

    /** Moves the clock to the offset since the test start and runs one world tick. */
    private List<WorldChannelRegistry.WorldState> advanceTo(Duration offset) {
        time.set(1 + offset.toNanos());
        return registry.advance(Set.of());
    }
}
