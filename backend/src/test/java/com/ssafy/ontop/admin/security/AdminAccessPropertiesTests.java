package com.ssafy.ontop.admin.security;

import java.util.Set;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AdminAccessPropertiesTests {
    @Test
    void 지급_관리자는_조회_관리자에도_포함되어야_한다() {
        assertThatThrownBy(() -> new AdminAccessProperties(Set.of(42L), Set.of(43L), null))
                .isInstanceOf(IllegalArgumentException.class);
        var access = new AdminAccessPolicy(new AdminAccessProperties(Set.of(42L, 43L), Set.of(43L), null));
        assertThat(access.canRead(42)).isTrue();
        assertThat(access.canGrant(42)).isFalse();
        assertThat(access.canRead(43)).isTrue();
        assertThat(access.canGrant(43)).isTrue();
        assertThat(access.canOperate(43)).isTrue();
    }

    @Test
    void 설정이_없거나_잘못된_회원_ID는_권한을_만들지_않는다() {
        var access = new AdminAccessPolicy(new AdminAccessProperties(null, null, null));
        assertThat(access.canRead(42)).isFalse();
        assertThat(access.canGrant(42)).isFalse();
        assertThat(access.canOperate(42)).isFalse();
        assertThatThrownBy(() -> new AdminAccessProperties(Set.of(-1L), Set.of(), null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 운영_전환_관리자는_별도로_제한할_수_있다() {
        var access = new AdminAccessPolicy(new AdminAccessProperties(Set.of(42L, 43L), Set.of(43L), Set.of(42L)));

        assertThat(access.canOperate(42)).isTrue();
        assertThat(access.canGrant(42)).isFalse();
        assertThat(access.canOperate(43)).isFalse();
        assertThatThrownBy(() -> new AdminAccessProperties(Set.of(43L), Set.of(43L), Set.of(42L)))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
