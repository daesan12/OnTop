package com.ssafy.ontop.gacha;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class GachaHttpTests {
    private MockMvc http;
    private GachaService service;
    @BeforeEach void setup() {
        service=mock(GachaService.class);
        var beans=new DefaultListableBeanFactory();beans.registerSingleton("gacha",service);
        http=MockMvcBuilders.standaloneSetup(new GachaController(beans.getBeanProvider(GachaService.class))).build();
    }
    @Test void anonymous_is_not_allowed_to_read_inventory() throws Exception {
        http.perform(get("/api/v1/gacha")).andExpect(status().isUnauthorized()); verifyNoInteractions(service);
    }
    @Test void unknown_claimed_awards_and_coerced_grades_are_not_accepted() throws Exception {
        for(String body:new String[]{"{\"operationId\":\"a\",\"grade\":\"1\"}","{\"operationId\":\"a\",\"grade\":1,\"awardedCoins\":5000}"})
            http.perform(post("/api/v1/gacha/boxes/open").principal(()->"42").contentType("application/json").content(body))
                    .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
    @Test void authenticated_owner_and_round_are_passed_without_client_identity() throws Exception {
        http.perform(post("/api/v1/gacha/draws").principal(()->"42").contentType("application/json")
                .content("{\"operationId\":\"draw-1\",\"roundId\":\"7\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        verify(service).draw(42,"draw-1","7");
    }
    @Test void disabled_service_returns_unavailable_instead_of_fake_success() throws Exception {
        var beans=new DefaultListableBeanFactory();
        var unavailable=MockMvcBuilders.standaloneSetup(new GachaController(beans.getBeanProvider(GachaService.class))).build();
        unavailable.perform(get("/api/v1/gacha").principal(()->"42")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("GACHA_NOT_CONFIGURED"));
    }
}
