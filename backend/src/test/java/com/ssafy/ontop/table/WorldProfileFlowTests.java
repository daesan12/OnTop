package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldEmoteProperties;
import com.ssafy.ontop.world.service.WorldProfileGateway;
import com.ssafy.ontop.world.service.WorldProfileGateway.Profile;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.world.channels[0].channel-id=a", "ontop.world.channels[0].name=A",
        "ontop.world.channels[0].capacity=3", "ontop.world.channels[1].channel-id=b",
        "ontop.world.channels[1].name=B", "ontop.world.channels[1].capacity=3"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, FrozenWorldFixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WorldProfileFlowTests {
    @LocalServerPort int port;
    @Autowired TableHub hub;
    @MockitoBean WorldProfileGateway gateway;
    @Autowired WorldEmoteProperties emotes;

    @Test
    void 느린조회중정기확인이반복돼도완료된결과를버리지않는다() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(gateway.profiles(anySet())).thenAnswer(invocation -> {
            entered.countDown();
            if (!release.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("조회 대기 초과");
            }
            return Map.of(101L, new Profile("느린조회결과", "FEMALE"));
        });
        try (var client = new ScenarioClient(port, "naver")) {
            client.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            for (int i = 0; i < 3; i++) {
                org.springframework.test.util.ReflectionTestUtils.invokeMethod(hub, "pollProfiles");
            }
            release.countDown();
            client.await(message -> hasProfile(message, "101", "느린조회결과", "FEMALE"));
            org.mockito.Mockito.verify(gateway, org.mockito.Mockito.times(1)).profiles(anySet());
        } finally {
            release.countDown();
        }
    }

    @Test
    void 개발프로필은감정표현5종을등록하고_기존이벤트로동기화한다() throws Exception {
        assertThat(emotes.codes()).containsExactly("WAVE", "CLAP", "APPLAUSE_REQUEST", "TSK", "FART");
        assertThat(emotes.cooldowns()).containsEntry("WAVE", java.time.Duration.ofSeconds(5))
                .containsEntry("CLAP", java.time.Duration.ofSeconds(5))
                .containsEntry("FART", java.time.Duration.ofMillis(1800));
        try (var first = new ScenarioClient(port, "naver");
                var second = new ScenarioClient(port, "ssafy")) {
            first.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            second.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            JsonNode sent = first.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "FART"));
            assertThat(sent.path("type").asText()).isEqualTo("WORLD_EMOTE_EVENT");
            assertThat(second.await(message -> message.path("type").asText().equals("WORLD_EMOTE_EVENT"))
                    .path("payload")).isEqualTo(sent.path("payload"));
            assertThat(first.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "TSK"))
                    .path("payload").path("code").asText()).isEqualTo("EMOTE_TOO_FREQUENT");
        }
    }

    @Test
    void 두회원공개프로필과변경을같은채널에전달하고_요청위조는막는다() throws Exception {
        AtomicBoolean changed = new AtomicBoolean();
        when(gateway.profiles(anySet())).thenAnswer(invocation -> Map.of(
                101L, new Profile(changed.get() ? "바뀐닉네임" : "첫회원", "MALE"),
                202L, new Profile("두번째회원", "FEMALE")));
        try (var first = new ScenarioClient(port, "naver");
                var second = new ScenarioClient(port, "ssafy")) {
            first.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            first.await(message -> hasProfile(message, "101", "첫회원", "MALE"));
            second.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            JsonNode state = first.await(message -> hasProfile(message, "202", "두번째회원", "FEMALE"));
            assertThat(state.path("payload").path("avatars").size()).isEqualTo(2);
            for (JsonNode avatar : state.path("payload").path("avatars")) {
                assertThat(avatar.properties().stream().map(Map.Entry::getKey)).containsExactlyInAnyOrder(
                        "userId", "position", "equipment", "nickname", "characterGender", "tableSeat");
                assertThat(avatar.path("tableSeat").isNull()).isTrue();
            }
            changed.set(true);
            hub.refreshProfiles();
            first.await(message -> hasProfile(message, "101", "바뀐닉네임", "MALE"));
            second.await(message -> hasProfile(message, "101", "바뀐닉네임", "MALE"));
            assertThat(first.request("CHANNEL_JOIN", Map.of("channelId", "a", "nickname", "위조"))
                    .path("payload").path("code").asText()).isEqualTo("INVALID_PAYLOAD");
        }
    }

    @Test
    void 조회는허브잠금을막지않고_이전채널의늦은응답을새입장에적용하지않는다() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        when(gateway.profiles(anySet())).thenAnswer(invocation -> {
            if (calls.incrementAndGet() == 1) {
                entered.countDown();
                if (!release.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("조회 대기 초과");
                }
                return Map.of(101L, new Profile("오래된이름", "MALE"));
            }
            return Map.of(101L, new Profile("최신이름", "FEMALE"));
        });
        try (var client = new ScenarioClient(port, "naver")) {
            client.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            client.request("CHANNEL_LEAVE", Map.of());
            client.request("CHANNEL_JOIN", Map.of("channelId", "b"));
            client.request("CHANNEL_LEAVE", Map.of());
            client.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            client.assertNoMessageDuring(message -> hasProfile(message, "101", "오래된이름", "MALE"), () -> {
                release.countDown();
                return client.await(message -> hasProfile(message, "101", "최신이름", "FEMALE"));
            });
        } finally {
            release.countDown();
        }
    }

    @Test
    void 끊긴이전연결의조회결과는같은계정새연결에적용하지않는다() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger reads = new AtomicInteger();
        when(gateway.profiles(anySet())).thenAnswer(invocation -> {
            java.util.Set<Long> ids = invocation.getArgument(0);
            if (ids.contains(101L) && reads.incrementAndGet() == 1) {
                entered.countDown();
                if (!release.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("조회 대기 초과");
                }
                return Map.of(101L, new Profile("이전연결", "MALE"));
            }
            return Map.of(101L, new Profile("새연결", "FEMALE"), 202L, new Profile("관찰자", "MALE"));
        });
        try (var observer = new ScenarioClient(port, "ssafy")) {
            observer.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            observer.await(message -> hasProfile(message, "202", "관찰자", "MALE"));
            try (var first = new ScenarioClient(port, "naver")) {
                first.request("CHANNEL_JOIN", Map.of("channelId", "a"));
                assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            }
            observer.await(message -> message.path("type").asText().equals("WORLD_STATE")
                    && message.path("payload").path("avatars").size() == 1);
            try (var restored = new ScenarioClient(port, "naver")) {
                restored.request("CHANNEL_JOIN", Map.of("channelId", "a"));
                restored.assertNoMessageDuring(message -> hasProfile(message, "101", "이전연결", "MALE"), () -> {
                    release.countDown();
                    return restored.await(message -> hasProfile(message, "101", "새연결", "FEMALE"));
                });
            }
        } finally {
            release.countDown();
        }
    }

    @Test
    void 조회장애는기존표시를유지하고_다른채널에프로필을보내지않는다() throws Exception {
        AtomicBoolean broken = new AtomicBoolean();
        CountDownLatch failed = new CountDownLatch(1);
        when(gateway.profiles(anySet())).thenAnswer(invocation -> {
            if (broken.get()) {
                failed.countDown();
                throw new IllegalStateException("private-db-detail");
            }
            return Map.of(101L, new Profile("내이름", "MALE"), 202L, new Profile("다른채널", "FEMALE"));
        });
        try (var first = new ScenarioClient(port, "naver");
                var second = new ScenarioClient(port, "ssafy")) {
            first.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            first.await(message -> hasProfile(message, "101", "내이름", "MALE"));
            second.request("CHANNEL_JOIN", Map.of("channelId", "b"));
            second.await(message -> hasProfile(message, "202", "다른채널", "FEMALE"));
            broken.set(true);
            hub.refreshProfiles();
            assertThat(failed.await(5, TimeUnit.SECONDS)).isTrue();
            first.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            first.await(message -> hasProfile(message, "101", "내이름", "MALE"));
            second.assertNoMessage(message -> hasProfile(message, "101", "내이름", "MALE")
                    || message.toString().contains("private-db-detail"));
        }
    }

    private static boolean hasProfile(JsonNode message, String userId, String nickname, String gender) {
        if (!message.path("type").asText().equals("WORLD_STATE")) {
            return false;
        }
        for (JsonNode avatar : message.path("payload").path("avatars")) {
            if (avatar.path("userId").asText().equals(userId)
                    && avatar.path("nickname").asText().equals(nickname)
                    && avatar.path("characterGender").asText().equals(gender)) {
                return true;
            }
        }
        return false;
    }
}
