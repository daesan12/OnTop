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

    record RoundData(long id, long userId, long seed, int version, Instant startedAt, String status, Integer score,
                     String nickname) {
    }

    record RoundWithMember(RoundData round, String nickname, boolean withdrawn) {
    }

    record Event(Instant receivedAt, JsonNode props, boolean settlement) {
    }

    RoundData findOwnedRound(MoleAuditGame game, long id, long owner) {
        String sql = select(game) + " WHERE id = :id AND user_id = :owner";
        return jdbc.query(sql, Map.of("id", id, "owner", owner), (row, index) -> round(row))
                .stream().findFirst().orElse(null);
    }

    RoundWithMember findRoundWithMember(MoleAuditGame game, long id) {
        String sql = """
                SELECT r.id, r.user_id, r.seed, r.rules_version, r.started_at, r.status, r.score,
                       u.nickname, u.deleted_at IS NOT NULL AS withdrawn
                FROM %s r
                LEFT JOIN users u ON u.id = r.user_id
                WHERE r.id = :id
                """.formatted(game.table);
        return jdbc.query(sql, Map.of("id", id), (row, index) -> new RoundWithMember(
                round(row, row.getString("nickname")), row.getString("nickname"), row.getBoolean("withdrawn")))
                .stream().findFirst().orElse(null);
    }

    List<RoundData> list(MoleAuditGame game, Long user, Long id, Instant from, Instant until, Integer version,
                         Long excludeUser, String nickname, int limit) {
        var args = new HashMap<String, Object>();
        var sql = new StringBuilder("""
                SELECT r.id, r.user_id, r.seed, r.rules_version, r.started_at, r.status, r.score, u.nickname
                FROM %s r LEFT JOIN users u ON u.id = r.user_id
                WHERE 1 = 1
                """.formatted(game.table));
        condition(sql, args, "r.user_id = :owner", "owner", user);
        condition(sql, args, "r.id = :id", "id", id);
        condition(sql, args, "r.started_at >= :from", "from", from == null ? null : utc(from));
        condition(sql, args, "r.started_at < :until", "until", until == null ? null : utc(until));
        condition(sql, args, "r.rules_version = :version", "version", version);
        condition(sql, args, "r.user_id <> :exclude", "exclude", excludeUser);
        condition(sql, args, "u.nickname = :nickname", "nickname", nickname);
        if (excludeUser != null) {
            sql.append(" AND r.status = 'SETTLED'");
        }
        args.put("limit", limit);
        return jdbc.query(sql.append(" ORDER BY r.id DESC LIMIT :limit").toString(), args,
                (row, index) -> round(row, row.getString("nickname")));
    }

    List<MoleAuditDtos.DetectedMember> detections(MoleAuditGame game, Instant from, Instant until, int limit) {
        // 판 중 묶음 재전송이나 완료 제출에 같은 신호가 있어도 적발 판은 한 번만 센다.
        String sql = """
                WITH detected_rounds AS (
                    SELECT r.user_id, r.id AS round_id, MAX(e.occurred_at) AS detected_at,
                           MAX(e.event_type = 'MOLE_TAP_BATCH') AS live_hit,
                           MAX(e.event_type = 'MOLE_ROUND_HONEYPOT') AS completion_hit
                    FROM behavior_events e
                    JOIN %s r ON r.id = CAST(SUBSTRING_INDEX(e.game_id, ':', -1) AS UNSIGNED)
                        AND e.game_id = CONCAT(:prefix, r.id) AND e.user_id = r.user_id
                    WHERE e.source = 'SERVER' AND e.game_id LIKE :gameKey
                      AND e.occurred_at >= :from AND e.occurred_at < :until
                      AND e.occurred_at >= r.started_at
                      AND e.occurred_at <= TIMESTAMPADD(MICROSECOND, :windowMicros, r.started_at)
                      AND e.event_type IN ('MOLE_TAP_BATCH', 'MOLE_ROUND_HONEYPOT')
                      AND (
                          (e.event_type = 'MOLE_TAP_BATCH'
                              AND JSON_SEARCH(e.props, 'one', '%%:HONEYPOT:%%', NULL, '$.taps[*]') IS NOT NULL)
                          OR (e.event_type = 'MOLE_ROUND_HONEYPOT'
                              AND JSON_EXTRACT(e.props, '$.hits') > 0)
                      )
                    GROUP BY r.user_id, r.id
                ), ranked AS (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY detected_at DESC, round_id DESC) AS recency
                    FROM detected_rounds
                )
                SELECT d.user_id, u.nickname, u.deleted_at IS NOT NULL AS withdrawn,
                       COUNT(*) AS flagged_rounds, SUM(d.live_hit) AS live_rounds,
                       SUM(d.completion_hit) AS completion_rounds,
                       MAX(CASE WHEN d.recency = 1 THEN d.round_id END) AS latest_round_id,
                       MAX(d.detected_at) AS last_detected_at
                FROM ranked d
                LEFT JOIN users u ON u.id = d.user_id
                GROUP BY d.user_id, u.nickname, u.deleted_at
                ORDER BY flagged_rounds DESC, last_detected_at DESC, d.user_id
                LIMIT :limit
                """.formatted(game.table);
        return jdbc.query(sql, Map.of("prefix", game.path + ":", "gameKey", game.path + ":%",
                "from", utc(from), "until", utc(until), "windowMicros", (game.durationMs + 30_000L) * 1000,
                "limit", limit), (row, index) -> new MoleAuditDtos.DetectedMember(
                        row.getString("user_id"), row.getString("nickname"), row.getBoolean("withdrawn"),
                        row.getInt("flagged_rounds"), row.getInt("live_rounds"), row.getInt("completion_rounds"),
                        row.getString("latest_round_id"), instant(row, "last_detected_at")));
    }

    List<MoleAuditDtos.TimingMember> timingDetections(MoleAuditGame game, Instant from, Instant until, int limit) {
        // 기간 안에 타이밍 신호가 한 번이라도 난 회원만 남기고, 같은 기간의 전체 기록 판 수를 함께 센다.
        String sql = """
                WITH timing AS (
                    SELECT user_id, round_id, received_at, fast_reaction, steady_timing, median_reaction_ms,
                           COALESCE(JSON_EXTRACT(segments, '$[*].pace.qualifies') = CAST('[true,true,true]' AS JSON),
                                    FALSE) AS sustained_pace,
                           (COALESCE(segments->>'$[0].earlyReaction.qualifies' = 'true', FALSE)
                                + COALESCE(segments->>'$[1].earlyReaction.qualifies' = 'true', FALSE)
                                + COALESCE(segments->>'$[2].earlyReaction.qualifies' = 'true', FALSE)) >= 2
                                AS repeated_early_reaction
                    FROM mole_timing_audits
                    WHERE game = :game AND received_at >= :from AND received_at < :until
                ), audits AS (
                    SELECT timing.*, (fast_reaction OR steady_timing OR sustained_pace OR repeated_early_reaction)
                           AS flagged
                    FROM timing
                ), latest AS (
                    SELECT user_id, round_id, received_at,
                           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY received_at DESC, round_id DESC) AS recency
                    FROM audits
                    WHERE flagged
                )
                SELECT a.user_id, u.nickname, u.deleted_at IS NOT NULL AS withdrawn,
                       SUM(a.flagged) AS flagged_rounds, SUM(a.fast_reaction) AS fast_rounds,
                       SUM(a.steady_timing) AS steady_rounds, SUM(a.sustained_pace) AS sustained_pace_rounds,
                       SUM(a.repeated_early_reaction) AS repeated_early_reaction_rounds,
                       COUNT(*) AS audited_rounds,
                       MIN(a.median_reaction_ms) AS lowest_median_reaction_ms,
                       MAX(l.round_id) AS latest_round_id, MAX(l.received_at) AS last_detected_at
                FROM audits a
                JOIN latest l ON l.user_id = a.user_id AND l.recency = 1
                LEFT JOIN users u ON u.id = a.user_id
                GROUP BY a.user_id, u.nickname, u.deleted_at
                ORDER BY flagged_rounds DESC, last_detected_at DESC, a.user_id
                LIMIT :limit
                """;
        return jdbc.query(sql, Map.of("game", game.path, "from", utc(from), "until", utc(until), "limit", limit),
                (row, index) -> new MoleAuditDtos.TimingMember(row.getString("user_id"), row.getString("nickname"),
                        row.getBoolean("withdrawn"), row.getInt("flagged_rounds"), row.getInt("fast_rounds"),
                        row.getInt("steady_rounds"), row.getInt("sustained_pace_rounds"),
                        row.getInt("repeated_early_reaction_rounds"), row.getInt("audited_rounds"),
                        row.getObject("lowest_median_reaction_ms", Integer.class),
                        row.getString("latest_round_id"), instant(row, "last_detected_at")));
    }

    MoleAuditDtos.Timing timing(MoleAuditGame game, long roundId) {
        return jdbc.query("""
                SELECT reaction_count, median_reaction_ms, segments, fast_reaction, steady_timing, received_at
                FROM mole_timing_audits
                WHERE game = :game AND round_id = :id
                """, Map.of("game", game.path, "id", roundId), (row, index) -> {
                    try {
                        var segments = List.of(mapper.readValue(row.getString("segments"),
                                MoleTimingSignals.Segment[].class));
                        Boolean sustainedPace = segments.stream().anyMatch(segment -> segment.pace() != null)
                                ? MoleTimingSignals.sustainedPace(segments) : null;
                        Boolean repeatedEarlyReaction = segments.stream().anyMatch(segment -> segment.earlyReaction() != null)
                                ? MoleTimingSignals.repeatedEarlyReaction(segments) : null;
                        return new MoleAuditDtos.Timing(row.getInt("reaction_count"),
                                row.getObject("median_reaction_ms", Integer.class), segments,
                                row.getBoolean("fast_reaction"), row.getBoolean("steady_timing"), sustainedPace,
                                repeatedEarlyReaction,
                                instant(row, "received_at"));
                    } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
                        throw new SQLException("두더지 타이밍 기록 JSON을 읽을 수 없습니다.", error);
                    }
                }).stream().findFirst().orElse(null);
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
        return "SELECT id, user_id, seed, rules_version, started_at, status, score FROM " + game.table;
    }

    private static RoundData round(ResultSet row) throws SQLException {
        return round(row, null);
    }

    private static RoundData round(ResultSet row, String nickname) throws SQLException {
        return new RoundData(row.getLong("id"), row.getLong("user_id"), row.getLong("seed"),
                row.getInt("rules_version"), instant(row, "started_at"), row.getString("status"),
                row.getObject("score", Integer.class), nickname);
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
