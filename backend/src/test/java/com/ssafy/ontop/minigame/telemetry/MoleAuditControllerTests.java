package com.ssafy.ontop.minigame.telemetry;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.user.domain.LoginProvider;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class MoleAuditControllerTests {
    private final AuthenticatedUser user = new AuthenticatedUser(101L, LoginProvider.NAVER, TestLoginSessions.ID);
    private final MoleAuditDtos.Batch batch = new MoleAuditDtos.Batch(List.of());

    @Test
    void 관측_서비스의_런타임_실패는_서버에서_처리한다() {
        var audits = audits();
        var audit = mock(MoleAuditService.class);
        when(audits.getIfAvailable()).thenReturn(audit);
        doThrow(new IllegalStateException("observation unavailable")).when(audit)
                .receive(eq(MoleAuditGame.MOLE), eq(456L), eq(101L), eq(batch.taps()), any());
        var controller = new MoleAuditController(audits);

        var response = controller.observe(user, "whack-a-mole", 456L, batch);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
    }

    @Test
    void 지원하지_않는_게임은_관측_실패로_숨기지_않는다() {
        var audits = audits();
        var controller = new MoleAuditController(audits);

        assertThatThrownBy(() -> controller.observe(user, "other-game", 456L, batch))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
        verifyNoInteractions(audits);
    }

    @SuppressWarnings("unchecked")
    private static ObjectProvider<MoleAuditService> audits() {
        return mock(ObjectProvider.class);
    }
}
