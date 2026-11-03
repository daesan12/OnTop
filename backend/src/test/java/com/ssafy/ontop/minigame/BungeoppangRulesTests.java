package com.ssafy.ontop.minigame;

import com.ssafy.ontop.minigame.service.BungeoppangRules;
import com.ssafy.ontop.minigame.service.MinigameException;
import java.util.Collections;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BungeoppangRulesTests {
    private final BungeoppangRules rules = new BungeoppangRules();

    @ParameterizedTest
    @CsvSource({"49,0", "50,2", "69,2", "70,5", "90,5", "91,2", "99,2", "100,0"})
    void 익힘_경계마다_판정이_일치한다(int cooked, int score) {
        assertThat(BungeoppangRules.sideScore(cooked)).isEqualTo(score);
    }

    @ParameterizedTest
    @CsvSource({"0,5599,100,69", "0,5600,100,70", "0,7279,100,90", "0,7280,100,91",
            "0,8000,100,100", "38000,42000,100,58", "40000,44200,100,70",
            "40000,45460,100,91", "0,60000,115,958"})
    void 평소와_손님몰림을_정수로_나누어_계산한다(int start, int end, int heat, int expected) {
        assertThat(BungeoppangRules.doneness(start, end, heat)).isEqualTo(expected);
    }

    @Test
    void 황금_7개의_콤보는_86점이고_클라이언트점수는_무시한다() {
        var heats = Collections.nCopies(64, 100);
        var result = rules.replay(BungeoppangFixtures.sevenGolden(heats), heats);
        assertThat(result.score()).isEqualTo(86);
        assertThat(result.golden()).isEqualTo(7);
        assertThat(result.maxCombo()).isEqualTo(7);
        assertThat(result.score() / 5).isEqualTo(17);
    }

    @Test
    void 미완성은_점수없이_남고_버리기는_소비한_불세기를_돌려놓지_않는다() {
        var body = BungeoppangFixtures.body("""
                {"log":[{"slot":0,"action":"POUR","t":0},{"slot":0,"action":"FILL","t":300},
                {"slot":0,"action":"DISCARD","t":600},{"slot":0,"action":"POUR","t":900},
                {"slot":0,"action":"FILL","t":1200},{"slot":0,"action":"TURN","t":6800},
                {"slot":0,"action":"TURN","t":12400},{"slot":1,"action":"POUR","t":60000}]}
                """);
        var heats = new java.util.ArrayList<>(Collections.nCopies(64, 100));
        heats.set(0, 115);
        var result = rules.replay(body, heats);
        assertThat(result.score()).isEqualTo(10);
        assertThat(result.wasted()).isEqualTo(1);
        assertThat(result.made()).isEqualTo(1);
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "[{\"slot\":6,\"action\":\"POUR\",\"t\":0}]|BAD_ENTRY",
            "[{\"slot\":0,\"action\":\"POUR\",\"t\":60001}]|BAD_ENTRY",
            "[{\"slot\":0,\"action\":\"POUR\",\"t\":1.2}]|BAD_ENTRY",
            "[{\"slot\":0,\"action\":\"TURN\",\"t\":0}]|ACTION_STATE_MISMATCH",
            "[{\"slot\":0,\"action\":\"POUR\",\"t\":100},{\"slot\":1,\"action\":\"POUR\",\"t\":99}]|TIME_REVERSED",
            "[{\"slot\":0,\"action\":\"POUR\",\"t\":0},{\"slot\":1,\"action\":\"POUR\",\"t\":49}]|TOO_FAST",
            "[{\"slot\":0,\"action\":\"POUR\",\"t\":0},{\"slot\":0,\"action\":\"FILL\",\"t\":299}]|SAME_SLOT_TOO_FAST"
    })
    void 잘못된_기록은_사유와_위치를_반환한다(String log, String detail) {
        assertThatThrownBy(() -> rules.replay(BungeoppangFixtures.body("{\"log\":" + log + "}"),
                Collections.nCopies(64, 100))).isInstanceOfSatisfying(MinigameException.class, error -> {
                    assertThat(error.code()).isEqualTo("LOG_INVALID");
                    assertThat(error.detail()).isEqualTo(detail);
                    assertThat(error.index()).isGreaterThanOrEqualTo(0);
                });
    }

    @ParameterizedTest
    @CsvSource({"3,GOOD,79,6,0", "6,GOOD,77,6,0", "3,FAIL,64,3,1", "3,DISCARD,64,3,0"})
    void 혼합성공은_콤보유지하고_실패와버리기는_콤보를_초기화한다(
            int fish, String mode, int expectedScore, int expectedCombo, int expectedFailed) {
        var heats = Collections.nCopies(64, 100);
        var body = BungeoppangFixtures.sevenGolden(heats).deepCopy();
        var entries = new java.util.ArrayList<com.fasterxml.jackson.databind.node.ObjectNode>();
        int turn = 0;
        for (var entry : body.path("log")) {
            var changed = (com.fasterxml.jackson.databind.node.ObjectNode) entry;
            if (changed.path("slot").asInt() == fish % 6 && changed.path("action").asText().equals("TURN")) {
                turn++;
                boolean target = fish == 6 ? turn >= 3 : turn <= 2;
                if (target) {
                    int fill = fish == 6 ? 25000 : fish * 350 + 3000;
                    if (mode.equals("DISCARD") && turn == 2) { changed.put("action", "DISCARD"); }
                    else if (mode.equals("FAIL") && turn == 1) { changed.put("t", fill + 3000); }
                    else if (mode.equals("GOOD")) {
                        if (fish == 6) { changed.put("t", fill + (turn - 2) * 4800); }
                        else if (turn == 1) { changed.put("t", fill + 4800); }
                    }
                }
            }
            entries.add(changed);
        }
        entries.sort(java.util.Comparator.comparingInt(e -> e.path("t").asInt()));
        ((com.fasterxml.jackson.databind.node.ObjectNode) body).putArray("log").addAll(entries);
        var result = rules.replay(body, heats);
        assertThat(result.score()).isEqualTo(expectedScore);
        assertThat(result.maxCombo()).isEqualTo(expectedCombo);
        assertThat(result.failed()).isEqualTo(expectedFailed);
        assertThat(result.wasted()).isEqualTo(mode.equals("DISCARD") ? 1 : 0);
    }

    @Test
    void 입력상한과_불세기소진을_거절한다() {
        var body = new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode();
        var log = body.putArray("log");
        for (int i = 0; i < 65; i++) {
            log.addObject().put("slot", 0).put("action", "POUR").put("t", i * 900);
            log.addObject().put("slot", 0).put("action", "FILL").put("t", i * 900 + 300);
            log.addObject().put("slot", 0).put("action", "DISCARD").put("t", i * 900 + 600);
        }
        assertThatThrownBy(() -> rules.replay(body, Collections.nCopies(64, 100)))
                .isInstanceOfSatisfying(MinigameException.class, e -> assertThat(e.detail()).isEqualTo("TOO_MANY_FILLS"));
        while (log.size() < 1201) { log.addObject(); }
        assertThatThrownBy(() -> rules.replay(body, Collections.nCopies(64, 100)))
                .isInstanceOfSatisfying(MinigameException.class, e -> assertThat(e.detail()).isEqualTo("LOG_TOO_LONG"));
    }
}
