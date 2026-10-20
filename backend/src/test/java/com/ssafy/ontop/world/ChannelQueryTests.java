package com.ssafy.ontop.world;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.service.ChannelPresence;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local",
        "ontop.world.channels[0].channel-id=channel-2", "ontop.world.channels[0].name=검증 채널 2",
        "ontop.world.channels[0].capacity=3",
        "ontop.world.channels[1].channel-id=channel-1", "ontop.world.channels[1].name=검증 채널 1",
        "ontop.world.channels[1].capacity=2"
})
@AutoConfigureMockMvc
@Import(ChannelQueryTests.PresenceConfiguration.class)
class ChannelQueryTests {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper mapper;

    @Autowired
    private TestPresence presence;

    @Autowired
    private TestRestTemplate http;

    @AfterEach
    void reset() {
        presence.counts = Map.of();
        presence.fail = false;
        presence.reads.set(0);
    }

    @Test
    void 실제_HTTP의_미인증_요청은_401과_공통_오류를_반환한다() {
        var response = http.getForEntity("/api/v1/channels", JsonNode.class);

        assertThat(response.getStatusCode().value()).isEqualTo(401);
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getBody().properties()).extracting(Map.Entry::getKey)
                .containsExactlyInAnyOrder("code", "message", "details");
        assertThat(response.getBody().path("code").asText()).isEqualTo("UNAUTHENTICATED");
        assertThat(response.getBody().path("details").isNull()).isTrue();
        assertThat(presence.reads.get()).isZero();
    }

    @Test
    void 쿼리나_임의_헤더로_사용자를_위조할_수_없다() throws Exception {
        mvc.perform(get("/api/v1/channels").param("userId", "101")
                        .header("Authorization", "Bearer forged-test-value").header("X-User-Id", "101"))
                .andExpect(status().isUnauthorized());

        assertThat(presence.reads.get()).isZero();
    }

    @Test
    void 서버_인증_연결점은_명세의_필드와_설정된_정원을_반환한다() throws Exception {
        presence.counts = Map.of("channel-1", 2, "channel-2", 1);

        JsonNode response = authenticatedList();

        assertThat(response.properties()).extracting(Map.Entry::getKey).containsExactly("items");
        assertThat(response.path("items")).hasSize(2);
        JsonNode first = response.path("items").get(0);
        assertThat(first.properties()).extracting(Map.Entry::getKey)
                .containsExactlyInAnyOrder("channelId", "name", "currentUsers", "capacity", "joinable");
        assertThat(first.path("channelId").asText()).isEqualTo("channel-1");
        assertThat(first.path("name").asText()).isEqualTo("검증 채널 1");
        assertThat(first.path("currentUsers").asInt()).isEqualTo(2);
        assertThat(first.path("capacity").asInt()).isEqualTo(2);
        assertThat(first.path("joinable").asBoolean()).isFalse();
        assertThat(response.path("items").get(1).path("joinable").asBoolean()).isTrue();
        assertThat(response.toString()).doesNotContain("userId", "server-authenticated-test-user");
        assertThat(presence.reads.get()).isEqualTo(1);
    }

    @Test
    void 조회는_인원을_변경하지_않고_다음_요청은_새_스냅샷을_반영한다() throws Exception {
        presence.counts = Map.of("channel-1", 1);
        JsonNode first = authenticatedList();
        presence.counts = Map.of("channel-1", 2);
        JsonNode second = authenticatedList();

        assertThat(first.path("items").get(0).path("currentUsers").asInt()).isEqualTo(1);
        assertThat(second.path("items").get(0).path("currentUsers").asInt()).isEqualTo(2);
        assertThat(first.path("items").get(0).path("joinable").asBoolean()).isTrue();
        assertThat(second.path("items").get(0).path("joinable").asBoolean()).isFalse();
        assertThat(presence.counts).containsExactly(Map.entry("channel-1", 2));
        assertThat(presence.reads.get()).isEqualTo(2);
    }

    @Test
    void 인원_공급자_실패를_0명_성공으로_바꾸거나_내부_오류를_노출하지_않는다() throws Exception {
        presence.fail = true;

        var response = mvc.perform(get("/api/v1/channels").principal(() -> "server-authenticated-test-user"))
                .andExpect(status().isServiceUnavailable()).andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse().getContentAsString();

        JsonNode error = mapper.readTree(response);
        assertThat(error.path("code").asText()).isEqualTo("SERVICE_UNAVAILABLE");
        assertThat(error.path("details").isNull()).isTrue();
        assertThat(response).doesNotContain("test-internal-detail", "items", "stackTrace");
    }

    @Test
    void 조회_API로_채널을_생성할_수_없다() throws Exception {
        mvc.perform(post("/api/v1/channels").principal(() -> "server-authenticated-test-user"))
                .andExpect(status().isMethodNotAllowed());
    }

    private JsonNode authenticatedList() throws Exception {
        // 인증 담당이 서버 요청에 Principal을 넣는 경계만 검증한다. 실제 로그인 성공을 뜻하지 않는다.
        var response = mvc.perform(get("/api/v1/channels").principal(() -> "server-authenticated-test-user"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse().getContentAsString();
        return mapper.readTree(response);
    }

    @TestConfiguration
    static class PresenceConfiguration {

        @Bean
        TestPresence presence() {
            return new TestPresence();
        }
    }

    static class TestPresence implements ChannelPresence {

        private volatile Map<String, Integer> counts = Map.of();
        private volatile boolean fail;
        private final AtomicInteger reads = new AtomicInteger();

        @Override
        public Map<String, Integer> snapshot() {
            reads.incrementAndGet();
            if (fail) {
                throw new IllegalStateException("test-internal-detail");
            }
            return counts;
        }
    }
}
