package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.boat.DuckBoatRoute;
import com.ssafy.ontop.world.boat.DuckBoatWallet;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldFacilityService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 실제 앱 구성과 220m 공원 생성물로 오리배 이용을 여러 사람이 소켓으로 진행한다.
 * 요금은 지갑 대역, 운항 시각은 조절 가능한 시계로 바꾼다. 공원 물리 tick은 실제 서버 스케줄러가 돈다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.world.map.source=generated", "ontop.world.map.require-match=true",
        "ontop.world.map.json-path=../frontend/generated/park-renewal/server-map.json",
        "ontop.world.map.manifest-path=../frontend/generated/park-renewal/manifest.json",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=공원",
        "ontop.world.channels[0].capacity=8"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, DuckBoatWebSocketTests.Wallet.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class DuckBoatWebSocketTests {
    @TestConfiguration
    static class Wallet {
        @Bean
        DuckBoatWallet duckBoatWallet() { return mock(DuckBoatWallet.class); }
    }

    @LocalServerPort int port;
    @Autowired WorldMapRuntime runtime;
    @Autowired WorldChannelRegistry channels;
    @Autowired TableHub hub;
    @Autowired DuckBoatWallet wallet;

    private final MutableClock clock = new MutableClock();
    private DuckBoatRoute route;
    private WorldFacilityService.Definition dock;

    @BeforeEach
    void schedule() {
        var prepared = runtime.prepared().orElseThrow();
        route = prepared.boatRoute();
        synchronized (hub) {
            ReflectionTestUtils.setField(hub, "facilities", new WorldFacilityService(prepared.facilities(), clock,
                    System::nanoTime, route, prepared.sleighRoute()));
        }
        dock = prepared.facilities().facilities().stream().filter(d -> d.kind().equals("BOAT")).findFirst().orElseThrow();
        reset(wallet);
        when(wallet.charge(anyLong(), anyString(), anyInt(), any(BooleanSupplier.class))).thenAnswer(call ->
                ((BooleanSupplier) call.getArgument(3)).getAsBoolean()
                        ? DuckBoatWallet.Payment.PAID : DuckBoatWallet.Payment.CANCELLED);
    }

    @AfterEach
    void forgetFare() {
        reset(wallet);
    }

    private static boolean type(JsonNode message, String type) { return message.path("type").asText().equals(type); }

    private ScenarioClient join(String login) throws Exception {
        var client = new ScenarioClient(port, login);
        client.await(m -> type(m, "CONNECTED"));
        client.request("WORLD_MAP_CONFIRM", runtime.scene().metadata());
        client.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
        // 선착장 위에 세운다. 시설 기준점(바닥 + 0.8)이 이용 범위 중심이다.
        channels.releaseFacility(client.userId, dock.center());
        return client;
    }

    private JsonNode solo(ScenarioClient client) throws Exception {
        return client.request("WORLD_BOAT_JOIN", Map.of());
    }

    private JsonNode pair(ScenarioClient client, String partner) throws Exception {
        return client.request("WORLD_BOAT_JOIN", Map.of("partnerId", partner));
    }

    private JsonNode reply(ScenarioClient client, String inviter, boolean accept) throws Exception {
        return client.request("WORLD_BOAT_REPLY", Map.of("inviterId", inviter, "accept", accept));
    }

    private JsonNode lease(JsonNode state, String userId) {
        for (JsonNode lease : state.at("/payload/occupancies")) {
            if (lease.path("userId").asText().equals(userId)) return lease;
        }
        return null;
    }

    private JsonNode awaitSeat(ScenarioClient client, String userId, java.util.function.IntPredicate seat) throws Exception {
        return client.await(m -> type(m, "WORLD_FACILITY_STATE") && lease(m, userId) != null
                && seat.test(lease(m, userId).path("seatIndex").asInt()));
    }

    private JsonNode notice(ScenarioClient client, String status) throws Exception {
        return client.await(m -> type(m, "WORLD_BOAT_NOTICE") && m.at("/payload/status").asText().equals(status));
    }

    private String leaseOf(ScenarioClient client, String userId) throws Exception {
        return lease(client.request("WORLD_FACILITY_CHECK", Map.of()), userId).path("leaseId").asText();
    }

    private void assertNear(WorldFacilityService.Pose expected, String userId, double tolerance) throws Exception {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while (true) {
            var at = channels.positionOf(userId);
            if (Math.hypot(at.x() - expected.x(), at.z() - expected.z()) < tolerance) return;
            if (System.nanoTime() > until) {
                throw new AssertionError("위치가 다릅니다: " + at + " 기대 " + expected);
            }
            Thread.sleep(50);
        }
    }

    @Test
    void 혼자_타면_바로_출발해_요금을_한_번_내고_한_바퀴_뒤_선착장에_내린다() throws Exception {
        try (var rider = join("naver")) {
            assertThat(solo(rider).path("type").asText()).isEqualTo("WORLD_FACILITY_STATE");
            var departed = awaitSeat(rider, "101", seat -> seat >= 4);
            assertThat(departed.at("/payload/boats/trips")).hasSize(1);
            assertThat(departed.at("/payload/boats/teams")).isEmpty();
            assertThat(notice(rider, "PAID").at("/payload/fare").asInt()).isEqualTo(30);
            String leaseId = lease(departed, "101").path("leaseId").asText();
            verify(wallet, times(1)).charge(eq(101L), eq(leaseId), eq(30), any(BooleanSupplier.class));

            clock.at += 30_000;
            assertNear(route.seatPose(30, 0), "101", .3);
            assertThat(channels.positionOf("101").swimming()).isFalse();

            clock.at += 30_000;
            notice(rider, "ARRIVED");
            assertNear(dock.exit(), "101", .05);
            verify(wallet, times(1)).charge(anyLong(), anyString(), anyInt(), any(BooleanSupplier.class));
            assertThat(rider.request("WORLD_MOVE", Map.of("seq", 1, "dx", 0, "dz", 1, "run", false))
                    .path("type").asText()).isNotEqualTo("ERROR");
        }
    }

    @Test
    void 초대를_수락하면_멀리_있던_사람도_옆_자리로_와서_함께_출발하고_한_명만_내릴_수_있다() throws Exception {
        try (var inviter = join("naver"); var partner = join("ssafy")) {
            channels.releaseFacility("202", new WorldFacilityService.Pose(-60, 5, 60, 0));
            var waiting = pair(inviter, "202");
            assertThat(waiting.at("/payload/boats/teams/0/phase").asText()).isEqualTo("INVITING");
            assertNear(dock.seats().get(0), "101", .05);
            var invite = partner.await(m -> type(m, "WORLD_BOAT_INVITE"));
            assertThat(invite.at("/payload/inviterId").asText()).isEqualTo("101");
            assertThat(invite.at("/payload/expiresAt").asLong()).isEqualTo(clock.at + 15_000);
            // 수락 전에는 출발하지 않는다.
            inviter.assertNoMessage(m -> type(m, "WORLD_BOAT_NOTICE") && m.at("/payload/status").asText().equals("PAID"));

            reply(partner, "101", true);
            notice(inviter, "ACCEPTED");
            awaitSeat(inviter, "202", seat -> seat == 5);
            notice(inviter, "PAID");
            notice(partner, "PAID");
            clock.at += 10_000;
            assertNear(route.seatPose(10, 1), "202", .3);

            var released = inviter.request("WORLD_FACILITY_RELEASE", Map.of("leaseId", leaseOf(inviter, "101")));
            assertThat(lease(released, "101")).isNull();
            assertThat(lease(released, "202").path("seatIndex").asInt()).isEqualTo(5);
            assertNear(dock.exit(), "101", .05);
            clock.at += 50_000;
            notice(partner, "ARRIVED");
            verify(wallet, times(2)).charge(anyLong(), anyString(), eq(30), any(BooleanSupplier.class));
        }
    }

    @Test
    void 둘이_함께_도착하면_선착장의_서로_다른_자리에_내린다() throws Exception {
        try (var inviter = join("naver"); var partner = join("ssafy")) {
            pair(inviter, "202");
            partner.await(m -> type(m, "WORLD_BOAT_INVITE"));
            reply(partner, "101", true);
            awaitSeat(inviter, "202", seat -> seat == 5);
            clock.at += 60_000;
            notice(inviter, "ARRIVED");
            notice(partner, "ARRIVED");
            // ARRIVED는 배에서 해제됐다는 통보다. 실제 접지는 이후 물리 tick에서 확정된다.
            var landed = org.awaitility.Awaitility.await().atMost(3, TimeUnit.SECONDS).until(
                    () -> channels.worldState("channel-1"),
                    state -> state.avatars().size() == 2 && state.avatars().stream()
                            .allMatch(rider -> rider.motion().grounded()));
            // 두 사람의 좌표를 같은 물리 스냅샷에서 비교한다.
            var first = landed.avatars().stream().filter(rider -> rider.userId().equals("101"))
                    .findFirst().orElseThrow().position();
            var second = landed.avatars().stream().filter(rider -> rider.userId().equals("202"))
                    .findFirst().orElseThrow().position();
            assertThat(Math.hypot(first.x() - dock.exit().x(), first.z() - dock.exit().z())).isLessThan(.05);
            assertThat(Math.hypot(first.x() - second.x(), first.z() - second.z())).isGreaterThan(1);
            // 하차 지점 옆 1.2m, 같은 선착장 바닥이다.
            assertThat(Math.hypot(second.x() - dock.exit().x(), second.z() - dock.exit().z())).isCloseTo(1.2,
                    org.assertj.core.data.Offset.offset(.05));
            // 맵의 배치용 높이 대신, 접지한 두 캐릭터가 같은 바닥에 섰는지 검증한다.
            assertThat(second.y()).isCloseTo(first.y(), org.assertj.core.data.Offset.offset(.05));
            assertThat(first.swimming()).isFalse();
            assertThat(second.swimming()).isFalse();
        }
    }

    @Test
    void 거절하면_초대한_사람이_혼자_타기로_바꿔_출발한다() throws Exception {
        try (var inviter = join("naver"); var partner = join("ssafy")) {
            pair(inviter, "202");
            partner.await(m -> type(m, "WORLD_BOAT_INVITE"));
            reply(partner, "101", false);
            notice(inviter, "DECLINED");
            var choosing = inviter.request("WORLD_FACILITY_CHECK", Map.of());
            assertThat(choosing.at("/payload/boats/teams/0/phase").asText()).isEqualTo("CHOOSING");
            assertThat(reply(partner, "101", true).at("/payload/code").asText()).isEqualTo("BOAT_INVITE_CLOSED");

            inviter.request("WORLD_BOAT_TEAM", Map.of("action", "SOLO"));
            awaitSeat(inviter, "101", seat -> seat >= 4);
            verify(wallet, never()).charge(eq(202L), anyString(), anyInt(), any(BooleanSupplier.class));
        }
    }

    @Test
    void 답이_없으면_15초_뒤_고르기로_넘어가고_다시_10초_안에_안_고르면_대기에서_빠진다() throws Exception {
        try (var inviter = join("naver"); var partner = join("ssafy")) {
            pair(inviter, "202");
            partner.await(m -> type(m, "WORLD_BOAT_INVITE"));
            clock.at += 15_000;
            notice(inviter, "EXPIRED");
            partner.await(m -> type(m, "WORLD_BOAT_INVITE_CLOSED"));

            // 다른 사람을 다시 초대할 수 있다.
            try (var other = join("303")) {
                inviter.request("WORLD_BOAT_TEAM", Map.of("action", "INVITE", "partnerId", "303"));
                other.await(m -> type(m, "WORLD_BOAT_INVITE"));
                clock.at += 15_000;
                notice(inviter, "EXPIRED");
                clock.at += 10_000;
                notice(inviter, "CANCELLED");
            }
            assertNear(dock.exit(), "101", .05);
            assertThat(lease(inviter.request("WORLD_FACILITY_CHECK", Map.of()), "101")).isNull();
            verify(wallet, never()).charge(anyLong(), anyString(), anyInt(), any(BooleanSupplier.class));
        }
    }

    @Test
    void 대기는_두_팀까지이고_초대_중인_앞_팀은_준비된_뒤_팀을_막지_않는다() throws Exception {
        try (var first = join("naver"); var waits = join("ssafy"); var second = join("303"); var third = join("404")) {
            pair(first, "202");
            pair(second, "202");
            var full = solo(third);
            assertThat(full.at("/payload/code").asText()).isEqualTo("FACILITY_OCCUPIED");

            // 두 번째 팀이 혼자 타기로 바꾸면 첫 팀의 초대를 기다리지 않고 먼저 출발한다.
            second.request("WORLD_BOAT_TEAM", Map.of("action", "SOLO"));
            awaitSeat(second, "303", seat -> seat >= 4);
            assertThat(lease(first.request("WORLD_FACILITY_CHECK", Map.of()), "101").path("seatIndex").asInt())
                    .isZero();
            reply(waits, "101", true);
            var ready = first.await(m -> type(m, "WORLD_FACILITY_STATE") && lease(m, "202") != null);
            assertThat(ready.at("/payload/boats/teams/0/departAt").asLong()).isEqualTo(clock.at + 10_000);
            clock.at += 10_000;
            awaitSeat(first, "202", seat -> seat >= 4);
        }
    }

    @Test
    void 냥이_부족하면_출발할_때_선착장으로_돌려보내고_같이_탄_사람은_계속_간다() throws Exception {
        when(wallet.charge(eq(101L), anyString(), anyInt(), any(BooleanSupplier.class)))
                .thenReturn(DuckBoatWallet.Payment.INSUFFICIENT);
        try (var poor = join("naver"); var rich = join("ssafy")) {
            pair(poor, "202");
            rich.await(m -> type(m, "WORLD_BOAT_INVITE"));
            reply(rich, "101", true);
            notice(poor, "INSUFFICIENT");
            notice(rich, "PAID");
            var state = rich.request("WORLD_FACILITY_CHECK", Map.of());
            assertThat(lease(state, "101")).isNull();
            assertThat(lease(state, "202").path("seatIndex").asInt()).isGreaterThanOrEqualTo(4);
            assertNear(dock.exit(), "101", .05);
        }
    }

    @Test
    void 초대한_사람이_나가면_초대가_닫히고_초대받은_사람이_나가면_거절로_알린다() throws Exception {
        try (var stays = join("ssafy")) {
            try (var leaves = join("naver")) {
                pair(leaves, "202");
                stays.await(m -> type(m, "WORLD_BOAT_INVITE"));
            }
            stays.await(m -> type(m, "WORLD_BOAT_INVITE_CLOSED"));
            assertThat(reply(stays, "101", true).at("/payload/code").asText()).isEqualTo("BOAT_INVITE_CLOSED");

            try (var invited = join("303")) {
                pair(stays, "303");
                invited.await(m -> type(m, "WORLD_BOAT_INVITE"));
            }
            notice(stays, "DECLINED");
            stays.request("WORLD_BOAT_TEAM", Map.of("action", "SOLO"));
            awaitSeat(stays, "202", seat -> seat >= 4);
        }
    }

    @Test
    void 대기_취소는_요금_없이_선착장에_남고_초대도_닫는다() throws Exception {
        try (var inviter = join("naver"); var partner = join("ssafy")) {
            pair(inviter, "202");
            partner.await(m -> type(m, "WORLD_BOAT_INVITE"));
            var released = inviter.request("WORLD_FACILITY_RELEASE", Map.of("leaseId", leaseOf(inviter, "101")));
            assertThat(lease(released, "101")).isNull();
            assertThat(released.at("/payload/boats/teams")).isEmpty();
            partner.await(m -> type(m, "WORLD_BOAT_INVITE_CLOSED"));
            assertNear(dock.exit(), "101", .05);
            verify(wallet, never()).charge(anyLong(), anyString(), anyInt(), any(BooleanSupplier.class));
        }
    }

    @Test
    void 잘못된_요청은_거절한다() throws Exception {
        try (var rider = join("naver"); var other = join("ssafy")) {
            assertThat(rider.request("WORLD_FACILITY_USE", Map.of("facilityId", "duck-boat", "seatIndex", 0))
                    .at("/payload/code").asText()).isEqualTo("BOAT_JOIN_REQUIRED");
            assertThat(pair(rider, "101").at("/payload/code").asText()).isEqualTo("BOAT_PARTNER_UNAVAILABLE");
            assertThat(pair(rider, "999").at("/payload/code").asText()).isEqualTo("BOAT_PARTNER_UNAVAILABLE");
            assertThat(rider.request("WORLD_BOAT_TEAM", Map.of("action", "SOLO")).at("/payload/code").asText())
                    .isEqualTo("FACILITY_LEASE_MISMATCH");
            // 선착장에서 멀면 대기열에 들어가지 못한다.
            channels.releaseFacility("101", new WorldFacilityService.Pose(-60, 5, 60, 0));
            assertThat(solo(rider).at("/payload/code").asText()).isEqualTo("FACILITY_OUT_OF_RANGE");

            Object fares;
            synchronized (hub) {
                fares = ReflectionTestUtils.getField(hub, "boatFares");
                ReflectionTestUtils.setField(hub, "boatFares", null);
            }
            try {
                assertThat(solo(other).at("/payload/code").asText()).isEqualTo("BOAT_UNAVAILABLE");
            } finally {
                synchronized (hub) {
                    ReflectionTestUtils.setField(hub, "boatFares", fares);
                }
            }
        }
    }

    private static final class MutableClock extends Clock {
        private volatile long at = 1_800_000_000_000L;

        @Override
        public ZoneId getZone() { return ZoneOffset.UTC; }

        @Override
        public Clock withZone(ZoneId zone) { return this; }

        @Override
        public Instant instant() { return Instant.ofEpochMilli(at); }
    }
}
