package com.ssafy.ontop.demo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.OntopApplication;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.auth.service.RefreshCookieService;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Map;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 운영 JAR에 포함되지 않는 loopback·전용 DB 통합 검수 실행기. 인증·게임·정산은 실제 서비스를 사용한다. */
public final class RenewalIntegrationApplication {
    public static void main(String[] args) {
        String url = System.getenv("DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_renewal_live_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("새 공원 통합 검수는 전용 loopback DB가 필요합니다.");
        }
        String port = System.getenv().getOrDefault("RENEWAL_HTTP_PORT", "19186");
        if (!port.matches("[0-9]{4,5}") || Integer.parseInt(port) < 1024 || Integer.parseInt(port) > 65535) {
            throw new IllegalStateException("로컬 통합 검수 포트를 확인하세요.");
        }
        new SpringApplication(OntopApplication.class, Fixture.class).run(
                "--spring.profiles.active=local,db,park-renewal-local,renewal-integration-qa",
                "--server.address=127.0.0.1", "--server.port=" + port,
                "--ontop.websocket.authenticated=true", "--ontop.start-rehearsal.enabled=false",
                "--ontop.games.omok.enabled=true", "--ontop.games.onecard.enabled=true",
                "--ontop.games.farkle.enabled=true", "--ontop.games.bridge.enabled=true");
    }

    @TestConfiguration(proxyBeanMethods = false)
    @Profile("local & db & renewal-integration-qa")
    public static class Fixture {
        @Bean
        ApplicationRunner renewalSeed(JdbcTemplate jdbc, AuthExchangePersistenceService issuer) {
            return args -> {
                var sessions = new ArrayList<Map<String, Object>>();
                for (long id : new long[] {101, 202, 303, 404}) {
                    jdbc.update("""
                            INSERT IGNORE INTO users(id,login_provider,provider_user_id,nickname,character_gender,
                                created_at,updated_at)
                            VALUES (?,'NAVER',?,?,'MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))
                            """, id, "renewal-local-" + id, "공원검수" + id);
                    jdbc.update("INSERT IGNORE INTO wallets(user_id,balance,reserved_balance) VALUES (?,1000,0)", id);
                    var credentials = issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                            LoginOutcome.Status.EXISTING_MEMBER, id, null));
                    sessions.add(Map.of("userId", id, "accessToken", credentials.accessToken(),
                            "refreshToken", credentials.refreshToken()));
                }
                Path output = Path.of(System.getenv("RENEWAL_SESSION_FILE")).toAbsolutePath();
                Files.createDirectories(output.getParent());
                new ObjectMapper().writeValue(output.toFile(), sessions);
            };
        }
    }

    /** 테스트 실행기에만 존재한다. 실제 세션·refresh 쿠키를 발급하며 운영 인증 경로는 수정하지 않는다. */
    @RestController
    @Profile("local & db & renewal-integration-qa")
    public static class LoginFixture {
        private final AuthExchangePersistenceService issuer;
        private final RefreshCookieService cookies;
        private final AuthExchangeOriginPolicy origins;

        public LoginFixture(AuthExchangePersistenceService issuer, RefreshCookieService cookies,
                AuthExchangeOriginPolicy origins) {
            this.issuer = issuer;
            this.cookies = cookies;
            this.origins = origins;
        }

        @PostMapping("/dev/tables")
        ResponseEntity<?> login(@RequestParam long qaUserId, HttpServletRequest request) {
            origins.allowedOrigin(request);
            if (qaUserId != 101 && qaUserId != 202 && qaUserId != 303 && qaUserId != 404) {
                return ResponseEntity.badRequest().build();
            }
            var credentials = issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                    LoginOutcome.Status.EXISTING_MEMBER, qaUserId, null));
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .header("Set-Cookie", cookies.issue(credentials.refreshToken()))
                    .body(Map.of("userId", qaUserId, "accessToken", credentials.accessToken()));
        }
    }
}
