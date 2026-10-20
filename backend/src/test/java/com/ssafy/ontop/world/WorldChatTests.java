package com.ssafy.ontop.world;

import com.ssafy.ontop.world.domain.ChatText;
import com.ssafy.ontop.world.service.WorldChatService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorldChatTests {

    private final AtomicLong nanos = new AtomicLong();
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-20T00:00:00Z"), ZoneOffset.UTC);
    private final WorldChatService chat = new WorldChatService(Duration.ofSeconds(1), clock, nanos::get);

    @Test
    void 텍스트를_정규화하고_이모지는_코드포인트로_200자까지_허용한다() {
        assertThat(new ChatText("  안녕 👋  ").value()).isEqualTo("안녕 👋");
        assertThat(new ChatText("👋".repeat(200)).value()).isEqualTo("👋".repeat(200));
        assertThatThrownBy(() -> new ChatText("👋".repeat(201))).isInstanceOf(IllegalArgumentException.class);
        for (String invalid : new String[] {null, "", "  ", "a\nb", "a\tb", "a\u0000b", "\uD800",
                "a\u2028b", "a\u2029b"}) {
            assertThatThrownBy(() -> new ChatText(invalid)).isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void 간격은_사용자별이며_거절은_마지막_성공_시간을_연장하지_않는다() {
        var first = chat.create("one", "a", new ChatText("첫 메시지"));
        assertThat(UUID.fromString(first.messageId())).isNotNull();
        assertThat(first.sentAt()).isEqualTo("2026-10-20T00:00:00Z");
        assertThat(chat.create("one", "b", new ChatText("다른 사용자")).messageId()).isNotEqualTo(first.messageId());
        nanos.set(999_999_999);
        assertThatThrownBy(() -> chat.create("two", "a", new ChatText("채널 이동해도 제한")))
                .isInstanceOf(WorldChatService.ChatException.class);
        nanos.incrementAndGet();
        var second = chat.create("two", "a", new ChatText("정확히 1초 뒤"));
        assertThat(second.channelId()).isEqualTo("two");
        assertThat(second.messageId()).isNotEqualTo(first.messageId());
    }

    @Test
    void 종료는_그_사용자의_간격만_지우며_전체_종료는_모두_정리한다() {
        chat.create("one", "a", new ChatText("a"));
        chat.create("one", "b", new ChatText("b"));
        chat.disconnected("a");
        chat.disconnected("a");
        assertThat(chat.create("one", "a", new ChatText("새 연결"))).isNotNull();
        assertThatThrownBy(() -> chat.create("one", "b", new ChatText("기존 연결")))
                .isInstanceOf(WorldChatService.ChatException.class);
        chat.clear();
        assertThat(chat.create("one", "b", new ChatText("다시 시작"))).isNotNull();
    }

    @Test
    void 잘못된_전송_간격은_시작_전에_거절한다() {
        for (Duration value : List.of(Duration.ZERO, Duration.ofMillis(-1), Duration.ofSeconds(61))) {
            assertThatThrownBy(() -> new WorldChatService(value)).isInstanceOf(IllegalArgumentException.class);
        }
    }
}
