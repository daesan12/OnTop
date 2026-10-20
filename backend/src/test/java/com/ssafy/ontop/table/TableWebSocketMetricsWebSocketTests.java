package com.ssafy.ontop.table;

import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.service.TableHub.MetricsSnapshot;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpStatus;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.profiles.active=local", "spring.application.name=ontop-websocket-metrics-test"})
@DirtiesContext
class TableWebSocketMetricsWebSocketTests {

    @LocalServerPort
    private int port;
    @Autowired
    private TableHub hub;
    @Autowired
    private MeterRegistry registry;
    @Autowired
    private TestRestTemplate http;

    @Test
    void 실제소켓_입퇴장과_메시지가_자동등록지표에_반영되고_관리HTTP는_비노출이다() throws Exception {
        assertCounts(0, 0, 0, 0);
        try (ScenarioClient remaining = new ScenarioClient(port, "metrics-second")) {
            remaining.await(message -> message.path("type").asText().equals("CONNECTED"));
            try (ScenarioClient first = new ScenarioClient(port, "metrics-first")) {
                first.await(message -> message.path("type").asText().equals("CONNECTED"));
                assertThat(first.request("TABLE_JOIN", Map.of("tableId", "table-1"))
                        .path("type").asText()).isEqualTo("TABLE_STATE");
                assertThat(first.request("UNKNOWN", Map.of()).path("type").asText()).isEqualTo("ERROR");
                assertCounts(2, 2, 0, 2);
            }
            assertCounts(1, 2, 1, 2);
            assertThat(remaining.request("TABLE_JOIN", Map.of("tableId", "table-1"))
                    .path("type").asText()).isEqualTo("TABLE_STATE");
        }
        assertCounts(0, 2, 2, 3);
        assertThat(http.getForEntity("/actuator/metrics", String.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(http.getForEntity("/actuator/health", String.class).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private void assertCounts(long active, long accepted, long closed, long received) throws Exception {
        MetricsSnapshot expected = new MetricsSnapshot(active, accepted, closed, received);
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (!hub.metricsSnapshot().equals(expected) && System.nanoTime() < deadline) {
            Thread.sleep(10);
        }
        assertThat(hub.metricsSnapshot()).isEqualTo(expected);
        assertThat(registry.get("ontop.websocket.connections.active").gauge().value()).isEqualTo(active);
        assertThat(registry.get("ontop.websocket.connections.accepted").functionCounter().count()).isEqualTo(accepted);
        assertThat(registry.get("ontop.websocket.connections.closed").functionCounter().count()).isEqualTo(closed);
        assertThat(registry.get("ontop.websocket.messages.received").functionCounter().count()).isEqualTo(received);
    }
}
