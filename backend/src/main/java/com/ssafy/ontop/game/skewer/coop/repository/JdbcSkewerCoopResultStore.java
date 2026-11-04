package com.ssafy.ontop.game.skewer.coop.repository;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.skewer.coop.dto.SkewerCoopRankingResponse;
import com.ssafy.ontop.game.skewer.coop.dto.SkewerCoopResultResponse;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopFinished;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopResultStore;
import com.ssafy.ontop.minigame.service.MinigameRewardBudget;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** 결과 두 명분·지갑·원장을 원자적으로 확정한다. 재시도는 결과 PK와 원장 고유 키로 멱등 처리한다. */
@Repository
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.games.skewer-coop.enabled", havingValue = "true")
public class JdbcSkewerCoopResultStore implements SkewerCoopResultStore {
    private static final String RANKING = """
            WITH choices AS (
                SELECT r.*, c.nickname AS chef_nickname, s.nickname AS server_nickname,
                    ROW_NUMBER() OVER (PARTITION BY r.team_low_id, r.team_high_id
                        ORDER BY r.team_score DESC, r.ended_at, r.game_id) AS choice
                FROM skewer_coop_results r
                JOIN users c ON c.id = r.chef_user_id JOIN users s ON s.id = r.server_user_id
                WHERE r.ranking_eligible = TRUE AND r.end_reason = 'SKEWER_TIME_UP'
                  AND r.rules_version = 'coop-v1' AND r.duration_ms = 240000
                  AND c.deleted_at IS NULL AND s.deleted_at IS NULL
            ), ranked AS (
                SELECT *, RANK() OVER (ORDER BY team_score DESC) AS place FROM choices WHERE choice = 1
            )
            SELECT * FROM ranked
            """;
    private final JdbcTemplate jdbc;
    private final EntityManager entities;
    private final TransactionTemplate transactions;

