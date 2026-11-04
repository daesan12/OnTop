package com.ssafy.ontop.operation.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.operation.domain.ServiceOperationMode;
import com.ssafy.ontop.operation.repository.InMemoryServiceOperationStateStore;
import com.ssafy.ontop.operation.service.ServiceOperationService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class NewActivityGateInterceptorTests {
    private static final Instant NOW = Instant.parse("2026-11-04T03:00:00Z");

    private final ServiceOperationService operations = new ServiceOperationService(
            new InMemoryServiceOperationStateStore(), Clock.fixed(NOW, ZoneOffset.UTC));
    private final NewActivityGateInterceptor interceptor =
            new NewActivityGateInterceptor(operations, new ObjectMapper());

    @Test
    void 배출_중에는_새_미니게임만_503으로_막는다() throws Exception {
        operations.update(42, ServiceOperationMode.DRAINING, "경기를 마무리하고 있어요.",
                NOW.plusSeconds(600), 0);
        var start = new MockHttpServletRequest("POST", "/api/v1/minigames/sessions");
        var startResponse = new MockHttpServletResponse();

        assertThat(interceptor.preHandle(start, startResponse, new Object())).isFalse();
        assertThat(startResponse.getStatus()).isEqualTo(503);
        assertThat(startResponse.getContentAsString()).contains("SERVICE_DRAINING", "경기를 마무리하고 있어요.");

        var cooperativeRoom = new MockHttpServletRequest("POST", "/api/v1/minigames/skewer/coop/rooms");
        assertThat(interceptor.preHandle(cooperativeRoom, new MockHttpServletResponse(), new Object())).isFalse();

        var completion = new MockHttpServletRequest("POST", "/api/v1/minigames/sessions/game/complete");
        assertThat(interceptor.preHandle(completion, new MockHttpServletResponse(), new Object())).isTrue();
    }
}
