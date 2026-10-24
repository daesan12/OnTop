package com.ssafy.ontop.feedback;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.feedback.service.FeedbackException;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FeedbackAccessTests {
    private final WorldChannelRegistry channels = mock(WorldChannelRegistry.class);
    private TableHub hub;

    @BeforeEach
    void 준비한다() {
        when(channels.snapshot()).thenReturn(Map.of());
        hub = new TableHub(new ObjectMapper(), Optional.empty(), false, Optional.empty(),
                Duration.ofHours(1), Duration.ofHours(1), channels);
        when(channels.isInChannel("101", "channel-1")).thenReturn(true);
    }

    @AfterEach
    void 종료한다() { hub.shutdown(); }

    @Test
    void 서버_위치가_소리함_근처이면_허용한다() {
        when(channels.positionOf("101")).thenReturn(new WorldChannelRegistry.Position(0, -10.8, 0.8, 14.5, 0));

        assertThatCode(() -> hub.requireFeedbackAccess(101, "channel-1", -10.8, 0.8, 14.5))
                .doesNotThrowAnyException();
    }

    @Test
    void 반경밖과_높이차는_거절한다() {
        when(channels.positionOf("101")).thenReturn(new WorldChannelRegistry.Position(0, -8.19, 0.8, 14.5, 0));
        assertThatThrownBy(() -> hub.requireFeedbackAccess(101, "channel-1", -10.8, 0.8, 14.5))
                .isInstanceOf(FeedbackException.class).hasMessageContaining("가까이");
        when(channels.positionOf("101")).thenReturn(new WorldChannelRegistry.Position(0, -10.8, 1.51, 14.5, 0));
        assertThatThrownBy(() -> hub.requireFeedbackAccess(101, "channel-1", -10.8, 0.8, 14.5))
                .isInstanceOf(FeedbackException.class).hasMessageContaining("같은 높이");
    }

    @Test
    void 수영과_다른채널과_없는위치는_거절한다() {
        when(channels.positionOf("101")).thenReturn(new WorldChannelRegistry.Position(
                0, -10.8, 0.8, 14.5, 0, false, false, true));
        assertThatThrownBy(() -> hub.requireFeedbackAccess(101, "channel-1", -10.8, 0.8, 14.5))
                .isInstanceOf(FeedbackException.class).hasMessageContaining("수영");
        when(channels.isInChannel("101", "channel-1")).thenReturn(false);
        assertThatThrownBy(() -> hub.requireFeedbackAccess(101, "channel-1", -10.8, 0.8, 14.5))
                .hasMessageContaining("채널");
        when(channels.isInChannel("101", "channel-1")).thenReturn(true);
        when(channels.positionOf("101")).thenReturn(null);
        assertThatThrownBy(() -> hub.requireFeedbackAccess(101, "channel-1", -10.8, 0.8, 14.5))
                .hasMessageContaining("채널");
    }
}
