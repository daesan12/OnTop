package com.ssafy.ontop.game.speedmole;

import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import java.net.URI;
import java.net.http.*;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"spring.profiles.active=local",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=", "ontop.auth.allowed-origins=http://localhost:5173"})
@Import(com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture.class)
class SpeedMoleHttpTests {
    @LocalServerPort int port;
    @Autowired AccessJwtService jwt;
    @MockitoBean WebSocketAccountLookup accounts;
    @MockitoBean SpeedMoleService service;
    private final HttpClient http=HttpClient.newHttpClient();
    @BeforeEach void auth() {
        when(accounts.findActive(101,TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(101,VerifiedWebSocketUser.Provider.NAVER,TestLoginSessions.ID)));
    }
    private HttpRequest.Builder request(String path,boolean auth) {
        var r=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/v1/minigames/speed-mole"+path));
        if(auth)r.header("Authorization","Bearer "+jwt.issue(101,TestLoginSessions.ID));
        return r;
    }
    @Test void unauthenticated_requests_do_not_reach_storage() throws Exception {
        var r=http.send(request("/rankings",false).GET().build(),HttpResponse.BodyHandlers.ofString());
        assertThat(r.statusCode()).isEqualTo(401);verifyNoInteractions(service);
    }
    @Test void authenticated_rankings_return_the_callers_best_without_cache() throws Exception {
        when(service.rankings(101,20,0)).thenReturn(new SpeedMoleDtos.Rankings(1,"ALL_TIME",Instant.now(),0,0,20,List.of(),null,false));
        var r=http.send(request("/rankings",true).GET().build(),HttpResponse.BodyHandlers.ofString());
        assertThat(r.statusCode()).isEqualTo(200);assertThat(r.body()).contains("ALL_TIME");assertThat(r.headers().firstValue("cache-control")).contains("no-store");
    }
    @Test void start_requires_one_idempotency_key() throws Exception {
        var r=http.send(request("/rounds",true).POST(HttpRequest.BodyPublishers.noBody()).build(),HttpResponse.BodyHandlers.ofString());
        assertThat(r.statusCode()).isEqualTo(400);verifyNoInteractions(service);
    }
    @Test
    void 완료_요청은_표적_ID가_있는_입력과_없는_입력을_함께_받는다() throws Exception {
        var taps = List.of(new SpeedMoleRules.Tap(1, 0), new SpeedMoleRules.Tap(3, 100, "target-id"));
        when(service.complete(101, 7, taps)).thenReturn(new SpeedMoleDtos.Result(
                "7", 1, 2, 2, 0, Instant.parse("2030-01-01T00:01:03Z"), 0, 0, 0, 1000));
        var request = request("/rounds/7/complete", true).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("""
                        {"taps":[{"hole":1,"at":0},{"hole":3,"at":100,"targetId":"target-id"}]}
                        """)).build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(200);
        verify(service).complete(101, 7, taps);
    }
    @Test void only_approved_origins_can_preflight_the_idempotent_start() throws Exception {
        for(String origin:List.of("http://localhost:5173","https://untrusted.invalid")) {
            var r=http.send(request("/rounds",false).header("Origin",origin).header("Access-Control-Request-Method","POST")
                    .header("Access-Control-Request-Headers","Authorization,Idempotency-Key").method("OPTIONS",HttpRequest.BodyPublishers.noBody()).build(),HttpResponse.BodyHandlers.ofString());
            assertThat(r.statusCode()).isEqualTo(origin.contains("localhost")?204:403);
        }
        verifyNoInteractions(service);
    }
}
