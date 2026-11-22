package com.ssafy.ontop.world.winter.community;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class WinterCommunityServiceTests {
    private static final String CHANNEL = "channel-1";
    private final FakeWorld world = new FakeWorld();
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-21T01:00:00Z"), ZoneOffset.UTC);
    private final LocalWinterCommunityStore store = new LocalWinterCommunityStore(null, 48);
    private final WinterCommunityService service = new WinterCommunityService(() -> store, world, clock);

    private static String operation() { return UUID.randomUUID().toString(); }
    private void player(long id, double x, double z) {
        world.people.put(id, new WinterCommunity.Player(Long.toString(id), "친구 " + id, x, .76, z, true));
    }
    @Test void 익명은_닉네임을_숨기고_오십번째_편지는_장식과_함께_한번만_점등한다() {
        player(1, 0, 0); player(2, 1, 0);
        String first = operation(), second = operation();
        var anonymous = service.postTree(1, CHANNEL, first, "고마웠어요", true, "STOCKING");
        assertThat(anonymous.message().nickname()).isNull();
        assertThat(anonymous.message().ornament()).isEqualTo("STOCKING");
        assertThat(anonymous.status().count()).isEqualTo(49); assertThat(anonymous.status().lit()).isFalse();
        var named = service.postTree(2, CHANNEL, second, "모두 응원해요", false, "BELL");
        assertThat(named.message().nickname()).isEqualTo("친구 2");
        assertThat(named.status().count()).isEqualTo(50); assertThat(named.status().lit()).isTrue();
        assertThat(named.status().ornaments()).contains(new WinterCommunity.TreeOrnament(49, "STOCKING"),
                new WinterCommunity.TreeOrnament(50, "BELL"));
        assertThat(service.postTree(2, CHANNEL, second, "모두 응원해요", false, "BELL")).isEqualTo(named);
        assertThat(store.treeStatus().count()).isEqualTo(50);
        assertThatThrownBy(() -> service.postTree(2, CHANNEL, second, "바뀐 내용", false, "BELL")).isInstanceOf(WinterCommunityException.class);
        assertThatThrownBy(() -> service.postTree(2, CHANNEL, second, "모두 응원해요", false, "GIFT")).isInstanceOf(WinterCommunityException.class);
        assertThatThrownBy(() -> service.postTree(2, CHANNEL, operation(), "연속 등록", true, "BAUBLE")).isInstanceOf(WinterCommunityException.class);
    }

    @Test void 장식을_선택하지_않거나_허용하지_않는_장식이면_편지를_저장하지_않는다() {
        player(1, 0, 0);
        for (String ornament : new String[] {null, "UNKNOWN"}) {
            assertThatThrownBy(() -> service.postTree(1, CHANNEL, operation(), "응원해요", true, ornament))
                    .isInstanceOf(WinterCommunityException.class).hasMessageContaining("장식을 먼저");
        }
        assertThat(store.treeStatus().count()).isEqualTo(48);
    }

    @Test void 저장_연결이_없으면_영구저장으로_가장하지_않는다() {
        player(1, 0, 0);
        var unavailable = new WinterCommunityService(() -> null, world, clock);
        assertThatThrownBy(() -> unavailable.treeStatus(1, CHANNEL)).isInstanceOf(WinterCommunityException.class).hasMessageContaining("기록");
    }

    @Test void 로컬_파일_재시작도_편지와_장식과_점등을_유지한다(@TempDir Path directory) {
        Path file = directory.resolve("winter.json"); var before = new LocalWinterCommunityStore(file, 49);
        before.postTree("actor", operation(), "마지막 편지", true, null, "GIFT", clock.instant());
        var after = new LocalWinterCommunityStore(file, 0);
        assertThat(after.treeStatus().lit()).isTrue(); assertThat(after.treeStatus().count()).isEqualTo(50);
        assertThat(after.treeStatus().ornaments()).contains(new WinterCommunity.TreeOrnament(50, "GIFT"));
        assertThat(after.actorSalt()).containsExactly(before.actorSalt());
    }

    private static class FakeWorld implements WinterWorld {
        final Map<Long, WinterCommunity.Player> people = new HashMap<>();
        @Override public WinterCommunity.Player player(long user, String channel) {
            var result = people.get(user);
            if (result == null || channel == null) { throw new WinterCommunityException(403, "NOT_IN_PARK", "공원 연결 필요"); }
            return result;
        }
        @Override public void requireTree(WinterCommunity.Player player, String channel) { }
        @Override public void publishTree(WinterCommunity.TreeStatus status) { }
    }
}
