package com.ssafy.ontop.table;

import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.service.WorldAppearanceGateway;
import com.ssafy.ontop.world.service.WorldAppearanceGateway.Equipment;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.world.channels[0].channel-id=a", "ontop.world.channels[0].name=A",
        "ontop.world.channels[0].capacity=3", "ontop.world.channels[1].channel-id=b",
        "ontop.world.channels[1].name=B", "ontop.world.channels[1].capacity=3"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, FrozenWorldFixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WorldAppearanceFlowTests {
    @LocalServerPort int port;
    @Autowired TableHub hub;
    @MockitoBean WorldAppearanceGateway gateway;
    private final Equipment red = new Equipment(1, "RED_TOP", "TOP", "demo-red-top");
    private final Equipment blue = new Equipment(2, "BLUE_TOP", "TOP", "demo-blue-top");

    @Test
    void 조회중에도채널퇴장은응답하고_이전채널조회결과는새채널에적용하지않는다() throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var calls = new AtomicInteger();
        when(gateway.equipment(101)).thenAnswer(invocation -> {
            if (calls.incrementAndGet() == 1) {
                entered.countDown();
                if (!release.await(5, TimeUnit.SECONDS)) { throw new IllegalStateException("조회 대기 초과"); }
                return List.of(red);
            }
            return List.of(blue);
        });
        try (var client = new ScenarioClient(port, "naver")) {
            client.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            // 조회가 끝나기 전에 응답하므로 Hub 모니터를 DB 조회가 점유하지 않는다.
            client.request("CHANNEL_LEAVE", Map.of());
            client.request("CHANNEL_JOIN", Map.of("channelId", "b"));
            client.await(message -> hasItem(message, "BLUE_TOP"));
            client.assertNoMessageDuring(message -> hasItem(message, "RED_TOP"), () -> {
                release.countDown(); return null;
            });
        } finally { release.countDown(); }
    }

    @Test
    void 조회중새변경은재조회하고_장애는마지막외형을지우지않으며_입력위조는거절한다() throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var calls = new AtomicInteger();
        when(gateway.equipment(101)).thenAnswer(invocation -> {
            int call = calls.incrementAndGet();
            if (call == 1) {
                entered.countDown();
                if (!release.await(5, TimeUnit.SECONDS)) { throw new IllegalStateException("조회 대기 초과"); }
                return List.of(red);
            }
            if (call == 2) { return List.of(blue); }
            throw new IllegalStateException("private-database-detail");
        });
        try (var client = new ScenarioClient(port, "naver")) {
            client.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            hub.refreshAppearance(101);
            release.countDown();
            client.await(message -> hasItem(message, "BLUE_TOP"));
            client.assertNoMessage(message -> hasItem(message, "RED_TOP"));
            hub.refreshAppearance(101);
            client.assertNoMessage(message -> message.toString().contains("private-database-detail")
                    || hasItem(message, "RED_TOP"));
            client.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            client.await(message -> hasItem(message, "BLUE_TOP"));
            assertThat(client.request("WORLD_MOVE", Map.of("equipment", List.of(), "inputSeq", 1))
                    .path("payload").path("code").asText()).isEqualTo("INVALID_PAYLOAD");
        } finally { release.countDown(); }
    }

    static boolean hasItem(com.fasterxml.jackson.databind.JsonNode message, String itemCode) {
        if (!message.path("type").asText().equals("WORLD_STATE")) { return false; }
        for (var avatar : message.path("payload").path("avatars")) {
            for (var item : avatar.path("equipment")) {
                if (item.path("itemCode").asText().equals(itemCode)) { return true; }
            }
        }
        return false;
    }
}
