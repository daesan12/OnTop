package com.ssafy.ontop.auth.controller;

import com.ssafy.ontop.auth.client.OAuthProviderClient;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.exception.AuthCallbackException;
import com.ssafy.ontop.auth.service.AuthUserStateService;
import com.ssafy.ontop.user.repository.UserRepository;
import jakarta.persistence.EntityManagerFactory;
import javax.sql.DataSource;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.ApplicationContext;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.util.UriComponentsBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ActiveProfiles("local")
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
@SpringBootTest(properties = {
        "ontop.oauth.ssafy.client-id=fixture-ssafy",
        "ontop.oauth.ssafy.redirect-uri=http://localhost:8080/api/v1/auth/ssafy/callback",
        "ontop.oauth.naver.client-id=fixture-naver",
        "ontop.oauth.naver.redirect-uri=http://localhost:8080/api/v1/auth/naver/callback",
        "ontop.oauth.frontend-callback-uri="
})
class AuthDatabaseProfileTests {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ApplicationContext context;

    @MockitoBean
    private OAuthProviderClient providerClient;

    @ParameterizedTest
    @EnumSource(OAuthProvider.class)
    void local만_활성화하면_민감정보_없는_진단_로그와_503을_반환하고_공급자는_호출하지_않는다(
            OAuthProvider provider, CapturedOutput output) throws Exception {
        assertThat(context.getEnvironment().getActiveProfiles()).containsExactly("local");
        assertThat(context.getBeansOfType(AuthUserStateService.class)).isEmpty();
        assertThat(context.getBeansOfType(UserRepository.class)).isEmpty();
        assertThat(context.getBeansOfType(DataSource.class)).isEmpty();
        assertThat(context.getBeansOfType(EntityManagerFactory.class)).isEmpty();
        MockHttpSession session = new MockHttpSession(null, "fixture-private-session-" + provider.path());
        MvcResult authorize = mvc.perform(get("/api/v1/auth/{provider}/authorize", provider.path()).session(session))
                .andExpect(status().isFound()).andReturn();
        String state = UriComponentsBuilder.fromUriString(authorize.getResponse().getHeader("Location"))
                .build().getQueryParams().getFirst("state");
        int logStart = output.getAll().length();

        MvcResult callback = mvc.perform(get("/api/v1/auth/{provider}/callback", provider.path()).session(session)
                        .param("state", state).param("code", "fixture-code"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("AUTH_DATABASE_UNAVAILABLE"))
                .andExpect(jsonPath("$.message").value("회원 상태를 확인할 수 없습니다."))
                .andReturn();

        assertThat(callback.getResolvedException()).isInstanceOfSatisfying(AuthCallbackException.class, exception -> {
            assertThat(exception.error()).isEqualTo(AuthCallbackException.Error.DATABASE_UNAVAILABLE);
            assertThat(exception.getCause()).isNull();
        });
        String callbackLogs = output.getAll().substring(logStart);
        assertThat(callbackLogs).contains("reason=USER_STATE_SERVICE_MISSING", "required_profile=db")
                .doesNotContain("fixture-code", state, session.getId(), "client_secret", "providerUserId",
                        AuthCallbackException.class.getName());
        verifyNoInteractions(providerClient);
    }
}
