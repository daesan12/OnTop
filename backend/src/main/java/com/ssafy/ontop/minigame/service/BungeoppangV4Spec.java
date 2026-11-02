package com.ssafy.ontop.minigame.service;

import com.ssafy.ontop.minigame.domain.BungeoppangV4Order;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Round;
import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

/** Immutable v4 configuration. Changing a value requires a new config version. */
public final class BungeoppangV4Spec {
    public static final String RULES_VERSION = "v4";
    public static final String CONFIG_VERSION = "v4-20261027.1";
    public static final int START_BUFFER_MS = 1_000;
    public static final int COUNTDOWN_MS = 3_500;
    public static final int DURATION_MS = 60_000;
    public static final int SUBMISSION_GRACE_MS = 15_000;
    public static final int PROCESSING_DRAIN_MS = 10_000;

    private static final BungeoppangV4Responses.FillingCounts FIRST_ORDER =
            new BungeoppangV4Responses.FillingCounts(2, 0, 0, 0);
    private static final BungeoppangV4Responses.Rules RULES = new BungeoppangV4Responses.Rules(
            6, DURATION_MS, COUNTDOWN_MS, 8_000, 6_000, 40_000, 85, 115, 512,
            4, 4, 20, 50, FIRST_ORDER, 50, 70, 90, 100, 2, 5, 15, MinigameRewardBudget.DAILY_CAP,
            50, 300, 1_200);

    private BungeoppangV4Spec() {
    }

    public static BungeoppangV4Responses.Rules rules() {
        return RULES;
    }

    public static BungeoppangV4Responses.Order firstOrder() {
        return new BungeoppangV4Responses.Order("1", 0, FIRST_ORDER);
    }

    public static BungeoppangV4Responses.Timing timing(Instant issuedAt) {
        Instant countdown = issuedAt.plusMillis(START_BUFFER_MS);
        Instant play = countdown.plusMillis(COUNTDOWN_MS);
        Instant end = play.plusMillis(DURATION_MS);
        Instant deadline = end.plusMillis(SUBMISSION_GRACE_MS);
        return new BungeoppangV4Responses.Timing(countdown, play, end, deadline,
                deadline.plusMillis(PROCESSING_DRAIN_MS));
    }

    public static BungeoppangV4Responses.Timing timing(BungeoppangV4Round round) {
        return new BungeoppangV4Responses.Timing(round.countdownStartsAt(), round.playStartsAt(),
                round.playEndsAt(), round.submitDeadline(), round.expiresAt());
    }

    public static BungeoppangV4Responses.Timing timing(BungeoppangV4Round round, Instant current) {
        long offset = round.pauseOffset(current);
        return new BungeoppangV4Responses.Timing(round.countdownStartsAt().plusMillis(offset),
                round.playStartsAt().plusMillis(offset), round.playEndsAt().plusMillis(offset),
                round.submitDeadline().plusMillis(offset), round.expiresAt().plusMillis(offset),
                round.isManualPaused(), round.manualPauseRevision());
    }

    public static BungeoppangV4Responses.Order order(BungeoppangV4Order order) {
        return new BungeoppangV4Responses.Order(Long.toString(order.orderId()), order.orderIndex(),
                new BungeoppangV4Responses.FillingCounts(order.bean(), order.custard(), order.pizza(),
                        order.chocolate()));
    }

    public static BungeoppangV4Responses.Checkpoint initialCheckpoint(long sessionId) {
        var slots = new ArrayList<BungeoppangV4Responses.Slot>(RULES.slots());
        for (int slot = 0; slot < RULES.slots(); slot++) {
            slots.add(new BungeoppangV4Responses.Slot(slot, "empty", 0, 100, null, 0, null));
        }
        var stats = new BungeoppangV4Responses.Stats(0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0);
        return new BungeoppangV4Responses.Checkpoint(0, 0, initialPrefixHash(sessionId), 0,
                null, List.copyOf(slots), List.of(), stats, firstOrder());
    }

    public static String initialPrefixHash(long sessionId) {
        String seed = "BUNGEOPPANG/v4\n" + sessionId + "\n" + CONFIG_VERSION + "\n";
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(seed.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256을 사용할 수 없습니다.", exception);
        }
    }

    public static String phase(String status, Instant now, BungeoppangV4Round round) {
        if (!"PLAYING".equals(status)) {
            return status;
        }
        now = round.gameTime(now);
        if (now.isBefore(round.countdownStartsAt())) {
            return "WAITING_START";
        }
        if (now.isBefore(round.playStartsAt())) {
            return "COUNTDOWN";
        }
        if (now.isBefore(round.playEndsAt())) {
            return "PLAYING";
        }
        return "AWAITING_COMPLETION";
    }
}
