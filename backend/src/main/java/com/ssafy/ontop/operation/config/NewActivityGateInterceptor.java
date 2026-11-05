package com.ssafy.ontop.operation.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.operation.domain.ServiceOperationState;
import com.ssafy.ontop.operation.service.ServiceOperationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.HandlerInterceptor;

final class NewActivityGateInterceptor implements HandlerInterceptor {
    private static final Set<String> START_PATHS = Set.of(
            "/api/v1/minigames/sessions",
            "/api/v1/minigames/skewer/admissions",
            "/api/v1/minigames/skewer/coop/rooms",
            "/api/v1/minigames/plus-minus/rounds",
            "/api/v1/minigames/rps-roulette/rounds");

    private final ServiceOperationService operations;
    private final ObjectMapper mapper;

    NewActivityGateInterceptor(ServiceOperationService operations, ObjectMapper mapper) {
        this.operations = operations;
        this.mapper = mapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws IOException {
        if (!request.getMethod().equals("POST") || !START_PATHS.contains(request.getRequestURI())) {
            return true;
        }
        ServiceOperationState state = operations.current();
        if (state.allowsNewActivity()) {
            return true;
        }
        response.setStatus(503);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-store");
        mapper.writeValue(response.getOutputStream(), new AuthErrorResponse(
                "SERVICE_" + state.mode().name(), state.notice()));
        return false;
    }
}
