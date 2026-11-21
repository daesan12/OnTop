package com.ssafy.ontop.world.winter.community;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class WinterCommunityServiceTests {
    private static final String CHANNEL = "channel-1";
    private final FakeWorld world = new FakeWorld();
    private final AtomicLong nanos = new AtomicLong(1);
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-21T01:00:00Z"), ZoneOffset.UTC);
    private final LocalWinterCommunityStore store = new LocalWinterCommunityStore(null, 98);
    private final WinterCommunityService service = new WinterCommunityService(() -> store, world, clock, nanos::get);

    private static String operation() { return UUID.randomUUID().toString(); }
    private void player(long id, double x, double z, boolean busy) {
        world.people.put(id, new WinterCommunity.Player(Long.toString(id), "친구 " + id, x, .76, z, 0, true, busy, "snow"));
    }
    private String ball(double x, int ticks) {
        player(1, x, 0, false);
        String operation = operation();
        var ball = service.hold(1, CHANNEL, "BEGIN", operation, null).balls().stream().filter(b -> b.pushing().contains("1")).findFirst().orElseThrow();
        for (int i = 0; i < ticks; i++) {
            nanos.addAndGet(100_000_000L);
            service.hold(1, CHANNEL, "KEEP", operation, ball.id()); service.tick();
        }
        service.hold(1, CHANNEL, "RELEASE", operation, ball.id());
        return ball.id();
    }

    @Test void 익명은_닉네임을_숨기고_백번째_편지는_한번만_점등한다() {
        player(1, 0, 0, false); player(2, 1, 0, false);
        String first = operation(), second = operation();
        var anonymous = service.postTree(1, CHANNEL, first, "고마웠어요", true);
        assertThat(anonymous.message().nickname()).isNull();
        assertThat(anonymous.status().count()).isEqualTo(99); assertThat(anonymous.status().lit()).isFalse();
        var named = service.postTree(2, CHANNEL, second, "모두 응원해요", false);
        assertThat(named.message().nickname()).isEqualTo("친구 2");
        assertThat(named.status().count()).isEqualTo(100); assertThat(named.status().lit()).isTrue();
        assertThat(service.postTree(2, CHANNEL, second, "모두 응원해요", false)).isEqualTo(named);
        assertThat(store.treeStatus().count()).isEqualTo(100);
        assertThatThrownBy(() -> service.postTree(2, CHANNEL, second, "바뀐 내용", false)).isInstanceOf(WinterCommunityException.class);
        assertThatThrownBy(() -> service.postTree(2, CHANNEL, operation(), "연속 등록", true)).isInstanceOf(WinterCommunityException.class);
    }

    @Test void 같은_눈을_함께_굴리며_최대_크기와_이전_놓기_요청을_보호한다() {
        player(1, 0, 0, false); player(2, 1, 0, false);
        String first = operation(), other = operation(), renewed = operation();
        String id = service.hold(1, CHANNEL, "BEGIN", first, null).balls().getFirst().id();
        assertThat(service.hold(2, CHANNEL, "BEGIN", other, id).balls().getFirst().pushing()).containsExactlyInAnyOrder("1", "2");
        service.hold(1, CHANNEL, "BEGIN", renewed, id);
        service.hold(1, CHANNEL, "RELEASE", first, id);
        for (int i = 0; i < 300; i++) {
            nanos.addAndGet(100_000_000L);
            service.hold(1, CHANNEL, "KEEP", renewed, id); service.hold(2, CHANNEL, "KEEP", other, id); service.tick();
        }
        var state = service.building(1, CHANNEL);
        assertThat(state.balls()).hasSize(1);
        assertThat(state.balls().getFirst().radius()).isEqualTo(1.1);
        assertThat(state.balls().getFirst().pushing()).contains("1");
        player(1, 0, 0, true); world.people.remove(2L); nanos.addAndGet(100_000_000L); service.tick();
        assertThat(service.building(1, CHANNEL).balls().getFirst().pushing()).isEmpty();
    }

    @Test void 눈덩이_세개를_한번만_소모하고_같은_채널에서_완성품을_복원한다() {
        var ids = List.of(ball(-3, 130), ball(0, 65), ball(3, 10));
        player(1, 0, 0, false);
        String request = operation(); var style = new WinterCommunity.Decoration("우리 눈사람", "BEANIE", "BLUE", "WINK");
        var man = service.finish(1, CHANNEL, request, ids, style, 0, 3, 0);
        assertThat(service.building(1, CHANNEL).balls()).isEmpty();
        assertThat(man.hat()).isEqualTo("BEANIE");
        assertThat(service.finish(1, CHANNEL, request, ids, style, 0, 3, 0)).isEqualTo(man);
        assertThat(store.snowmen(CHANNEL)).hasSize(1);
        var restarted = new WinterCommunityService(() -> store, world, clock, nanos::get);
        assertThat(restarted.building(1, CHANNEL).snowmen()).containsExactly(man);
        assertThat(restarted.building(1, "channel-2").snowmen()).isEmpty();
        assertThatThrownBy(() -> restarted.finish(1, CHANNEL, request, ids, style, 1, 3, 0)).isInstanceOf(WinterCommunityException.class);
        assertThat(world.installed).contains(man.id());
    }

    @Test void 크기가_모자라거나_주변에_사람이_있으면_소모하지_않는다() {
        var ids = List.of(ball(-3, 0), ball(0, 0), ball(3, 0)); player(1, 0, 0, false);
        assertThatThrownBy(() -> service.finish(1, CHANNEL, operation(), ids,
                new WinterCommunity.Decoration("눈사람", "NONE", "RED", "SMILE"), 0, 3, 0)).isInstanceOf(WinterCommunityException.class);
        assertThat(service.building(1, CHANNEL).balls()).hasSize(3);
    }

    @Test void 저장_연결이_없으면_영구저장으로_가장하지_않는다() {
        player(1, 0, 0, false);
        var unavailable = new WinterCommunityService(() -> null, world, clock, nanos::get);
        assertThatThrownBy(() -> unavailable.treeStatus(1, CHANNEL)).isInstanceOf(WinterCommunityException.class).hasMessageContaining("기록");
    }

    @Test void 눈밭을_벗어난_보행은_눈의_크기를_늘리지_않는다() {
        player(1, 0, 0, false); String request = operation();
        var ball = service.hold(1, CHANNEL, "BEGIN", request, null).balls().getFirst();
        for (int i = 0; i < 10; i++) {
            world.people.put(1L, new WinterCommunity.Player("1", "친구", i * .08, .76, 0, 0, true, false, ""));
            nanos.addAndGet(100_000_000L); service.hold(1, CHANNEL, "KEEP", request, ball.id()); service.tick();
        }
        assertThat(service.building(1, CHANNEL).balls().getFirst().radius()).isEqualTo(.25);
    }

    @Test void 로컬_파일_재시작도_점등과_채널별_눈사람을_유지한다(@TempDir Path directory) {
        Path file = directory.resolve("winter.json"); var before = new LocalWinterCommunityStore(file, 99);
        before.postTree("actor", operation(), "마지막 편지", true, null, clock.instant());
        var man = new WinterCommunity.Snowman(operation(), CHANNEL, "눈사람", 0, 0, 3, 0, .8, .6, .4, "NONE", "GREEN", "SMILE", clock.instant().toString());
        before.saveSnowman("actor", operation(), "hash", man);
        var after = new LocalWinterCommunityStore(file, 0);
        assertThat(after.treeStatus().lit()).isTrue(); assertThat(after.treeStatus().count()).isEqualTo(100);
        assertThat(after.actorSalt()).containsExactly(before.actorSalt());
        assertThat(after.snowmen(CHANNEL)).containsExactly(man); assertThat(after.snowmen("other")).isEmpty();
    }

    private static class FakeWorld implements WinterWorld {
        final Map<Long, WinterCommunity.Player> people = new HashMap<>();
        final List<String> installed = new ArrayList<>();
        @Override public WinterCommunity.Player player(long user, String channel) {
            var result = people.get(user);
            if (result == null || channel == null) { throw new WinterCommunityException(403, "NOT_IN_PARK", "공원 연결 필요"); }
            return result;
        }
        @Override public List<WinterCommunity.Player> players(String channel) { return List.copyOf(people.values()); }
        @Override public WinterCommunity.Surface surface(String channel, double x, double z, double radius) { return new WinterCommunity.Surface(0, true, true); }
        @Override public void requireTree(WinterCommunity.Player player, String channel) { }
        @Override public void install(WinterCommunity.Snowman man) { installed.add(man.id()); }
        @Override public void publish(WinterCommunity.BuildingState state) { }
        @Override public void publishTree(WinterCommunity.TreeStatus status) { }
    }
}
