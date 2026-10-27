package com.ssafy.ontop.table;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.ontop.world.service.WorldClock;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.world.map.require-match=true"
})
@Import(AuthenticatedWebSocketTests.AuthFixture.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class WorldTimeFlowTests {
    @LocalServerPort private int port;

    @Test
    void 연결과_재접속_맵확인전_서버시각을_읽되_입장권한은_바꾸지않는다() throws Exception {
        for (int i = 0; i < 2; i++) {
            try (var client = new ScenarioClient(port, i == 0 ? "naver" : "ssafy")) {
                var connected = client.await(m -> m.path("type").asText().equals("CONNECTED"));
                assertThat(connected.path("payload").path("time").path("cycleEpochMs").asLong())
                        .isEqualTo(1_767_193_200_000L);
                long before = System.currentTimeMillis();
                var result = client.request("WORLD_TIME_CHECK", Map.of());
                assertThat(result.path("type").asText()).isEqualTo("WORLD_TIME_STATE");
                assertThat(result.path("payload").path("serverNow").asLong())
                        .isBetween(before, System.currentTimeMillis());
                assertThat(result.path("payload").path("cycleDurationMs").asLong()).isEqualTo(1_800_000);
                assertThat(client.request("WORLD_TIME_CHECK", Map.of("serverNow", 0))
                        .path("payload").path("code").asText()).isEqualTo("INVALID_PAYLOAD");
                assertThat(client.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"))
                        .path("payload").path("code").asText()).isEqualTo("MAP_VERSION_REQUIRED");
            }
        }
    }

    @Test
    void 채널과_서버시작시각에_무관하게_동일한_낮밤기준을_쓴다() {
        var first = new WorldClock(Clock.fixed(Instant.parse("2026-10-27T00:00:00Z"), ZoneOffset.UTC)).sample();
        var later = new WorldClock(Clock.fixed(Instant.parse("2026-10-27T01:00:00Z"), ZoneOffset.UTC)).sample();
        assertThat(later.serverNow() - first.serverNow()).isEqualTo(3_600_000);
        assertThat(first.cycleEpochMs()).isEqualTo(later.cycleEpochMs());
        assertThat(first.cycleDurationMs()).isEqualTo(later.cycleDurationMs());
    }
}
