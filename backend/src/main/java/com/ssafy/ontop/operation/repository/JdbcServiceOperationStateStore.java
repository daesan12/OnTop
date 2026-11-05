package com.ssafy.ontop.operation.repository;

import com.ssafy.ontop.operation.domain.ServiceOperationMode;
import com.ssafy.ontop.operation.domain.ServiceOperationState;
import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("db")
public class JdbcServiceOperationStateStore implements ServiceOperationStateStore {
    private static final String SELECT_STATE = """
            SELECT mode, notice, maintenance_started_at, expected_open_at, version, updated_by, updated_at
            FROM service_operation_state
            WHERE id = 1
            """;
    private static final String UPDATE_STATE = """
            UPDATE service_operation_state
            SET mode = ?, notice = ?, maintenance_started_at = ?, expected_open_at = ?,
                version = ?, updated_by = ?, updated_at = ?
            WHERE id = 1 AND version = ?
            """;

    private final JdbcTemplate jdbc;

    public JdbcServiceOperationStateStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public ServiceOperationState load() {
        return jdbc.queryForObject(SELECT_STATE, (result, row) -> new ServiceOperationState(
                ServiceOperationMode.valueOf(result.getString("mode")),
                result.getString("notice"),
                instant(result.getTimestamp("maintenance_started_at")),
                instant(result.getTimestamp("expected_open_at")),
                result.getLong("version"),
                result.getObject("updated_by", Long.class),
                result.getTimestamp("updated_at").toInstant()));
    }

    @Override
    public boolean update(ServiceOperationState state, long expectedVersion) {
        return jdbc.update(UPDATE_STATE, state.mode().name(), state.notice(), timestamp(state.maintenanceStartedAt()),
                timestamp(state.expectedOpenAt()), state.version(), state.updatedBy(), Timestamp.from(state.updatedAt()),
                expectedVersion) == 1;
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static Timestamp timestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }
}
