package com.ssafy.ontop.table;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {"spring.profiles.active=local,visual-test", "ontop.websocket.authenticated=true"})
@AutoConfigureMockMvc
class DevWorldAuthenticatedTests {

    @Autowired
    private MockMvc mvc;

    @Test
    void 인증_모드에서는_개발_채널_설정을_노출하지_않는다() throws Exception {
        mvc.perform(get("/dev/world-config")).andExpect(status().isNotFound());
    }
}
