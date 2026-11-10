package com.ssafy.ontop.world.jumpmap;

import com.ssafy.ontop.world.config.JumpmapProperties;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.RETURNS_SELF;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JdbcJumpmapStoreTests {
    @TempDir Path directory;

    static Stream<Arguments> flags() {
        return Stream.of(Arguments.of(true, true), Arguments.of(false, false),
                Arguments.of(1, true), Arguments.of(0, false),
                Arguments.of(1L, true), Arguments.of(0L, false),
                Arguments.of((byte) 1, true), Arguments.of((byte) 0, false));
    }

    @ParameterizedTest
    @MethodSource("flags")
    void 첫_판과_동일_시작키_재시도에서_JDBC_불리언과_숫자를_같게_읽는다(Object flag, boolean expected) {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForMap(contains("SELECT user_id"), eq("run"))).thenReturn(Map.of(
                "user_id", 101L, "channel_id", "channel-1", "rules_version", JumpCourse.RULES_VERSION,
                "course_version", JumpCourse.COURSE_VERSION, "is_first_run", flag));
        JdbcJumpmapStore store = store(jdbc, new JumpmapProperties(true));

        var first = store.start("run", 101, "channel-1", Instant.EPOCH);
        var retry = store.start("run", 101, "channel-1", Instant.EPOCH.plusSeconds(1));

        assertThat(first.firstRun()).isEqualTo(expected);
        assertThat(retry.firstRun()).isEqualTo(expected);
    }

    @Test
    void 외부_코스_파일이_없으면_기본_코스로_폴백하지_않는다() {
        var properties = new JumpmapProperties(true, directory.resolve("missing.json").toString(),
                directory.resolve("missing.sha256").toString());

        assertThatThrownBy(() -> store(mock(JdbcTemplate.class), properties))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("저장소를 시작하지 않습니다");
    }

    @Test
    void 외부_코스의_체크섬이_다르면_애플리케이션_컨텍스트가_시작하지_않는다() throws Exception {
        Path json = directory.resolve("course.json");
        Path checksum = directory.resolve("course.sha256");
        Files.writeString(json, "{}");
        Files.writeString(checksum, "0".repeat(64));
        var properties = new JumpmapProperties(true, json.toString(), checksum.toString());

        new ApplicationContextRunner().withBean(JumpmapStore.class,
                () -> store(mock(JdbcTemplate.class), properties)).run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure()).hasStackTraceContaining("SHA-256");
                });
    }

    @Test
    void 정상_새_공원_코스와_기본_레거시_코스는_각각_시작한다() {
        Path generated = Path.of("../frontend/generated/park-renewal");

        assertThat(store(mock(JdbcTemplate.class), new JumpmapProperties(true))).isNotNull();
        assertThat(store(mock(JdbcTemplate.class), new JumpmapProperties(true,
                generated.resolve("course.local.json").toString(),
                generated.resolve("course.local.sha256").toString()))).isNotNull();
    }

    private JdbcJumpmapStore store(JdbcTemplate jdbc, JumpmapProperties properties) {
        EntityManager entities = mock(EntityManager.class);
        Query query = mock(Query.class, RETURNS_SELF);
        when(entities.createNativeQuery(anyString())).thenReturn(query);
        when(query.getSingleResult()).thenReturn(0L);
        PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
        when(transactions.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        return new JdbcJumpmapStore(jdbc, entities, transactions, properties);
    }
}
