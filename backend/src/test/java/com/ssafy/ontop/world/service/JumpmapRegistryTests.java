package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.jumpmap.JumpRun;
import com.ssafy.ontop.world.jumpmap.JumpmapActivation;
import com.ssafy.ontop.world.jumpmap.JumpmapTracker;
import com.ssafy.ontop.world.map.PreparedParkMap;
import com.ssafy.ontop.world.movement.MoveInput;
import com.ssafy.ontop.world.movement.ParkScene;
import com.ssafy.ontop.world.movement.WorldPhysics;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import static org.assertj.core.api.Assertions.assertThat;

/** 실제 생성 맵·코스 물리에서 레지스트리가 서버 지지면으로 판을 시작·종료하는지 확인한다. */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JumpmapRegistryTests {
    private ParkScene scene;
    private JumpCourse course;
    private final AtomicLong nanos = new AtomicLong(1_000_000_000L);
    private final List<WorldChannelRegistry.JumpmapDelivery> delivered = new ArrayList<>();

    @BeforeAll
    void prepare() throws Exception {
        scene = PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"), Set.of("channel-1")).createScene();
        course = JumpCourse.loadDefault();
    }

    private WorldChannelRegistry registry(boolean active) {
        var registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("channel-1", "공원", 20))), Duration.ofMillis(1), nanos::get, scene);
        if (active) registry.configureJumpCourse(JumpmapActivation.decide(true, scene.version(), () -> course));
        return registry;
    }

    private void advance(WorldChannelRegistry registry, int ticks) {
        for (int i = 0; i < ticks; i++) {
            nanos.addAndGet(WorldPhysics.STEP_NANOS);
            registry.advance(Set.of());
            delivered.addAll(registry.drainJumpmap());
        }
    }

    private void dropOnto(WorldChannelRegistry registry, String user, JumpCourse.Collider pad) {
        registry.releaseFacility(user, new WorldFacilityService.Pose(pad.x(), pad.top() + 1.2, pad.z(), 0));
        advance(registry, 45);
    }

    private <T> List<T> signals(Class<T> type) {
        return delivered.stream().map(WorldChannelRegistry.JumpmapDelivery::signal).filter(type::isInstance).map(type::cast).toList();
    }

    @Test
    void 비활성이면_코스도_판정신호도_없다() {
        delivered.clear();
        var registry = registry(false);
        registry.join("7", "channel-1");
        dropOnto(registry, "7", course.colliders().getFirst());
        assertThat(delivered).isEmpty();
        assertThat(registry.jumpmapRun("7")).isEmpty();
    }

    @Test
    void 첫_발판_착지로_시작하고_광장바닥으로_걸어내려가면_FALL이다() {
        delivered.clear();
        var registry = registry(true);
        registry.join("7", "channel-1");
        registry.join("8", "channel-1");
        registry.join("9", "channel-1");
        var pad = course.colliders().getFirst();
        // 8은 착지 지점 25m 안, 9는 밖에 세워 둔다.
        registry.releaseFacility("8", new WorldFacilityService.Pose(pad.x() + 6, .95, pad.z() + 6, 0));
        registry.releaseFacility("9", new WorldFacilityService.Pose(pad.x() + 40, .95, pad.z() + 20, 0));
        dropOnto(registry, "7", pad);

        assertThat(signals(JumpmapTracker.Started.class)).singleElement().satisfies(started -> {
            assertThat(started.userId()).isEqualTo("7");
            assertThat(started.channelId()).isEqualTo("channel-1");
        });
        var step = delivered.stream().filter(d -> d.signal() instanceof JumpmapTracker.Step s && s.userId().equals("7")).findFirst();
        assertThat(step).get().satisfies(d -> {
            assertThat(((JumpmapTracker.Step) d.signal()).block()).isZero();
            assertThat(d.recipients()).contains("7", "8").doesNotContain("9");
        });
        assertThat(registry.jumpmapRun("7")).isPresent();

        delivered.clear();
        for (int i = 1; i <= 30; i++) {
            registry.input("7", new MoveInput(i, 0, 1, false, false));
            advance(registry, 1);
        }
        advance(registry, 20);
        assertThat(signals(JumpmapTracker.Progress.class)).singleElement().satisfies(progress ->
                assertThat(progress.outcome()).isInstanceOfSatisfying(JumpRun.Ended.class,
                        ended -> assertThat(ended.reason()).isEqualTo(JumpRun.EndReason.FALL)));
        assertThat(registry.jumpmapRun("7")).isEmpty();
    }

    private List<JumpRun.EndReason> endings() {
        return signals(JumpmapTracker.Progress.class).stream().map(JumpmapTracker.Progress::outcome)
                .filter(JumpRun.Ended.class::isInstance).map(o -> ((JumpRun.Ended) o).reason()).toList();
    }

    @Test
    void 판이_없으면_유예하지_않고_유예는_15초_경계에서_한번만_DISCONNECT한다() {
        delivered.clear();
        var registry = registry(true);
        registry.join("7", "channel-1");
        assertThat(registry.suspendJumpmap("7")).isFalse();
        dropOnto(registry, "7", course.colliders().getFirst());
        registry.interactionBusy("7", true, true);
        assertThat(registry.suspendJumpmap("7")).isTrue();
        assertThat(registry.worldState("channel-1").avatars()).allMatch(a -> a.vrActive() == null);
        assertThat(registry.suspendJumpmap("7")).isFalse();
        delivered.clear();
        int ticks = (int) (WorldChannelRegistry.JUMPMAP_GRACE.toNanos() / WorldPhysics.STEP_NANOS);
        advance(registry, ticks - 2);
        assertThat(registry.channelOf("7")).isEqualTo("channel-1");
        assertThat(registry.jumpmapRun("7")).isPresent();
        assertThat(endings()).isEmpty();
        advance(registry, 3);
        assertThat(registry.channelOf("7")).isNull();
        assertThat(endings()).containsExactly(JumpRun.EndReason.DISCONNECT);
        assertThat(registry.drainSuspensionEnds()).singleElement().satisfies(state -> assertThat(state.currentUsers()).isZero());
        advance(registry, 30);
        assertThat(endings()).containsExactly(JumpRun.EndReason.DISCONNECT);
    }

    @Test
    void 유예중_같은채널_재입장은_캐릭터와_판을_잇고_순번과_epoch를_새로_시작한다() {
        delivered.clear();
        var registry = registry(true);
        registry.join("7", "channel-1");
        dropOnto(registry, "7", course.colliders().getFirst());
        for (int i = 1; i <= 3; i++) registry.input("7", new MoveInput(i, 0, 0, false, false));
        advance(registry, 2);
        var before = registry.worldState("channel-1").avatars().getFirst();
        long epoch = before.motion().epoch();
        String runId = registry.jumpmapRun("7").orElseThrow().runId();
        registry.suspendJumpmap("7");
        advance(registry, 150);
        var change = registry.join("7", "channel-1");
        assertThat(change.changed()).isFalse();
        assertThat(registry.jumpmapSuspended("7")).isFalse();
        var after = registry.worldState("channel-1").avatars().getFirst();
        assertThat(after.position().lastInputSeq()).isZero();
        assertThat(after.motion().epoch()).isNotEqualTo(epoch);
        assertThat(after.position().x()).isCloseTo(before.position().x(), org.assertj.core.data.Offset.offset(.01));
        assertThat(registry.jumpmapRun("7")).get().extracting(JumpmapTracker.RunView::runId).isEqualTo(runId);
        assertThat(registry.input("7", new MoveInput(1, 0, 0, false, false)).changed()).isTrue();
        advance(registry, 600);
        assertThat(endings()).isEmpty();
        assertThat(registry.channelOf("7")).isEqualTo("channel-1");
    }

    @Test
    void 유예중_다른채널_입장은_LEFT이고_유예중_판이_끝나면_바로_정리한다() {
        delivered.clear();
        var registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("channel-1", "공원", 20), new WorldChannelProperties.Channel("channel-2", "공원2", 20))),
                Duration.ofMillis(1), nanos::get, scene);
        registry.configureJumpCourse(JumpmapActivation.decide(true, scene.version(), () -> course));
        registry.join("7", "channel-1");
        dropOnto(registry, "7", course.colliders().getFirst());
        registry.suspendJumpmap("7");
        registry.join("7", "channel-2");
        delivered.addAll(registry.drainJumpmap());
        assertThat(endings()).containsExactly(JumpRun.EndReason.LEFT);
        assertThat(registry.channelOf("7")).isEqualTo("channel-2");
        assertThat(registry.drainSuspensionEnds()).singleElement().satisfies(state -> assertThat(state.channelId()).isEqualTo("channel-1"));

        delivered.clear();
        registry.leave("7");
        registry.join("7", "channel-1");
        advance(registry, 1);
        var pad = course.colliders().getFirst();
        dropOnto(registry, "7", pad);
        // 유예 중 판이 다른 이유(여기서는 서버 순간 이동 RESET)로 끝나면 남은 유예를 기다리지 않고 바로 정리한다.
        registry.suspendJumpmap("7");
        registry.releaseFacility("7", new WorldFacilityService.Pose(pad.x(), .95, pad.z() + 3, 0));
        advance(registry, 5);
        assertThat(endings()).containsExactly(JumpRun.EndReason.RESET);
        assertThat(registry.channelOf("7")).isNull();
        assertThat(registry.drainSuspensionEnds()).hasSize(1);
    }

    @Test
    void 위치보고_사용자는_유예중_서버물리로_떨어지고_재입장후_다시_위치보고로_돌아간다() {
        delivered.clear();
        var registry = registry(true);
        var dev = new org.springframework.mock.env.MockEnvironment();
        dev.setActiveProfiles("dev");
        registry.configurePositionReports(true, dev);
        registry.join("7", "channel-1");
        dropOnto(registry, "7", course.colliders().getFirst());
        assertThat(registry.worldState("channel-1").avatars().getFirst().motion().authority()).isEqualTo("CLIENT_VALIDATED");
        registry.suspendJumpmap("7");
        assertThat(registry.worldState("channel-1").avatars().getFirst().motion().authority()).isNull();
        advance(registry, 30);
        registry.join("7", "channel-1");
        advance(registry, 5);
        assertThat(registry.worldState("channel-1").avatars().getFirst().motion().authority()).isEqualTo("CLIENT_VALIDATED");
        assertThat(registry.jumpmapRun("7")).isPresent();
    }

    @Test
    void 진행중_서버_배치는_RESET이고_퇴장과_연결끊김은_LEFT_DISCONNECT다() {
        delivered.clear();
        var registry = registry(true);
        registry.join("7", "channel-1");
        dropOnto(registry, "7", course.colliders().getFirst());
        registry.releaseFacility("7", new WorldFacilityService.Pose(-70, .95, 0, 0));
        advance(registry, 2);
        assertThat(signals(JumpmapTracker.Progress.class)).singleElement().satisfies(progress ->
                assertThat(((JumpRun.Ended) progress.outcome()).reason()).isEqualTo(JumpRun.EndReason.RESET));

        delivered.clear();
        dropOnto(registry, "7", course.colliders().getFirst());
        registry.leave("7");
        delivered.addAll(registry.drainJumpmap());
        assertThat(signals(JumpmapTracker.Progress.class)).singleElement().satisfies(progress ->
                assertThat(((JumpRun.Ended) progress.outcome()).reason()).isEqualTo(JumpRun.EndReason.LEFT));

        delivered.clear();
        registry.join("7", "channel-1");
        advance(registry, 1);
        dropOnto(registry, "7", course.colliders().getFirst());
        registry.disconnect("7");
        delivered.addAll(registry.drainJumpmap());
        assertThat(signals(JumpmapTracker.Progress.class)).singleElement().satisfies(progress ->
                assertThat(((JumpRun.Ended) progress.outcome()).reason()).isEqualTo(JumpRun.EndReason.DISCONNECT));
    }
}
