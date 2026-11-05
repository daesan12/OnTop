package com.ssafy.ontop.game.mole.domain;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.SplittableRandom;

/**
 * 두더지 잡기 규칙. 서버가 시드로 출현표를 만들고, 완료 때 같은 시드로 출현표를 다시 만들어 타격 기록을 처음부터 계산한다.
 * 화면(frontend/src/features/mole/scoring.ts)은 같은 계산으로 진행 중 점수만 보여 주며 최종 점수는 서버 값이다.
 */
public final class MoleRules {
    /** 2: 빈 구멍 2초 기절·망치 하나·반응 기준 0.06초·구멍 6개 한 줄·더 오래 머무는 두더지·45점당 1냥 (S15P31B105-340). */
    public static final int RULES_VERSION = 2;
    public static final ZoneId KST = ZoneId.of("Asia/Seoul");
    public static final int DURATION_MS = 90_000;
    public static final int PHASE_MS = 30_000;
    /** 구멍 순서. 한 줄 아치로 왼손 Q W E, 오른손 I O P. */
    public static final List<String> KEYS = List.of("Q", "W", "E", "I", "O", "P");
    public static final int POINTS_PER_COIN = 45;
    public static final int NORMAL_POINTS = 10;
    public static final int GOLD_POINTS = 30;
    public static final int DECOY_PENALTY = 20;
    /** 연타 횟수별 점수. 클릭당 10점에 4회 +5, 5회 +10을 더한다. */
    public static final List<Integer> RAPID_POINTS = List.of(0, 0, 20, 30, 45, 60);
    /** 콤보 배수(×10). 10콤보 ×1.2, 20콤보 ×1.5, 30콤보 ×2. */
    public static final List<Integer> COMBO_STEPS = List.of(10, 20, 30);
    public static final List<Integer> COMBO_TENTHS = List.of(10, 12, 15, 20);
    /** 출현 직후 이 시간 안의 타격은 사람이 본 뒤 친 것으로 보지 않는다. 올라오는 모션(약 0.17초) 대부분은 잡힌다. */
    public static final int REACTION_FLOOR_MS = 60;
    /** 망치는 하나다. 한 번 친 뒤 이 시간 안의 다른 키는 세지 않아 동시 누르기를 막는다. */
    public static final int MALLET_MS = 80;
    /** 아무것도 없는 구멍을 치면 이 시간 동안 모든 키를 받지 않는다. */
    public static final int STUN_MS = 2_000;
    /** 기절을 봐주는 아슬아슬한 경우: 곧 나올 두더지(앞)와 막 들어간 두더지(뒤). */
    public static final int EARLY_GRACE_MS = 150;
    public static final int LATE_GRACE_MS = 250;
    /** 같은 구멍 타격 간격 하한. 이보다 빠른 입력은 연타로 세지 않는다. */
    public static final int SAME_HOLE_MIN_MS = 60;
    /** 두더지를 잡은 직후 같은 구멍 잔타는 빈 곳 타격으로 보지 않는다. */
    public static final int AFTERSHOCK_MS = 250;
    public static final int MAX_HITS = 1_200;

    public enum Kind { NORMAL, GOLD, RAPID, DECOY }

    /** 구간별 간격·동시 출현·머무는 시간·종류 확률(%)·연타 최대 횟수. */
    record Phase(int gapMs, int maxActive, int stayMs, int goldPercent, int rapidPercent, int decoyPercent,
            int rapidMax) {
    }

    static final List<Phase> PHASES = List.of(
            new Phase(656, 2, 1_100, 6, 8, 4, 3),
            new Phase(472, 2, 950, 8, 10, 7, 4),
            new Phase(360, 3, 800, 9, 12, 9, 5));

    public record Mole(int id, int hole, Kind kind, int hits, int appearAt, int leaveAt) {
    }

    public record Hit(int hole, int at) {
    }

    public record Score(int score, int maxCombo, int caught, int coins) {
    }

    private MoleRules() {
    }

    public static int phaseOf(int at) {
        return Math.min(PHASES.size() - 1, Math.max(0, at) / PHASE_MS);
    }

    /** 같은 시드는 언제나 같은 출현표를 만든다. 구멍마다 한 마리씩만 나오고 구간별 동시 출현 수를 넘지 않는다. */
    public static List<Mole> schedule(long seed) {
        SplittableRandom random = new SplittableRandom(seed);
        int[] busyUntil = new int[KEYS.size()];
        List<Mole> moles = new ArrayList<>();
        int at = 700;
        while (at < DURATION_MS) {
            Phase phase = PHASES.get(phaseOf(at));
            int active = 0;
            int earliestEnd = Integer.MAX_VALUE;
            for (Mole mole : moles) {
                if (mole.leaveAt() > at) {
                    active++;
                    earliestEnd = Math.min(earliestEnd, mole.leaveAt());
                }
            }
            if (active >= phase.maxActive()) {
                at = earliestEnd + 40;
                continue;
            }
            List<Integer> free = new ArrayList<>();
            for (int hole = 0; hole < busyUntil.length; hole++) {
                if (busyUntil[hole] + 150 <= at) {
                    free.add(hole);
                }
            }
            if (free.isEmpty()) {
                at += 60;
                continue;
            }
            int hole = free.get(random.nextInt(free.size()));
            int roll = random.nextInt(100);
            Kind kind = roll < phase.goldPercent() ? Kind.GOLD
                    : roll < phase.goldPercent() + phase.rapidPercent() ? Kind.RAPID
                    : roll < phase.goldPercent() + phase.rapidPercent() + phase.decoyPercent() ? Kind.DECOY
                    : Kind.NORMAL;
            int hits = kind == Kind.RAPID ? 2 + random.nextInt(phase.rapidMax() - 1) : 1;
            int stay = switch (kind) {
                case GOLD -> phase.stayMs() * 55 / 100;
                case RAPID -> hits * 220 + 600;
                default -> phase.stayMs();
            };
            if (at + stay > DURATION_MS) {
                break;
            }
            moles.add(new Mole(moles.size(), hole, kind, hits, at, at + stay));
            busyUntil[hole] = at + stay;
            at += Math.round(phase.gapMs() * (0.7f + random.nextFloat() * 0.6f));
        }
        return List.copyOf(moles);
    }

