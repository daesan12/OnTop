package com.ssafy.ontop.game.speedmole;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class SpeedMoleRulesTests {
    @Test void unsigned_seed_one_matches_the_clients_twelve_replacements() {
        int[] holes = {1,3,5,6,0,2,7,4,1,5,2,3};
        var taps = new ArrayList<SpeedMoleRules.Tap>();
        for (int i = 0; i < holes.length; i++) taps.add(new SpeedMoleRules.Tap(holes[i], i * 100));
        assertThat(SpeedMoleRules.replay(1, taps)).isEqualTo(new SpeedMoleRules.Score(12,12,0));
    }
    @Test void misses_clamp_after_each_tap_and_do_not_block_next_hit() {
        int[] holes = {0,0,1,3,4,5};
        var taps = new ArrayList<SpeedMoleRules.Tap>();
        for (int i = 0; i < holes.length; i++) taps.add(new SpeedMoleRules.Tap(holes[i], i));
        assertThat(SpeedMoleRules.replay(1, taps)).isEqualTo(new SpeedMoleRules.Score(1,3,3));
    }
    @Test void hit_listener_reports_when_each_hit_target_appeared_without_changing_the_score() {
        var taps = new ArrayList<SpeedMoleRules.Tap>();
        for (int i = 0; i < 200; i++) taps.add(new SpeedMoleRules.Tap(i % 8, 100 + i * 50));
        var hitTimes = new ArrayList<Integer>();
        var initial = new int[1];
        var score = SpeedMoleRules.replay(1, taps, (appearedAt, at) -> {
            // 처음 4마리가 아니면 앞선 적중이 그 두더지를 불러냈다.
            if (appearedAt < 0) initial[0]++;
            else assertThat(hitTimes).contains(appearedAt);
            assertThat(appearedAt).isLessThan(at);
            hitTimes.add(at);
        });
        assertThat(score).isEqualTo(SpeedMoleRules.replay(1, taps));
        assertThat(hitTimes).hasSize(score.hits());
        assertThat(initial[0]).isBetween(1, 4);
        assertThat(score.hits()).isGreaterThan(initial[0]);
    }
    @Test void no_input_is_a_valid_zero_score() { assertThat(SpeedMoleRules.replay(1, List.of())).isEqualTo(new SpeedMoleRules.Score(0,0,0)); }
    @Test void malformed_timestamps_holes_and_nulls_are_rejected() {
        for (var tap : List.of(new SpeedMoleRules.Tap(-1,0),new SpeedMoleRules.Tap(8,0),
                new SpeedMoleRules.Tap(0,-1),new SpeedMoleRules.Tap(0,60000))) {
            assertThatThrownBy(() -> SpeedMoleRules.replay(1,List.of(tap))).isInstanceOf(SpeedMoleException.class);
        }
        assertThatThrownBy(() -> SpeedMoleRules.replay(1,List.of(new SpeedMoleRules.Tap(1,10),new SpeedMoleRules.Tap(3,9)))).isInstanceOf(SpeedMoleException.class);
        var nullTap = new ArrayList<SpeedMoleRules.Tap>(); nullTap.add(null);
        assertThatThrownBy(() -> SpeedMoleRules.replay(1,nullTap)).isInstanceOf(SpeedMoleException.class);
        assertThatThrownBy(() -> SpeedMoleRules.replay(1,null)).isInstanceOf(SpeedMoleException.class);
    }
    @Test void request_size_is_bounded() {
        assertThatThrownBy(() -> SpeedMoleRules.replay(1,java.util.Collections.nCopies(6001,new SpeedMoleRules.Tap(0,0))))
                .isInstanceOf(SpeedMoleException.class);
    }
}
