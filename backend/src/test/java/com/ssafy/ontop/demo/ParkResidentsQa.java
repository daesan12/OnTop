package com.ssafy.ontop.demo;

import java.util.List;
import java.util.Map;

/** 루프백 QA 서버의 대화 확인용 고정 주민. 실제 AI 이동·대국 서버를 대체하지 않는다. */
final class ParkResidentsQa {
    private ParkResidentsQa() {
    }

    static Map<String, Object> snapshot(String channel) {
        return Map.ofEntries(
                Map.entry("actors", (channel == null || "channel-1".equals(channel)) ? List.of(
                        actor("elder", "박영감", "ELDER", -10, 55),
                        actor("hansu", "윤한수", "NEIGHBOR", 10, 55),
                        actor("child", "강잼민", "CHILD", -5, 42)) : List.of()),
                Map.entry("actorVersion", System.currentTimeMillis()),
                Map.entry("practicePending", false), Map.entry("practiceError", ""),
                Map.entry("waitSeconds", -1), Map.entry("autoPaused", false),
                Map.entry("reply", ""), Map.entry("engine", "QA_DIALOGUE_ONLY"),
                Map.entry("mode", "LOCAL_QA"), Map.entry("commentary", List.of()));
    }

    private static Map<String, Object> actor(String id, String name, String persona, double x, double z) {
        return Map.ofEntries(Map.entry("id", "qa-resident-" + id), Map.entry("channelId", "channel-1"),
                Map.entry("name", name), Map.entry("role", "VISITOR"), Map.entry("persona", persona),
                Map.entry("x", x), Map.entry("y", 4.085), Map.entry("z", z), Map.entry("yaw", 0.0),
                Map.entry("moving", false), Map.entry("seated", false));
    }
}
