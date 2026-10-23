package com.ssafy.ontop.behavior.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.PositionSample;
import com.ssafy.ontop.behavior.service.BehaviorStore;
import java.nio.ByteBuffer;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 묶음 하나를 한 트랜잭션의 batch INSERT로 저장한다. */
public class JdbcBehaviorStore implements BehaviorStore {

    private static final String INSERT_EVENT = """
            INSERT INTO behavior_events (event_id, event_type, schema_version, source, occurred_at, user_id,
                login_session_id, connection_id, channel_id, table_id, game_id, props)
            VALUES (?, ?, 1, 'SERVER', ?, ?, ?, ?, ?, ?, ?, ?)
            """;
    private static final String INSERT_POSITION = """
            INSERT INTO world_position_samples (user_id, channel_id, sampled_at, x, y, z, moving, running, swimming,
                map_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """;

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final ObjectMapper mapper;

    public JdbcBehaviorStore(JdbcTemplate jdbc, PlatformTransactionManager transactions, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.transactions = new TransactionTemplate(transactions);
        this.mapper = mapper;
    }

    @Override
    public void save(List<BehaviorEvent> events, List<PositionSample> positions) {
        transactions.executeWithoutResult(status -> {
            if (!events.isEmpty()) {
                jdbc.batchUpdate(INSERT_EVENT, events, events.size(), this::bindEvent);
            }
            if (!positions.isEmpty()) {
                jdbc.batchUpdate(INSERT_POSITION, positions, positions.size(), this::bindPosition);
            }
        });
    }

    private void bindEvent(PreparedStatement statement, BehaviorEvent event) throws SQLException {
        statement.setBytes(1, toBytes(event.eventId()));
        statement.setString(2, event.type().name());
        setUtc(statement, 3, event.occurredAt());
        setLong(statement, 4, event.userId());
        statement.setString(5, event.loginSessionId());
        statement.setString(6, event.connectionId());
        statement.setString(7, event.channelId());
        statement.setString(8, event.tableId());
        statement.setString(9, event.gameId());
        statement.setString(10, event.props().isEmpty() ? null : toJson(event));
    }

    private void bindPosition(PreparedStatement statement, PositionSample sample) throws SQLException {
        setLong(statement, 1, sample.userId());
        statement.setString(2, sample.channelId());
        setUtc(statement, 3, sample.sampledAt());
        statement.setFloat(4, (float) sample.x());
        statement.setFloat(5, (float) sample.y());
        statement.setFloat(6, (float) sample.z());
        statement.setBoolean(7, sample.moving());
        statement.setBoolean(8, sample.running());
        statement.setBoolean(9, sample.swimming());
        statement.setString(10, sample.mapVersion());
    }

    private String toJson(BehaviorEvent event) {
        try {
            return mapper.writeValueAsString(event.props());
        } catch (JsonProcessingException exception) {
            // BehaviorEvent가 값 종류를 제한하므로 정상 흐름에서는 생기지 않는다.
            throw new IllegalStateException("행동 로그 props를 JSON으로 바꾸지 못했습니다: type=" + event.type(), exception);
        }
    }

    // JVM 기본 시간대와 무관하게 UTC로 저장한다. 연결은 SET time_zone = '+00:00'을 사용한다.
    private static void setUtc(PreparedStatement statement, int index, Instant value) throws SQLException {
        statement.setTimestamp(index, Timestamp.from(value), Calendar.getInstance(TimeZone.getTimeZone("UTC")));
    }

    private static void setLong(PreparedStatement statement, int index, Long value) throws SQLException {
        if (value == null) {
            statement.setNull(index, Types.BIGINT);
            return;
        }
        statement.setLong(index, value);
    }

    private static byte[] toBytes(UUID id) {
        return ByteBuffer.allocate(16)
                .putLong(id.getMostSignificantBits())
                .putLong(id.getLeastSignificantBits())
                .array();
    }
}
