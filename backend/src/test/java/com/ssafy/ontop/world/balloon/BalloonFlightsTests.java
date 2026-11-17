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

    @Test
    void 일인_수동_탑승은_출발_전까지_같은_탑승권으로_내렸다_다시_탈_수_있다() {
        flights.authorize(PILOT, TICKET, NOW, NOW);
        var boarding = flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW, 0, 1, null, "solo");

        assertThat(boarding.party().boarding()).isTrue();
        assertThat(boarding.flight().cabin().x()).isNegative();
        var stillBoarding = flights.update(CHANNEL, PILOT, SESSION, TICKET, new Flight(DOCK, true),
                Duration.ofMillis(200).toNanos());
        assertThat(stillBoarding.party().boarding()).isTrue();
        flights.finish(PILOT, SESSION, TICKET);
        assertThat(flights.ticketAvailable(PILOT, TICKET, NOW)).isTrue();
        assertThat(flights.drainUsage()).isEmpty();

        flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW, 0, 1, null, "solo");
        assertThat(flights.launch(CHANNEL, PILOT, SESSION, TICKET, NOW, 0).party().boarding()).isFalse();
        assertThat(flights.ticketAvailable(PILOT, TICKET, NOW)).isFalse();
    }

    @Test
    void 분담_조종은_담당_입력만_반영하고_수락_시_두_좌석을_동시에_교대한다() {
        String guest = "102";
        UUID guestTicket = UUID.randomUUID();
        flights.authorize(PILOT, TICKET, NOW, NOW);
        flights.authorize(guest, guestTicket, NOW, NOW);
        assertThat(flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW, 0, 4, null, "split")).isNotNull();
        assertThat(flights.launch(CHANNEL, PILOT, SESSION, TICKET, NOW, 0)).isNull();
        assertThat(flights.holdSeat(CHANNEL, PILOT, guest, guestTicket, NOW, 0)).isTrue();
        flights.start(CHANNEL, guest, "guest", guestTicket, GROUND, DOCK, NOW, 0, 1, PILOT);
        UUID passengerTicket = UUID.randomUUID();
        flights.authorize("103", passengerTicket, NOW, NOW);
        assertThat(flights.holdSeat(CHANNEL, PILOT, "103", passengerTicket, NOW, 0)).isTrue();
        var boarded = flights.start(CHANNEL, "103", "passenger", passengerTicket, GROUND, DOCK, NOW, 0, 1, PILOT);
        assertThat(boarded.party().passengers().get("103").seatIndex()).isEqualTo(1);
        flights.launch(CHANNEL, PILOT, SESSION, TICKET, NOW, 0);
        long tick = Duration.ofMillis(200).toNanos();
        var pose = new Flight(DOCK, true);
        flights.update(CHANNEL, PILOT, SESSION, TICKET, pose, new BalloonControls.Intent(1, -1, -1), tick);
        var flying = flights.update(CHANNEL, guest, "guest", guestTicket, pose, new BalloonControls.Intent(-1, 1, 1), tick);
        assertThat(flying.party().controls().input()).isEqualTo(new BalloonControls.Intent(1, -1, 1));

        var offer = flights.control(CHANNEL, PILOT, SESSION, TICKET, "offer", "direction", guest, tick).party().controls().offer();
        assertThat(flights.control(CHANNEL, guest, "guest", guestTicket, "accept", "direction", "old-offer", tick)).isNull();
        var swapped = flights.control(CHANNEL, guest, "guest", guestTicket, "accept", "direction", offer.id(), tick);
        assertThat(swapped.party().controls().direction()).isEqualTo(guest);
        assertThat(swapped.party().controls().altitude()).isEqualTo(PILOT);
        assertThat(swapped.party().controls().input()).isEqualTo(BalloonControls.Intent.STOPPED);
        assertThat(swapped.party().controls().emptyMillis()).isNull();
        assertThat(swapped.flight().cabin().seatIndex()).isEqualTo(2);

        var oneLeft = flights.control(CHANNEL, PILOT, SESSION, TICKET, "leave", "altitude", null, tick);
        assertThat(oneLeft.party().controls().emptyMillis()).isNull();
        var bothLeft = flights.control(CHANNEL, guest, "guest", guestTicket, "leave", "direction", null, tick);
        assertThat(bothLeft.party().controls().emptyMillis()).isEqualTo(3000);
    }

    @Test
    void 혼자_조종하면_양쪽_입력이_가능하고_자리에서_일어난_뒤_삼초가_지나면_추락_대기가_끝난다() {
        flights.authorize(PILOT, TICKET, NOW, NOW);
        flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW, 0, 2, null, "split");
        var solo = flights.launch(CHANNEL, PILOT, SESSION, TICKET, NOW, 0, true);
        assertThat(solo.party().controls().mode()).isEqualTo("solo");
        long tick = Duration.ofMillis(200).toNanos();
        var intent = new BalloonControls.Intent(-1, 1, -1);
        assertThat(flights.update(CHANNEL, PILOT, SESSION, TICKET, new Flight(DOCK, true), intent, tick)
                .party().controls().input()).isEqualTo(intent);
        var empty = flights.control(CHANNEL, PILOT, SESSION, TICKET, "leave", "direction", null, tick);
        assertThat(empty.party().controls().emptyMillis()).isEqualTo(3000);
        assertThat(flights.snapshot(CHANNEL, tick + Duration.ofMillis(2999).toNanos()).getFirst()
                .party().controls().emptyMillis()).isEqualTo(1);
        long falling = tick + Duration.ofSeconds(3).toNanos();
        assertThat(flights.snapshot(CHANNEL, falling).getFirst().party().controls().emptyMillis()).isZero();
        var rescued = flights.control(CHANNEL, PILOT, SESSION, TICKET, "claim", "direction", null, falling);
        assertThat(rescued.party().controls().emptyMillis()).isNull();
    }

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
    void 혼자_비행은_첫_비행_갱신에_이륙을_남기고_직접_내리면_탄_시간과_함께_하차를_남긴다() {
        flights.authorize(PILOT, TICKET, NOW, NOW);
        flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW, 0);
        assertThat(flights.drainUsage()).isEmpty();
        long tick = Duration.ofMillis(200).toNanos();
        flights.update(CHANNEL, PILOT, SESSION, TICKET, new Flight(DOCK, true), tick);
        flights.update(CHANNEL, PILOT, SESSION, TICKET, new Flight(DOCK, true), tick * 2);

        assertThat(flights.drainUsage()).containsExactly(
                new BalloonFlights.Usage(CHANNEL, PILOT, TICKET, "PILOT", 1, "single", null, 0, 100));
        flights.finish(PILOT, SESSION, TICKET, tick + Duration.ofSeconds(30).toNanos());
        assertThat(flights.drainUsage()).containsExactly(new BalloonFlights.Usage(CHANNEL, PILOT, TICKET, "PILOT",
                1, "single", "ENDED", Duration.ofSeconds(30).toNanos(), 100));
        assertThat(flights.drainUsage()).isEmpty();
    }

    @Test
    void 이륙_전에_내린_탑승은_남기지_않는다() {
        flights.authorize(PILOT, TICKET, NOW, NOW);
        flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW, 0);

        flights.finish(PILOT, SESSION, null, 1, "DISCONNECTED");

        assertThat(flights.drainUsage()).isEmpty();
    }

    @Test
    void 여럿_비행은_출발에_모두_이륙하고_동승자는_따로_내리며_시간이_지나면_남은_사람이_함께_내린다() {
        String guest = "102";
        String rider = "103";
        UUID guestTicket = UUID.randomUUID();
        UUID riderTicket = UUID.randomUUID();
        flights.authorize(PILOT, TICKET, NOW, NOW);
        flights.authorize(guest, guestTicket, NOW, NOW);
        flights.authorize(rider, riderTicket, NOW, NOW);
        flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW, 0, 3, null, "split");
        flights.holdSeat(CHANNEL, PILOT, guest, guestTicket, NOW, 0);
        flights.start(CHANNEL, guest, "guest", guestTicket, GROUND, DOCK, NOW, 0, 1, PILOT);
        flights.holdSeat(CHANNEL, PILOT, rider, riderTicket, NOW, 0);
        flights.start(CHANNEL, rider, "rider", riderTicket, GROUND, DOCK, NOW, 0, 1, PILOT);
        assertThat(flights.drainUsage()).isEmpty();

        long launched = Duration.ofSeconds(1).toNanos();
        flights.launch(CHANNEL, PILOT, SESSION, TICKET, NOW, launched);
        assertThat(flights.drainUsage()).extracting(BalloonFlights.Usage::riderId, BalloonFlights.Usage::role,
                BalloonFlights.Usage::riders, BalloonFlights.Usage::mode, BalloonFlights.Usage::endReason)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(PILOT, "PILOT", 3, "split", null),
                        org.assertj.core.groups.Tuple.tuple(guest, "PASSENGER", 3, "split", null),
                        org.assertj.core.groups.Tuple.tuple(rider, "PASSENGER", 3, "split", null));

        flights.finish(rider, "rider", riderTicket, launched + Duration.ofSeconds(20).toNanos(), "CHANNEL_LEFT");
        assertThat(flights.drainUsage()).containsExactly(new BalloonFlights.Usage(CHANNEL, rider, riderTicket,
                "PASSENGER", 3, "split", "CHANNEL_LEFT", Duration.ofSeconds(20).toNanos(), 100));

        long idle = launched + Duration.ofSeconds(9).toNanos();
        flights.expire(NOW.plusSeconds(10), idle);
        assertThat(flights.drainUsage()).extracting(BalloonFlights.Usage::riderId, BalloonFlights.Usage::endReason,
                BalloonFlights.Usage::durationNanos)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(PILOT, "EXPIRED", Duration.ofSeconds(9).toNanos()),
                        org.assertj.core.groups.Tuple.tuple(guest, "EXPIRED", Duration.ofSeconds(9).toNanos()));
    }

    @Test
    void 조종사가_끝내면_남은_동승자는_조종사_종료로_함께_내린다() {
        String guest = "102";
        UUID guestTicket = UUID.randomUUID();
        flights.authorize(PILOT, TICKET, NOW, NOW);
        flights.authorize(guest, guestTicket, NOW, NOW);
        flights.start(CHANNEL, PILOT, SESSION, TICKET, GROUND, DOCK, NOW, 0, 2, null);
        flights.holdSeat(CHANNEL, PILOT, guest, guestTicket, NOW, 0);
        flights.start(CHANNEL, guest, "guest", guestTicket, GROUND, DOCK, NOW, 0, 1, PILOT);
        flights.launch(CHANNEL, PILOT, SESSION, TICKET, NOW, 0);
        flights.drainUsage();

        flights.finish(PILOT, SESSION, TICKET, Duration.ofSeconds(5).toNanos(), "DISCONNECTED");

        assertThat(flights.drainUsage()).extracting(BalloonFlights.Usage::riderId, BalloonFlights.Usage::mode,
                BalloonFlights.Usage::endReason)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(PILOT, "party", "DISCONNECTED"),
                        org.assertj.core.groups.Tuple.tuple(guest, "party", "PILOT_ENDED"));
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
