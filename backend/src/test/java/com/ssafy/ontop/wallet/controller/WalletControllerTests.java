package com.ssafy.ontop.wallet.controller;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.wallet.dto.WalletBalanceResponse;
import com.ssafy.ontop.wallet.service.WalletQueryService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class WalletControllerTests {

    private final WalletQueryService service = mock(WalletQueryService.class);
    private final WalletController controller = new WalletController(service);

    @Test
    void Principal의_ID로만_조회하고_캐시를_방지한다() {
        var balance = new WalletBalanceResponse(100, 30, 70);
        when(service.findBalance(42)).thenReturn(balance);

        var result = controller.me(new AuthenticatedUser(42, LoginProvider.SSAFY, TestLoginSessions.ID));

        assertThat(result.getStatusCode().value()).isEqualTo(200);
        assertThat(result.getBody()).isEqualTo(balance);
        assertThat(result.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(result.getHeaders().getFirst("Referrer-Policy")).isEqualTo("no-referrer");
        verify(service).findBalance(42);
    }

    @Test
    void Principal없이는_조회하지_않는다() {
        assertThatThrownBy(() -> controller.me(null)).isInstanceOfSatisfying(RestAuthenticationException.class,
                failure -> assertThat(failure.error()).isEqualTo(RestAuthenticationException.Error.REQUIRED));
        verifyNoInteractions(service);
    }
}
