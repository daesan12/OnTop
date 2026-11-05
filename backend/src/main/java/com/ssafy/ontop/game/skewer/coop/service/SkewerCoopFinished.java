package com.ssafy.ontop.game.skewer.coop.service;

import com.ssafy.ontop.game.result.GameFinished;
import java.util.List;

/** 서버가 확정한 불변 결과. 지갑·랭킹 저장은 별도 소비자가 처리한다. */
public record SkewerCoopFinished(GameFinished result, int teamScore, int served, Long chefUserId,
        Long serverUserId, boolean rankingEligible, long elapsedMillis, long durationMillis) {
    public static final String RULES_VERSION = "coop-v1";

    public List<Long> users() {
        return result.participants().stream().map(GameFinished.Participant::userId).sorted().toList();
    }

    public String role(long user) {
        return Long.valueOf(user).equals(chefUserId) ? "chef"
                : Long.valueOf(user).equals(serverUserId) ? "server" : "unassigned";
    }

    public String rankingReason() {
        if (!"SKEWER_TIME_UP".equals(result.endReason())) {
            return "EARLY_END";
        }
        if (!rankingEligible) {
            return "NON_VR";
        }
        return durationMillis == 240_000 ? "ELIGIBLE" : "RULES_MISMATCH";
    }
}
