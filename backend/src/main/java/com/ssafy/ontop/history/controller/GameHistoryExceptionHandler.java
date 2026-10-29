package com.ssafy.ontop.history.controller;

import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.security.RestSecurityErrorHandler;
import com.ssafy.ontop.history.exception.GameHistoryException;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = GameHistoryController.class)
public class GameHistoryExceptionHandler {
    private final RestSecurityErrorHandler errors;

    public GameHistoryExceptionHandler(RestSecurityErrorHandler errors) {
        this.errors = errors;
    }

    @ExceptionHandler(GameHistoryException.class)
    public void handleHistory(GameHistoryException exception, HttpServletResponse response) throws IOException {
        var error = exception.error();
        errors.write(response, error.status(), error.code(), error.message());
    }

    @ExceptionHandler(RestAuthenticationException.class)
    public void handleAuthentication(RestAuthenticationException exception, HttpServletResponse response) throws IOException {
        var error = exception.error();
        errors.write(response, error.status(), error.code(), error.message());
    }
}
