package com.ssafy.ontop.notification;

import com.ssafy.ontop.notification.controller.NotificationController;
import com.ssafy.ontop.notification.dto.NotificationListResponse;
import com.ssafy.ontop.notification.service.NotificationService;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class NotificationControllerTests {
    private final NotificationService service = mock(NotificationService.class);
    private MockMvc mvc;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void 준비한다() {
        ObjectProvider<NotificationService> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(service);
        mvc = MockMvcBuilders.standaloneSetup(new NotificationController(provider)).build();
    }

    @ParameterizedTest
    @ValueSource(strings = {"?cursor=-1", "?cursor=9223372036854775808", "?limit=0", "?limit=51", "?limit=1.5"})
    void 페이지_범위와_정수_형식을_검사한다(String query) throws Exception {
        mvc.perform(get("/api/v1/notifications" + query).principal(() -> "202")).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "null", "[]", "{", "{\"operationId\":\"bad\",\"text\":\"답변\",\"status\":\"RESOLVED\",\"expectedVersion\":0}",
            "{\"operationId\":\"ac385700-c98e-40d3-93a6-7c5fe2efaeed\",\"text\":\"답변\",\"status\":\"BAD\",\"expectedVersion\":0}",
            "{\"operationId\":\"ac385700-c98e-40d3-93a6-7c5fe2efaeed\",\"text\":\"답변\",\"status\":\"RESOLVED\",\"expectedVersion\":0,\"userId\":303}"})
    void 답변_잘못된_본문과_수신자_위조는_거절한다(String body) throws Exception {
        mvc.perform(post("/api/v1/admin/operations/feedback/1/replies").principal(() -> "101")
                .contentType("application/json").content(body)).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void 목록은_인증된_본인만_사용한다() throws Exception {
        mvc.perform(get("/api/v1/notifications")).andExpect(status().isUnauthorized());
        when(service.list(anyLong(), anyLong(), anyInt())).thenReturn(new NotificationListResponse(List.of(), null, 0));
        mvc.perform(get("/api/v1/notifications").principal(() -> "202")).andExpect(status().isOk());
    }
}
