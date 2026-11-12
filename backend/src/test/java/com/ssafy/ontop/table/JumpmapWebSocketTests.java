package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.jumpmap.InMemoryJumpmapStore;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.jumpmap.JumpmapActivation;
import com.ssafy.ontop.world.jumpmap.JumpmapStore;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldFacilityService;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

/** 실제 앱 구성의 소켓: 서버 물리 착지 → 본인 개인 이벤트, 주변 착지 알림, 순간 이동 RESET 종료. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.world.jumpmap.enabled=true",
        "ontop.world.map.source=generated", "ontop.world.map.require-match=true",
        "ontop.world.map.json-path=../frontend/generated/park/server-map.json",
        "ontop.world.map.manifest-path=../frontend/generated/park/manifest.json",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=점프맵",
        "ontop.world.channels[0].capacity=4"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, JumpmapWebSocketTests.Store.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class JumpmapWebSocketTests {
    @TestConfiguration
    static class Store {
        @Bean
        JumpmapStore jumpmapStore() { return new InMemoryJumpmapStore(); }
    }

    @LocalServerPort int port;
    @Autowired WorldMapRuntime runtime;
    @Autowired WorldChannelRegistry channels;
    @Autowired JumpmapActivation activation;

    private static boolean type(JsonNode message, String type) { return message.path("type").asText().equals(type); }

    @Test
    void 착지_판정을_본인에게_순서대로_보내고_착지알림은_주변에만_보낸다() throws Exception {
        assertThat(activation.state()).isEqualTo(JumpmapActivation.State.ACTIVE);
        var pad = activation.course().orElseThrow().colliders().getFirst();
        try (var first = new ScenarioClient(port, "naver"); var second = new ScenarioClient(port, "ssafy")) {
            first.await(m -> type(m, "CONNECTED"));
            second.await(m -> type(m, "CONNECTED"));
            first.request("WORLD_MAP_CONFIRM", runtime.scene().metadata());
            second.request("WORLD_MAP_CONFIRM", runtime.scene().metadata());
            first.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            second.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            channels.releaseFacility("202", new WorldFacilityService.Pose(pad.x() + 5, .95, pad.z() + 5, 0));
            // 주변 사람(202)은 착지 알림만 받고 101의 개인 이벤트는 받지 않는다.
            second.assertNoMessageDuring(m -> type(m, "JUMPMAP_STARTED") || type(m, "JUMPMAP_ENDED"), () -> {
                scenario(first, second, pad);
                return null;
            });
        }
    }

    private void scenario(ScenarioClient first, ScenarioClient second, JumpCourse.Collider pad) throws Exception {
        {
            channels.releaseFacility("101", new WorldFacilityService.Pose(pad.x(), pad.top() + 1.2, pad.z(), 0));
            var started = first.await(m -> type(m, "JUMPMAP_STARTED")).path("payload");
            assertThat(started.path("channelId").asText()).isEqualTo("channel-1");
            assertThat(started.path("mapVersion").asText()).isEqualTo(runtime.scene().version()).matches("[0-9a-f]{64}");
            assertThat(started.path("courseVersion").asText()).isEqualTo(JumpCourse.COURSE_VERSION);
            assertThat(started.path("rulesVersion").asText()).isEqualTo(JumpCourse.RULES_VERSION);
            assertThat(started.path("dailyCap").asInt()).isEqualTo(1000);
            assertThat(started.path("earningsDate").asText()).matches("\\d{4}-\\d{2}-\\d{2}");
            assertThat(started.path("serverTime").isIntegralNumber()).isTrue();
            var step = second.await(m -> type(m, "JUMPMAP_STEP") && m.at("/payload/playerId").asText().equals("101"));
            assertThat(step.at("/payload/block").asInt()).isZero();

            // 진행 중 서버 순간 이동은 RESET으로 끝난다.
            channels.releaseFacility("101", new WorldFacilityService.Pose(-70, .95, 0, 0));
            var ended = first.await(m -> type(m, "JUMPMAP_ENDED")).path("payload");
            assertThat(ended.path("reason").asText()).isEqualTo("RESET");
            assertThat(ended.path("runId").asText()).isEqualTo(started.path("runId").asText());
            assertThat(ended.path("revision").asLong()).isGreaterThan(started.path("revision").asLong());
            assertThat(ended.path("runCoins").asInt()).isZero();
        }
    }
}
