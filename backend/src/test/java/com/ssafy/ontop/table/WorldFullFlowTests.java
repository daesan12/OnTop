package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
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
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=2s",
        "ontop.world.chat.minimum-interval=60s", "ontop.world.emote.minimum-interval=60s",
        "ontop.world.emote.codes[0]=WAVE", "ontop.world.emote.codes[1]=CLAP",
        "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=하나",
        "ontop.world.channels[0].capacity=3",
        "ontop.world.channels[1].channel-id=two", "ontop.world.channels[1].name=둘",
        "ontop.world.channels[1].capacity=3"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, AllowedWatchFixture.class, FrozenWorldFixture.class})
@DirtiesContext
class WorldFullFlowTests {

    @LocalServerPort
    private int port;
    @Autowired private AccessJwtService jwt;
    @MockitoBean private WebSocketAccountLookup accounts;

    @BeforeEach
    void authenticatedHttp() {
        when(accounts.findActive(101)).thenReturn(Optional.of(new VerifiedWebSocketUser(101,
                VerifiedWebSocketUser.Provider.NAVER)));
    }

    @Test
    void 광장부터_착석과_준비_끊김_정리까지_확인한다() throws Exception {
        System.out.println("[SIMULATED] 인증은 테스트 대역. WAVE/CLAP은 검증 코드. 경기·정산·3D 검증 아님.");
        try (ScenarioClient first = connect("naver"); ScenarioClient second = connect("ssafy")) {
            join(first, "one");
            join(second, "two");
            JsonNode moved = payload(first, "WORLD_MOVE", move(0, 3), "WORLD_STATE");
            assertThat(avatar(moved, "101").path("position").path("x").asDouble()).isEqualTo(com.ssafy.ontop.world.movement.ParkScene.load().spawn(0).x);
            payload(first, "WORLD_CHAT_SEND", Map.of("text", "격리 확인"), "WORLD_CHAT_MESSAGE");
            payload(first, "WORLD_EMOTE_SEND", Map.of("emoteCode", "WAVE"), "WORLD_EMOTE_EVENT");
            second.assertNoMessage(message -> message.path("type").asText().startsWith("WORLD_"));
            pass("다른 채널에 위치·채팅·감정표현 미전송 (300ms 관찰)");

            payload(second, "CHANNEL_LEAVE", Map.of(), "CHANNEL_LEFT");
            JsonNode late = second.assertNoMessageDuring(message -> isType(message, "WORLD_CHAT_MESSAGE")
                    || isType(message, "WORLD_EMOTE_EVENT"), () -> join(second, "one"));
            assertThat(avatar(late, "101").path("position").path("x").asDouble()).isEqualTo(com.ssafy.ontop.world.movement.ParkScene.load().spawn(0).x);
            assertThat(avatar(late, "202").path("position").isObject()).isTrue();
            payload(second, "WORLD_MOVE", move(0, 4), "WORLD_STATE");
            first.await(message -> isType(message, "WORLD_STATE")
                    && message.path("payload").path("avatars").size() == 2);
            JsonNode chat = payload(second, "WORLD_CHAT_SEND", Map.of("text", "같이 놀자 👋"),
                    "WORLD_CHAT_MESSAGE");
            assertThat(chat.path("userId").asText()).isEqualTo("202");
            assertThat(first.await(message -> isType(message, "WORLD_CHAT_MESSAGE")).path("payload"))
                    .isEqualTo(chat);
            JsonNode emote = payload(second, "WORLD_EMOTE_SEND", Map.of("emoteCode", "CLAP"),
                    "WORLD_EMOTE_EVENT");
            assertThat(first.await(message -> isType(message, "WORLD_EMOTE_EVENT")).path("payload"))
                    .isEqualTo(emote);
            pass("같은 채널 최신 위치·채팅·감정표현 공유 / 이전 이벤트 재생 없음");

            JsonNode table = table();
            String tableId = table.path("tableId").asText();
            assertThat(tableId).isNotBlank();
            assertThat(table.path("occupiedSeats").asInt()).isZero();
            payload(second, "TABLE_WATCH", Map.of("tableId", tableId), "TABLE_WATCH_STATE");
            payload(first, "TABLE_JOIN", Map.of("tableId", tableId), "TABLE_STATE");
            second.await(message -> isType(message, "TABLE_WATCH_STATE")
                    && message.path("payload").path("seats").findValuesAsText("userId").contains("101"));
            assertThat(table().path("occupiedSeats").asInt()).isEqualTo(1);
            assertThat(payload(second, "READY_SET", Map.of("ready", true), "ERROR").path("code").asText())
                    .isEqualTo("NOT_SEATED");
            payload(second, "TABLE_JOIN", Map.of("tableId", tableId), "TABLE_STATE");
            payload(first, "GAME_SELECT", Map.of("gameCode", "DICE", "targetScore", 4000), "TABLE_STATE");
            assertThat(payload(first, "READY_SET", Map.of("ready", true), "TABLE_STATE")
                    .path("allReady").asBoolean()).isFalse();
            JsonNode ready = payload(second, "READY_SET", Map.of("ready", true), "TABLE_STATE");
            assertThat(ready.path("allReady").asBoolean()).isTrue();
            assertThat(first.await(message -> isType(message, "TABLE_STATE")
                    && message.path("payload").path("allReady").asBoolean()).path("payload")).isEqualTo(ready);
            assertThat(table().path("occupiedSeats").asInt()).isEqualTo(2);
            assertThat(table().path("readyCount").asInt()).isEqualTo(2);
            pass("HTTP 테이블 조회 → 보기(좌석 미점유) → 착석 전환 → 게임 선택·전원 준비");

            second.stopPong();
            assertThat(second.awaitClose()).isEqualTo(1001);
            first.await(message -> isType(message, "CHANNEL_STATE")
                    && message.path("payload").path("currentUsers").asInt() == 1);
            JsonNode cleaned = first.await(message -> isType(message, "WORLD_STATE")
                    && message.path("payload").path("avatars").size() == 1).path("payload");
            assertThat(avatar(cleaned, "101").path("position").path("x").asDouble()).isEqualTo(com.ssafy.ontop.world.movement.ParkScene.load().spawn(0).x);
            JsonNode remaining = first.await(message -> isType(message, "TABLE_STATE")
                    && !message.path("payload").path("seats").findValuesAsText("userId").contains("202"))
                    .path("payload");
            assertThat(remaining.path("allReady").asBoolean()).isFalse();
            assertThat(remaining.path("seats").findValues("ready")).allMatch(value -> !value.asBoolean());
            assertThat(table().path("occupiedSeats").asInt()).isEqualTo(1);
            assertThat(table().path("readyCount").asInt()).isZero();
            pass("heartbeat 끊김 → 좌석·준비·채널 인원·위치 정리 및 조회 반영");

            try (ScenarioClient returned = connect("ssafy")) {
                JsonNode fresh = join(returned, "one");
                assertThat(avatar(fresh, "202").path("position").isObject()).isTrue();
                assertThat(table().path("occupiedSeats").asInt()).isEqualTo(1);
                payload(returned, "WORLD_MOVE", move(0, 4), "WORLD_STATE");
                payload(returned, "WORLD_CHAT_SEND", Map.of("text", "다시 입장"), "WORLD_CHAT_MESSAGE");
                payload(returned, "WORLD_EMOTE_SEND", Map.of("emoteCode", "CLAP"), "WORLD_EMOTE_EVENT");
                JsonNode seated = payload(returned, "TABLE_JOIN", Map.of("tableId", tableId), "TABLE_STATE");
                assertThat(seated.path("allReady").asBoolean()).isFalse();
                assertThat(table().path("occupiedSeats").asInt()).isEqualTo(2);
                pass("같은 계정 새 연결 → 서버 스폰·좌석 자동 복구 없음·간격 정리·다시 착석");
            }
        }
    }

