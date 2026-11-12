package com.ssafy.ontop.minigame.service;

import io.swagger.v3.oas.annotations.media.Schema;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** 두 두더지 게임이 판 시작에 발급하는 타격 관측용 ID. 게임 판정에는 사용하지 않는다. */
public record MoleTargets(String game, long roundId, long seed) {
    private static final Logger log = LoggerFactory.getLogger(MoleTargets.class);

    @Schema(name = "MoleRoundTarget")
    public record Target(int hole, List<String> ids) {
    }

    public List<Target> forStart(int holes) {
        var targets = new ArrayList<Target>(holes);
        for (int hole = 0; hole < holes; hole++) {
            targets.add(new Target(hole, List.of(id(hole, 0), id(hole, 1))));
        }
        return List.copyOf(targets);
    }

    public Set<String> hiddenIds(int holes) {
        int selection = selectionBits();
        var hidden = new HashSet<String>();
        for (int hole = 0; hole < holes; hole++) {
            int selected = (selection >>> hole) & 1;
            hidden.add(id(hole, 1 - selected));
        }
        return hidden;
    }

    private int selectionBits() {
        // 십진 판 ID 문자열의 FNV-1a 32비트 해시. 프런트 arcade/moleTargets.ts와 동일하다.
        String decimal = Long.toString(roundId);
        int hash = 0x811c9dc5;
        for (int i = 0; i < decimal.length(); i++) {
            hash = (hash ^ decimal.charAt(i)) * 0x01000193;
        }
        return hash;
    }

    private String id(int hole, int slot) {
        // 동일 시작 요청과 다른 서버 인스턴스에서도 같은 판의 ID를 재현한다.
        String source = game + ":" + roundId + ":" + seed + ":" + hole + ":" + slot;
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
