package com.ssafy.ontop.world.winter.community;

import com.ssafy.ontop.config.RuntimeProfiles;
import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** V190. 점등은 전 채널 공용 행, 눈사람 추가는 채널 행을 먼저 잠가 직렬화한다. */
@Repository
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
public final class JdbcWinterCommunityStore implements WinterCommunityStore {
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
        return Objects.requireNonNull(jdbc.queryForObject(
                "SELECT message_count,lit_at,revision FROM winter_community_board WHERE id=1", (row, index) -> {
                    String litAt = time(row, "lit_at");
                    long count = row.getLong("message_count");
                    return new WinterCommunity.TreeStatus(count, litAt != null || count >= WinterCommunity.TREE_TARGET,
                            litAt, row.getLong("revision"));
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
            String nickname, Instant now) {
        actorSalt();
        return Objects.requireNonNull(transactions.execute(transaction -> {
            jdbc.queryForObject("SELECT id FROM winter_community_board WHERE id=1 FOR UPDATE", Integer.class);
            var existing = jdbc.query("SELECT * FROM winter_tree_messages WHERE actor_key=? AND operation_id=?",
                    this::message, actorKey, operation);
            if (!existing.isEmpty()) {
                var previous = existing.getFirst();
                if (!previous.text().equals(text) || previous.anonymous() != anonymous) {
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
                        + "(actor_key,operation_id,body,anonymous,display_name,created_at) VALUES (?,?,?,?,?,?)",
                        Statement.RETURN_GENERATED_KEYS);
                statement.setString(1, actorKey);
                statement.setString(2, operation);
                statement.setString(3, text);
                statement.setBoolean(4, anonymous);
                statement.setString(5, anonymous ? null : nickname);
                statement.setObject(6, utc(now));
                return statement;
            }, keys);
            long count = status().count() + 1;
            jdbc.update("UPDATE winter_community_board SET message_count=?,lit_at=COALESCE(lit_at,?),revision=revision+1 WHERE id=1",
                    count, count >= WinterCommunity.TREE_TARGET ? utc(now) : null);
            long id = Objects.requireNonNull(keys.getKey()).longValue();
            return new WinterCommunity.TreeReceipt(status(),
                    new WinterCommunity.TreeMessage(id, text, anonymous, anonymous ? null : nickname, now.toString()),
                    now.plusSeconds(15).toString());
        }));
    }

    @Override
    public List<WinterCommunity.Snowman> snowmen(String channel) {
        return jdbc.query("SELECT * FROM winter_snowmen WHERE channel_id=? ORDER BY created_at,id", this::snowman, channel);
    }

    @Override
    public Optional<WinterCommunity.Snowman> previousSnowman(String actorKey, String operation, String requestHash) {
        return jdbc.query("SELECT * FROM winter_snowmen WHERE actor_key=? AND operation_id=?", (row, index) -> {
                    if (!requestHash.equals(row.getString("request_hash"))) {
                        throw new WinterCommunityException(409, "WINTER_OPERATION_CONFLICT", "같은 요청의 내용이 달라졌어요.");
                    }
                    return snowman(row, index);
                },
                actorKey, operation).stream().findFirst();
    }

    @Override
    public WinterCommunity.Snowman saveSnowman(String actorKey, String operation, String requestHash,
            WinterCommunity.Snowman snowman) {
        return Objects.requireNonNull(transactions.execute(transaction -> {
            jdbc.update("INSERT IGNORE INTO winter_snowman_channels (channel_id) VALUES (?)", snowman.channelId());
            jdbc.queryForObject("SELECT revision FROM winter_snowman_channels WHERE channel_id=? FOR UPDATE",
                    Long.class, snowman.channelId());
            var previous = previousSnowman(actorKey, operation, requestHash);
            if (previous.isPresent()) {
                return previous.get();
            }
            var placed = snowmen(snowman.channelId());
            if (placed.size() >= WinterCommunity.MAX_SNOWMEN) {
                throw new WinterCommunityException(409, "WINTER_GARDEN_FULL", "이 채널의 눈사람 자리가 가득 찼어요.");
            }
            if (placed.stream().anyMatch(other -> Math.hypot(other.x() - snowman.x(), other.z() - snowman.z())
                    < other.baseRadius() + snowman.baseRadius() + .5)) {
                throw new WinterCommunityException(409, "WINTER_PLACEMENT_BLOCKED", "다른 눈사람과 조금 떨어뜨려 주세요.");
            }
            jdbc.update("INSERT INTO winter_snowmen "
                    + "(id,channel_id,actor_key,operation_id,request_hash,name,x,ground_y,z,yaw,base_radius,middle_radius,head_radius,hat,scarf,face,created_at) "
                    + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", snowman.id(), snowman.channelId(), actorKey, operation, requestHash,
                    snowman.name(), snowman.x(), snowman.groundY(), snowman.z(), snowman.yaw(), snowman.baseRadius(),
                    snowman.middleRadius(), snowman.headRadius(), snowman.hat(), snowman.scarf(), snowman.face(),
                    utc(Instant.parse(snowman.createdAt())));
            jdbc.update("UPDATE winter_snowman_channels SET revision=revision+1 WHERE channel_id=?", snowman.channelId());
            return snowman;
        }));
    }

    private WinterCommunity.TreeMessage message(ResultSet row, int index) throws SQLException {
        boolean anonymous = row.getBoolean("anonymous");
        return new WinterCommunity.TreeMessage(row.getLong("id"), row.getString("body"), anonymous,
                anonymous ? null : row.getString("display_name"), time(row, "created_at"));
    }

    private WinterCommunity.Snowman snowman(ResultSet row, int index) throws SQLException {
        return new WinterCommunity.Snowman(row.getString("id"), row.getString("channel_id"), row.getString("name"),
                row.getDouble("x"), row.getDouble("ground_y"), row.getDouble("z"), row.getDouble("yaw"),
                row.getDouble("base_radius"), row.getDouble("middle_radius"), row.getDouble("head_radius"),
                row.getString("hat"), row.getString("scarf"), row.getString("face"), time(row, "created_at"));
    }

    private static String time(ResultSet row, String column) throws SQLException {
        var value = row.getObject(column, LocalDateTime.class);
        return value == null ? null : value.toInstant(ZoneOffset.UTC).toString();
    }

    private static LocalDateTime utc(Instant value) { return LocalDateTime.ofInstant(value, ZoneOffset.UTC); }
}
