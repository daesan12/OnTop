package com.ssafy.ontop.history;

import com.ssafy.ontop.game.domain.GameParticipant;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.history.dto.GameHistoryPageRequest;
import com.ssafy.ontop.history.dto.GameHistoryPageResponse;
import com.ssafy.ontop.history.dto.GameStatsResponse;
import com.ssafy.ontop.history.repository.GameHistoryRepository;
import com.ssafy.ontop.history.service.GameHistoryService;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("mysql")
@Transactional
@SpringBootTest(properties = {
        "spring.profiles.active=local,db", "spring.flyway.enabled=false",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "ontop.game-recovery.background-enabled=false"
})
class GameHistoryMySqlTests {
    private static final Instant AT = Instant.parse("2026-10-29T00:00:00Z");
    @Autowired private EntityManager entities;
    @Autowired private EntityManagerFactory factory;
    @Autowired private GameHistoryRepository repository;
    @Autowired private GameHistoryService service;

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_HISTORY_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_ranking_test_bungeo_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("이미 구성된 loopback 격리 DB에서만 전적을 검증합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_GAME_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_GAME_DB_PASSWORD"));
    }

    @Test
    void 본인만_최신ID순으로_조회하고_무효와_정산대기와_필터를_구분한다() {
        long user = member(), other = member(), empty = member();
        long first = seed(user, other, "OMOK", GameFinished.Result.WIN, "FINISHED", true);
        long invalid = seed(user, other, "LIAR_BRIDGE", null, "INVALID", true);
        long dice = seed(user, other, "DICE", GameFinished.Result.LOSE, "FINISHED", true);
        seed(other, user, "ONE_CARD", GameFinished.Result.WIN, "FINISHED", true);
        long pending = seed(user, other, "OMOK", GameFinished.Result.FORFEIT, "FINISHED", false);
        entities.flush();
        entities.clear();
        var stats = factory.unwrap(SessionFactory.class).getStatistics();
        stats.clear();

        var page = service.findHistory(user, new GameHistoryPageRequest(null, 2, null));
        assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
        assertThat(stats.getEntityLoadCount()).isZero();
        assertThat(page.items()).extracting(GameHistoryPageResponse.Item::gameSessionId)
                .containsExactly(Long.toString(pending), Long.toString(dice));
        assertThat(page.items().getFirst().settlementStatus()).isEqualTo("PENDING");
        var next = service.findHistory(user, new GameHistoryPageRequest(Long.parseLong(page.nextCursor()), 2, null));
        assertThat(next.items()).extracting(GameHistoryPageResponse.Item::gameSessionId)
                .containsExactly(Long.toString(invalid), Long.toString(first));
        assertThat(next.items().getFirst().myResult()).isNull();
        assertThat(next.hasNext()).isFalse();
        assertThat(next.nextCursor()).isNull();
        assertThat(service.findHistory(user, new GameHistoryPageRequest(null, 20, "DICE")).items())
                .extracting(GameHistoryPageResponse.Item::gameSessionId).containsExactly(Long.toString(dice));
        assertThat(service.findHistory(empty, new GameHistoryPageRequest(null, 20, null)).items()).isEmpty();
        assertThat(stats.getEntityInsertCount()).isZero();
        assertThat(stats.getEntityUpdateCount()).isZero();
        assertThat(stats.getEntityDeleteCount()).isZero();
    }

    @Test
    void 승패기권무승부를_중복없이_집계하고_진행중과_무효는_제외한다() {
        long user = member(), other = member(), empty = member();
        seed(user, other, "OMOK", GameFinished.Result.WIN, "FINISHED", true);
        seed(user, other, "OMOK", GameFinished.Result.LOSE, "FINISHED", true);
        seed(user, other, "OMOK", GameFinished.Result.FORFEIT, "FINISHED", true);
        seed(user, other, "OMOK", GameFinished.Result.DRAW, "FINISHED", true);
        seed(user, other, "ONE_CARD", GameFinished.Result.WIN, "FINISHED", true);
        seed(user, other, "LIAR_BRIDGE", GameFinished.Result.FORFEIT, "INVALID", true);
        seed(other, user, "OMOK", GameFinished.Result.WIN, "FINISHED", true);
        seed(user, other, "DICE", null, "RUNNING", false);
        entities.flush();
        entities.clear();
        var stats = factory.unwrap(SessionFactory.class).getStatistics();
        stats.clear();

        assertThat(repository.findStats(user)).containsExactly(
                new GameStatsResponse.Item("OMOK", 4, 1, 1, 1, 1),
                new GameStatsResponse.Item("ONE_CARD", 1, 1, 0, 0, 0));
        assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
        assertThat(stats.getEntityLoadCount()).isZero();
        assertThat(repository.findStats(empty)).isEmpty();
        assertThat(stats.getEntityInsertCount()).isZero();
        assertThat(stats.getEntityUpdateCount()).isZero();
        assertThat(stats.getEntityDeleteCount()).isZero();
    }

    private long member() {
        String random = UUID.randomUUID().toString().replace("-", "");
        var user = new User(LoginProvider.SSAFY, "history-test-" + random,
                "H" + random.substring(0, 7), CharacterGender.MALE);
        entities.persist(user);
        entities.flush();
        return user.getId();
    }

    // 이 테스트는 실제 경기 플레이/정산이 아니라 기존 엔티티로 만든 소규모 롤백 fixture를 조회한다.
    private long seed(long user, long other, String code, GameFinished.Result result, String status, boolean settled) {
        var command = new GameStartCommand(UUID.randomUUID(), "history-test-" + UUID.randomUUID(), 1, code,
                List.of(new GameStartCommand.Participant(Long.toString(user), 1),
                        new GameStartCommand.Participant(Long.toString(other), 2)), code.equals("DICE") ? 2000 : null);
        var session = GameSession.prepare(command, new byte[32], "history-test", UUID.randomUUID(), AT);
        session.reserve(AT);
        session.markStarted(AT);
        entities.persist(session);
        entities.flush();
        var player = new GameParticipant(session.id(), user, 1, 0);
        if (!status.equals("RUNNING")) {
            if (status.equals("INVALID")) {
                session.recordInvalidFinish("history:" + session.id(), new byte[32], 1, "ABORTED_NO_PLAYERS", AT);
            } else {
                session.recordFinish("history:" + session.id(), new byte[32], 1, "FIVE_IN_ROW", AT);
            }
            if (result != null) {
                player.recordFinish(new GameFinished.Participant(user, result,
                        result == GameFinished.Result.FORFEIT ? GameDepartureReason.EXPLICIT_LEAVE : null,
                        result == GameFinished.Result.FORFEIT ? AT : null));
            }
            if (settled) {
                if (status.equals("INVALID")) {
                    session.completeInvalidation(AT);
                    player.releaseInvalidReservation(AT);
                } else {
                    session.settle(0, 2, AT);
                    player.closeReservation(result == GameFinished.Result.WIN ? 1 : -1, AT);
                }
            }
        }
        entities.persist(player);
        entities.flush();
        return session.id();
    }
}
