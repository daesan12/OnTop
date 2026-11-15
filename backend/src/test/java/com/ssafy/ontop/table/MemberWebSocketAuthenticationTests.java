package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.AuthenticationRevocations;
import com.ssafy.ontop.auth.websocket.MemberWebSocketConnections;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.websocket.TableWebSocketHandler;
import com.ssafy.ontop.user.domain.LoginProvider;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationContext;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.when;

/** 비local 기본 설정 + 실제 JWT/HTTP/소켓/회원 어댑터. DB 경계만 대체한다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.profiles.active=dev", "server.address=127.0.0.1"})
class MemberWebSocketAuthenticationTests {
    @LocalServerPort
    private int port;
    @Autowired
    private AccessJwtService jwt;
    @Autowired
    private ObjectMapper mapper;
    @Autowired
    private ApplicationContext context;
    @Autowired
    private TableHub hub;
    @Autowired
    private MemberWebSocketConnections connections;
    @MockitoBean
    private ActiveMemberLookup members;
    @MockitoBean(name = "oauthClock")
    private Clock clock;
    private volatile Instant now;

    @DynamicPropertySource
    static void key(DynamicPropertyRegistry registry) {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        String key = Base64.getEncoder().encodeToString(bytes);
        registry.add("ontop.auth.jwt-secret-base64", () -> key);
    }

    @BeforeEach
    void activeMembers() {
        now = Instant.parse("2026-10-22T00:00:00Z");
        when(clock.instant()).thenAnswer(call -> now);
        when(members.findActive(anyLong(), anyString())).thenAnswer(call -> Optional.of(new AuthenticatedUser(
                call.getArgument(0), LoginProvider.SSAFY, TestLoginSessions.ID)));
    }

    @Test
    void 비local_기본인증과_실제_접속권으로_내부ID를_전달하고_중복은_새연결만_닫는다() throws Exception {
        assertThat(context.getEnvironment().getProperty("ontop.websocket.authenticated", Boolean.class)).isTrue();
        assertThat(context.getBean(TableWebSocketHandler.class)).isNotNull();
        String ticket = issueTicket(101);
        try (ScenarioClient first = new ScenarioClient(port, "101", ticket)) {
            assertThat(first.await(message -> message.path("type").asText().equals("CONNECTED"))
                    .path("payload").path("userId").asText()).isEqualTo("101");
            String table = enterPark(first, 0);
            first.request("TABLE_JOIN", Map.of("tableId", table));
            try (ScenarioClient duplicate = new ScenarioClient(port, "101", issueTicket(101))) {
                assertThat(duplicate.awaitClose()).isEqualTo(1008);
            }
            assertThat(first.request("TABLE_JOIN", Map.of("tableId", table))
                    .path("payload").path("tableId").asText()).isEqualTo(table);
            assertThat(first.request("GAME_SELECT", Map.of("betAmountPerPlayer", 1, "gameCode", "OMOK", "userId", "202"))
                    .path("payload").path("code").asText()).isEqualTo("INVALID_PAYLOAD");
        }
    }

    @Test
    void 새_로그인은_기존_연결_정리_중_재시도하고_정리_후_채널에_입장한다() throws Exception {
        String previousSession = TestLoginSessions.ID;
        String newSession = UUID.randomUUID().toString();
        when(members.findActive(101, newSession))
                .thenReturn(Optional.of(new AuthenticatedUser(101, LoginProvider.SSAFY, newSession)));
        String newAccess = jwt.issue(101, newSession);
        try (ScenarioClient previous = new ScenarioClient(port, "101", issueTicket(101))) {
            previous.await(message -> message.path("type").asText().equals("CONNECTED"));
            enterPark(previous, 0);
            when(members.findActive(101, previousSession)).thenReturn(Optional.empty());
            try (ScenarioClient pending = new ScenarioClient(port, "101", issueTicket(newAccess))) {
                assertThat(pending.awaitClose()).isEqualTo(1013);
            }

            connections.revoked(new AuthenticationRevocations.Revoked(101, previousSession));

            assertThat(previous.awaitClose()).isEqualTo(4401);
            assertThat(issue(jwt.issue(101, previousSession)).statusCode()).isEqualTo(401);
            // Close 프레임 직후에는 서버 정리가 아직 진행 중일 수 있다.
            org.awaitility.Awaitility.await().until(() -> hub.metricsSnapshot().activeConnections() == 0);
            try (ScenarioClient current = new ScenarioClient(port, "101", issueTicket(newAccess))) {
                assertThat(current.await(message -> message.path("type").asText().equals("CONNECTED"))
                        .path("payload").path("userId").asText()).isEqualTo("101");
                enterPark(current, 0);
            }
        }
    }

    @Test
    void Access_누락과_위조와_온보딩과_만료는_발급하지_않는다() throws Exception {
        assertThat(issue(null).statusCode()).isEqualTo(401);
        for (String raw : new String[] {"forged", "ob_not-an-access-token", jwt.issue(101, TestLoginSessions.ID) + "x"}) {
            assertThat(issue(raw).statusCode()).isEqualTo(401);
        }
        String expired = jwt.issue(101, TestLoginSessions.ID);
        now = now.plusSeconds(1800);
        assertThat(issue(expired).statusCode()).isEqualTo(401);
    }

    @Test
    void 없는회원과_탈퇴회원은_발급과_이미_발급된_접속을_모두_차단한다() throws Exception {
        String ticket = issueTicket(101);
        when(members.findActive(101, TestLoginSessions.ID)).thenReturn(Optional.empty());
        assertThat(issue(jwt.issue(101, TestLoginSessions.ID)).statusCode()).isEqualTo(401);
        assertUpgradeRejected(ticket, 401);
        assertUpgradeRejected(ticket, 401);
    }

    @Test
    void DB_장애는_발급과_연결에서_503이며_실패_접속권은_복원하지_않는다() throws Exception {
        String ticket = issueTicket(101);
        when(members.findActive(101, TestLoginSessions.ID)).thenThrow(new DataAccessResourceFailureException("private-db-fixture"));
        HttpResponse<String> response = issue(jwt.issue(101, TestLoginSessions.ID));
        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(response.body()).doesNotContain("private-db-fixture", "Exception");
        assertUpgradeRejected(ticket, 503);
        doReturn(Optional.of(new AuthenticatedUser(101, LoginProvider.SSAFY, TestLoginSessions.ID))).when(members).findActive(101, TestLoginSessions.ID);
        assertUpgradeRejected(ticket, 401);
    }

    @Test
    void 조작과_30초만료와_재사용을_거절하고_새연결에는_접속권이_필요하다() throws Exception {
        String ticket = issueTicket(101);
        assertUpgradeRejected("wst_" + "x".repeat(43), 401);
        now = now.plusSeconds(30);
        assertUpgradeRejected(ticket, 401);
        assertThatThrownBy(() -> new ScenarioClient(port, "101")).isInstanceOf(AssertionError.class)
                .hasMessageContaining("401");
        String valid = issueTicket(101);
        try (ScenarioClient socket = new ScenarioClient(port, "101", valid)) {
            socket.await(message -> message.path("type").asText().equals("CONNECTED"));
            assertUpgradeRejected(valid, 401);
        }
    }

    @Test
    void 연결후_Access만료는_소켓을_끊지_않고_재발급에는_새Access가_필요하다() throws Exception {
        String access = jwt.issue(202, TestLoginSessions.ID);
        String ticket = mapper.readTree(issue(access).body()).path("ticket").asText();
        try (ScenarioClient socket = new ScenarioClient(port, "202", ticket)) {
            socket.await(message -> message.path("type").asText().equals("CONNECTED"));
            String table = enterPark(socket, 1);
            now = now.plusSeconds(1800);
            assertThat(socket.request("TABLE_JOIN", Map.of("tableId", table))
                    .path("payload").path("tableId").asText()).isEqualTo(table);
            assertThat(issue(access).statusCode()).isEqualTo(401);
        }
    }

    @Test
    void 동시_Upgrade는_접속권을_정확히_한번만_소비한다() throws Exception {
        String ticket = issueTicket(303);
        try (var workers = Executors.newFixedThreadPool(2)) {
            Callable<Boolean> connect = () -> {
                try (ScenarioClient socket = new ScenarioClient(port, "303", ticket)) {
                    socket.await(message -> message.path("type").asText().equals("CONNECTED"));
                    return true;
                } catch (AssertionError rejected) {
                    return false;
                }
            };
            var results = workers.invokeAll(java.util.List.of(connect, connect));
            assertThat((results.get(0).get() ? 1 : 0) + (results.get(1).get() ? 1 : 0)).isEqualTo(1);
        }
    }

    private String enterPark(ScenarioClient socket, int tableIndex) throws Exception {
        assertThat(socket.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"))
                .path("type").asText()).isEqualTo("CHANNEL_STATE");
        return hub.listTables("channel-1").tables().get(tableIndex).tableId();
    }

    private String issueTicket(long id) throws Exception {
        return issueTicket(jwt.issue(id, TestLoginSessions.ID));
    }

    private String issueTicket(String access) throws Exception {
        HttpResponse<String> response = issue(access);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.headers().firstValue("Set-Cookie")).isEmpty();
        JsonNode body = mapper.readTree(response.body());
        assertThat(body.path("expiresIn").asLong()).isEqualTo(30);
        return body.path("ticket").asText();
    }

    private HttpResponse<String> issue(String access) throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/api/v1/auth/websocket-ticket")).POST(HttpRequest.BodyPublishers.noBody());
            if (access != null) {
                request.header("Authorization", "Bearer " + access);
            }
            return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
        }
    }

    private void assertUpgradeRejected(String ticket, int status) {
        assertThatThrownBy(() -> new ScenarioClient(port, "101", ticket)).isInstanceOf(AssertionError.class)
                .hasMessageContaining(Integer.toString(status));
    }
}
