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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorldEmoteCooldownTests {
    private final WorldEmoteProperties properties = new WorldEmoteProperties(
            List.of("WAVE", "CLAP", "APPLAUSE_REQUEST", "TSK", "FART"), Map.of(
                    "WAVE", Duration.ofSeconds(5), "CLAP", Duration.ofSeconds(5),
                    "APPLAUSE_REQUEST", Duration.ofMillis(1800), "TSK", Duration.ofMillis(1800),
                    "FART", Duration.ofMillis(1800)));

    @ParameterizedTest
    @CsvSource({"WAVE,5000", "CLAP,5000", "APPLAUSE_REQUEST,1800", "TSK,1800", "FART,1800"})
    void 직전표현의대기시간은다른표현과채널로바꿔도유지한다(String code, long millis) {
        AtomicLong nanos = new AtomicLong();
        var service = new WorldEmoteService(properties, Duration.ofSeconds(1), Clock.systemUTC(), nanos::get);
        service.create("a", "user", new EmoteCode(code));
        nanos.set(Duration.ofMillis(millis).toNanos() - 1);
        assertThatThrownBy(() -> service.create("b", "user", new EmoteCode("TSK")))
                .isInstanceOf(WorldEmoteService.EmoteException.class)
                .extracting("code").isEqualTo("EMOTE_TOO_FREQUENT");
        nanos.incrementAndGet();
        assertThat(service.create("b", "user", new EmoteCode("TSK")).emoteCode()).isEqualTo("TSK");
        nanos.addAndGet(Duration.ofMillis(1800).toNanos() - 1);
        assertThatThrownBy(() -> service.create("a", "user", new EmoteCode("WAVE")))
                .isInstanceOf(WorldEmoteService.EmoteException.class);
        nanos.incrementAndGet();
        service.create("a", "user", new EmoteCode("WAVE"));
    }

    @Test
    void 운영최소간격이더길면짧은표현으로우회할수없다() {
        AtomicLong nanos = new AtomicLong();
        var service = new WorldEmoteService(properties, Duration.ofSeconds(60), Clock.systemUTC(), nanos::get);
        service.create("a", "user", new EmoteCode("FART"));
        nanos.set(Duration.ofSeconds(59).toNanos());
        assertThatThrownBy(() -> service.create("a", "user", new EmoteCode("WAVE")))
                .isInstanceOf(WorldEmoteService.EmoteException.class);
    }

    @Test
    void 표현별잘못된설정은시작전에거절한다() {
        assertThatThrownBy(() -> new WorldEmoteProperties(List.of("WAVE"), Map.of("WAVE", Duration.ZERO)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new WorldEmoteProperties(List.of("WAVE"), Map.of("bad", Duration.ofSeconds(1))))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
