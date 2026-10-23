package com.ssafy.ontop.wallet;

import com.ssafy.ontop.OntopApplication;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import jakarta.persistence.EntityManagerFactory;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.core.env.MapPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("mysql")
class WalletPersistenceProfilesMySqlTests {

    @ParameterizedTest
    @ValueSource(strings = {"", "local", "dev", "db", "local,db", "dev,db"})
    void 기본_local_dev는_DB없이_실행하고_db를_조합하면_상점없이_지갑을_등록한다(String profiles) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("프로필 검증도 격리 MySQL DB만 사용합니다.");
        }
        var builder = new SpringApplicationBuilder(OntopApplication.class).web(WebApplicationType.SERVLET)
                .initializers(context -> context.getEnvironment().getPropertySources().addFirst(
                        new MapPropertySource("wallet-profile-fixture", Map.of(
                                "spring.datasource.url", url,
                                "spring.datasource.username", System.getenv("TEST_DB_USERNAME"),
                                "spring.datasource.password", System.getenv("TEST_DB_PASSWORD"),
                                "ontop.shop.enabled", "false",
                                "server.address", "127.0.0.1",
                                "server.port", "0",
                                "logging.level.root", "WARN"))));
        try (var context = builder.run("--spring.profiles.active=" + profiles)) {
            if (profiles.contains("db")) {
                assertThat(context.getBean(EntityManagerFactory.class).getMetamodel().getEntities())
                        .extracting(entity -> entity.getJavaType().getName())
                        .contains(Wallet.class.getName(), WalletTransaction.class.getName());
                assertThat(context.getBeansOfType(WalletRepository.class)).hasSize(1);
            } else {
                assertThat(context.getBeansOfType(EntityManagerFactory.class)).isEmpty();
                assertThat(context.getBeansOfType(WalletRepository.class)).isEmpty();
            }
        }
    }
}
