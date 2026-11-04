package com.ssafy.ontop.operation.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.operation.service.ServiceOperationConflictException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = {ServiceOperationController.class, AdminServiceOperationController.class})
public class ServiceOperationExceptionHandler {
    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<AuthErrorResponse> invalid(IllegalArgumentException error) {
        return ResponseEntity.badRequest().cacheControl(CacheControl.noStore())
                .body(new AuthErrorResponse("OPERATION_INVALID_REQUEST", error.getMessage()));
    }

    @ExceptionHandler(ServiceOperationConflictException.class)
    ResponseEntity<AuthErrorResponse> conflict(ServiceOperationConflictException error) {
        return ResponseEntity.status(409).cacheControl(CacheControl.noStore())
                .body(new AuthErrorResponse("OPERATION_VERSION_CONFLICT", error.getMessage()));
    }
}
