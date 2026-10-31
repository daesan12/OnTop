package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.jumpmap.InMemoryJumpmapStore;
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

/** 같은 로그인 세션 재연결(half-open)과 점프맵 15초 유예 재결합을 실제 소켓으로 확인한다. 확인 시간은 테스트용 0.5초. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.world.jumpmap.enabled=true",
        "ontop.websocket.duplicate-probe-timeout=500ms",
        "ontop.world.map.source=generated", "ontop.world.map.require-match=true",
        "ontop.world.map.json-path=../frontend/generated/park/server-map.json",
        "ontop.world.map.manifest-path=../frontend/generated/park/manifest.json",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=점프맵",
        "ontop.world.channels[0].capacity=4"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, JumpmapReconnectWebSocketTests.Store.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class JumpmapReconnectWebSocketTests {
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

    private ScenarioClient enter(String login) throws Exception {
        var client = new ScenarioClient(port, login);
        client.await(m -> type(m, "CONNECTED"));
        client.request("WORLD_MAP_CONFIRM", runtime.scene().metadata());
        client.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
        return client;
    }

    @Test
    void 응답없는_옛연결은_즉시확인_후_정리되고_새연결은_1013_뒤_재시도로_들어온다() throws Exception {
        try (var stale = enter("naver")) {
            stale.stopPong();
            try (var first = new ScenarioClient(port, "naver")) {
                assertThat(first.awaitClose()).isEqualTo(1013);
            }
            Thread.sleep(900);
            assertThat(channels.channelOf("101")).isNull();
            try (var retry = new ScenarioClient(port, "naver")) {
                assertThat(retry.await(m -> type(m, "CONNECTED"))).isNotNull();
            }
        }
    }

    @Test
    void 응답하는_다른탭은_유지하고_확인뒤_재연결은_기존처럼_1008이다() throws Exception {
        try (var live = enter("ssafy")) {
            try (var first = new ScenarioClient(port, "ssafy")) {
                assertThat(first.awaitClose()).isEqualTo(1013);
            }
            Thread.sleep(1_000);
            try (var second = new ScenarioClient(port, "ssafy")) {
                assertThat(second.awaitClose()).isEqualTo(1008);
            }
            assertThat(channels.channelOf("202")).isEqualTo("channel-1");
            assertThat(live.request("WORLD_TIME_CHECK", Map.of()).path("type").asText()).isEqualTo("WORLD_TIME_STATE");
        }
    }

    @Test
    void 진행중_판은_끊긴뒤_같은채널로_돌아오면_이어지고_명시적_퇴장은_LEFT다() throws Exception {
        assertThat(activation.active()).isTrue();
        var pad = activation.course().orElseThrow().colliders().getFirst();
        String runId;
        try (var first = enter("naver")) {
            channels.releaseFacility("101", new WorldFacilityService.Pose(pad.x(), pad.top() + 1.2, pad.z(), 0));
            runId = first.await(m -> type(m, "JUMPMAP_STARTED")).at("/payload/runId").asText();
        }
        Thread.sleep(500);
        assertThat(channels.jumpmapSuspended("101")).isTrue();
        assertThat(channels.channelOf("101")).isEqualTo("channel-1");
        try (var back = new ScenarioClient(port, "naver")) {
            back.await(m -> type(m, "CONNECTED"));
            back.request("WORLD_MAP_CONFIRM", runtime.scene().metadata());
            back.assertNoMessageDuring(m -> type(m, "JUMPMAP_ENDED"), () -> {
                back.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
                return null;
            });
            assertThat(channels.jumpmapSuspended("101")).isFalse();
            assertThat(channels.jumpmapRun("101")).get().extracting(run -> run.runId()).isEqualTo(runId);
            assertThat(channels.positionOf("101").lastInputSeq()).isZero();
            back.request("CHANNEL_LEAVE", Map.of());
            var ended = back.await(m -> type(m, "JUMPMAP_ENDED")).path("payload");
            assertThat(ended.path("reason").asText()).isEqualTo("LEFT");
            assertThat(ended.path("runId").asText()).isEqualTo(runId);
        }
    }
}
