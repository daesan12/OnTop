package com.ssafy.ontop.auth.security;

import com.ssafy.ontop.auth.service.AccessJwtService;
import java.security.SecureRandom;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "spring.profiles.active=local")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@org.springframework.test.context.TestPropertySource(properties = "ontop.websocket.authenticated=false")
class RestWithoutDatabaseTests {
    @Autowired
    private MockMvc mvc;
    @Autowired
    private AccessJwtService jwt;
    @Autowired
    private ApplicationContext context;

    @DynamicPropertySource
    static void key(DynamicPropertyRegistry registry) {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        String encoded = Base64.getEncoder().encodeToString(key);
        registry.add("ontop.auth.jwt-secret-base64", () -> encoded);
    }

    @Test
    void DB없는_개발실행은_유지하되_보호_REST는_활성회원_확인없이_통과하지_않는다() throws Exception {
        assertThat(context.getBeansOfType(javax.sql.DataSource.class)).isEmpty();
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
        boolean localPageExists = new org.springframework.core.io.ClassPathResource("dev/tables.html").exists();
        mvc.perform(get("/dev/tables")).andExpect(status().is(localPageExists ? 200 : 404));
        mvc.perform(get("/api/v1/tables")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/tables").header("Authorization", "Bearer " + jwt.issue(42, TestLoginSessions.ID)))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("AUTH_MEMBER_LOOKUP_UNAVAILABLE"));
    }
}
