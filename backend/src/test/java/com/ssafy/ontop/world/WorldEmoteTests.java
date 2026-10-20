package com.ssafy.ontop.world;

import com.ssafy.ontop.world.config.WorldEmoteProperties;
import com.ssafy.ontop.world.domain.EmoteCode;
import com.ssafy.ontop.world.service.WorldEmoteService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorldEmoteTests {

    private final AtomicLong nanos = new AtomicLong();
    private final WorldEmoteService service = new WorldEmoteService(new WorldEmoteProperties(List.of("WAVE", "CLAP")),
            Duration.ofSeconds(1), Clock.fixed(Instant.parse("2026-10-20T00:00:00Z"), ZoneOffset.UTC), nanos::get);

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "wave", "WAVE ", "<b>", "WAVE\n", "0WAVE", "가나다"})
    void 코드_문법을_검증한다(String value) {
        assertThatThrownBy(() -> new EmoteCode(value)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 코드_길이와_서버_설정_중복을_검증하고_기본은_빈_목록이다() {
        assertThat(new EmoteCode("A".repeat(32)).value()).hasSize(32);
        assertThatThrownBy(() -> new EmoteCode("A".repeat(33))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new EmoteCode(null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new WorldEmoteProperties(List.of("WAVE", "WAVE")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new WorldEmoteProperties(List.of("wave"))).isInstanceOf(IllegalArgumentException.class);
        assertThat(new WorldEmoteProperties(null).codes()).isEmpty();
        WorldEmoteService empty = new WorldEmoteService(new WorldEmoteProperties(null), Duration.ofSeconds(1));
        assertThatThrownBy(() -> empty.create("one", "user", new EmoteCode("WAVE")))
                .isInstanceOf(WorldEmoteService.EmoteException.class).extracting("code").isEqualTo("EMOTE_NOT_SUPPORTED");
    }

    @Test
    void 미등록_코드는_간격을_소비하지_않고_서버가_식별자와_시각을_만든다() {
        assertThatThrownBy(() -> service.create("one", "user", new EmoteCode("OTHER")))
                .isInstanceOf(WorldEmoteService.EmoteException.class).extracting("code").isEqualTo("EMOTE_NOT_SUPPORTED");
        var event = service.create("one", "user", new EmoteCode("WAVE"));
        assertThat(UUID.fromString(event.eventId())).isNotNull();
        assertThat(event.channelId()).isEqualTo("one");
        assertThat(event.userId()).isEqualTo("user");
        assertThat(event.sentAt()).isEqualTo("2026-10-20T00:00:00Z");
    }

    @Test
    void 사용자별_경계와_채널_이동_제한_유지_거절후_시각_보존을_검사한다() {
        var first = service.create("one", "user", new EmoteCode("WAVE"));
        nanos.set(999_999_999);
        assertThatThrownBy(() -> service.create("two", "user", new EmoteCode("CLAP")))
                .isInstanceOf(WorldEmoteService.EmoteException.class).extracting("code").isEqualTo("EMOTE_TOO_FREQUENT");
        assertThat(service.create("one", "other", new EmoteCode("WAVE")).eventId()).isNotEqualTo(first.eventId());
        nanos.incrementAndGet();
        assertThat(service.create("two", "user", new EmoteCode("CLAP")).channelId()).isEqualTo("two");
    }

    @Test
    void 종료는_해당_사용자만_앱_정리는_전체_간격을_초기화한다() {
        service.create("one", "user", new EmoteCode("WAVE"));
        service.create("one", "other", new EmoteCode("WAVE"));
        service.disconnected("user");
        service.disconnected("user");
        service.create("one", "user", new EmoteCode("CLAP"));
        assertThatThrownBy(() -> service.create("one", "other", new EmoteCode("CLAP")))
                .isInstanceOf(WorldEmoteService.EmoteException.class);
        service.clear();
        service.create("one", "other", new EmoteCode("CLAP"));
    }

    @Test
    void 잘못된_전송_간격은_실행_전에_거절한다() {
        for (Duration duration : new Duration[] {null, Duration.ZERO, Duration.ofNanos(-1), Duration.ofSeconds(61)}) {
            assertThatThrownBy(() -> new WorldEmoteService(new WorldEmoteProperties(null), duration))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }
}
