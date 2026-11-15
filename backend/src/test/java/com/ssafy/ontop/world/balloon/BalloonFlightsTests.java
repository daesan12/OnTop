package com.ssafy.ontop.world.balloon;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.balloon.BalloonFlights.Flight;
import com.ssafy.ontop.world.balloon.BalloonFlights.CabinPose;
import com.ssafy.ontop.world.balloon.BalloonFlights.Point;
import com.ssafy.ontop.world.balloon.BalloonFlights.State;
import com.ssafy.ontop.world.map.PreparedParkMap;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class BalloonFlightsTests {
    private static final Instant NOW = Instant.parse("2026-11-15T00:00:00Z");
    private static final UUID TICKET = UUID.randomUUID();
    private static final Point DOCK = new Point(-33.608, 22.4, -76);
    private static final Position GROUND = new Position(1, -40, 23.905, -61.952, 0);
    private static final String CHANNEL = "channel-1";
    private static final String PILOT = "101";
    private static final String SESSION = "socket-1";

    private BalloonFlights flights;

    @BeforeEach
    void 준비() throws Exception {
        var map = mock(WorldMapRuntime.class);
        var prepared = mock(PreparedParkMap.class);
        var json = new ObjectMapper();
        when(map.prepared()).thenReturn(Optional.of(prepared));
        when(prepared.constructionSites()).thenReturn(json.readTree("""
                [{"id":"balloon","position":[-40,22.1,-76],"reachPosition":[-40,23.905,-61.952],
                  "radius":3,"heightTolerance":0.7}]
                """));
        when(prepared.collisionData()).thenReturn(json.readTree("""
                {"world":{"halfSize":110}}
                """));
        flights = new BalloonFlights(map);
    }

    @Test
    void 결제를_확인한_비행의_최신_좌표는_같은_채널에만_공개된다() {
        flights.authorize(PILOT, TICKET, NOW, NOW);
        var initial = flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW, 0);
        var next = new Flight(new Point(DOCK.x(), DOCK.y() + 1, DOCK.z()), true);
        long tick = Duration.ofMillis(200).toNanos();

        var updated = flights.update(CHANNEL, PILOT, SESSION, TICKET, next, tick);

        assertThat(initial).isEqualTo(new State(CHANNEL, PILOT, new Flight(DOCK, true)));
        assertThat(flights.snapshot(CHANNEL, tick)).containsExactly(updated);
        assertThat(flights.snapshot("channel-2", tick)).isEmpty();
        assertThat(updated.flight()).isEqualTo(next);
    }

    @Test
    void 다른_회원의_탑승권과_다른_연결의_좌표를_거절한다() {
        flights.authorize(PILOT, TICKET, NOW, NOW);
        assertThat(flights.start(CHANNEL, "102", SESSION, TICKET, GROUND, DOCK, NOW, 0)).isNull();
        flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW, 0);
        long tick = Duration.ofMillis(200).toNanos();

        assertThat(flights.update(CHANNEL, PILOT, "other", TICKET, new Flight(DOCK, true), tick)).isNull();
        assertThat(flights.update(CHANNEL, PILOT, SESSION, TICKET,
                new Flight(new Point(120, 30, 0), true), tick)).isNull();
    }

    @Test
    void 기내_좌석_상태는_공개하고_바구니_밖의_좌표는_거절한다() {
        flights.authorize(PILOT, TICKET, NOW, NOW);
        flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW, 0);
        long tick = Duration.ofMillis(200).toNanos();
        var seat = new CabinPose(0, -1.22, 0, 0, false);

        var seated = flights.update(CHANNEL, PILOT, SESSION, TICKET, new Flight(DOCK, true, seat), tick);
        var outside = new CabinPose(1.5, .7, 0, -1, true);
        var rejected = flights.update(CHANNEL, PILOT, SESSION, TICKET, new Flight(DOCK, true, outside), tick * 2);

        assertThat(seated.flight().cabin()).isEqualTo(seat);
        assertThat(rejected).isNull();
        assertThat(flights.snapshot(CHANNEL, tick * 2)).containsExactly(seated);
    }

    @Test
    void 첫_좌표를_받기_전_연결이_끊기면_같은_탑승권으로_재시도할_수_있다() {
        flights.authorize(PILOT, TICKET, NOW, NOW);
        flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW, 0);
        assertThat(flights.finish(PILOT, SESSION, null)).isEqualTo(new State(CHANNEL, PILOT, null));

        assertThat(flights.start(CHANNEL, PILOT, "reconnected", TICKET, GROUND, DOCK, NOW, 0)).isNotNull();
    }

    @Test
    void 업데이트가_끊긴_비행을_제거하고_사용한_탑승권은_재사용하지_않는다() {
        flights.authorize(PILOT, TICKET, NOW, NOW);
        flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW, 0);
        flights.update(CHANNEL, PILOT, SESSION, TICKET, new Flight(DOCK, true), Duration.ofMillis(200).toNanos());
        long later = Duration.ofSeconds(9).toNanos();

        assertThat(flights.expire(NOW.plusSeconds(9), later)).containsExactly(new State(CHANNEL, PILOT, null));
        assertThat(flights.snapshot(CHANNEL, later)).isEmpty();
        flights.authorize(PILOT, TICKET, NOW, NOW.plusSeconds(9));
        assertThat(flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW.plusSeconds(9), later)).isNull();
    }

    @Test
    void 조종자를_포함해_최대_네_명이_탑승하고_다른_채널이나_만석인_열기구는_좌석을_예약할_수_없다() {
        flights.authorize(PILOT, TICKET, NOW, NOW);
        flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW, 0, 4, null);
        for (String guest : new String[]{"102", "103", "104"}) {
            UUID ticket = UUID.randomUUID();
            assertThat(flights.holdSeat("channel-2", PILOT, guest, ticket, NOW, 0)).isFalse();
            assertThat(flights.holdSeat(CHANNEL, PILOT, guest, ticket, NOW, 0)).isTrue();
            flights.authorize(guest, ticket, NOW, NOW);
            var state = flights.start(CHANNEL, guest, "socket-" + guest, ticket, GROUND, DOCK, NOW, 0, 1, PILOT);
            assertThat(state.pilotId()).isEqualTo(PILOT);
        }
        assertThat(flights.holdSeat(CHANNEL, PILOT, "105", UUID.randomUUID(), NOW, 0)).isFalse();
        var state = flights.launch(CHANNEL, PILOT, SESSION, TICKET, NOW, 0);
        assertThat(state.party().boarding()).isFalse();
        assertThat(state.party().passengers().values()).extracting(CabinPose::seatIndex).containsExactlyInAnyOrder(0, 1, 2);
        assertThat(flights.finish(PILOT, SESSION, TICKET)).isEqualTo(new State(CHANNEL, PILOT, null));
        assertThat(flights.snapshot(CHANNEL, 0)).isEmpty();
    }

    @Test
    void 결제_중인_좌석을_보호하고_조종자는_정원을_채우지_않아도_출발할_수_있다() {
        flights.authorize(PILOT, TICKET, NOW, NOW);
        flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW, 0, 2, null);
        UUID guestTicket = UUID.randomUUID();
        assertThat(flights.holdSeat(CHANNEL, PILOT, "102", guestTicket, NOW, 0)).isTrue();
        assertThat(flights.holdSeat(CHANNEL, PILOT, "103", UUID.randomUUID(), NOW, 0)).isFalse();
        assertThat(flights.launch(CHANNEL, PILOT, SESSION, TICKET, NOW, 0)).isNull();
        flights.releaseSeat(PILOT, "102", guestTicket);
        assertThat(flights.launch(CHANNEL, PILOT, SESSION, TICKET, NOW, 0).party().boarding()).isFalse();
        assertThat(flights.holdSeat(CHANNEL, PILOT, "102", guestTicket, NOW, 0)).isFalse();
    }

    @Test
    void 탑승객은_열기구를_이동시키거나_다른_탑승객의_의자를_차지할_수_없다() {
        flights.authorize(PILOT, TICKET, NOW, NOW);
        flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW, 0, 3, null);
        UUID guestTicket = UUID.randomUUID();
        for (String guest : new String[]{"102", "103"}) {
            assertThat(flights.holdSeat(CHANNEL, PILOT, guest, guestTicket, NOW, 0)).isTrue();
            flights.authorize(guest, guestTicket, NOW, NOW);
            flights.start(CHANNEL, guest, "socket-" + guest, guestTicket, GROUND, DOCK, NOW, 0, 1, PILOT);
        }
        assertThat(flights.launch(CHANNEL, "102", "socket-102", guestTicket, NOW, 0)).isNull();
        flights.launch(CHANNEL, PILOT, SESSION, TICKET, NOW, 0);
        long tick = Duration.ofMillis(200).toNanos();
        var blocked = flights.update(CHANNEL, "102", "socket-102", guestTicket,
                new Flight(new Point(99, 30, 0), false, new CabinPose(0, 0, 0, 1, false)), tick);
        assertThat(blocked.flight().position()).isEqualTo(DOCK);
        assertThat(blocked.flight().aboard()).isTrue();
        assertThat(blocked.party().passengers().get("102").seatIndex()).isZero();

        var walking = new CabinPose(.25, -.2, 0, -1, true);
        var moved = flights.update(CHANNEL, "102", "socket-102", guestTicket, new Flight(DOCK, true, walking), tick);
        assertThat(moved.party().passengers().get("102")).isEqualTo(walking);
        assertThat(flights.finish("102", "socket-102", guestTicket).party().passengers()).doesNotContainKey("102");
    }
}
