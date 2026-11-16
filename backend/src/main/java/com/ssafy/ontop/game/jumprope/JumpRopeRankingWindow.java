package com.ssafy.ontop.game.jumprope;

import java.time.Instant;

/** 리메이크 이벤트: KST 11/16 14:00부터 11/18 23:59 전체 분까지. 종료 경계는 제외한다. */
public final class JumpRopeRankingWindow {
    public static final Instant START = Instant.parse("2026-11-16T05:00:00Z");
    public static final Instant END_EXCLUSIVE = Instant.parse("2026-11-18T15:00:00Z");
    private JumpRopeRankingWindow() { }
}
