package com.ssafy.ontop.minigame.telemetry;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TimeZone;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
class MoleAuditStore {
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper mapper;

    MoleAuditStore(NamedParameterJdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    record RoundData(long id, long userId, long seed, int version, Instant startedAt, String status) {
    }

    record Event(Instant receivedAt, JsonNode props, boolean settlement) {
    }

    RoundData find(MoleAuditGame game, long id, Long owner) {
        var args = new HashMap<String, Object>();
        args.put("id", id);
        String sql = select(game) + " WHERE id = :id";
        if (owner != null) {
            sql += " AND user_id = :owner";
            args.put("owner", owner);
        }
        return jdbc.query(sql, args, (row, index) -> round(row)).stream().findFirst().orElse(null);
    }

    List<RoundData> list(MoleAuditGame game, Long user, Long id, Instant from, Instant until, Integer version,
                         Long excludeUser, int limit) {
        var args = new HashMap<String, Object>();
        StringBuilder sql = new StringBuilder(select(game)).append(" WHERE 1 = 1");
        condition(sql, args, "user_id = :owner", "owner", user);
        condition(sql, args, "id = :id", "id", id);
        condition(sql, args, "started_at >= :from", "from", from == null ? null : utc(from));
        condition(sql, args, "started_at < :until", "until", until == null ? null : utc(until));
        condition(sql, args, "rules_version = :version", "version", version);
        condition(sql, args, "user_id <> :exclude", "exclude", excludeUser);
        if (excludeUser != null) {
            sql.append(" AND status = 'SETTLED'");
        }
        args.put("limit", limit);
        return jdbc.query(sql.append(" ORDER BY id DESC LIMIT :limit").toString(), args, (row, index) -> round(row));
    }

    Map<Long, List<Event>> events(MoleAuditGame game, List<RoundData> rounds) {
        var result = new HashMap<Long, List<Event>>();
        if (rounds.isEmpty()) {
            return result;
        }
        var keys = new HashMap<String, RoundData>();
        rounds.forEach(round -> keys.put(game.key(round.id()), round));
        Instant earliest = rounds.stream().map(RoundData::startedAt).min(Instant::compareTo).orElseThrow();
        Instant latest = rounds.stream().map(RoundData::startedAt).max(Instant::compareTo).orElseThrow()
                .plusMillis(game.durationMs + 30_000L);
        jdbc.query("""
                SELECT game_id, user_id, occurred_at, props, event_type
                FROM behavior_events
                WHERE source = 'SERVER' AND event_type IN ('MOLE_TAP_BATCH', 'MOLE_ROUND_HONEYPOT')
                  AND occurred_at >= :earliest AND occurred_at <= :latest AND game_id IN (:keys)
                ORDER BY occurred_at, id
                """, Map.of("earliest", utc(earliest), "latest", utc(latest), "keys", keys.keySet()),
                (ResultSet row) -> {
                    RoundData round = keys.get(row.getString("game_id"));
                    if (round == null || round.userId() != row.getLong("user_id")) {
                        return;
                    }
                    try {
                        var event = new Event(instant(row, "occurred_at"),
                                mapper.readTree(row.getString("props")),
                                row.getString("event_type").equals("MOLE_ROUND_HONEYPOT"));
                        result.computeIfAbsent(round.id(), id -> new ArrayList<>()).add(event);
                    } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
                        throw new SQLException("두더지 행동 로그 JSON을 읽을 수 없습니다.", error);
                    }
                });
        return result;
    }

    private static String select(MoleAuditGame game) {
        return "SELECT id, user_id, seed, rules_version, started_at, status FROM " + game.table;
    }

    private static RoundData round(ResultSet row) throws SQLException {
        return new RoundData(row.getLong("id"), row.getLong("user_id"), row.getLong("seed"),
                row.getInt("rules_version"), instant(row, "started_at"), row.getString("status"));
    }

    private static LocalDateTime utc(Instant time) {
        return LocalDateTime.ofInstant(time, ZoneOffset.UTC);
    }

    private static Instant instant(ResultSet row, String column) throws SQLException {
        return row.getTimestamp(column, Calendar.getInstance(TimeZone.getTimeZone("UTC"))).toInstant();
    }

    private static void condition(StringBuilder sql, Map<String, Object> args, String expression,
            String key, Object value) {
        if (value != null) {
            sql.append(" AND ").append(expression);
            args.put(key, value);
        }
    }
}
