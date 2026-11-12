package com.ssafy.ontop.minigame.service;

import io.swagger.v3.oas.annotations.media.Schema;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** 두 두더지 게임이 판 시작에 발급하는 타격 관측용 ID. 게임 판정에는 사용하지 않는다. */
public record MoleTargets(String game, long roundId, long seed) {
    private static final Logger log = LoggerFactory.getLogger(MoleTargets.class);

    @Schema(name = "MoleRoundTarget")
    public record Target(String id, int hole, boolean visible) {
    }

    public List<Target> forStart(int holes) {
        int hiddenHole = Math.floorMod(seed, holes);
        var targets = new ArrayList<Target>(holes + 1);
        for (int hole = 0; hole < holes; hole++) {
            targets.add(new Target(id(Integer.toString(hole)), hole, true));
        }
        targets.add(hiddenHole, new Target(hiddenId(), hiddenHole, false));
        return List.copyOf(targets);
    }

    public String hiddenId() {
        return id("hidden");
    }

    private String id(String target) {
        // 동일 시작 요청과 다른 서버 인스턴스에서도 같은 판의 ID를 재현한다.
        String source = game + ":" + roundId + ":" + seed + ":" + target;
        return UUID.nameUUIDFromBytes(source.getBytes(StandardCharsets.UTF_8)).toString();
    }

    public record Completion<T>(T result, int hiddenTaps) {
        public T report(String game, long userId, long roundId) {
            if (hiddenTaps > 0) {
                log.info("mole_honeypot_hit game={} userId={} roundId={} hits={}", game, userId, roundId, hiddenTaps);
            }
            return result;
        }
    }
}
