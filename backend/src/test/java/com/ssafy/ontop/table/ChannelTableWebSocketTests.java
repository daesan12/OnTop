package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.RestSecurityTestSupport;
import com.ssafy.ontop.auth.service.AccessJwtService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.start-rehearsal.enabled=true",
        "ontop.start-rehearsal.delay-millis=0",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=검증 채널 1",
        "ontop.world.channels[0].capacity=4",
        "ontop.world.channels[1].channel-id=channel-2", "ontop.world.channels[1].name=검증 채널 2",
        "ontop.world.channels[1].capacity=4"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@Import(RestSecurityTestSupport.class)
@org.springframework.test.context.TestPropertySource(properties = "ontop.websocket.authenticated=false")
class ChannelTableWebSocketTests {

    @Autowired
    private AccessJwtService jwt;

    @LocalServerPort
    private int port;

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void 채널_목록_필터와_착석_권한은_실제_HTTP와_소켓에서_검사한다() throws Exception {
        try (HttpClient http = HttpClient.newHttpClient(); ScenarioClient user = connect()) {
            HttpResponse<String> missing = query(http, "");
            assertThat(missing.statusCode()).isEqualTo(400);
            assertThat(mapper.readTree(missing.body()).path("code").asText()).isEqualTo("CHANNEL_REQUIRED");
            assertThat(query(http, "?channelId=unknown").statusCode()).isEqualTo(404);
            assertThat(missing.headers().firstValue("Cache-Control")).contains("no-store");
            String own = table(http, "channel-1");
            String other = table(http, "channel-2");
            assertThat(own).isNotEqualTo(other);
            assertThat(user.request("TABLE_JOIN", Map.of("tableId", own)).path("payload").path("code").asText())
                    .isEqualTo("NOT_IN_CHANNEL");
            user.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            assertThat(user.request("TABLE_JOIN", Map.of("tableId", other)).path("payload").path("code").asText())
                    .isEqualTo("TABLE_CHANNEL_MISMATCH");
            assertThat(user.request("TABLE_JOIN", Map.of("tableId", own)).path("payload").path("tableId").asText())
                    .isEqualTo(own);
            assertThat(user.request("CHANNEL_LEAVE", Map.of()).path("payload").path("code").asText())
                    .isEqualTo("TABLE_BUSY");
            user.request("TABLE_LEAVE", Map.of());
            user.request("CHANNEL_LEAVE", Map.of());
            user.request("CHANNEL_JOIN", Map.of("channelId", "channel-2"));
            assertThat(user.request("TABLE_JOIN", Map.of("tableId", other)).path("payload").path("tableId").asText())
                    .isEqualTo(other);
            assertThat(rows(http, "channel-1").get(0).path("occupiedSeats").asInt()).isZero();
        }
    }

    @Test
    void 두_채널의_게임_선택과_시작_결과와_보존_좌석은_독립적이다() throws Exception {
        try (HttpClient http = HttpClient.newHttpClient(); ScenarioClient first = connect();
                ScenarioClient second = connect(); ScenarioClient other = connect(); ScenarioClient fourth = connect()) {
            String one = table(http, "channel-1");
            String two = table(http, "channel-2");
            seat(first, "channel-1", one);
            seat(second, "channel-1", one);
            seat(other, "channel-2", two);
            seat(fourth, "channel-2", two);
            first.request("GAME_SELECT", Map.of("gameCode", "DICE", "targetScore", 4000));
            first.request("READY_SET", Map.of("ready", true));
            second.request("READY_SET", Map.of("ready", true));
            JsonNode firstStart = confirmed(first);
            assertThat(confirmed(second)).isEqualTo(firstStart);
            assertThat(firstStart.path("tableId").asText()).isEqualTo(one);
            JsonNode untouched = rows(http, "channel-2").get(0);
            assertThat(untouched.path("gameCode").isNull()).isTrue();
            assertThat(untouched.path("readyCount").asInt()).isZero();
            assertThat(untouched.path("status").asText()).isEqualTo("WAITING");

            other.request("GAME_SELECT", Map.of("gameCode", "OMOK"));
            other.request("READY_SET", Map.of("ready", true));
            fourth.request("READY_SET", Map.of("ready", true));
            JsonNode otherStart = confirmed(other);
            assertThat(confirmed(fourth)).isEqualTo(otherStart);
            assertThat(otherStart.path("tableId").asText()).isEqualTo(two);
            assertThat(otherStart.path("gameCode").asText()).isEqualTo("OMOK");
            assertThat(otherStart.path("gameSessionId")).isNotEqualTo(firstStart.path("gameSessionId"));
            assertThat(first.request("GAME_START_CHECK", Map.of()).path("payload").path("tableId").asText())
                    .isEqualTo(one);
            first.close();
            // 종료 처리가 끝났다는 채널 알림을 확인한 뒤 보존 좌석을 읽는다.
            second.await(message -> message.path("type").asText().equals("CHANNEL_STATE")
                    && message.path("payload").path("currentUsers").asInt() == 1);
            assertThat(rows(http, "channel-1").get(0).path("occupiedSeats").asInt()).isEqualTo(2);
            assertThat(rows(http, "channel-2").get(0).path("occupiedSeats").asInt()).isEqualTo(2);
            assertThat(other.request("GAME_START_CHECK", Map.of()).path("payload")).isEqualTo(otherStart);
        }
    }

    private ScenarioClient connect() throws Exception {
        ScenarioClient client = new ScenarioClient(port, "ignored-in-dev");
        client.await(message -> message.path("type").asText().equals("CONNECTED"));
        client.await(message -> message.path("type").asText().equals("GAME_START_STATE"));
        return client;
    }

    private void seat(ScenarioClient client, String channel, String table) throws Exception {
        client.request("CHANNEL_JOIN", Map.of("channelId", channel));
        assertThat(client.request("TABLE_JOIN", Map.of("tableId", table)).path("type").asText())
                .isEqualTo("TABLE_STATE");
    }

    private JsonNode confirmed(ScenarioClient client) throws Exception {
        return client.await(message -> message.path("type").asText().equals("GAME_START_STATE")
                && message.path("payload").path("phase").asText().equals("CONFIRMED")).path("payload");
    }

    private String table(HttpClient http, String channel) throws Exception {
        return rows(http, channel).get(0).path("tableId").asText();
    }

    private JsonNode rows(HttpClient http, String channel) throws Exception {
        HttpResponse<String> response = query(http, "?channelId=" + channel);
        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode rows = mapper.readTree(response.body()).path("tables");
        assertThat(rows.size()).isEqualTo(2);
        return rows;
    }

    private HttpResponse<String> query(HttpClient http, String query) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/tables" + query))
                        .header("Authorization", "Bearer " + jwt.issue(RestSecurityTestSupport.USER_ID))
                .timeout(Duration.ofSeconds(5)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }
}
