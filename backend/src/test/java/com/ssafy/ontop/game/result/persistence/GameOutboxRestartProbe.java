package com.ssafy.ontop.game.result.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import javax.sql.DataSource;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** 격리 DB outbox의 별도 JVM 재시작 검증 전용. 운영 JAR에는 포함되지 않는다. */
public final class GameOutboxRestartProbe {
    private GameOutboxRestartProbe() { }

    public static void main(String[] args) {
        try {
            String url = System.getenv("TEST_GAME_DB_URL");
            if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_game_test_story174_[A-Za-z0-9_]+(?:\\?.*)?")) {
                throw new IllegalArgumentException("승인한 격리 DB가 필요합니다.");
            }
            long gameId = Long.parseLong(args[0]);
            var source = new DriverManagerDataSource(url, System.getenv("TEST_GAME_DB_USERNAME"),
                    System.getenv("TEST_GAME_DB_PASSWORD"));
            try (var context = new AnnotationConfigApplicationContext()) {
                context.getEnvironment().setActiveProfiles("db");
                context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("probe",
                        java.util.Map.of("ontop.game-start.enabled", "true")));
                context.registerBean(DataSource.class, () -> source);
                context.registerBean(ObjectMapper.class, () -> new ObjectMapper().findAndRegisterModules());
                context.registerBean("oauthClock", Clock.class, Clock::systemUTC);
                context.register(GameDeliveryMySqlTests.DeliveryConfiguration.class);
                context.refresh();
                var notifications = context.getBean(GameResultNotifications.class);
                var jdbc = context.getBean(JdbcTemplate.class);
                for (int index = 0; index < 20 && delivered(jdbc, gameId) < 2; index++) {
                    notifications.dispatchOnce(100);
                }
                if (delivered(jdbc, gameId) != 2) {
                    throw new IllegalStateException("보관된 결과 알림이 남아 있습니다.");
                }
                System.out.println("OUTBOX_RESTART_DELIVERED=2");
            }
        } catch (Exception exception) {
            // 연결 URL·비밀번호·payload·예외 원문을 출력하지 않는다.
            System.err.println("OUTBOX_RESTART_FAILED=" + exception.getClass().getSimpleName());
            System.exit(1);
        }
    }

    private static long delivered(JdbcTemplate jdbc, long gameId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM game_result_outbox "
                + "WHERE game_session_id=? AND delivered_at IS NOT NULL", Long.class, gameId);
    }
}
