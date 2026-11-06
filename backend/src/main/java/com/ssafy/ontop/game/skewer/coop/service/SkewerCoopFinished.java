package com.ssafy.ontop.game.skewer.coop.service;

import com.ssafy.ontop.game.result.GameFinished;
import java.util.List;

/** 서버가 확정한 불변 결과. 지갑·랭킹 저장은 별도 소비자가 처리한다. */
public record SkewerCoopFinished(GameFinished result, int teamScore, int served, Long chefUserId,
        Long serverUserId, boolean rankingEligible, long elapsedMillis, long durationMillis, String playMode) {
    public static final String RULES_VERSION = "coop-v1";

    public SkewerCoopFinished {
        if (playMode != null && !List.of("PC", "VR").contains(playMode)) {
            throw new IllegalArgumentException("플레이 방식을 확인해주세요.");
        }
    }

    public SkewerCoopFinished(GameFinished result, int teamScore, int served, Long chefUserId,
            Long serverUserId, boolean rankingEligible, long elapsedMillis, long durationMillis) {
        this(result, teamScore, served, chefUserId, serverUserId, rankingEligible, elapsedMillis, durationMillis, null);
    }

    public String rankingMode() {
        return playMode == null ? "VR" : playMode;
    }

    /** 구 저널의 결과 해시는 기존 record 표현을 그대로 사용해 재인계 멱등성을 지킨다. */
    public String digestInput() {
        return playMode != null ? toString() : "SkewerCoopFinished[result=" + result + ", teamScore=" + teamScore
                + ", served=" + served + ", chefUserId=" + chefUserId + ", serverUserId=" + serverUserId
                + ", rankingEligible=" + rankingEligible + ", elapsedMillis=" + elapsedMillis
                + ", durationMillis=" + durationMillis + "]";
    }

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
            return playMode == null ? "NON_VR" : "MODE_CHANGED";
        }
        return durationMillis == 240_000 ? "ELIGIBLE" : "RULES_MISMATCH";
    }
}
