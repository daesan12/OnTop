package com.ssafy.ontop.raffle.controller;

import com.ssafy.ontop.raffle.dto.CurrentRaffleResponse;
import com.ssafy.ontop.raffle.dto.RafflePurchaseResponse;
import com.ssafy.ontop.raffle.service.RaffleService;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class RaffleControllerTests {
    private RaffleService service;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        service = mock(RaffleService.class);
        var beans = new StaticListableBeanFactory();
        beans.addBean("raffleService", service);
        mvc = MockMvcBuilders.standaloneSetup(
                new RaffleController(beans.getBeanProvider(RaffleService.class))).build();
    }

    @Test
    void 현재_응모권은_본인의_주차와_잔액을_캐시하지_않고_반환한다() throws Exception {
        when(service.current(7)).thenReturn(new CurrentRaffleResponse(3, LocalDate.of(2026, 11, 2), "OPEN",
                Instant.parse("2026-11-02T00:00:00Z"), Instant.parse("2026-11-08T15:00:00Z"),
                100, 10, 0, 10, 500, 100, 400, List.of()));

        mvc.perform(get("/api/v1/raffles/current").principal(() -> "7"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.roundId").value(3))
                .andExpect(jsonPath("$.availableBalance").value(400))
                .andExpect(jsonPath("$.remainingCount").value(10));

        verify(service).current(7);
    }

    @Test
    void 유효한_멱등키로_응모권_한_장을_구매한다() throws Exception {
        when(service.purchase(7, "request-1")).thenReturn(new RafflePurchaseResponse(
                13, 3, 3140, 100, Instant.parse("2026-11-02T00:30:00Z"), 400, 1, 9));

        mvc.perform(post("/api/v1/raffles/current/tickets")
                        .principal(() -> "7").header("Idempotency-Key", "request-1"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.ticketId").value(13))
                .andExpect(jsonPath("$.ticketNumber").value(3140))
                .andExpect(jsonPath("$.balanceAfter").value(400));

        verify(service).purchase(7, "request-1");
    }

    @Test
    void 멱등키가_없거나_여러_개면_구매를_거절한다() throws Exception {
        mvc.perform(post("/api/v1/raffles/current/tickets").principal(() -> "7"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        mvc.perform(post("/api/v1/raffles/current/tickets").principal(() -> "7")
                        .header("Idempotency-Key", "request-1", "request-2"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }
}
