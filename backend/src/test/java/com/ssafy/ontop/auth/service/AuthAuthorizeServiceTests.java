package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.config.OAuthProperties;
import com.ssafy.ontop.auth.exception.AuthAuthorizeException;
import java.net.URI;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AuthAuthorizeServiceTests {

    @ParameterizedTest
    @MethodSource("callbackCases")
    void 프로필과_callback_scheme에_따라_인가_요청을_허용하거나_안전하게_거절한다(
            String provider, String profiles, String origin, boolean allowed) {
        MockEnvironment environment = new MockEnvironment();
        if (!profiles.isEmpty()) {
            environment.setActiveProfiles(profiles.split(","));
        }
        OAuthProperties properties = new OAuthProperties(
                new OAuthProperties.Client("ssafy-test-client", origin + "/api/v1/auth/ssafy/callback"),
                new OAuthProperties.Client("naver-test-client", origin + "/api/v1/auth/naver/callback"));
        AuthAuthorizeService service = new AuthAuthorizeService(properties, new NaverStateStore(), environment);
        MockHttpServletRequest request = new MockHttpServletRequest();

        if (allowed) {
            URI authorization = service.authorize(provider, request);

            assertThat(authorization.getScheme()).isEqualTo("https");
            assertThat(authorization.getHost()).isEqualTo(
                    "naver".equals(provider) ? "nid.naver.com" : "project.ssafy.com");
        } else {
            assertThatThrownBy(() -> service.authorize(provider, request))
                    .isInstanceOfSatisfying(AuthAuthorizeException.class, exception -> {
                        assertThat(exception.status()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
                        assertThat(exception.code()).isEqualTo("AUTH_CONFIGURATION_ERROR");
                        assertThat(exception.getMessage()).isEqualTo("소셜 로그인 설정을 확인해 주세요.");
                        assertThat(exception.getCause()).isNull();
                    });
            assertThat(request.getSession(false)).isNull();
        }
    }

    private static Stream<Arguments> callbackCases() {
        return Stream.of("ssafy", "naver").flatMap(provider -> Stream.concat(
                Stream.of("local", "local,db").flatMap(profile -> Stream.of(
                        Arguments.of(provider, profile, "http://localhost:8080", true),
                        Arguments.of(provider, profile, "http://127.0.0.1:8080", true),
                        Arguments.of(provider, profile, "http://[::1]:8080", true),
                        Arguments.of(provider, profile, "https://backend.example.test", true),
                        Arguments.of(provider, profile, "http://backend.example.test", false),
                        Arguments.of(provider, profile, "http://localhost.attacker.test", false),
                        Arguments.of(provider, profile, "ftp://localhost", false))),
                Stream.of("", "dev", "test", "db", "prod").flatMap(profile -> Stream.of(
                        Arguments.of(provider, profile, "https://backend.example.test", true),
                        Arguments.of(provider, profile, "https://localhost", true),
                        Arguments.of(provider, profile, "http://localhost:8080", false),
                        Arguments.of(provider, profile, "http://127.0.0.1:8080", false),
                        Arguments.of(provider, profile, "http://[::1]:8080", false),
                        Arguments.of(provider, profile, "http://backend.example.test", false),
                        Arguments.of(provider, profile, "ftp://localhost", false)))));
    }
}
