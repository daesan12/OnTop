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
    @Test void ticket_quantity_null_or_missing_is_one_ticket_and_only_whole_numbers_pass() throws Exception {
        for(String body:new String[]{"{\"operationId\":\"buy-1\"}","{\"operationId\":\"buy-1\",\"quantity\":null}"})
            http.perform(post("/api/v1/gacha/tickets").principal(()->"42").contentType("application/json").content(body))
                    .andExpect(status().isOk());
        verify(service,times(2)).purchase(42,"buy-1");
        http.perform(post("/api/v1/gacha/tickets").principal(()->"42").contentType("application/json")
                .content("{\"operationId\":\"buy-3\",\"quantity\":3}")).andExpect(status().isOk());
        verify(service).purchase(42,"buy-3",3);
        for(String quantity:new String[]{"\"3\"","1.5","true","99999999999"})
            http.perform(post("/api/v1/gacha/tickets").principal(()->"42").contentType("application/json")
                    .content("{\"operationId\":\"bad\",\"quantity\":"+quantity+"}")).andExpect(status().isBadRequest());
        verify(service,never()).purchase(eq(42L),eq("bad"));
        verify(service,never()).purchase(eq(42L),eq("bad"),anyInt());
    }
    @Test void disabled_service_returns_unavailable_instead_of_fake_success() throws Exception {
        var beans=new DefaultListableBeanFactory();
        var unavailable=MockMvcBuilders.standaloneSetup(new GachaController(beans.getBeanProvider(GachaService.class))).build();
        unavailable.perform(get("/api/v1/gacha").principal(()->"42")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("GACHA_NOT_CONFIGURED"));
    }
    @Test void refill_rejection_is_definitive_and_read_state_contains_shared_time() throws Exception {
        doThrow(new GachaException(409,"GACHA_REFILLING","캡슐을 채우고 있어요. 뽑기권은 사용하지 않았어요."))
                .when(service).draw(42,"during-refill","2");
        http.perform(post("/api/v1/gacha/draws").principal(()->"42").contentType("application/json")
                .content("{\"operationId\":\"during-refill\",\"roundId\":\"2\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("GACHA_REFILLING"));
        var now=java.time.Instant.parse("2026-11-07T10:00:00Z");
        when(service.state(42)).thenReturn(new GachaDtos.State(true,100,
                new GachaDtos.Machine("2",1,30,java.util.List.of(),now.plusSeconds(3)),null,java.util.List.of(),now));
        http.perform(get("/api/v1/gacha").principal(()->"42")).andExpect(status().isOk())
                .andExpect(jsonPath("$.machine.refillEndsAt").exists()).andExpect(jsonPath("$.serverNow").exists());
    }
}