    public static int comboTenths(int combo) {
        int step = 0;
        while (step < COMBO_STEPS.size() && combo >= COMBO_STEPS.get(step)) {
            step++;
        }
        return COMBO_TENTHS.get(step);
    }

    public static int coins(int score) {
        return Math.max(0, score) / POINTS_PER_COIN;
    }

    /**
     * 타격 기록을 시간 순서로 다시 계산한다. 나와 있는 두더지를 치면 점수와 콤보가 오르고,
     * 빈 구멍이나 치면 안 되는 친구를 치면 콤보가 끊긴다. 두더지가 그냥 도망가는 것은 콤보를 끊지 않는다.
     * 아무것도 없는 구멍을 치면 2초 기절하고, 망치는 하나라 0.08초 안의 다른 키는 세지 않는다.
     */
    public static Score score(List<Mole> moles, List<Hit> hits) {
        List<Hit> ordered = hits.stream()
                .filter(hit -> hit.hole() >= 0 && hit.hole() < KEYS.size() && hit.at() >= 0 && hit.at() <= DURATION_MS)
                .sorted(Comparator.comparingInt(Hit::at)).toList();
        int[] lastHit = new int[KEYS.size()];
        int[] caughtAt = new int[KEYS.size()];
        Arrays.fill(lastHit, Integer.MIN_VALUE / 2);
        Arrays.fill(caughtAt, Integer.MIN_VALUE / 2);
        int[] taps = new int[moles.size()];
        boolean[] done = new boolean[moles.size()];
        int score = 0;
        int combo = 0;
        int maxCombo = 0;
        int caught = 0;
        int lastSwing = Integer.MIN_VALUE / 2;
        int stunUntil = Integer.MIN_VALUE / 2;
        for (Hit hit : ordered) {
            int hole = hit.hole();
            int at = hit.at();
            if (at < stunUntil || at - lastSwing < MALLET_MS || at - lastHit[hole] < SAME_HOLE_MIN_MS) {
                continue;
            }
            lastSwing = at;
            lastHit[hole] = at;
            Mole mole = null;
            for (Mole candidate : moles) {
                if (candidate.hole() == hole && !done[candidate.id()]
                        && candidate.appearAt() <= at && at < candidate.leaveAt()) {
                    mole = candidate;
                    break;
                }
            }
            if (mole != null && at - mole.appearAt() < REACTION_FLOOR_MS) {
                continue;
            }
            if (mole == null) {
                if (at - caughtAt[hole] < AFTERSHOCK_MS || appearsSoon(moles, hole, at)) {
                    continue;
                }
                combo = 0;
                // 막 들어간 두더지를 늦게 친 것은 콤보만 끊고, 아무것도 없던 구멍은 기절한다.
                if (!leftRecently(moles, hole, at)) {
                    stunUntil = at + STUN_MS;
                }
                continue;
            }
            if (mole.kind() == Kind.DECOY) {
                done[mole.id()] = true;
                caughtAt[hole] = at;
                score -= DECOY_PENALTY;
                combo = 0;
                continue;
            }
            if (mole.kind() == Kind.RAPID && ++taps[mole.id()] < mole.hits()) {
                continue;
            }
            int points = switch (mole.kind()) {
                case GOLD -> GOLD_POINTS;
                case RAPID -> RAPID_POINTS.get(mole.hits());
                default -> NORMAL_POINTS;
            };
            done[mole.id()] = true;
            caughtAt[hole] = at;
            combo++;
            maxCombo = Math.max(maxCombo, combo);
            caught++;
            score += points * comboTenths(combo) / 10;
        }
        int total = Math.max(0, score);
        return new Score(total, maxCombo, caught, coins(total));
    }

    private static boolean appearsSoon(List<Mole> moles, int hole, int at) {
        return moles.stream().anyMatch(mole -> mole.hole() == hole && mole.appearAt() > at
                && mole.appearAt() - at <= EARLY_GRACE_MS);
    }

    private static boolean leftRecently(List<Mole> moles, int hole, int at) {
        return moles.stream().anyMatch(mole -> mole.hole() == hole && mole.leaveAt() <= at
                && at - mole.leaveAt() <= LATE_GRACE_MS);
    }
}
