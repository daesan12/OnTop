package com.ssafy.ontop.behavior.domain;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BehaviorEventTests {

    private static final Instant AT = Instant.parse("2026-10-23T00:00:00Z");

    @Test
    void 값이_null인_props는_남기지_않는다() {
        BehaviorEvent event = BehaviorEvent.builder(BehaviorEventType.CHAT_SENT, AT)
                .prop("length", 5)
                .prop("recipients", null)
                .build();

        assertThat(event.props()).containsExactly(Map.entry("length", 5));
    }

    @Test
    void props에_문자열_숫자_boolean과_그_목록만_허용한다() {
        BehaviorEvent event = BehaviorEvent.builder(BehaviorEventType.GAME_ENDED, AT)
                .prop("gameCode", "OMOK")
                .prop("won", true)
                .prop("winners", List.of(1L, 2L))
                .build();

        assertThat(event.props()).hasSize(3);
        assertThatThrownBy(() -> BehaviorEvent.builder(BehaviorEventType.GAME_ENDED, AT)
                .prop("raw", new Object())
                .build())
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 긴_문자열과_DB_길이를_넘는_식별자는_거절한다() {
        assertThatThrownBy(() -> BehaviorEvent.builder(BehaviorEventType.CHAT_SENT, AT)
                .prop("text", "가".repeat(201))
                .build())
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> BehaviorEvent.builder(BehaviorEventType.CHANNEL_JOINED, AT)
                .channelId("c".repeat(65))
                .build())
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 출처를_정하지_않으면_서버_기록으로_본다() {
        assertThat(BehaviorEvent.builder(BehaviorEventType.CHAT_SENT, AT).build().source())
                .isEqualTo(BehaviorSource.SERVER);
        assertThat(BehaviorEvent.builder(BehaviorEventType.PERF_REPORT, AT).source(BehaviorSource.CLIENT).build()
                .source()).isEqualTo(BehaviorSource.CLIENT);
    }

    @Test
    void 발생_시각이_없으면_만들지_않는다() {
        assertThatThrownBy(() -> BehaviorEvent.builder(BehaviorEventType.WS_CONNECTED, null).build())
                .isInstanceOf(NullPointerException.class);
    }

    @Test
    void 만든_뒤에는_props를_바꿀_수_없다() {
        BehaviorEvent event = BehaviorEvent.builder(BehaviorEventType.CHAT_SENT, AT).prop("length", 1).build();

        assertThatThrownBy(() -> event.props().put("length", 2))
                .isInstanceOf(UnsupportedOperationException.class);
    }
}
