package com.ssafy.ontop.world;

import com.ssafy.ontop.world.config.WorldEmoteProperties;
import com.ssafy.ontop.world.domain.EmoteCode;
import com.ssafy.ontop.world.service.WorldEmoteService;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorldEmoteLifecycleTests {
    private final AtomicLong nanos = new AtomicLong();
    private final WorldEmoteService service = new WorldEmoteService(new WorldEmoteProperties(
            List.of("WAVE", "CLAP", "FART"), Map.of("WAVE", Duration.ofSeconds(5),
                    "CLAP", Duration.ofSeconds(5), "FART", Duration.ofMillis(1800))),
            Duration.ofSeconds(1), Clock.systemUTC(), nanos::get);

    @Test
    void 방귀는_이동_취소를_무시하되_시설_이용은_같은_사건을_취소한다() {
        var first = service.create("a", "user", new EmoteCode("FART"));
        assertThat(service.cancel("user", "MOVEMENT")).isNull();
        var stopped = service.cancel("user", "ACTIVITY_STARTED");
        assertThat(stopped.emoteEventId()).isEqualTo(first.eventId());
        assertThat(service.cancel("user", "ACTIVITY_STARTED")).isNull();
    }

    @Test
    void 유효한_이동_취소는_즉시_다른_표현을_허용하고_정상_쿨다운은_유지한다() {
        var first = service.create("a", "user", new EmoteCode("WAVE"));
        nanos.set(50_000_000L);
        assertThat(service.cancel("user", "MOVEMENT").emoteEventId()).isEqualTo(first.eventId());
        assertThat(service.create("a", "user", new EmoteCode("CLAP")).emoteCode()).isEqualTo("CLAP");
        assertThatThrownBy(() -> service.create("a", "user", new EmoteCode("WAVE")))
                .isInstanceOf(WorldEmoteService.EmoteException.class);
    }

    @Test
    void 이미_끝난_표현의_늦은_이동은_남은_정상_쿨다운을_풀지_않는다() {
        service.create("a", "user", new EmoteCode("WAVE"));
        nanos.set(Duration.ofMillis(2600).toNanos());
        assertThat(service.cancel("user", "MOVEMENT")).isNull();
        assertThatThrownBy(() -> service.create("a", "user", new EmoteCode("CLAP")))
                .isInstanceOf(WorldEmoteService.EmoteException.class);
        nanos.set(Duration.ofSeconds(5).toNanos());
        assertThat(service.create("a", "user", new EmoteCode("CLAP")).emoteCode()).isEqualTo("CLAP");
    }

    @Test
    void 취소를_반복해도_슬라이딩_1초의_승인_5회를_초과하지_못하고_거절은_제한을_연장하지_않는다() {
        for (int i = 0; i < 5; i++) {
            nanos.set(i * 10_000_000L);
            service.create("a", "user", new EmoteCode("WAVE"));
            service.cancel("user", "MOVEMENT");
        }
        nanos.set(999_999_999L);
        assertThatThrownBy(() -> service.create("b", "user", new EmoteCode("CLAP")))
                .isInstanceOf(WorldEmoteService.EmoteException.class)
                .extracting("code").isEqualTo("EMOTE_TOO_FREQUENT");
        assertThat(service.create("a", "other", new EmoteCode("WAVE")).emoteCode()).isEqualTo("WAVE");
        nanos.incrementAndGet();
        service.create("b", "user", new EmoteCode("CLAP"));
        service.cancel("user", "MOVEMENT");
        assertThatThrownBy(() -> service.create("a", "user", new EmoteCode("WAVE")))
                .isInstanceOf(WorldEmoteService.EmoteException.class);
        nanos.set(1_010_000_000L);
        assertThat(service.create("a", "user", new EmoteCode("WAVE")).emoteCode()).isEqualTo("WAVE");
    }

    @Test
    void 재생길이_부분설정은_다른_표현의_기본길이를_보존한다() {
        var properties = new WorldEmoteProperties(List.of("WAVE", "CLAP"), Map.of(),
                Map.of("WAVE", Duration.ofMillis(10)));
        assertThat(properties.durations().get("CLAP")).isEqualTo(Duration.ofMillis(4867));
        var configured = new WorldEmoteService(properties, Duration.ofSeconds(1), Clock.systemUTC(), nanos::get);
        configured.create("a", "user", new EmoteCode("WAVE"));
        nanos.set(10_000_000L);
        assertThat(configured.cancel("user", "MOVEMENT")).isNull();
        assertThatThrownBy(() -> configured.create("a", "user", new EmoteCode("CLAP")))
                .isInstanceOf(WorldEmoteService.EmoteException.class);
        assertThatThrownBy(() -> new WorldEmoteService(properties, Duration.ofSeconds(1),
                Clock.systemUTC(), nanos::get, 0)).isInstanceOf(IllegalArgumentException.class);
    }
}