    public JdbcSkewerCoopResultStore(JdbcTemplate jdbc, EntityManager entities, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        this.entities = entities;
        transactions = new TransactionTemplate(manager);
        transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        Integer tables = jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME IN ('skewer_coop_results', 'skewer_coop_rewards')
                """, Integer.class);
        if (tables == null || tables != 2) {
            throw new IllegalStateException("꼬치왕 보상에는 db/minigame V145 적용이 필요합니다.");
        }
    }

    @Override
    public void settle(SkewerCoopFinished event, Instant at) {
        List<Long> users = event.users();
        if (users.size() != 2 || users.getFirst() <= 0 || users.getFirst().equals(users.getLast())
                || event.teamScore() < 0 || event.served() < 0) {
            throw new IllegalArgumentException("서버 공동 결과를 확인하세요.");
        }
        transactions.executeWithoutResult(status -> {
            jdbc.update("""
                    INSERT INTO skewer_coop_results(game_id, result_hash, rules_version, table_id,
                        team_low_id, team_high_id, chef_user_id, server_user_id, team_score, served,
                        elapsed_ms, duration_ms, end_reason, ranking_eligible, ranking_reason, ended_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE game_id = game_id
                    """, event.result().gameId(), hash(event), SkewerCoopFinished.RULES_VERSION,
                    event.result().tableId(), users.getFirst(), users.getLast(), event.chefUserId(),
                    event.serverUserId(), event.teamScore(), event.served(), event.elapsedMillis(),
                    event.durationMillis(), event.result().endReason(), "ELIGIBLE".equals(event.rankingReason()),
                    event.rankingReason(), Timestamp.from(event.result().endedAt()));
            String saved = jdbc.queryForObject(
                    "SELECT result_hash FROM skewer_coop_results WHERE game_id = ? FOR UPDATE",
                    String.class, event.result().gameId());
            if (!hash(event).equals(saved)) {
                throw new DataIntegrityViolationException("이미 저장한 경기와 다른 결과입니다.");
            }
            Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM skewer_coop_rewards WHERE game_id = ?",
                    Integer.class, event.result().gameId());
            if (count != null && count == 2) {
                return;
            }
            if (count == null || count != 0) {
                throw new DataIntegrityViolationException("공동 정산 영수증을 확인하세요.");
            }
            // 다른 미니게임과 동일한 지갑 잠금으로 하루 상한을 직렬화한다. 두 지갑은 회원 ID 순으로 잠근다.
            List<Wallet> wallets = new ArrayList<>();
            for (long user : users) {
                var rows = entities.createQuery("select w from Wallet w where w.userId = :user", Wallet.class)
                        .setParameter("user", user).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
                if (rows.isEmpty()) {
                    throw new DataIntegrityViolationException("지갑이 없는 회원의 보상은 확정할 수 없습니다.");
                }
                Wallet wallet = rows.getFirst();
                entities.refresh(wallet, LockModeType.PESSIMISTIC_WRITE);
                wallets.add(wallet);
            }
            LocalDate date = at.atZone(MinigameRewardBudget.KST).toLocalDate();
            for (int index = 0; index < users.size(); index++) {
                long user = users.get(index);
                Wallet wallet = wallets.get(index);
                int calculated = event.teamScore() / 20;
                long earned = earned(user, date);
                int granted = MinigameRewardBudget.grant(calculated, earned);
                if (granted > 0) {
                    wallet.creditReward(granted);
                    entities.persist(WalletTransaction.skewerReward(wallet.id(), granted,
                            "skewer-coop:" + event.result().gameId() + ":" + user, at));
                }
                jdbc.update("""
                        INSERT INTO skewer_coop_rewards(game_id, user_id, player_role, coins_calculated,
                            coins_granted, earned_at_settlement, balance_after, reward_date, settled_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, event.result().gameId(), user, event.role(user), calculated, granted, earned + granted,
                        wallet.balance(), Date.valueOf(date), Timestamp.from(at));
            }
            entities.flush();
        });
    }

    @Override
    public Optional<SkewerCoopResultResponse> find(long user, String gameId, Instant now) {
        return transactions.execute(status -> {
            LocalDate today = now.atZone(MinigameRewardBudget.KST).toLocalDate();
            var rows = jdbc.queryForList("""
                    SELECT r.*, p.coins_calculated, p.coins_granted, p.balance_after, p.reward_date, p.settled_at
                    FROM skewer_coop_results r JOIN skewer_coop_rewards p ON p.game_id = r.game_id
                    WHERE r.game_id = ? AND p.user_id = ?
                    """, gameId, user);
            if (rows.isEmpty()) {
                return Optional.empty();
            }
            var row = rows.getFirst();
            long earned = earned(user, today);
            return Optional.of(new SkewerCoopResultResponse(gameId, "SETTLED", number(row.get("team_score")),
                    number(row.get("served")), (String) row.get("end_reason"),
                    "ELIGIBLE".equals(row.get("ranking_reason")) ? "REGISTERED" : "EXCLUDED",
                    (String) row.get("ranking_reason"), number(row.get("coins_calculated")),
                    number(row.get("coins_granted")), earned, MinigameRewardBudget.DAILY_CAP,
                    Math.max(0, MinigameRewardBudget.DAILY_CAP - earned),
                    ((Number) row.get("balance_after")).longValue(),
                    ((Date) row.get("reward_date")).toLocalDate(), ((Timestamp) row.get("settled_at")).toInstant()));
        });
    }

    @Override
    public SkewerCoopRankingResponse ranking(long user, Instant now) {
        return transactions.execute(status -> {
            var items = jdbc.query(RANKING + " ORDER BY team_score DESC, ended_at, game_id LIMIT 20",
                    JdbcSkewerCoopResultStore::item);
            var mine = jdbc.query(RANKING + " WHERE team_low_id = ? OR team_high_id = ?"
                            + " ORDER BY team_score DESC, ended_at, game_id LIMIT 1",
                    JdbcSkewerCoopResultStore::item, user, user);
            return new SkewerCoopRankingResponse(SkewerCoopFinished.RULES_VERSION, "ALL_TIME", "TEAM_BEST", now,
                    items, mine.isEmpty() ? null : mine.getFirst());
        });
    }

    private long earned(long user, LocalDate date) {
        return MinigameRewardBudget.earned(entities, user, date.atStartOfDay(MinigameRewardBudget.KST).toInstant(),
                date.plusDays(1).atStartOfDay(MinigameRewardBudget.KST).toInstant());
    }

    private static SkewerCoopRankingResponse.Item item(ResultSet row, int index) throws SQLException {
        return new SkewerCoopRankingResponse.Item(row.getLong("place"), row.getString("game_id"),
                row.getString("chef_user_id"), row.getString("chef_nickname"), row.getString("server_user_id"),
                row.getString("server_nickname"), row.getInt("team_score"), row.getInt("served"),
                row.getTimestamp("ended_at").toInstant());
    }

    private static int number(Object value) {
        return ((Number) value).intValue();
    }

    private static String hash(SkewerCoopFinished result) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(result.toString().getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("결과 해시를 만들 수 없습니다.", exception);
        }
    }
}
