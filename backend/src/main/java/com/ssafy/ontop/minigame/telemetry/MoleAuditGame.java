package com.ssafy.ontop.minigame.telemetry;

import com.ssafy.ontop.game.mole.domain.MoleRules;
import com.ssafy.ontop.game.speedmole.SpeedMoleRules;

enum MoleAuditGame {
    MOLE("whack-a-mole", "mole_rounds", MoleRules.KEYS.size(), MoleRules.DURATION_MS, MoleRules.MAX_HITS),
    SPEED("speed-mole", "speed_mole_rounds", 8, SpeedMoleRules.DURATION_MS, SpeedMoleRules.MAX_TAPS);

    final String path;
    final String table;
    final int holes;
    final int durationMs;
    final int maxTaps;

    MoleAuditGame(String path, String table, int holes, int durationMs, int maxTaps) {
        this.path = path;
        this.table = table;
        this.holes = holes;
        this.durationMs = durationMs;
        this.maxTaps = maxTaps;
    }

    String key(long roundId) {
        return path + ":" + roundId;
    }
}
