package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.assertj.core.api.Assertions.assertThat;

class PoliceAdvisoryPolicyTests {
    @TempDir
    Path directory;

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void 기존에_경고하던_애매한_점수는_보존하되_경고와_출동을_만들지_않는다() throws Exception {
        var dispatched = new ArrayList<AiOperations.PoliceDispatch>();
        var samples = List.of("쉽다 ㅋ", "시귀봉진＠＠＠＠＠＠＠＠＠＠＠＠＠＠＠＠＠", "아깝다ㅋㅋ", "이걸 지네",
                "너 오늘 못한다 ㅋㅋ", "아 짜증나", "왜 그따위로 플레이하냐", "게임에서 너 잡으러 간다");

        try (var judge = new PoliceJudgeFixture(mapper, Map.of());
                var store = new LocalAiStore(directory, mapper)) {
            var operations = new AiOperations(store, judge.client(mapper), AiText.fixed(), AiNotifier.local(),
                    Clock.systemUTC(), dispatched::add, 60_000, true);
            for (String text : samples) {
                assertThat(ChatWarningRules.matches(text)).as(text).isFalse();
                operations.chat("A", "world:one", text, 0, 0);
            }

            operations.flush();

            assertThat(store.read().messages).hasSize(samples.size())
                    .allMatch(message -> message.processed() && !message.hidden());
            assertThat(store.read().conflictAssessments.values()).allSatisfy(assessment -> {
                assertThat(assessment.probability()).isEqualTo(.61);
                assertThat(assessment.threshold()).isEqualTo(.85);
                assertThat(assessment.suspected()).isFalse();
                assertThat(assessment.policyVersion()).isEqualTo(JevDecisions.ADVISORY_POLICY_VERSION);
            });
            assertThat(dispatched).isEmpty();
            assertThat(store.read().incidents).isEmpty();
            assertThat(store.read().notices).isEmpty();
        }
    }

    @Test
    void 높은_공격_점수의_작성자만_출동_대상으로_하고_일반_답변자는_제외한다() throws Exception {
        String attack = "너는 쓸모없는 인간이야";
        var dispatched = new ArrayList<AiOperations.PoliceDispatch>();

        try (var judge = new PoliceJudgeFixture(mapper, Map.of(attack, .98));
                var store = new LocalAiStore(directory, mapper)) {
            var operations = new AiOperations(store, judge.client(mapper), AiText.fixed(), AiNotifier.local(),
                    Clock.systemUTC(), dispatched::add, 60_000, true);
            String attackId = operations.chat("A", "world:one", attack, 0, 0);
            operations.chat("B", "world:one", "쉽다 ㅋ", 0, 0);

            operations.flush();

            assertThat(dispatched).hasSize(1);
            assertThat(dispatched.getFirst().actors()).containsExactly("A");
            assertThat(store.read().incidents.getFirst().messageIds()).containsExactly(attackId);
            assertThat(store.read().messages).noneMatch(LocalAiStore.Message::hidden);
            assertThat(store.read().notices).hasSize(1);
            operations.flush();
            assertThat(dispatched).hasSize(1);
        }
    }

    @Test
    void 명백한_사전_욕설은_제브의_애매한_판정과_무관하게_계속_경고한다() throws Exception {
        var dispatched = new ArrayList<AiOperations.PoliceDispatch>();
        try (var judge = new PoliceJudgeFixture(mapper, Map.of());
                var store = new LocalAiStore(directory, mapper)) {
            var operations = new AiOperations(store, judge.client(mapper), AiText.fixed(), AiNotifier.local(),
                    Clock.systemUTC(), dispatched::add, 60_000, true);

            operations.chat("A", "world:one", "씨발", 0, 0);
            operations.flush();

            assertThat(dispatched).hasSize(1);
            assertThat(dispatched.getFirst().kind()).isEqualTo("PROFANITY_RULE");
        }
    }
}
