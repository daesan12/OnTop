package com.ssafy.ontop.notification;

import com.ssafy.ontop.notification.controller.NotificationRewardController;
import com.ssafy.ontop.notification.service.NotificationRewardService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class NotificationRewardControllerTests {
    private final NotificationRewardService service = mock(NotificationRewardService.class);
    private MockMvc mvc;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void 준비한다() {
        ObjectProvider<NotificationRewardService> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(service);
        mvc = MockMvcBuilders.standaloneSetup(new NotificationRewardController(provider)).build();
    }

    @ParameterizedTest
    @ValueSource(strings = {"null", "[]", "{", "{\"amount\":100}", "{\"userId\":202}", "{\"kind\":\"COIN\"}"})
    void 수령_본문으로_수신자나_수량을_바꾸지_못한다(String body) throws Exception {
        mvc.perform(post("/api/v1/notifications/1/claim").principal(() -> "202")
                .contentType("application/json").content(body)).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "9223372036854775808", "1.5"})
    void 비정상_알림ID를_거절한다(String id) throws Exception {
        mvc.perform(post("/api/v1/notifications/" + id + "/claim").principal(() -> "202"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void 로그인없이_수령하지_못한다() throws Exception {
        mvc.perform(post("/api/v1/notifications/1/claim")).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "1.5", "9007199254740992", "\"1\"", "null"})
    void 발급_수량은_안전한_양의정수여야_한다(String amount) throws Exception {
        String body = "{\"operationId\":\"ac385700-c98e-40d3-93a6-7c5fe2efaeed\",\"userId\":\"202\","
                + "\"kind\":\"COIN\",\"amount\":" + amount + ",\"title\":\"선물\",\"text\":\"감사합니다\","
                + "\"expiresAt\":\"2030-01-01T00:00:00Z\"}";
        mvc.perform(post("/api/v1/admin/wallet-grants/rewards").principal(() -> "101")
                .contentType("application/json").content(body)).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
}
