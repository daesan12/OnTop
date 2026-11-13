package com.ssafy.ontop.game.mole.dto;

import com.ssafy.ontop.minigame.service.MoleTargets;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

/** 두더지 잡기 API 본문. 계약: docs/whack-a-mole-api.md */
public final class MoleDtos {
    private MoleDtos() {
    }

    public record Rules(int durationMs, int phaseMs, List<String> keys, int pointsPerCoin, int normalPoints,
            int goldPoints, int decoyPenalty, List<Integer> rapidPoints, List<Integer> comboSteps,
            List<Integer> comboTenths) {
    }

    /** 가장 최근에 정산한 판. 없으면 null이다. */
    public record Result(String id, int score, int maxCombo, int caught, int calculatedReward, int reward,
            Instant settledAt) {
    }

    public record State(Instant serverNow, long todayEarned, int dailyCap, int bestScore, Rules rules, Result last) {
    }

    /** kind는 NORMAL · GOLD · RAPID · DECOY. 시각은 판 시작 기준 ms이다. */
    public record Mole(int id, int hole, String kind, int hits, int appearAt, int leaveAt) {
    }

    public record Round(String id, Instant startedAt, Rules rules, List<Mole> moles, List<MoleTargets.Target> targets) {
    }

    /** hole은 0~5(S D F J K L), at은 판 시작 기준 ms이다. */
    public record Hit(int hole, int at, String targetId) {
        public Hit(int hole, int at) {
            this(hole, at, null);
        }
    }

    public record CompleteRequest(List<Hit> hits) {
    }

    public record Settlement(Result result, long todayEarned, int dailyCap, int bestScore) {
    }

    /** 현재 규칙으로 정산한 판 중 회원별 최고 기록 하나. */
    @Schema(name = "MoleRankingItem")
    public record RankingItem(long rank, String userId, String nickname, int score, int maxCombo, int caught,
            Instant completedAt) {
    }

    @Schema(name = "MoleRankings")
    public record Rankings(int rulesVersion, String period, Instant updatedAt, long totalParticipants, int offset,
            int limit, List<RankingItem> items, @Schema(nullable = true) RankingItem me, boolean hasMore) {
    }
}
