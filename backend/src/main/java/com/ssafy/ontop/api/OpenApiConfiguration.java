package com.ssafy.ontop.api;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.boot.info.BuildProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile("(local | dev) & !prod & !production")
public class OpenApiConfiguration {

    @Bean
    OpenAPI ontopOpenApi(BuildProperties build) {
        return new OpenAPI().info(new Info().title("OnTop API")
                .description("OnTop REST API Documentation").version(build.getVersion()))
                // 상대 주소는 현재 로컬/개발 서버와 프록시 외부 주소를 그대로 사용한다.
                .addServersItem(new Server().url("/").description("현재 문서 서버 (local/dev)"))
                .components(new Components()
                        .addSecuritySchemes("AccessJwt", bearer("JWT",
                                "30분 Access JWT. 서명/Issuer/Audience/typ/token_use/만료 및 sid·활성 회원 검증. "
                                        + "로그아웃한 로그인 계열·탈퇴 회원은 거절합니다."))
                        .addSecuritySchemes("OnboardingBearer", bearer("opaque",
                                "89번 교환 API의 ob_ 온보딩 전용 Bearer. 독립 인증·600초. "
                                        + "온보딩/닉네임 조회만 가능하며 조회는 소비하지 않습니다. Access JWT가 아닙니다."))
                        .addSecuritySchemes("RefreshCookie", new SecurityScheme().type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.COOKIE).name("ONTOP_REFRESH")
                                .description("HttpOnly Refresh 쿠키. Origin 필수. 브라우저는 Cookie 헤더를 임의로 설정할 수 "
                                        + "없으므로 Authorize 입력으로 쿠키를 만들 수 없습니다. 실제 로그인으로 발급받습니다."))
                        .addSecuritySchemes("OAuthSession", new SecurityScheme().type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.COOKIE).name("JSESSIONID")
                                .description("인가 시작에서 생성된 동일 OAuth HttpSession. callback의 state와 "
                                        + "exchangeCode에 결합됩니다. 교환 성공 시 세션 ID가 회전합니다.")));
    }

    private SecurityScheme bearer(String format, String description) {
        return new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer")
                .bearerFormat(format).description(description);
    }
}
