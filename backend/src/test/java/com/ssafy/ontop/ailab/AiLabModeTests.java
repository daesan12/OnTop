package com.ssafy.ontop.ailab;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;

/** Checks provider selection only: never submit data or invoke the remote API. */
class AiLabModeTests {
    @TempDir Path directory;

    @Test void jevOnlyRequiresNoLlmKeyAndKeepsNotificationsLocal() throws Exception {
        try(var runtime=new AiLabRuntime(new ObjectMapper(),directory,
                Map.of("AI_LAB_JEV_LIVE","true","JEV_API_KEY","fixture-not-a-real-key"))) {
            var state=runtime.snapshot("world:one",true);
            assertThat(state.get("mode")).isEqualTo("CHAT_RULES + CONFLICT_JEV + FIXED");
            assertThat(state.get("notifier")).isEqualTo("LOCAL_CAPTURE");
            assertThat(state).containsKey("jevUsage").doesNotContainKey("llmUsage");
        }
    }

    @Test void anInheritedKeyAloneDoesNotEnableExternalCalls() throws Exception {
        try(var runtime=new AiLabRuntime(new ObjectMapper(),directory,
                Map.of("JEV_API_KEY","fixture-not-a-real-key"))) {
            var state=runtime.snapshot("world:one",true);
            assertThat(state.get("mode")).isEqualTo("CHAT_RULES + CONFLICT_FIXTURE + FIXED");
            assertThat(state).doesNotContainKey("jevUsage");
        }
    }

    @Test void jevOnlyRejectsMissingKeyRatherThanSilentlyUsingFixture() {
        assertThatThrownBy(() -> new AiLabRuntime(new ObjectMapper(),directory,Map.of("AI_LAB_JEV_LIVE","true")))
                .isInstanceOf(IllegalArgumentException.class).hasMessage("JEV_API_KEY 설정 필요");
    }
    @Test void jevAndMattermostCanBeSelectedWithoutLlmKeyAndWithoutRemoteCalls() throws Exception {
        try(var runtime=new AiLabRuntime(new ObjectMapper(),directory,Map.of(
                "AI_LAB_JEV_LIVE","true","JEV_API_KEY","fixture-not-a-real-key",
                "AI_LAB_MM_LIVE","true","AI_LAB_MM_WEBHOOK","https://mm.example.invalid/hooks/fixture"))) {
            var state=runtime.snapshot("world:one",true);
            assertThat(state.get("mode")).isEqualTo("CHAT_RULES + CONFLICT_JEV + FIXED");
            assertThat(state.get("notifier")).isEqualTo("MATTERMOST");
            assertThat(state).doesNotContainKey("llmUsage");
        }
    }
    @Test void liveMattermostRequiresWebhookAndRejectsInvalidCooldown() {
        assertThatThrownBy(() -> new AiLabRuntime(new ObjectMapper(),directory,Map.of("AI_LAB_MM_LIVE","true")))
                .hasMessage("AI_LAB_MM_WEBHOOK 설정 필요");
        assertThatThrownBy(() -> new AiLabRuntime(new ObjectMapper(),directory,Map.of("AI_LAB_INCIDENT_COOLDOWN_SECONDS","0")))
                .hasMessage("사건 쿨다운은1~300초여야 합니다.");
    }
}
