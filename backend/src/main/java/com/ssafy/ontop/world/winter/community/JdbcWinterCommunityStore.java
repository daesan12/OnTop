package com.ssafy.ontop.world.winter.community;

import com.ssafy.ontop.config.RuntimeProfiles;
import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** V183. 점등은 전 채널 공용 행을 먼저 잠가 직렬화한다. */
@Repository
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
public class JdbcWinterCommunityStore implements WinterCommunityStore {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private volatile byte[] salt;

    public JdbcWinterCommunityStore(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        transactions = new TransactionTemplate(manager);
    }

    private void ensureBoard() {
        byte[] generated = new byte[32];
        new SecureRandom().nextBytes(generated);
        jdbc.update("INSERT IGNORE INTO winter_community_board (id,actor_salt) VALUES (1,?)", generated);
    }

    @Override
    public byte[] actorSalt() {
        if (salt == null) {
            synchronized (this) {
                if (salt == null) {
                    ensureBoard();
                    salt = Objects.requireNonNull(jdbc.queryForObject(
                            "SELECT actor_salt FROM winter_community_board WHERE id=1", byte[].class));
                }
            }
        }
        return salt.clone();
    }

    @Override
    public WinterCommunity.TreeStatus treeStatus() {
        actorSalt();
        return status();
    }

    private WinterCommunity.TreeStatus status() {
        // 집계와 장식을 한 SQL 스냅샷으로 읽어 동시 등록 중 서로 다른 revision이 섞이지 않게 한다.
        return Objects.requireNonNull(jdbc.query(
                "SELECT b.message_count,b.lit_at,b.revision,m.id AS ornament_id,m.ornament "
                        + "FROM winter_community_board b LEFT JOIN "
                        + "(SELECT id,ornament FROM winter_tree_messages ORDER BY id DESC LIMIT 50) m ON TRUE "
                        + "WHERE b.id=1 ORDER BY m.id DESC", row -> {
                    if (!row.next()) { throw new IllegalStateException("겨울 트리 집계 행이 없습니다."); }
                    String litAt = time(row, "lit_at");
                    long count = row.getLong("message_count"), revision = row.getLong("revision");
                    var ornaments = new ArrayList<WinterCommunity.TreeOrnament>();
                    do {
                        long id = row.getLong("ornament_id");
                        if (!row.wasNull()) { ornaments.add(new WinterCommunity.TreeOrnament(id, row.getString("ornament"))); }
                    } while (row.next());
                    return new WinterCommunity.TreeStatus(count, litAt != null || count >= WinterCommunity.TREE_TARGET,
                            litAt, revision, List.copyOf(ornaments));
                }));
    }

    @Override
    public WinterCommunity.TreePage tree(Long before, int limit) {
        actorSalt();
        return Objects.requireNonNull(transactions.execute(transaction -> {
            var rows = before == null
                    ? jdbc.query("SELECT * FROM winter_tree_messages ORDER BY id DESC LIMIT ?", this::message, limit + 1)
                    : jdbc.query("SELECT * FROM winter_tree_messages WHERE id<? ORDER BY id DESC LIMIT ?",
                            this::message, before, limit + 1);
            var visible = List.copyOf(rows.subList(0, Math.min(rows.size(), limit)));
            return new WinterCommunity.TreePage(status(), visible,
                    rows.size() > limit ? visible.getLast().id() : null);
        }));
    }

    @Override
    public WinterCommunity.TreeReceipt postTree(String actorKey, String operation, String text, boolean anonymous,
            String nickname, String ornament, Instant now) {
        actorSalt();
        return Objects.requireNonNull(transactions.execute(transaction -> {
            jdbc.queryForObject("SELECT id FROM winter_community_board WHERE id=1 FOR UPDATE", Integer.class);
            var existing = jdbc.query("SELECT * FROM winter_tree_messages WHERE actor_key=? AND operation_id=?",
                    this::message, actorKey, operation);
            if (!existing.isEmpty()) {
                var previous = existing.getFirst();
                if (!previous.text().equals(text) || previous.anonymous() != anonymous
                        || !previous.ornament().equals(ornament)) {
                    throw new WinterCommunityException(409, "WINTER_OPERATION_CONFLICT", "같은 요청의 내용이 달라졌어요.");
                }
                return new WinterCommunity.TreeReceipt(status(), previous,
                        Instant.parse(previous.createdAt()).plusSeconds(15).toString());
            }
            var latest = jdbc.query("SELECT created_at FROM winter_tree_messages WHERE actor_key=? ORDER BY id DESC LIMIT 1",
                    (row, index) -> Instant.parse(Objects.requireNonNull(time(row, "created_at"))), actorKey);
            if (!latest.isEmpty() && now.isBefore(latest.getFirst().plusSeconds(15))) {
                throw new WinterCommunityException(429, "WINTER_MESSAGE_COOLDOWN", "새 편지는 15초 뒤에 남겨주세요.");
            }
            var keys = new GeneratedKeyHolder();
            jdbc.update(connection -> {
                var statement = connection.prepareStatement("INSERT INTO winter_tree_messages "
                        + "(actor_key,operation_id,body,anonymous,display_name,ornament,created_at) VALUES (?,?,?,?,?,?,?)",
                        Statement.RETURN_GENERATED_KEYS);
                statement.setString(1, actorKey);
                statement.setString(2, operation);
                statement.setString(3, text);
                statement.setBoolean(4, anonymous);
                statement.setString(5, anonymous ? null : nickname);
                statement.setString(6, ornament);
                statement.setObject(7, utc(now));
                return statement;
            }, keys);
            // MySQL은 대입을 왼쪽부터 평가한다. 증가 전 개수로 최초 점등을 결정한 뒤 원자적으로 증가시킨다.
            jdbc.update("UPDATE winter_community_board SET "
                            + "lit_at=COALESCE(lit_at,CASE WHEN message_count+1>=? THEN ? ELSE NULL END),"
                            + "message_count=message_count+1,revision=revision+1 WHERE id=1",
                    WinterCommunity.TREE_TARGET, utc(now));
            long id = Objects.requireNonNull(keys.getKey()).longValue();
            return new WinterCommunity.TreeReceipt(status(),
                    new WinterCommunity.TreeMessage(id, text, anonymous, anonymous ? null : nickname, ornament, now.toString()),
                    now.plusSeconds(15).toString());
        }));
    }

    private WinterCommunity.TreeMessage message(ResultSet row, int index) throws SQLException {
        boolean anonymous = row.getBoolean("anonymous");
        return new WinterCommunity.TreeMessage(row.getLong("id"), row.getString("body"), anonymous,
                anonymous ? null : row.getString("display_name"), row.getString("ornament"), time(row, "created_at"));
    }

    private static String time(ResultSet row, String column) throws SQLException {
        var value = row.getObject(column, LocalDateTime.class);
        return value == null ? null : value.toInstant(ZoneOffset.UTC).toString();
    }

    private static LocalDateTime utc(Instant value) { return LocalDateTime.ofInstant(value, ZoneOffset.UTC); }
}
