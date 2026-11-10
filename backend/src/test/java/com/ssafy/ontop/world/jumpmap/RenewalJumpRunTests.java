package com.ssafy.ontop.world.jumpmap;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class RenewalJumpRunTests {
    static JumpCourse course() throws Exception {
        return JumpCourse.load(Path.of("../frontend/generated/park-renewal/course.local.json"),
                Path.of("../frontend/generated/park-renewal/course.local.sha256"));
    }

    @Test
    void 새_코스는_178개_충돌체와_증가하는_10단계_250냥을_검증한다() throws Exception {
        var course = course();
        assertThat(course.stageCount()).isEqualTo(10);
        assertThat(course.colliders()).hasSize(178);
        assertThat(course.stages().stream().map(JumpCourse.Stage::reward).toList())
                .containsExactly(5,10,15,20,25,30,32,35,38,40);
        assertThat(course.courseVersion()).isEqualTo("park220-jump10-v1");
        assertThat(course.rulesVersion()).isEqualTo("v4");
    }

    @Test
    void 마지막_오리_후_호수섬에_도착해야_250냥_완주하며_중복_완주하지_않는다() throws Exception {
        var course = course();
        var run = new JumpRun("run", 0, course, 4.65);
        var gates = new ArrayList<JumpRun.GatePassed>();
        long now = 0;
        for (var p : course.colliders()) {
            if (p.block() == 0) continue;
            for (var event : run.land(p.block(),p.gate(),++now)) if(event instanceof JumpRun.GatePassed gate) gates.add(gate);
            assertThat(run.land(p.block(),p.gate(),now)).isEmpty();
        }
        assertThat(run.active()).isTrue();
        assertThat(run.finalReached()).isTrue();
        assertThat(run.gatesPassed()).isEqualTo(9);
        for(var event : run.terrain(course.finish().x(),course.finish().z(),++now)) if(event instanceof JumpRun.GatePassed gate) gates.add(gate);
        assertThat(gates).extracting(JumpRun.GatePassed::gate).containsExactly(1,2,3,4,5,6,7,8,9,10);
        assertThat(gates.stream().mapToInt(JumpRun.GatePassed::coinsCalculated).sum()).isEqualTo(250);
        assertThat(run.ended()).isEqualTo(JumpRun.EndReason.FINISH);
        assertThat(run.terrain(course.finish().x(),course.finish().z(),++now)).isEmpty();
    }

    @Test
    void 같은_발판_반복과_단계_건너뛰기로는_보상을_얻지_못한다() throws Exception {
        var course = course();
        var run = new JumpRun("run",0,course,4.65);
        var first = course.colliders().get(1);
        for(int i=0;i<30;i++) run.land(first.block(),first.gate(),i);
        var gate = course.colliders().stream().filter(p->Integer.valueOf(1).equals(p.gate())).findFirst().orElseThrow();
        assertThat(run.land(gate.block(),gate.gate(),100)).noneMatch(JumpRun.GatePassed.class::isInstance);
        var skipped=course.colliders().stream().filter(p->Integer.valueOf(3).equals(p.gate())).findFirst().orElseThrow();
        assertThat(run.land(skipped.block(),skipped.gate(),101)).isEmpty();
        assertThat(run.gatesPassed()).isZero();
        assertThat(run.suspicious()).isTrue();
    }

    @Test
    void 기존_7단계_코스는_기존_완주_방식을_유지한다() throws Exception {
        assertThat(JumpCourse.loadDefault().stageCount()).isEqualTo(7);
        var rewards=List.of(5,10,20,30,40,60,85);
        assertThat(new JumpRun("legacy",0,rewards,0).active()).isTrue();
    }
}
