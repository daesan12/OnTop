package com.ssafy.ontop.operation.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.operation.domain.ServiceOperationState;
import com.ssafy.ontop.operation.service.ServiceOperationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.MediaType;
import org.springframework.transaction.TransactionException;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

final class NewActivityGateInterceptor implements HandlerInterceptor {
    private final ServiceOperationService operations;
    private final ObjectMapper mapper;

    NewActivityGateInterceptor(ServiceOperationService operations, ObjectMapper mapper) {
        this.operations = operations;
        this.mapper = mapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws IOException {
        if (!(handler instanceof HandlerMethod method) || !method.hasMethodAnnotation(NewActivity.class)) {
            return true;
        }
        ServiceOperationState state;
        try {
            state = operations.current();
        } catch (DataAccessException | TransactionException exception) {
            reject(response, "SERVICE_OPERATION_UNAVAILABLE", "운영 상태를 확인하고 있어요. 잠시 후 다시 시도해주세요.");
            return false;
        }
        if (state.allowsNewActivity()) {
            return true;
        }
        reject(response, "SERVICE_" + state.mode().name(), state.notice());
        return false;
    }

    private void reject(HttpServletResponse response, String code, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE + ";charset=UTF-8");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-store");
        mapper.writeValue(response.getOutputStream(), new AuthErrorResponse(code, message));
    }
}
