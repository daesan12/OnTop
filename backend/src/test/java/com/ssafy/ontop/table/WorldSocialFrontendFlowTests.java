package com.ssafy.ontop.table;

import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/** 실제 FE 통신/상태 모듈과 Spring HTTP/WS를 연결한다. 회원 조회·초기 위치만 테스트 대역이다. */
@EnabledIfEnvironmentVariable(named = "TEST_WORLD_SOCIAL_FRONTEND", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.world.channels[0].channel-id=a", "ontop.world.channels[0].name=A",
        "ontop.world.channels[0].capacity=4", "ontop.world.channels[1].channel-id=b",
        "ontop.world.channels[1].name=B", "ontop.world.channels[1].capacity=4"
})
@Import({MemberAuthenticationFixture.class, WorldSocialFrontendFlowTests.Placement.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class WorldSocialFrontendFlowTests {
    @LocalServerPort int port;
    @Autowired AccessJwtService jwt;
    @MockitoBean WebSocketAccountLookup accounts;
    @TempDir Path temporary;

    @Test
    void 실제프론트로_따라가기승인_해제_감정표현취소_착석제한_재접속을연결한다() throws Exception {
        assertThat(Path.of("../frontend/node_modules/vitest/vitest.mjs")).exists();
        String[] tokens = new String[3];
        long[] ids = {101, 202, 505};
        for (int index = 0; index < ids.length; index++) {
            long id = ids[index];
            when(accounts.findActive(id, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(
                    id, VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID)));
            tokens[index] = jwt.issue(id, TestLoginSessions.ID);
        }
        Path output = temporary.resolve("social-frontend.txt");
        Path diagnostics = temporary.resolve("social-diagnostics.json");
        var builder = new ProcessBuilder("node", "../frontend/node_modules/vitest/vitest.mjs", "run", "--config",
                "src/test/js/world-social-frontend/vitest.config.mts")
                .redirectErrorStream(true).redirectOutput(output.toFile());
        builder.environment().put("TEST_SOCIAL_BASE", "http://127.0.0.1:" + port);
        builder.environment().put("TEST_SOCIAL_DIAGNOSTICS", diagnostics.toString());
        for (int index = 0; index < ids.length; index++) {
            builder.environment().put("TEST_SOCIAL_TOKEN_" + ids[index], tokens[index]);
        }
        Process process = builder.start();
        try {
            assertThat(process.waitFor(60, TimeUnit.SECONDS)).as("FE 소켓 연동 제한 시간").isTrue();
            String report = Files.readString(output);
            for (String token : tokens) {
                report = report.replace(token, "[redacted]");
            }
            System.out.println(report);
            assertThat(process.exitValue()).as("FE 실제 소켓 검증: %s", report).isZero();
            assertThat(diagnostics).exists();
            System.out.println("[SOCIAL_FRONTEND_DIAGNOSTICS]\n" + Files.readString(diagnostics));
        } finally {
            if (process.isAlive()) {
                process.destroyForcibly();
                process.waitFor(5, TimeUnit.SECONDS);
            }
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Placement {
        @Bean @Primary
        WorldChannelRegistry socialWorld(WorldChannelProperties properties) {
            // 위치/시간을 고정한다. 실제 물리 이동·충돌 성능이나 브라우저 모션 검증으로 해석하지 않는다.
            return new WorldChannelRegistry(properties, Duration.ofNanos(1), new AtomicLong()::incrementAndGet) {
                @Override
                public synchronized Change join(String userId, String channelId) {
                    Change change = super.join(userId, channelId);
                    if (change.changed()) {
                        super.move(userId, new Position(0, -9, .8, 34.75, 0));
                    }
                    return change;
                }
            };
        }
    }
}
