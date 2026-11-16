package com.ssafy.ontop.world.boat;

import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DuckBoatScheduleTests {
    // 60초 한 바퀴, 진입로 3초.
    private final DuckBoatRoute route = new DuckBoatRoute(60, 3.5,
            List.of(new double[] {0, 0}, new double[] {0, -30}, new double[] {30, -30}, new double[] {0, 0}),
            List.of(new double[] {-.47, 1.06, .48}, new double[] {.47, 1.06, .48}), 3);
    private final DuckBoatSchedule schedule = new DuckBoatSchedule(route);

    private DuckBoatSchedule.TeamView team(String channel, int slot) {
        return schedule.view(channel).teams().stream().filter(t -> t.slot() == slot).findFirst().orElseThrow();
    }

    @Test
    void 혼자_타는_팀은_기다리지_않고_바로_출발한다() {
        schedule.join("ch", "a", schedule.freeSlot("ch"), null, 1_000);

        assertThat(team("ch", 0).departAt()).isEqualTo(1_000);
        var departure = schedule.advance(1_000).departures();

        assertThat(departure).singleElement().satisfies(d -> {
            assertThat(d.boat()).isZero();
            assertThat(d.riders()).containsExactly(new DuckBoatSchedule.Rider("a", 0));
        });
        assertThat(schedule.ride("a")).containsExactly(1_000, 0, 0);
        assertThat(schedule.view("ch").teams()).isEmpty();
        assertThat(schedule.sailing("ch")).isTrue();
    }

    @Test
    void 대기는_두_팀까지_받고_대기_자리는_팀마다_둘이다() {
        schedule.join("ch", "a", 0, "b", 0);
        schedule.join("ch", "c", 1, null, 0);

        assertThat(schedule.freeSlot("ch")).isEqualTo(-1);
        assertThatThrownBy(() -> schedule.join("ch", "d", 0, null, 0)).isInstanceOf(IllegalStateException.class);
        assertThat(DuckBoatSchedule.queueSeat(1, 1)).isEqualTo(3);
        assertThat(DuckBoatSchedule.boatSeat(0, 0)).isEqualTo(4);
        assertThat(schedule.queueSeat("c")).isEqualTo(2);
    }

    @Test
    void 초대를_수락하면_둘이_같은_배로_출발하고_수락_전에는_출발하지_않는다() {
        schedule.join("ch", "a", 0, "b", 0);

        assertThat(team("ch", 0).phase()).isEqualTo(DuckBoatSchedule.Phase.INVITING);
        assertThat(team("ch", 0).deadline()).isEqualTo(15_000);
        assertThat(team("ch", 0).departAt()).isNull();
        assertThat(schedule.advance(5_000).departures()).isEmpty();
        assertThat(schedule.invitersOf("b")).containsExactly("a");

        schedule.accept("a", "b");
        assertThat(schedule.queueSeat("b")).isEqualTo(1);
        var departure = schedule.advance(6_000).departures().get(0);

        assertThat(departure.riders()).containsExactly(new DuckBoatSchedule.Rider("a", 0),
                new DuckBoatSchedule.Rider("b", 1));
    }

    @Test
    void 초대가_15초_안에_답이_없으면_고르기로_넘어가고_다시_10초_안에_안_고르면_대기에서_뺀다() {
        schedule.join("ch", "a", 0, "b", 0);

        assertThat(schedule.advance(14_999).invitesClosed()).isEmpty();
        var closed = schedule.advance(15_000).invitesClosed();
        assertThat(closed).containsExactly(new DuckBoatSchedule.InviteClosed("ch", "a", "b"));
        assertThat(team("ch", 0).phase()).isEqualTo(DuckBoatSchedule.Phase.CHOOSING);
        assertThat(team("ch", 0).deadline()).isEqualTo(25_000);
        assertThat(schedule.invite("a", "b")).isNull();
        assertThatThrownBy(() -> schedule.accept("a", "b")).isInstanceOf(IllegalStateException.class);

        assertThat(schedule.advance(24_999).choicesExpired()).isEmpty();
        assertThat(schedule.advance(25_000).choicesExpired()).containsExactly(new DuckBoatSchedule.ChoiceExpired("ch", "a"));
    }

    @Test
    void 거절하면_혼자_타기나_다른_사람_초대를_고를_수_있다() {
        schedule.join("ch", "a", 0, "b", 0);
        assertThat(schedule.decline("a", "b", 2_000)).isTrue();
        assertThat(schedule.decline("a", "b", 2_000)).isFalse();

        schedule.reinvite("a", "c", 3_000);
        assertThat(team("ch", 0).partnerId()).isEqualTo("c");
        assertThat(team("ch", 0).deadline()).isEqualTo(18_000);
        schedule.solo("a");

        assertThat(schedule.pendingPartner("a")).isNull();
        assertThat(schedule.advance(3_000).departures().get(0).riders())
                .containsExactly(new DuckBoatSchedule.Rider("a", 0));
    }

    @Test
    void 준비된_팀은_먼저_온_순서로_10초_간격을_두고_출발하며_초대_중인_팀은_뒤_팀을_막지_않는다() {
        schedule.join("ch", "a", 0, "b", 0);
        schedule.join("ch", "c", 1, null, 1_000);

        // 초대 중인 앞 팀을 기다리지 않는다.
        assertThat(schedule.advance(1_000).departures()).extracting(DuckBoatSchedule.Departure::riders)
                .containsExactly(List.of(new DuckBoatSchedule.Rider("c", 0)));
        schedule.accept("a", "b");
        assertThat(team("ch", 0).departAt()).isEqualTo(11_000);
        assertThat(schedule.advance(10_999).departures()).isEmpty();
        assertThat(schedule.advance(11_000).departures().get(0).boat()).isEqualTo(1);
    }

    @Test
    void 두_팀이_모두_준비되면_먼저_온_팀부터_출발한다() {
        schedule.join("ch", "late", 1, null, 2_000);
        schedule.join("ch", "early", 0, null, 1_000);

        assertThat(team("ch", 0).departAt()).isEqualTo(1_000);
        assertThat(team("ch", 1).departAt()).isEqualTo(11_000);
        assertThat(schedule.advance(2_000).departures().get(0).riders())
                .containsExactly(new DuckBoatSchedule.Rider("early", 0));
    }

    @Test
    void 네_척이_모두_나가_있으면_가장_먼저_돌아오는_배를_기다린다() {
        for (int i = 0; i < 4; i++) {
            long at = i * 10_000L;
            schedule.join("ch", "u" + i, 0, null, at);
            assertThat(schedule.advance(at).departures()).hasSize(1);
        }
        schedule.join("ch", "late", 0, null, 36_000);

        // 첫 배는 0초에 출발해 60초에 돌아온다. 도착 순간 같은 자리에서 출발한다.
        assertThat(team("ch", 0).departAt()).isEqualTo(60_000);
        var events = schedule.advance(60_000);
        assertThat(events.arrivals()).extracting(DuckBoatSchedule.Arrival::riders).containsExactly(List.of("u0"));
        assertThat(events.departures().get(0).boat()).isZero();
    }

    @Test
    void 돌아오는_배가_진입로에_있는_동안에는_출발하지_않는다() {
        schedule.join("ch", "a", 0, null, 0);
        schedule.advance(0);
        // 60초 도착. 진입로를 함께 쓰는 54~60초 사이에는 출발하지 않는다.
        schedule.join("ch", "b", 0, null, 55_000);

        assertThat(team("ch", 0).departAt()).isEqualTo(60_000);
        schedule.leave("b");
        schedule.join("ch", "b", 0, null, 40_000);
        assertThat(team("ch", 0).departAt()).isEqualTo(40_000);
    }

    @Test
    void 중간에_내린_사람만_빠지고_모두_내리면_운항을_끝낸다() {
        schedule.join("ch", "a", 0, "b", 0);
        schedule.accept("a", "b");
        schedule.advance(0);

        assertThat(schedule.leave("a")).isTrue();
        assertThat(schedule.ride("a")).isNull();
        assertThat(schedule.ride("b")).containsExactly(0, 1, 0);
        assertThat(schedule.leave("b")).isTrue();
        assertThat(schedule.sailing("ch")).isFalse();
        assertThat(schedule.leave("b")).isFalse();
    }

    @Test
    void 대기_중_초대한_사람이_빠지면_함께_기다리던_사람은_혼자_팀으로_남는다() {
        schedule.join("ch", "a", 0, "b", 0);
        schedule.join("ch", "c", 1, null, 0);
        schedule.advance(0);
        schedule.accept("a", "b");
        schedule.leave("a");

        var left = team("ch", 0);
        assertThat(left.members()).containsExactly(null, "b");
        assertThat(left.phase()).isEqualTo(DuckBoatSchedule.Phase.READY);
        assertThat(schedule.advance(10_000).departures().get(0).riders())
                .containsExactly(new DuckBoatSchedule.Rider("b", 0));
    }

    @Test
    void 초대_중에_초대한_사람이_빠지면_팀과_초대가_사라진다() {
        schedule.join("ch", "a", 0, "b", 0);
        schedule.leave("a");

        assertThat(schedule.view("ch").teams()).isEmpty();
        assertThat(schedule.invite("a", "b")).isNull();
        assertThat(schedule.invitersOf("b")).isEmpty();
    }

    @Test
    void 한_바퀴가_끝나면_도착으로_내리고_다시_대기할_수_있다() {
        schedule.join("ch", "a", 0, null, 0);
        schedule.advance(0);

        assertThat(schedule.advance(59_999).arrivals()).isEmpty();
        assertThat(schedule.advance(60_000).arrivals()).extracting(DuckBoatSchedule.Arrival::riders)
                .containsExactly(List.of("a"));
        assertThat(schedule.ride("a")).isNull();
        schedule.join("ch", "a", 0, null, 61_000);
    }

    @Test
    void 채널마다_따로_운항한다() {
        schedule.join("ch1", "a", 0, null, 0);
        schedule.join("ch2", "b", 0, null, 0);

        assertThat(schedule.advance(0).departures()).extracting(DuckBoatSchedule.Departure::channelId)
                .containsExactlyInAnyOrder("ch1", "ch2");
    }
}