    private ScenarioClient connect(String login) throws Exception {
        ScenarioClient client = new ScenarioClient(port, login);
        client.await(message -> isType(message, "CONNECTED"));
        return client;
    }

    private JsonNode join(ScenarioClient client, String channel) throws Exception {
        payload(client, "CHANNEL_JOIN", Map.of("channelId", channel), "CHANNEL_STATE");
        return client.await(message -> isType(message, "WORLD_STATE")).path("payload");
    }

    private JsonNode table() throws Exception {
        try (HttpClient http = HttpClient.newHttpClient()) {
            var response = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/api/v1/tables?channelId=one")).header("Authorization", "Bearer " + jwt.issue(101))
                    .GET().build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
            JsonNode tables = new ObjectMapper().readTree(response.body()).path("tables");
            assertThat(tables).hasSize(2);
            return tables.get(0);
        }
    }

    private static JsonNode payload(ScenarioClient client, String type, Object body, String expected) throws Exception {
        JsonNode message = client.request(type, body);
        assertThat(message.path("type").asText()).isEqualTo(expected);
        return message.path("payload");
    }

    private static JsonNode avatar(JsonNode state, String userId) {
        for (JsonNode avatar : state.path("avatars")) {
            if (avatar.path("userId").asText().equals(userId)) {
                return avatar;
            }
        }
        throw new AssertionError("사용자 위치 항목 누락: " + userId);
    }

    private static Map<String, Object> move(long sequence, double x) {
        return Map.of("seq", sequence + 1, "dx", 0, "dz", 0, "run", false);
    }

    private static boolean isType(JsonNode message, String type) {
        return message.path("type").asText().equals(type);
    }

    private static void pass(String message) {
        System.out.println("[PASS] " + message);
    }
}
