package com.ssafy.ontop.raffle;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.Statement;
import java.util.Arrays;
import java.util.List;
import java.util.function.Predicate;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/** V182 파일의 세션 시간대 설정과 선택한 데이터 문장을 복사본 없이 그대로 다시 실행한다. */
final class RaffleLiveEventMigrationScript {
    static final String PATH = "db/migration/V182__register_raffle_live_event_20261116.sql";

    private RaffleLiveEventMigrationScript() {
    }

    /** 선택한 문장 앞에 파일의 첫 문장(세션 시간대 UTC 고정)을 같은 연결에서 먼저 실행한다. */
    static void run(JdbcTemplate jdbc, Predicate<String> selected) throws IOException {
        List<String> statements = statements();
        assertThat(statements.getFirst()).isEqualTo("SET time_zone = '+00:00'");
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            try (Statement statement = connection.createStatement()) {
                statement.execute(statements.getFirst());
                for (String sql : statements.stream().filter(selected).toList()) {
                    statement.execute(sql);
                }
            }
            return null;
        });
    }

    private static List<String> statements() throws IOException {
        String script = new ClassPathResource(PATH).getContentAsString(StandardCharsets.UTF_8);
        String withoutComments = String.join("\n", script.lines()
                .filter(line -> !line.trim().startsWith("--")).toList());
        return Arrays.stream(withoutComments.split(";")).map(String::trim).filter(sql -> !sql.isEmpty()).toList();
    }
}
