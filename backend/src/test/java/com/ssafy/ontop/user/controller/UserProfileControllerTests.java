package com.ssafy.ontop.user.controller;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.dto.UserProfileResponse;
import com.ssafy.ontop.user.service.UserProfileService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class UserProfileControllerTests {

    private final UserProfileService service = mock(UserProfileService.class);
    private final UserProfileController controller = new UserProfileController(service);

    @Test
    void Principal의_내부_ID를_사용하고_프로필_응답은_캐시하지_않는다() {
        var profile = new UserProfileResponse(42, "미지", CharacterGender.FEMALE);
        when(service.findProfile(42)).thenReturn(profile);
        var result = controller.me(new AuthenticatedUser(42, LoginProvider.SSAFY, TestLoginSessions.ID));

        assertThat(result.getStatusCode().value()).isEqualTo(200);
        assertThat(result.getBody()).isEqualTo(profile);
        assertThat(result.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(result.getHeaders().getFirst("Referrer-Policy")).isEqualTo("no-referrer");
        verify(service).findProfile(42);
    }

    @Test
    void Principal이_없으면_조회하지_않는다() {
        assertThatThrownBy(() -> controller.me(null)).isInstanceOfSatisfying(
                RestAuthenticationException.class,
                failure -> assertThat(failure.error()).isEqualTo(RestAuthenticationException.Error.REQUIRED));
        verifyNoInteractions(service);
    }
}
