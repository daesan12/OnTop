package com.ssafy.ontop.operation.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.mole.controller.MoleController;
import com.ssafy.ontop.game.plusminus.controller.PlusMinusController;
import com.ssafy.ontop.game.rpsroulette.controller.RpsRouletteController;
import com.ssafy.ontop.game.skewer.coop.controller.SkewerCoopController;
import com.ssafy.ontop.minigame.controller.MinigameController;
import com.ssafy.ontop.operation.domain.ServiceOperationMode;
import com.ssafy.ontop.operation.repository.InMemoryServiceOperationStateStore;
import com.ssafy.ontop.operation.repository.ServiceOperationStateStore;
import com.ssafy.ontop.operation.service.ServiceOperationService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;

import static org.assertj.core.api.Assertions.assertThat;

class NewActivityGateInterceptorTests {
    private static final Instant NOW = Instant.parse("2026-11-04T03:00:00Z");

    private final ServiceOperationService operations = new ServiceOperationService(
            new InMemoryServiceOperationStateStore(), Clock.fixed(NOW, ZoneOffset.UTC));
    private final NewActivityGateInterceptor interceptor =
            new NewActivityGateInterceptor(operations, new ObjectMapper());

    @Test
    void 배출_중에는_표시된_새_활동만_503으로_막는다() throws Exception {
        operations.update(42, ServiceOperationMode.DRAINING, "경기를 마무리하고 있어요.",
                NOW.plusSeconds(600), 0);
        var start = new MockHttpServletRequest("POST", "/api/v1/minigames/sessions");
        var startResponse = new MockHttpServletResponse();

        assertThat(interceptor.preHandle(start, startResponse, handler("start"))).isFalse();
        assertThat(startResponse.getStatus()).isEqualTo(503);
        assertThat(startResponse.getContentType()).isEqualTo("application/json;charset=UTF-8");
        assertThat(startResponse.getContentAsString()).contains("SERVICE_DRAINING", "경기를 마무리하고 있어요.");

        var completion = new MockHttpServletRequest("POST", "/api/v1/minigames/sessions/game/complete");
        assertThat(interceptor.preHandle(completion, new MockHttpServletResponse(), handler("complete"))).isTrue();
    }

    @Test
    void 정상_운영에서는_새_활동을_허용한다() throws Exception {
        assertThat(interceptor.preHandle(new MockHttpServletRequest("POST", "/start"),
                new MockHttpServletResponse(), handler("start"))).isTrue();
    }

    @Test
    void 운영_상태를_읽지_못하면_새_활동을_안전하게_막는다() throws Exception {
        ServiceOperationStateStore failingStore = new ServiceOperationStateStore() {
            @Override
            public com.ssafy.ontop.operation.domain.ServiceOperationState load() {
                throw new DataRetrievalFailureException("operation state unavailable");
            }

            @Override
            public boolean update(com.ssafy.ontop.operation.domain.ServiceOperationState state, long expectedVersion) {
                return false;
            }
        };
        var failing = new NewActivityGateInterceptor(
                new ServiceOperationService(failingStore, Clock.fixed(NOW, ZoneOffset.UTC)), new ObjectMapper());
        var response = new MockHttpServletResponse();

        assertThat(failing.preHandle(new MockHttpServletRequest("POST", "/start"), response,
                handler("start"))).isFalse();
        assertThat(response.getStatus()).isEqualTo(503);
        assertThat(response.getContentAsString()).contains("SERVICE_OPERATION_UNAVAILABLE");
    }

    @Test
    void 모든_게임_시작_컨트롤러가_새_활동으로_표시된다() {
        assertNewActivity(MinigameController.class, "start");
        assertNewActivity(MoleController.class, "start");
        assertNewActivity(PlusMinusController.class, "start");
        assertNewActivity(RpsRouletteController.class, "start");
        assertNewActivity(SkewerCoopController.class, "enter");
    }

    private static HandlerMethod handler(String name) throws NoSuchMethodException {
        return new HandlerMethod(new TestHandler(), TestHandler.class.getDeclaredMethod(name));
    }

    private static void assertNewActivity(Class<?> controller, String methodName) {
        assertThat(Arrays.stream(controller.getDeclaredMethods())
                .filter(method -> method.getName().equals(methodName))
                .anyMatch(method -> method.isAnnotationPresent(NewActivity.class))).isTrue();
    }

    private static final class TestHandler {
        @NewActivity
        void start() {
        }

        void complete() {
        }
    }
}
