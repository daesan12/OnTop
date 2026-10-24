package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.world.channels[0].channel-id=a", "ontop.world.channels[0].name=A",
        "ontop.world.channels[0].capacity=5", "ontop.world.channels[1].channel-id=b",
        "ontop.world.channels[1].name=B", "ontop.world.channels[1].capacity=5"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, FrozenWorldFixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WorldFacilityFlowTests {
    @LocalServerPort int port;
    @Autowired WorldChannelRegistry channels;
    @Autowired TableHub hub;

    @Test
    void 두회원이_같은좌석을_동시에_요청하면_한명만_이용한다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a")) {
            locate(first, -9, .8, 34.75);
            locate(second, -9, .8, 34.75);
            var left = CompletableFuture.supplyAsync(() -> useUnchecked(first, "bench-0", 0));
            var right = CompletableFuture.supplyAsync(() -> useUnchecked(second, "bench-0", 0));
            var results = java.util.List.of(left.get(), right.get());
            assertThat(results.stream().filter(r -> r.path("type").asText().equals("WORLD_FACILITY_STATE")))
                    .hasSize(1);
            assertThat(results.stream().filter(r -> r.path("payload").path("code").asText()
                    .equals("FACILITY_OCCUPIED"))).hasSize(1);
            assertThat(state(first).path("occupancies")).hasSize(1);
        }
    }

    @Test
    void 벤치_두좌석은_독립적이고_중복활동과_이동은_거절한다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a")) {
            locate(first, -9, .8, 34.75);
            locate(second, -9, .8, 34.75);
            JsonNode lease = lease(use(first, "bench-0", 0), first.userId);
            use(second, "bench-0", 1);
            assertThat(state(first).path("occupancies")).hasSize(2);
            assertCode(first.request("WORLD_FACILITY_USE", Map.of("facilityId", "bench-1", "seatIndex", 0)),
                    "FACILITY_BUSY");
            assertCode(first.request("WORLD_MOVE", Map.of("seq", 1, "dx", 1, "dz", 0, "run", false)),
                    "FACILITY_BUSY");
            assertCode(first.request("TABLE_JOIN", Map.of("tableId", hub.listTables("a").tables().getFirst().tableId())),
                    "FACILITY_BUSY");
            assertThat(channels.positionOf(first.userId).x()).isEqualTo(lease.path("pose").path("x").asDouble(),
                    org.assertj.core.data.Offset.offset(.001));
            assertThat(first.request("WORLD_FACILITY_RELEASE", Map.of("leaseId", lease.path("leaseId").asText()))
                    .path("type").asText()).isEqualTo("WORLD_FACILITY_STATE");
            assertThat(channels.positionOf(first.userId).z()).isEqualTo(36.25,
                    org.assertj.core.data.Offset.offset(.001));
            assertThat(first.request("WORLD_MOVE", Map.of("seq", 2, "dx", 1, "dz", 0, "run", false))
                    .path("type").asText()).isEqualTo("WORLD_STATE");
        }
    }

    @Test
    void 망원경_지상우회와_위조요청을_거절하고_방향을_공유한다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a")) {
            locate(first, 49.1, .8, 48.2);
            assertCode(use(first, "telescope-1", 0), "FACILITY_HEIGHT_MISMATCH");
            locate(first, 49.1, 18.92, 48.2);
            JsonNode result = use(first, "telescope-1", 0);
            String id = lease(result, first.userId).path("leaseId").asText();
            JsonNode notice = second.await(message -> message.path("type").asText().equals("WORLD_FACILITY_STATE"));
            assertThat(notice.path("requestId").isNull()).isTrue();
            assertCode(second.request("WORLD_FACILITY_RELEASE", Map.of("leaseId", id)), "FACILITY_LEASE_MISMATCH");
            assertCode(first.request("WORLD_FACILITY_AIM", Map.of("leaseId", id, "seq", 1, "yaw", 0, "pitch", 2)),
                    "FACILITY_AIM_INVALID");
            var aim = Map.of("leaseId", id, "seq", 1, "yaw", .5, "pitch", -.2);
            JsonNode aimed = first.request("WORLD_FACILITY_AIM", aim);
            assertThat(lease(aimed, first.userId).path("yaw").asDouble()).isEqualTo(.5);
            second.await(message -> message.path("type").asText().equals("WORLD_FACILITY_STATE")
                    && message.path("payload").path("occupancies").get(0).path("lastAimSeq").asInt() == 1);
            JsonNode repeated = second.assertNoMessageDuring(
                    message -> message.path("type").asText().equals("WORLD_FACILITY_STATE"),
                    () -> first.request("WORLD_FACILITY_AIM", aim));
            assertThat(lease(repeated, first.userId).path("lastAimSeq").asInt())
                    .isEqualTo(1);
            assertCode(first.request("WORLD_FACILITY_USE", Map.of("facilityId", "bench-0", "seatIndex", 0,
                    "userId", second.userId)), "INVALID_PAYLOAD");
        }
    }

    @Test
    void 단절은_점유를_해제하고_복귀하면_현재상태를_다시_조회한다() throws Exception {
        String oldLease;
        try (var second = client("ssafy", "a")) {
            try (var first = client("naver", "a")) {
                locate(first, -65, .855, 33);
                oldLease = lease(use(first, "walker-1", 0), first.userId).path("leaseId").asText();
            }
            second.await(message -> message.path("type").asText().equals("WORLD_FACILITY_STATE")
                    && message.path("payload").path("occupancies").isEmpty());
            locate(second, -65, .855, 33);
            JsonNode used = use(second, "walker-1", 0);
            assertThat(lease(used, second.userId).path("leaseId").asText()).isNotEqualTo(oldLease);
            try (var returned = client("naver", "a")) {
                assertThat(state(returned).path("occupancies")).hasSize(1);
                assertCode(returned.request("WORLD_FACILITY_RELEASE", Map.of("leaseId", oldLease)),
                        "FACILITY_LEASE_MISMATCH");
            }
        }
    }

    @Test
    void 채널별점유를_분리하고_퇴장후_이전이용은_재사용하지_못한다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "b")) {
            locate(first, -9, .8, 34.75);
            locate(second, -9, .8, 34.75);
            String old = lease(use(first, "bench-0", 0), first.userId).path("leaseId").asText();
            assertThat(state(second).path("occupancies")).isEmpty();
            use(second, "bench-0", 0);
            first.request("CHANNEL_LEAVE", Map.of());
            first.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            assertThat(state(first).path("occupancies")).isEmpty();
            locate(first, -9, .8, 34.75);
            use(first, "bench-0", 0);
            assertCode(first.request("WORLD_FACILITY_RELEASE", Map.of("leaseId", old)), "FACILITY_LEASE_MISMATCH");
        }
    }

    @Test
    void 목록은_현재맵과_일치하고_테이블과_거리_권한을_검사한다() throws Exception {
        try (var first = client("naver", "a")) {
            JsonNode catalog = first.request("WORLD_FACILITY_CATALOG", Map.of()).path("payload");
            assertThat(catalog.path("total").asInt()).isEqualTo(94);
            assertThat(catalog.path("facilities")).hasSize(10);
            assertThat(catalog.path("nextOffset").asInt()).isEqualTo(10);
            assertCode(use(first, "bench-0", 0), "FACILITY_OUT_OF_RANGE");
            assertCode(use(first, "unknown", 0), "FACILITY_NOT_FOUND");
            first.request("TABLE_JOIN", Map.of("tableId", hub.listTables("a").tables().getFirst().tableId()));
            assertCode(use(first, "bench-0", 0), "TABLE_BUSY");
        }
    }

    @Test
    void 시설과_테이블을_실제_이용중이면_소리함_접수를_차단한다() throws Exception {
        try (var first = client("naver", "a")) {
            locate(first, -9, .8, 34.75);
            String id = lease(use(first, "bench-0", 0), first.userId).path("leaseId").asText();
            long userId = Long.parseLong(first.userId);
            assertThatThrownBy(() -> hub.requireFeedbackAccess(userId, "a", -9, .8, 34.75))
                    .isInstanceOf(com.ssafy.ontop.feedback.service.FeedbackException.class)
                    .hasMessageContaining("시설");
            assertThatThrownBy(() -> hub.requireNotesAccess(userId, "a", -9, .8, 34.75))
                    .isInstanceOf(com.ssafy.ontop.notes.service.NoteException.class)
                    .hasMessageContaining("시설");
            first.request("WORLD_FACILITY_RELEASE", Map.of("leaseId", id));
            first.request("TABLE_JOIN", Map.of("tableId", hub.listTables("a").tables().getFirst().tableId()));
            assertThatThrownBy(() -> hub.requireFeedbackAccess(userId, "a", -9, .8, 34.75))
                    .isInstanceOf(com.ssafy.ontop.feedback.service.FeedbackException.class)
                    .hasMessageContaining("테이블");
            assertThatThrownBy(() -> hub.requireNotesAccess(userId, "a", -9, .8, 34.75))
                    .isInstanceOf(com.ssafy.ontop.notes.service.NoteException.class)
                    .hasMessageContaining("테이블");
        }
    }

    private ScenarioClient client(String login, String channel) throws Exception {
        var client = new ScenarioClient(port, login);
        client.request("CHANNEL_JOIN", Map.of("channelId", channel));
        return client;
    }

    private void locate(ScenarioClient client, double x, double y, double z) {
        long sequence = channels.positionOf(client.userId).sequence() + 1;
        channels.move(client.userId, new WorldChannelRegistry.Position(sequence, x, y, z, 0));
    }

    private JsonNode use(ScenarioClient client, String facility, int seat) throws Exception {
        return client.request("WORLD_FACILITY_USE", Map.of("facilityId", facility, "seatIndex", seat));
    }

    private JsonNode useUnchecked(ScenarioClient client, String facility, int seat) {
        try {
            return use(client, facility, seat);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private JsonNode state(ScenarioClient client) throws Exception {
        return client.request("WORLD_FACILITY_CHECK", Map.of()).path("payload");
    }

    private static JsonNode lease(JsonNode response, String userId) {
        assertThat(response.path("type").asText()).isEqualTo("WORLD_FACILITY_STATE");
        for (JsonNode lease : response.path("payload").path("occupancies")) {
            if (lease.path("userId").asText().equals(userId)) {
                assertThat(lease.has("returnPose")).isFalse();
                return lease;
            }
        }
        throw new AssertionError("본인 이용 상태 없음");
    }

    private static void assertCode(JsonNode response, String code) {
        assertThat(response.path("type").asText()).isEqualTo("ERROR");
        assertThat(response.path("payload").path("code").asText()).isEqualTo(code);
    }
}
