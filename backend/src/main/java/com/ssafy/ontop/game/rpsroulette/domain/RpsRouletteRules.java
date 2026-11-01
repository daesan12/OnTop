package com.ssafy.ontop.game.rpsroulette.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.List;

/** 가위바위보 룰렛의 서버 고정 규칙. 확률은 칸 구성 그대로이며 판정은 입력과 무관하게 균등하다. */
public final class RpsRouletteRules {
    public static final List<Integer> FEES = List.of(10, 20, 30);
    public static final int DAILY_PLAYS = 15;
    public static final ZoneId KST = ZoneId.of("Asia/Seoul");
    public static final Duration DUEL_LIMIT = Duration.ofSeconds(5);
    public static final Duration DECIDE_LIMIT = Duration.ofSeconds(10);
    /** 표시 마감 뒤 네트워크 지연을 받아 주는 시간. 이후에는 서버가 대신 처리한다. */
    public static final Duration GRACE = Duration.ofMillis(1500);
    public static final int MAX_CHALLENGES = 2;
    /** 배수는 10분의 1 단위: ×1.0, ×1.5, ×2.0. 참가비가 10의 배수라 지급액은 항상 정수다. */
    public static final List<Integer> MULTIPLIER_TENTHS = List.of(10, 15, 20);
    /** 12시 방향부터 시계방향. 1×19, 2×5, 3×2, 4·5·7·10 각 1칸. */
    public static final List<Integer> ROULETTE = List.of(10, 1, 2, 1, 3, 1, 1, 1, 5, 1, 1, 2, 1, 1, 1,
            7, 1, 2, 1, 3, 1, 2, 1, 4, 1, 1, 1, 2, 1, 1);

    public enum Hand { ROCK, SCISSORS, PAPER }

    public enum Result { WIN, DRAW, LOSE }

    private RpsRouletteRules() {
    }

    public static boolean isFee(int fee) {
        return FEES.contains(fee);
    }

    /** 플레이어 기준 결과. 바위는 가위를, 가위는 보를, 보는 바위를 이긴다. */
    public static Result judge(Hand player, Hand machine) {
        if (player == machine) {
            return Result.DRAW;
        }
        int beaten = (player.ordinal() + 1) % Hand.values().length;
        return machine.ordinal() == beaten ? Result.WIN : Result.LOSE;
    }

    public static int payout(int fee, int stakeLevel, int cell) {
        return fee * ROULETTE.get(cell) * MULTIPLIER_TENTHS.get(stakeLevel) / 10;
    }

    /** 클라이언트가 공개 후 같은 값으로 다시 계산해 볼 수 있는 기계 손 커밋. */
    public static String commitment(int duelNo, Hand machine, String salt) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(
                    ("rps-roulette|" + duelNo + "|" + machine.name() + "|" + salt).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256을 사용할 수 없습니다.", exception);
        }
    }
}
