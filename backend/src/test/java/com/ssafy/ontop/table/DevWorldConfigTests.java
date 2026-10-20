package com.ssafy.ontop.table;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "spring.profiles.active=local,visual-test")
@AutoConfigureMockMvc
class DevWorldConfigTests {

    @Autowired
    private MockMvc mvc;

    @Test
    void 개발_설정은_샘플_채널과_간격만_제공하고_정식_채널_인증은_유지한다() throws Exception {
        mvc.perform(get("/dev/world-config")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.channels.length()").value(2))
                .andExpect(jsonPath("$.channels[0].channelId").value("visual-a"))
                .andExpect(jsonPath("$.channels[0].currentUsers").doesNotExist())
                .andExpect(jsonPath("$.channels[0].userIds").doesNotExist())
                .andExpect(jsonPath("$.movementIntervalMs").value(100))
                .andExpect(jsonPath("$.chatIntervalMs").value(1000))
                .andExpect(jsonPath("$.emoteCodes.length()").value(2))
                .andExpect(jsonPath("$.emoteCodes[0]").value("WAVE"))
                .andExpect(jsonPath("$.emoteCodes[1]").value("CLAP"))
                .andExpect(jsonPath("$.emoteIntervalMs").value(1000));
        mvc.perform(get("/api/v1/channels")).andExpect(status().isUnauthorized());
    }
}
