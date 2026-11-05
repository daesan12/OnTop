package com.ssafy.ontop.behavior.repository;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.domain.PositionSample;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.offset;

@Tag("mysql")
@ActiveProfiles("db")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class JdbcBehaviorStoreMySqlTests {

    private static final Instant AT = Instant.parse("2026-10-23T01:02:03.456Z");

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private PlatformTransactionManager transactions;

    @Autowired
    private ObjectMapper mapper;

    private JdbcBehaviorStore store;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_BEHAVIOR_DB_URL");
        if (url == null
                || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_behavior_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_behavior_test_ 전용 검증 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_BEHAVIOR_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_BEHAVIOR_DB_PASSWORD"));
    }

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM behavior_events");
        jdbc.update("DELETE FROM world_position_samples");
        store = new JdbcBehaviorStore(jdbc, transactions, mapper);
    }

    @Test
    void 이벤트를_UTC_시각과_JSON_props로_저장한다() {
        BehaviorEvent event = BehaviorEvent.builder(BehaviorEventType.GAME_ENDED, AT)
                .userId(101L)
                .tableId("table-1")
                .gameId("game-1")
                .prop("gameCode", "OMOK")
                .prop("won", true)
                .build();

        store.save(List.of(event), List.of());

        Map<String, Object> row = jdbc.queryForMap("""
                SELECT HEX(event_id) AS event_id, event_type, source, schema_version, user_id, table_id, game_id,
                    DATE_FORMAT(occurred_at, '%Y-%m-%d %H:%i:%s.%f') AS occurred_at,
                    JSON_UNQUOTE(JSON_EXTRACT(props, '$.gameCode')) AS game_code,
                    JSON_EXTRACT(props, '$.won') AS won
                FROM behavior_events
                """);
        assertThat(row.get("event_id")).isEqualTo(event.eventId().toString().replace("-", "").toUpperCase());
        assertThat(row.get("event_type")).isEqualTo("GAME_ENDED");
        assertThat(row.get("source")).isEqualTo("SERVER");
        assertThat(((Number) row.get("schema_version")).intValue()).isEqualTo(1);
        assertThat(((Number) row.get("user_id")).longValue()).isEqualTo(101L);
        assertThat(row.get("occurred_at")).isEqualTo("2026-10-23 01:02:03.456000");
        assertThat(row.get("game_code")).isEqualTo("OMOK");
        assertThat(row.get("won").toString()).isEqualTo("true");
    }

    @Test
    void 클라이언트가_보고한_이벤트는_CLIENT_출처로_저장한다() {
        store.save(List.of(BehaviorEvent.builder(BehaviorEventType.PERF_REPORT, AT).userId(101L)
                .source(com.ssafy.ontop.behavior.domain.BehaviorSource.CLIENT).prop("fps", 58.3).build()), List.of());

        Map<String, Object> row = jdbc.queryForMap("SELECT event_type, source FROM behavior_events");
        assertThat(row.get("event_type")).isEqualTo("PERF_REPORT");
        assertThat(row.get("source")).isEqualTo("CLIENT");
    }

    @Test
    void props와_사용자가_없는_이벤트는_NULL로_저장한다() {
        store.save(List.of(BehaviorEvent.builder(BehaviorEventType.WS_CONNECTED, AT).build()), List.of());

        Map<String, Object> row = jdbc.queryForMap("SELECT user_id, props FROM behavior_events");
        assertThat(row.get("user_id")).isNull();
        assertThat(row.get("props")).isNull();
    }

    @Test
    void 위치_좌표를_저장한다() {
        PositionSample sample = new PositionSample(101L, "channel-1", AT, -2.025, 0.84, 34, true, false, true,
                "544bc6fa");

        store.save(List.of(), List.of(sample));

        Map<String, Object> row = jdbc.queryForMap("""
                SELECT user_id, channel_id, x, y, z, moving, running, swimming, map_version,
                    DATE_FORMAT(sampled_at, '%Y-%m-%d %H:%i:%s.%f') AS sampled_at
                FROM world_position_samples
                """);
        assertThat(((Number) row.get("x")).doubleValue()).isCloseTo(-2.025, offset(1e-4));
        assertThat(((Number) row.get("z")).doubleValue()).isEqualTo(34.0);
        assertThat(row.get("moving")).isEqualTo(true);
        assertThat(row.get("running")).isEqualTo(false);
        assertThat(row.get("swimming")).isEqualTo(true);
        assertThat(row.get("map_version")).isEqualTo("544bc6fa");
        assertThat(row.get("sampled_at")).isEqualTo("2026-10-23 01:02:03.456000");
    }

    @Test
    void 묶음_중_하나라도_실패하면_아무것도_남기지_않는다() {
        BehaviorEvent duplicated = BehaviorEvent.builder(BehaviorEventType.CHAT_SENT, AT).userId(101L).build();
        PositionSample sample = new PositionSample(101L, "channel-1", AT, 1, 0.84, 2, true, false, false, "map");

        assertThatThrownBy(() -> store.save(List.of(duplicated, duplicated), List.of(sample)))
                .isInstanceOf(DataAccessException.class);

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM behavior_events", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM world_position_samples", Integer.class)).isZero();
    }
}
