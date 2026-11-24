package com.ssafy.ontop.world.winter;

import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SnowballServiceTests {
    private final SnowballService service = new SnowballService();
    private final Position origin = new Position(0, 0, .84, 0, 0);
    private final List<SnowballService.Target> targets = List.of(
            new SnowballService.Target("far", new Position(0, 0, .84, 10, 0)),
            new SnowballService.Target("near", new Position(0, .2, .84, 5, 0)),
            new SnowballService.Target("side", new Position(0, 3, .84, 3, 0)));

    @BeforeEach
    void 눈을_준비한다() { pickup("park", "self", 0); }

    @Test
    void 조준_미리보기는_실제_발사와_같은_대상을_계산하지만_소지량과_명중을_바꾸지_않는다() {
        var before = service.state("park");
        var aim = service.preview("park", "self", origin, 0, targets, yaw -> 16, 0);
        assertThat(aim.hitUserId()).isEqualTo("near");
        assertThat(service.state("park")).isEqualTo(before);
        var shot = service.create("shot", "park", "self", origin, 0, targets, yaw -> 16, 0, Instant.EPOCH);
        assertThat(shot.hitUserId()).isEqualTo(aim.hitUserId());
        assertThat(shot.endX()).isEqualTo(aim.endX());
        assertThat(shot.endY()).isEqualTo(aim.endY());
        assertThat(shot.endZ()).isEqualTo(aim.endZ());
    }

    @Test
    void 같은_높이의_중간_거리_상대도_낮아진_포물선_안에서_맞출_수_있다() {
        for (double distance : List.of(3.0, 6.0, 8.0, 12.0, 15.0)) {
            var target = new SnowballService.Target("other", new Position(0, 0, .84, distance, 0));
            assertThat(service.preview("park", "self", origin, 0, List.of(target), yaw -> 16, 0).hitUserId())
                    .as("거리 %.1fm", distance).isEqualTo("other");
        }
    }

    @Test
    void 준비_동작은_탄약을_쓰지_않고_중복과_빠른_반복을_구분한다() {
        var before = service.state("park");
        var motion = service.prepare("prepare", "park", "self", 0, 0, Instant.EPOCH);
        assertThat(motion.durationMs()).isEqualTo(300);
        assertThat(service.prepare("prepare", "park", "self", 0, 1, Instant.EPOCH)).isSameAs(motion);
        assertThat(service.state("park")).isEqualTo(before);
        assertThatThrownBy(() -> service.prepare("spam", "park", "self", 0, 1, Instant.EPOCH))
                .extracting("code").isEqualTo("SNOWBALL_COOLDOWN");
        service.disconnected("self");
        assertThatThrownBy(() -> service.prepare("again", "park", "self", 0, 1, Instant.EPOCH))
                .extracting("code").isEqualTo("SNOWBALL_REQUIRED");
    }

    @Test
    void 앞쪽의_가장_가까운_사용자에게_맞는다() {
        var event = service.create("shot", "park", "self", origin, 0, targets, yaw -> 16, 0, Instant.EPOCH);

        assertThat(event.hitUserId()).isEqualTo("near");
        assertThat(event.endZ()).isEqualTo(5);
    }

    @Test
    void 벽_너머나_다른_높이의_사용자에게_맞지_않는다() {
        var event = service.create("shot", "park", "self", origin, 0, targets, yaw -> 4, 0, Instant.EPOCH);

        assertThat(event.hitUserId()).isEmpty();
        assertThat(event.endZ()).isEqualTo(4);
    }

    @Test
    void 중복_요청은_같은_발사를_돌려주고_새_연속_발사는_거절한다() {
        var first = service.create("shot", "park", "self", origin, 0, targets, yaw -> 16, 0, Instant.EPOCH);

        assertThat(service.create("shot", "park", "self", origin, 0, targets, yaw -> 16, 1, Instant.EPOCH))
                .isSameAs(first);
        assertThatThrownBy(() -> service.create("next", "park", "self", origin, 0, targets,
                yaw -> 16, 1, Instant.EPOCH)).isInstanceOf(IllegalStateException.class);
        pickup("park", "self", 900_000_000L);
        assertThat(service.create("next", "park", "self", origin, Math.PI, targets,
                yaw -> 16, 900_000_000L, Instant.EPOCH).hitUserId()).isEmpty();
    }
    @Test
    void 눈은_최대_세개까지_모으고_한번에_하나씩만_소비한다() {
        service.disconnected("self");
        assertThatThrownBy(() -> service.create("empty", "park", "self", origin, 0, targets,
                yaw -> 16, 0, Instant.EPOCH)).hasMessageContaining("먼저 주워");
        for (int i = 0; i < 4; i++) { pickup("park", "self", 0); }
        assertThat(ammo()).isEqualTo(3);
        for (int i = 0; i < 3; i++) {
            service.create("shot-" + i, "park", "self", origin, 0, targets, yaw -> 16,
                    i * 1_000_000_000L, Instant.EPOCH.plusSeconds(i));
            assertThat(ammo()).isEqualTo(2 - i);
        }
    }

    @Test
    void 같은_줍기_요청의_재전송으로_눈이_늘어나지_않는다() {
        service.disconnected("self");
        service.pickup("one", "park", "self", 0);
        var state = service.state("park");
        assertThat(service.pickup("one", "park", "self", 1)).isEqualTo(state);
        assertThat(ammo()).isEqualTo(1);
    }

    @Test
    void 눈이_도착하기_전에는_맞지_않고_도착_판정은_한번만_적용한다() {
        var event = service.create("flight", "park", "self", origin, 0, targets, yaw -> 16, 0, Instant.EPOCH);
        long arrival = event.durationMs() * 1_000_000L;
        assertThat(service.arrive(arrival - 1, Instant.EPOCH, c -> targets)).isEmpty();
        assertThat(service.state("park").players()).allSatisfy(p -> assertThat(p.hits()).isZero());
        assertThat(service.arrive(arrival, Instant.EPOCH.plusMillis(event.durationMs()), c -> targets))
                .singleElement().satisfies(impact -> assertThat(impact.hitUserId()).isEqualTo("near"));
        assertThat(service.arrive(arrival, Instant.EPOCH, c -> targets)).isEmpty();
    }

    @Test
    void 비행_중_피하거나_채널을_떠난_사용자에게_뒤늦게_명중하지_않는다() {
        var event = service.create("dodge", "park", "self", origin, 0, targets, yaw -> 16, 0, Instant.EPOCH);
        var moved = List.of(new SnowballService.Target("near", new Position(0, 3, .84, 5, 0)));
        assertThat(service.arrive(1_000_000_000L, Instant.EPOCH.plusSeconds(1), c -> moved))
                .singleElement().satisfies(impact -> assertThat(impact.hitUserId()).isEmpty());
        pickup("park", "self", 1_000_000_000L);
        service.create("leave", "park", "self", origin, 0, targets, yaw -> 16, 1_000_000_000L, Instant.EPOCH.plusSeconds(1));
        service.disconnected("near");
        assertThat(service.arrive(2_000_000_000L, Instant.EPOCH.plusSeconds(2), c -> targets)).isEmpty();
    }

    private int ammo() {
        return service.state("park").players().stream().filter(p -> p.userId().equals("self")).findFirst().orElseThrow().snowballs();
    }

    @Test
    void 지연된_틱은_도착한_눈을_일괄_처리하고_채널별_위치조회와_버전갱신은_한번만_한다() {
        for (String user : List.of("self", "second", "third")) {
            pickup("park", user, 0);
            service.create(user, "park", user, origin, 0, targets, yaw -> 16, 0, Instant.EPOCH);
        }
        pickup("other", "other-self", 0);
        service.create("other-shot", "other", "other-self", origin, 0,
                List.of(new SnowballService.Target("other-victim", new Position(0, 0, .84, 10, 0))),
                yaw -> 16, 0, Instant.EPOCH);
        long before = service.state("park").version(), otherBefore = service.state("other").version();
        var calls = new java.util.HashMap<String, Integer>();
        var impacts = service.arrive(60_000_000_000L, Instant.EPOCH.plusSeconds(60), channel -> {
            calls.merge(channel, 1, Integer::sum);
            return channel.equals("park") ? targets
                    : List.of(new SnowballService.Target("other-victim", new Position(0, 0, .84, 10, 0)));
        });
        assertThat(impacts).hasSize(4);
        assertThat(impacts).allSatisfy(impact -> assertThat(impact.hitUserId()).isNotEmpty());
        assertThat(calls).containsEntry("park", 1).containsEntry("other", 1);
        assertThat(service.state("park").version()).isEqualTo(before + 1);
        assertThat(service.state("other").version()).isEqualTo(otherBefore + 1);
        assertThat(service.frozen("near", 60_000_000_000L)).isTrue();
        assertThat(service.arrive(61_000_000_000L, Instant.EPOCH.plusSeconds(61), channel -> {
            throw new AssertionError("처리된 비행이 남아 있어서는 안 된다");
        })).isEmpty();
    }

    @Test
    void 송신자_연결이_끊기면_남은_비행을_정리한다() {
        service.create("flight", "park", "self", origin, 0, targets, yaw -> 16, 0, Instant.EPOCH);
        service.disconnected("self");
        assertThat(service.arrive(1_000_000_000L, Instant.EPOCH.plusSeconds(1), channel -> targets)).isEmpty();
    }

    private void 세번_맞힌다() {
        for (int i = 0; i < 3; i++) {
            pickup("park", "self", i * 1_000_000_000L);
            var event = service.create("hit-" + i, "park", "self", origin, 0, targets, yaw -> 16,
                    i * 1_000_000_000L, Instant.EPOCH.plusSeconds(i));
            service.arrive(i * 1_000_000_000L + event.durationMs() * 1_000_000L, Instant.EPOCH.plusSeconds(i).plusMillis(event.durationMs()), c -> targets);
        }
    }

    @Test
    void 세번_맞으면_오초간_얼고_시간이_지나면_피격_횟수가_초기화된다() {
        세번_맞힌다();
        assertThat(service.frozen("near", 2_400_000_000L)).isTrue();
        assertThat(service.expire(7_226_000_000L)).isEmpty();
        assertThat(service.expire(7_227_000_000L)).containsExactly("near");
        var victim = service.state("park").players().stream().filter(p -> p.userId().equals("near")).findFirst().orElseThrow();
        assertThat(victim.hits()).isZero();
        assertThat(victim.freezeId()).isEmpty();
    }

    @Test
    void 같은키나_중복요청은_탈출을_완성하지_못하고_AD_교대_여섯번으로_푼다() {
        세번_맞힌다();
        String id = service.state("park").players().stream().filter(p -> p.userId().equals("near")).findFirst().orElseThrow().freezeId();
        service.escape("a", "park", "near", id, "A", 2_400_000_000L);
        service.escape("a", "park", "near", id, "D", 2_500_000_000L);
        service.escape("aa", "park", "near", id, "A", 2_600_000_000L);
        assertThat(service.frozen("near", 2_600_000_000L)).isTrue();
        for (int i = 0; i < 5; i++) {
            service.escape("press-" + i, "park", "near", id, i % 2 == 0 ? "D" : "A", 2_700_000_000L + i * 100_000_000L);
        }
        assertThat(service.frozen("near", 3_200_000_000L)).isFalse();
        assertThatThrownBy(() -> service.escape("stale", "park", "near", id, "A", 3_300_000_000L))
                .isInstanceOf(SnowballService.Rejected.class);
    }

    private SnowballService.State pickup(String channel, String user, long now) {
        return service.pickup(java.util.UUID.randomUUID().toString(), channel, user, now);
    }
}
