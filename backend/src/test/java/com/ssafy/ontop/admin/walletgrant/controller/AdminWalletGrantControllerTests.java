package com.ssafy.ontop.admin.walletgrant.controller;

import com.ssafy.ontop.admin.walletgrant.AdminWalletGrantException;
import com.ssafy.ontop.admin.walletgrant.dto.AdminWalletGrantExecuteRequest;
import com.ssafy.ontop.admin.walletgrant.dto.AdminWalletGrantExecuteResponse;
import com.ssafy.ontop.admin.walletgrant.dto.AdminWalletGrantPreviewRequest;
import com.ssafy.ontop.admin.walletgrant.dto.AdminWalletGrantPreviewResponse;
import com.ssafy.ontop.admin.walletgrant.service.AdminWalletGrantService;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AdminWalletGrantControllerTests {
    private static final UUID REQUEST_ID = UUID.fromString("378eb951-f173-4ca2-bdfc-eb291054777f");
    private AdminWalletGrantService service;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        service = mock(AdminWalletGrantService.class);
        var beans = new StaticListableBeanFactory();
        beans.addBean("adminWalletGrantService", service);
        mvc = MockMvcBuilders.standaloneSetup(
                new AdminWalletGrantController(beans.getBeanProvider(AdminWalletGrantService.class))).build();
    }

    @Test
    void 미리보기는_대상_인원과_총액을_캐시하지_않고_반환한다() throws Exception {
        when(service.preview(7, new AdminWalletGrantPreviewRequest(100, "출시 기념")))
                .thenReturn(new AdminWalletGrantPreviewResponse(100, "출시 기념", 3, 0, 300, true));

        mvc.perform(post("/api/v1/admin/wallet-grants/preview")
                        .principal(() -> "7")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountPerMember\":100,\"reason\":\"출시 기념\"}"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.recipientCount").value(3))
                .andExpect(jsonPath("$.totalAmount").value(300))
                .andExpect(jsonPath("$.executable").value(true));
    }

    @Test
    void 실행은_요청_ID와_미리보기_인원을_서비스에_전달한다() throws Exception {
        var request = new AdminWalletGrantExecuteRequest(REQUEST_ID, 100, "출시 기념", 3);
        when(service.execute(7, request)).thenReturn(new AdminWalletGrantExecuteResponse(
                21, REQUEST_ID, 100, "출시 기념", 3, 300, Instant.parse("2026-11-03T08:00:00Z")));

        mvc.perform(post("/api/v1/admin/wallet-grants")
                        .principal(() -> "7")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"requestId":"378eb951-f173-4ca2-bdfc-eb291054777f",
                                 "amountPerMember":100,"reason":"출시 기념","expectedRecipientCount":3}
                                """))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.batchId").value(21))
                .andExpect(jsonPath("$.totalAmount").value(300));

        verify(service).execute(7, request);
    }

    @Test
    void 지급_충돌은_409와_업무_오류_코드로_반환한다() throws Exception {
        var request = new AdminWalletGrantExecuteRequest(REQUEST_ID, 100, "출시 기념", 3);
        when(service.execute(7, request)).thenThrow(new AdminWalletGrantException(
                409, "ADMIN_WALLET_GRANT_TARGET_CHANGED", "미리보기를 다시 확인해주세요."));

        mvc.perform(post("/api/v1/admin/wallet-grants")
                        .principal(() -> "7")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"requestId":"378eb951-f173-4ca2-bdfc-eb291054777f",
                                 "amountPerMember":100,"reason":"출시 기념","expectedRecipientCount":3}
                                """))
                .andExpect(status().isConflict())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.code").value("ADMIN_WALLET_GRANT_TARGET_CHANGED"));
    }
}
