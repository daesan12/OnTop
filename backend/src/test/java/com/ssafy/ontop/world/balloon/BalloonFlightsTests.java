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
}
