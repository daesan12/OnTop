package com.ssafy.ontop.auth.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "spring.profiles.active=local")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class RestConfigurationTests {
    @Autowired
    private MockMvc mvc;

    @DynamicPropertySource
    static void invalidConfiguration(DynamicPropertyRegistry registry) {
        registry.add("ontop.auth.jwt-secret-base64", () -> "");
        registry.add("ontop.auth.allowed-origins", () -> "*");
    }

    @Test
    void 키가_없어도_기본개발은_시작하고_인증은_기본키_없이_안전하게_실패한다() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
        String response = mvc.perform(get("/api/v1/tables").header("Authorization", "Bearer a.b.c"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("AUTH_TOKEN_CONFIGURATION_ERROR"))
                .andReturn().getResponse().getContentAsString();

        assertThat(response).doesNotContain("secret", "base64", "a.b.c", "Exception");
    }

    @Test
    void 와일드카드_CORS_설정은_공개_허용으로_변환하지_않는다() throws Exception {
        mvc.perform(options("/api/v1/tables").header("Origin", "http://localhost:8080")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("AUTH_TOKEN_CONFIGURATION_ERROR"));
    }
}
