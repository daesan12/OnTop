package com.ssafy.ontop.game.stonerumble.domain;

import java.util.List;

/** 참가 인원에 따라 10냥씩 차등 지급한다. 공동 순위는 해당 자리의 보상을 평균한다. */
public final class StoneRumbleRewards {
    private StoneRumbleRewards() { }

    public static long reward(int players, int rank, int tied) {
        if (players < 2 || players > 8 || rank < 1 || tied < 1 || rank + tied - 1 > players) {
            throw new IllegalArgumentException("돌탑 순위를 확인하세요.");
        }
        return (players - rank + 1) * 10L - (tied - 1) * 5L;
    }

    public static List<Long> fromRanks(List<Integer> ranks) {
        if (ranks.size() < 2 || ranks.size() > 8 || ranks.stream().anyMatch(java.util.Objects::isNull)) {
            throw new IllegalArgumentException("돌탑 참가자 순위가 필요합니다.");
        }
        var sorted = ranks.stream().sorted().toList();
        for (int index = 0; index < sorted.size();) {
            int rank = sorted.get(index), tied = java.util.Collections.frequency(sorted, rank);
            if (rank != index + 1) { throw new IllegalArgumentException("돌탑 공동 순위가 일치하지 않습니다."); }
            index += tied;
        }
        return ranks.stream().map(rank -> reward(ranks.size(), rank, java.util.Collections.frequency(ranks, rank))).toList();
    }
}
