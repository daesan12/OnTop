package com.ssafy.ontop.user;

import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.PersistenceContext;
import java.sql.SQLException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("mysql")
@ActiveProfiles("db")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Transactional
class UsersMySqlTests {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private UserRepository users;

    @Autowired
    private Flyway flyway;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @PersistenceContext
    private EntityManager entityManager;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = requiredEnvironment("TEST_DB_URL");
        if (!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("mysqlTest는 loopback의 ontop_users80_test_ 전용 DB만 사용합니다.");
        }
        String username = requiredEnvironment("TEST_DB_USERNAME");
        String password = requiredEnvironment("TEST_DB_PASSWORD");
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> username);
        registry.add("spring.datasource.password", () -> password);
    }

    @Test
    void MySQL_84와_strict_mode와_UTC_세션으로_검증한다() {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.4.");
        assertThat(jdbc.queryForObject("SELECT @@session.sql_mode", String.class)).contains("STRICT_TRANS_TABLES");
        assertThat(jdbc.queryForObject("SELECT @@session.time_zone", String.class)).isEqualTo("+00:00");
    }

    @Test
    void V1과_V2가_성공하고_users와_Refresh와_Flyway_이력이_존재한다() {
        assertThat(jdbc.queryForList("SHOW TABLES", String.class))
                .containsExactlyInAnyOrder("users", "refresh_tokens", "flyway_schema_history");
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE version = '1' AND success = 1", Integer.class))
                .isEqualTo(1);
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("2");
    }

    @Test
    void users의_여덟_컬럼은_지정한_자료형과_NULL과_정밀도를_사용한다() {
        List<Map<String, Object>> columns = jdbc.queryForList("""
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH, DATETIME_PRECISION, EXTRA
                FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = 'users'
                ORDER BY ordinal_position
                """);

        assertThat(columns).extracting(column -> column.get("COLUMN_NAME")).containsExactly(
                "id", "login_provider", "provider_user_id", "nickname", "character_gender",
                "created_at", "updated_at", "deleted_at");
        assertThat(columns.getFirst()).containsEntry("DATA_TYPE", "bigint").containsEntry("IS_NULLABLE", "NO");
        assertThat(columns.getFirst().get("EXTRA").toString()).contains("auto_increment");
        assertVarchar(columns.get(1), 20);
        assertVarchar(columns.get(2), 255);
        assertVarchar(columns.get(3), 8);
        assertVarchar(columns.get(4), 10);
        for (int index = 5; index < 8; index++) {
            assertThat(columns.get(index)).containsEntry("DATA_TYPE", "timestamp")
                    .containsEntry("IS_NULLABLE", index == 7 ? "YES" : "NO");
            assertThat(((Number) columns.get(index).get("DATETIME_PRECISION")).intValue()).isEqualTo(3);
        }
    }

    @Test
    void 복합_UNIQUE와_닉네임_UNIQUE와_두_CHECK가_존재한다() {
        Map<String, String> uniqueIndexes = jdbc.queryForList("""
                SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS column_names
                FROM information_schema.statistics
                WHERE table_schema = DATABASE() AND table_name = 'users' AND non_unique = 0
                GROUP BY index_name
                """).stream().collect(Collectors.toMap(
                        row -> row.get("INDEX_NAME").toString(), row -> row.get("column_names").toString()));

        assertThat(uniqueIndexes).containsExactlyInAnyOrderEntriesOf(Map.of(
                "PRIMARY", "id", "uk_users_login_provider_provider_user_id", "login_provider,provider_user_id",
                "uk_users_nickname", "nickname"));
        assertThat(jdbc.queryForList("""
                SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
                WHERE table_schema = DATABASE() AND table_name = 'users' AND constraint_type = 'CHECK'
                """, String.class)).containsExactlyInAnyOrder("ck_users_login_provider", "ck_users_character_gender");
    }

    @Test
    void 동일_provider와_식별자의_중복은_거절한다() {
        insert("SSAFY", "same-social-id", "중복전1", "MALE", null);

        assertRejected(() -> insert("SSAFY", "same-social-id", "중복후1", "FEMALE", null), 1062);
    }

    @Test
    void 다른_provider라면_같은_식별자를_허용한다() {
        insert("SSAFY", "same-social-id", "다른제공1", "MALE", null);
        insert("NAVER", "same-social-id", "다른제공2", "FEMALE", null);

        User ssafy = users.findByLoginProviderAndProviderUserId(LoginProvider.SSAFY, "same-social-id").orElseThrow();
        User naver = users.findByLoginProviderAndProviderUserId(LoginProvider.NAVER, "same-social-id").orElseThrow();
        assertThat(ssafy.getId()).isNotEqualTo(naver.getId());
    }

    @Test
    void 소셜_식별자는_대소문자를_구분한다() {
        insert("SSAFY", "OpaqueID", "식별자1", "MALE", null);
        insert("SSAFY", "opaqueid", "식별자2", "MALE", null);

        assertThat(users.findByLoginProviderAndProviderUserId(LoginProvider.SSAFY, "OpaqueID").orElseThrow().getId())
                .isNotEqualTo(users.findByLoginProviderAndProviderUserId(LoginProvider.SSAFY, "opaqueid")
                        .orElseThrow().getId());
    }

    @Test
    void 닉네임은_같은_문자열의_중복을_거절한다() {
        insert("SSAFY", "nickname-one", "중복닉", "MALE", null);

        assertRejected(() -> insert("NAVER", "nickname-two", "중복닉", "FEMALE", null), 1062);
    }

    @Test
    void 닉네임은_대소문자를_무시하며_조회와_UNIQUE가_같은_기준을_사용한다() {
        insert("SSAFY", "nickname-case-one", "OnTop", "MALE", null);

        assertThat(users.existsByNickname("ontop")).isTrue();
        assertRejected(() -> insert("NAVER", "nickname-case-two", "ontop", "FEMALE", null), 1062);
        assertThat(jdbc.queryForObject("""
                SELECT COLLATION_NAME FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'nickname'
                """, String.class)).isEqualTo("utf8mb4_0900_as_ci");
        assertThat(jdbc.queryForObject("""
                SELECT CHARACTER_SET_NAME FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'nickname'
                """, String.class)).isEqualTo("utf8mb4");
    }

    @ParameterizedTest
    @ValueSource(strings = {"12345678", "가나다라마바사아"})
    void 여덟_글자_닉네임은_허용한다(String nickname) {
        insert("SSAFY", "eight-character-name", nickname, "MALE", null);

        assertThat(users.existsByNickname(nickname)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"123456789", "가나다라마바사아자"})
    void 아홉_글자_닉네임은_strict_mode에서_거절한다(String nickname) {
        assertRejected(() -> insert("SSAFY", "nine-character-name", nickname, "MALE", null), 1406);
    }

    @ParameterizedTest
    @ValueSource(strings = {"GOOGLE", "ssafy", "NAVER "})
    void 잘못된_login_provider는_CHECK로_거절한다(String provider) {
        assertRejected(() -> insert(provider, "invalid-provider", "제공자검증", "MALE", null), 3819);
    }

    @ParameterizedTest
    @ValueSource(strings = {"OTHER", "male", "FEMALE "})
    void 잘못된_character_gender는_CHECK로_거절한다(String gender) {
        assertRejected(() -> insert("SSAFY", "invalid-gender", "성별검증", gender, null), 3819);
    }

    @Test
    void 정상_사용자는_deleted_at_NULL을_허용한다() {
        insert("NAVER", "active-user", "정상사용자", "FEMALE", null);

        assertThat(users.findByLoginProviderAndProviderUserId(LoginProvider.NAVER, "active-user")
                .orElseThrow().getDeletedAt()).isNull();
    }

    @Test
    void 탈퇴_사용자도_소셜_식별자로_조회하며_닉네임과_소셜키를_계속_예약한다() {
        insert("SSAFY", "withdrawn-user", "탈퇴사용자", "MALE", "2026-10-20 03:04:05.678");

        User withdrawn = users.findByLoginProviderAndProviderUserId(LoginProvider.SSAFY, "withdrawn-user")
                .orElseThrow();
        assertThat(withdrawn.getDeletedAt()).isEqualTo(Instant.parse("2026-10-20T03:04:05.678Z"));
        assertThat(users.existsByNickname("탈퇴사용자")).isTrue();
        assertRejected(() -> insert("NAVER", "other-user", "탈퇴사용자", "FEMALE", null), 1062);
        assertRejected(() -> insert("SSAFY", "withdrawn-user", "새닉네임", "FEMALE", null), 1062);
    }

    @Test
    void JPA_validate가_성공하며_Entity를_왕복_저장한다() {
        User user = users.saveAndFlush(new User(LoginProvider.NAVER, "jpa-user", "매핑검증", CharacterGender.FEMALE));
        entityManager.clear();

        User persisted = users.findByLoginProviderAndProviderUserId(LoginProvider.NAVER, "jpa-user").orElseThrow();

        assertThat(entityManagerFactory.getProperties()).containsEntry("hibernate.hbm2ddl.auto", "validate");
        assertThat(persisted.getId()).isPositive().isEqualTo(user.getId());
        assertThat(persisted.getCharacterGender()).isEqualTo(CharacterGender.FEMALE);
        assertThat(persisted.getNickname()).isEqualTo("매핑검증");
        assertThat(persisted.getCreatedAt()).isEqualTo(persisted.getUpdatedAt()).isEqualTo(user.getCreatedAt());
        assertThat(persisted.getCreatedAt()).isEqualTo(persisted.getCreatedAt().truncatedTo(ChronoUnit.MILLIS));
    }

    @Test
    void JPA_수정은_생성시각과_성별과_소셜키를_보존하고_수정시각을_갱신한다() {
        insert("SSAFY", "immutable-social-id", "수정전닉", "MALE", null);
        jdbc.update("UPDATE users SET created_at = '2026-01-01 00:00:00.123', "
                + "updated_at = '2026-01-01 00:00:00.123' WHERE provider_user_id = 'immutable-social-id'");
        User user = users.findByLoginProviderAndProviderUserId(LoginProvider.SSAFY, "immutable-social-id")
                .orElseThrow();
        // 변경 API를 추가하지 않고 JPA 컬럼의 갱신 제한과 생명주기 콜백을 검증한다.
        ReflectionTestUtils.setField(user, "nickname", "수정후닉");
        ReflectionTestUtils.setField(user, "characterGender", CharacterGender.FEMALE);
        ReflectionTestUtils.setField(user, "loginProvider", LoginProvider.NAVER);
        ReflectionTestUtils.setField(user, "providerUserId", "changed-social-id");

        users.flush();
        entityManager.clear();

        User updated = users.findByLoginProviderAndProviderUserId(LoginProvider.SSAFY, "immutable-social-id")
                .orElseThrow();
        assertThat(updated.getNickname()).isEqualTo("수정후닉");
        assertThat(updated.getCharacterGender()).isEqualTo(CharacterGender.MALE);
        assertThat(updated.getCreatedAt()).isEqualTo(Instant.parse("2026-01-01T00:00:00.123Z"));
        assertThat(updated.getUpdatedAt()).isAfter(updated.getCreatedAt())
                .isEqualTo(updated.getUpdatedAt().truncatedTo(ChronoUnit.MILLIS));
    }

    @Test
    void Flyway_재실행은_V1을_중복_적용하거나_사용자_행을_변경하지_않는다() {
        insert("SSAFY", "migration-retry", "이력검증", "MALE", null);
        Long originalId = users.findByLoginProviderAndProviderUserId(LoginProvider.SSAFY, "migration-retry")
                .orElseThrow().getId();

        assertThat(flyway.migrate().migrationsExecuted).isZero();

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history", Integer.class)).isEqualTo(2);
        entityManager.clear();
        assertThat(users.findByLoginProviderAndProviderUserId(LoginProvider.SSAFY, "migration-retry")
                .orElseThrow().getId()).isEqualTo(originalId);
    }

    private void insert(String provider, String providerUserId, String nickname, String gender, String deletedAt) {
        jdbc.update("""
                INSERT INTO users (login_provider, provider_user_id, nickname, character_gender,
                                   created_at, updated_at, deleted_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), ?)
                """, provider, providerUserId, nickname, gender, deletedAt);
    }

    private void assertRejected(Runnable insertion, int errorCode) {
        assertThatThrownBy(insertion::run).isInstanceOf(DataAccessException.class).satisfies(exception ->
                assertThat(NestedExceptionUtils.getMostSpecificCause(exception))
                        .isInstanceOfSatisfying(SQLException.class,
                                sqlException -> assertThat(sqlException.getErrorCode()).isEqualTo(errorCode)));
    }

    private void assertVarchar(Map<String, Object> column, int length) {
        assertThat(column).containsEntry("DATA_TYPE", "varchar").containsEntry("IS_NULLABLE", "NO");
        assertThat(((Number) column.get("CHARACTER_MAXIMUM_LENGTH")).intValue()).isEqualTo(length);
    }

    private static String requiredEnvironment(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("mysqlTest 필수 환경변수가 없습니다: " + name);
        }
        return value;
    }
}
