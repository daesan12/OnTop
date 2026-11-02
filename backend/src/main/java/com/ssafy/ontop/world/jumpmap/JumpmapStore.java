package com.ssafy.ontop.world.jumpmap;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * 점프맵 판·문 지급·하루 수입 저장(BE 명세 8·10장). 모든 메서드는 각자 하나의 트랜잭션이다.
 * 호출자는 한 판의 시작 → 문 → 종료를 순서대로 부른다.
 */
public interface JumpmapStore {
    ZoneId KST = ZoneId.of("Asia/Seoul");
    int DAILY_CAP = com.ssafy.ontop.minigame.service.MinigameRewardBudget.DAILY_CAP;
    Set<String> TIPS = Set.of("START_SPOT", "RUN_STARTED", "FIRST_GATE", "FIRST_FALL", "FINAL_PAD");

    static LocalDate kstDate(Instant at) { return LocalDate.ofInstant(at, KST); }

    record Started(boolean firstRun, int todayEarned, LocalDate today) {}
    record Settled(String runId, long userId, int gate, int coinsCalculated, int coinsGranted, int runCoins,
            int todayEarned, LocalDate today) {}
    record RunEnd(JumpRun.EndReason reason, Instant endedAt, long elapsedMs, Long finishMs, int gatesPassed,
            boolean finalReached, double maxHeight, List<Integer> landings, boolean suspicious, List<String> reasons) {}
    record Ended(int runCoins, int todayEarned, LocalDate today, Long bestFinishMs, boolean newBest) {}
    record Status(boolean firstRun, List<String> seenTips, Long bestFinishMs, int todayEarned, LocalDate today) {}
    record RewardKey(String runId, int gate) {}
    record RankingEntry(int rank, String userId, String nickname, long finishMs, String finishedAt) {}
    record Ranking(List<RankingEntry> items, RankingEntry me) {}

    default Ranking ranking(long userId) {
        return new Ranking(List.of(), null);
    }

    /** 점프맵 테이블(V131)이 현재 DB에 있는지. 없으면 플래그를 켜도 점프맵만 비활성으로 두고 서버는 시작한다. */
    default boolean ready() { return true; }

    /** 판 행을 STARTED로 만들고 첫 도전 여부를 프로필에 남긴다. */
    Started start(String runId, long userId, String channelId, Instant at);

    /**
     * 문 통과를 기록하고 PENDING 지급 행을 만든다. 판이 STARTED이고 gates_passed = gate-1일 때만 기록한다.
     * 같은 (판, 문)이 이미 있으면 다시 만들지 않고 true를 돌려준다.
     */
    boolean passGate(String runId, long userId, int gate, int coinsCalculated, long elapsedMs, Instant at);

    /** PENDING 지급을 하루 상한 안에서 지갑에 반영한다. 이미 GRANTED면 같은 결과를 돌려준다. */
    Optional<Settled> settle(String runId, int gate, Instant now);

    /** STARTED 판을 끝낸다. 이미 끝난 판은 바꾸지 않고 현재 값을 돌려준다. */
    Ended end(String runId, RunEnd end);

    Status status(long userId, Instant now);

    /** 모르는 키는 버리고 기존 목록과 합친다. */
    void seeTips(long userId, Set<String> tips, Instant now);

    /** 서버 시작 때 남아 있는 STARTED 판을 DISCONNECT로 끝낸다. */
    int abandonOpenRuns(Instant now);

    List<RewardKey> pendingRewards(Instant createdBefore, int limit);
}
