package com.ssafy.ontop.history;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.history.dto.GameHistoryPageRequest;
import com.ssafy.ontop.history.dto.GameHistoryPageResponse;
import com.ssafy.ontop.history.dto.GameStatsResponse;
import com.ssafy.ontop.history.repository.GameHistoryRepository;
import com.ssafy.ontop.user.domain.LoginProvider;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "server.address=127.0.0.1", "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class GameHistoryHttpTests {
    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @Autowired private ObjectMapper mapper;
    @MockitoBean private ActiveMemberLookup members;
    @MockitoBean private GameHistoryRepository repository;

    @BeforeEach
    void activeMember() {
        when(members.findActive(42, TestLoginSessions.ID)).thenReturn(Optional.of(
                new AuthenticatedUser(42, LoginProvider.SSAFY, TestLoginSessions.ID)));
        when(repository.findHistory(eq(42L), any())).thenReturn(List.of(new GameHistoryPageResponse.Item(
                "9007199254740993", "OMOK", "FINISHED", "FORFEIT", "PENDING", Instant.EPOCH)));
        when(repository.findStats(42)).thenReturn(List.of(new GameStatsResponse.Item("OMOK", 1, 0, 0, 1, 0)));
    }

    @Test
    void 본인_식별자만_사용하고_필드와_CORS_캐시금지를_유지한다() throws Exception {
        var response = send("GET", "/games?size=1&gameCode=OMOK&userId=99", token());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        assertThat(response.headers().firstValue("Access-Control-Allow-Origin").orElse(""))
                .isEqualTo("https://dev.on-top.world");
        var body = mapper.readTree(response.body());
        assertThat(body.at("/items/0/gameSessionId").isTextual()).isTrue();
        assertThat(body.at("/items/0/gameSessionId").asText()).isEqualTo("9007199254740993");
        assertThat(body.at("/items/0/myResult").asText()).isEqualTo("FORFEIT");
        assertThat(body.at("/items/0/settlementStatus").asText()).isEqualTo("PENDING");
        assertThat(body.path("nextCursor").isNull()).isTrue();
        verify(repository).findHistory(42, new GameHistoryPageRequest(null, 1, "OMOK"));
        assertThat(mapper.readTree(send("GET", "/game-stats?userId=99", token()).body())
                .at("/items/0/forfeits").asInt()).isEqualTo(1);
        verify(repository).findStats(42);
    }

    @Test
    void 할리갈리_필터는_같은_요청_형식으로_저장소에_전달한다() throws Exception {
        assertThat(send("GET", "/games?size=20&gameCode=HALLI_GALLI", token()).statusCode()).isEqualTo(200);
        verify(repository).findHistory(42, new GameHistoryPageRequest(null, 20, "HALLI_GALLI"));
    }

    @Test
    void 알까기_필터도_회원_범위를_유지한_채_저장소에_전달한다() throws Exception {
        assertThat(send("GET", "/games?size=20&gameCode=ALKKAGI", token()).statusCode()).isEqualTo(200);
        verify(repository).findHistory(42, new GameHistoryPageRequest(null, 20, "ALKKAGI"));
    }

    @Test
    void 미인증과_위조와_비활성_회원은_조회하지_못한다() throws Exception {
        for (String path : List.of("/games", "/game-stats")) {
            assertThat(send("GET", path, null).statusCode()).isEqualTo(401);
            assertThat(send("GET", path, "forged").statusCode()).isEqualTo(401);
        }
        when(members.findActive(42, TestLoginSessions.ID)).thenReturn(Optional.empty());
        assertThat(send("GET", "/games", token()).statusCode()).isEqualTo(401);
        assertThat(send("GET", "/game-stats", token()).statusCode()).isEqualTo(401);
        verifyNoInteractions(repository);
    }

    @Test
    void 잘못된_조건과_저장소_장애를_구분한다() throws Exception {
        assertError("/games?cursor=-1", 400, "INVALID_CURSOR");
        assertError("/games?size=101", 400, "INVALID_SIZE");
        assertError("/games?gameCode=FARKLE", 400, "UNSUPPORTED_GAME");
        verifyNoInteractions(repository);
        when(repository.findStats(42)).thenThrow(new DataAccessResourceFailureException("sensitive-sql"));
        var response = send("GET", "/game-stats", token());
        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(mapper.readTree(response.body()).path("code").asText()).isEqualTo("HISTORY_UNAVAILABLE");
        assertThat(response.body()).doesNotContain("sensitive-sql", "SELECT", "Exception");
    }

    @Test
    void 프리플라이트는_인증없이_처리한다() throws Exception {
        assertThat(send("OPTIONS", "/games", null).statusCode()).isBetween(200, 204);
        assertThat(send("OPTIONS", "/game-stats", null).statusCode()).isBetween(200, 204);
        verifyNoInteractions(repository);
    }

    private void assertError(String path, int status, String code) throws Exception {
        var response = send("GET", path, token());
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(mapper.readTree(response.body()).path("code").asText()).isEqualTo(code);
    }

    private String token() {
        return jwt.issue(42, TestLoginSessions.ID);
    }

    private HttpResponse<String> send(String method, String path, String token) throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/users/me" + path))
                    .header("Origin", "https://dev.on-top.world");
            if (token != null) {
                request.header("Authorization", "Bearer " + token);
            }
            if (method.equals("OPTIONS")) {
                request.header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "authorization");
            }
            return client.send(request.method(method, HttpRequest.BodyPublishers.noBody()).build(),
                    HttpResponse.BodyHandlers.ofString());
        }
    }
}
