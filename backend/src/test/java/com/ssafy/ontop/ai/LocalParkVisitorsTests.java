package com.ssafy.ontop.ai;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class LocalParkVisitorsTests {
    @Test void movementFollowsWalkwayInsteadOfCuttingAcrossGrassAndCanStop() {
        var visitors=new LocalParkVisitors();
        visitors.walk("산책자 A","world:one",28,18);
        for(int i=0;i<60;i++) {
            visitors.tick(.25);
            var p=visitors.position("산책자 A","world:one");
            assertThat(p.x()>=4 && p.x()<=28 && p.z()>=4 && p.z()<=18).isTrue();
            assertThat(p.x()==4 || p.x()==28 || p.z()==4 || p.z()==18).isTrue();
        }
        var arrived=visitors.views("world:one").getFirst();
        assertThat(arrived.x()).isEqualTo(28); assertThat(arrived.z()).isEqualTo(18); assertThat(arrived.moving()).isFalse();
        visitors.walk("산책자 A","world:one",4,4); visitors.tick(.25); visitors.stop("산책자 A","world:one");
        var stopped=visitors.position("산책자 A","world:one"); visitors.tick(.5);
        assertThat(visitors.position("산책자 A","world:one")).isEqualTo(stopped);
    }
    @Test void grassInvalidFixturesAndNonfiniteCoordinatesAreRejected() {
        var visitors=new LocalParkVisitors();
        assertThatThrownBy(() -> visitors.walk("산책자 A","world:one",16,11)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> visitors.walk("산책자 A","world:one",Double.NaN,4)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> visitors.walk("fake","world:one",4,4)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void audienceIsCapturedAtSendingPositionAndWorldRoomsDoNotShareMovement() {
        var visitors=new LocalParkVisitors();
        var before=visitors.audience("산책자 A","world:one");
        assertThat(before).contains("산책자 B");
        visitors.walk("산책자 A","world:one",28,18);
        for(int i=0;i<60;i++) visitors.tick(.25);
        assertThat(visitors.audience("산책자 A","world:one")).doesNotContain("산책자 B");
        assertThat(before).contains("산책자 B");
        assertThat(visitors.position("산책자 A","world:two")).isEqualTo(new NpcDirector.Point(4,4));
        assertThat(visitors.audience("산책자 A","game:omok")).contains("산책자 B");
    }
}
