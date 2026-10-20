package com.ssafy.ontop.user.domain;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

class UserTests {

    @Test
    void 생성자는_온보딩_정보를_보관하며_DB저장_전에는_ID와_시각이_없다() {
        User user = new User(LoginProvider.SSAFY, "provider-user", "온탑1", CharacterGender.MALE);

        assertThat(user.getId()).isNull();
        assertThat(user.getLoginProvider()).isEqualTo(LoginProvider.SSAFY);
        assertThat(user.getProviderUserId()).isEqualTo("provider-user");
        assertThat(user.getNickname()).isEqualTo("온탑1");
        assertThat(user.getCharacterGender()).isEqualTo(CharacterGender.MALE);
        assertThat(user.getCreatedAt()).isNull();
        assertThat(user.getUpdatedAt()).isNull();
        assertThat(user.getDeletedAt()).isNull();
    }

    @Test
    void 최초_저장_시각은_같은_밀리초_정밀도의_Instant다() {
        User user = new User(LoginProvider.NAVER, "provider-user", "온탑2", CharacterGender.FEMALE);

        user.initializeTimestamps();

        assertThat(user.getCreatedAt()).isNotNull().isEqualTo(user.getUpdatedAt());
        assertThat(user.getCreatedAt()).isEqualTo(user.getCreatedAt().truncatedTo(ChronoUnit.MILLIS));
    }

    @Test
    void 수정시각_갱신은_생성시각을_변경하지_않는다() {
        User user = new User(LoginProvider.NAVER, "provider-user", "온탑3", CharacterGender.FEMALE);
        user.initializeTimestamps();
        Instant createdAt = user.getCreatedAt();
        ReflectionTestUtils.setField(user, "updatedAt", Instant.EPOCH);

        user.updateTimestamp();

        assertThat(user.getCreatedAt()).isEqualTo(createdAt);
        assertThat(user.getUpdatedAt()).isAfter(Instant.EPOCH)
                .isEqualTo(user.getUpdatedAt().truncatedTo(ChronoUnit.MILLIS));
    }
}
