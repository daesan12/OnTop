package com.ssafy.ontop.ranking.controller;

import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.security.RestSecurityErrorHandler;
import com.ssafy.ontop.ranking.exception.BungeoppangRankingException;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = BungeoppangRankingController.class)
public class BungeoppangRankingExceptionHandler {
    private final RestSecurityErrorHandler errors;
    public BungeoppangRankingExceptionHandler(RestSecurityErrorHandler errors) { this.errors = errors; }
    @ExceptionHandler(BungeoppangRankingException.class)
    public void ranking(BungeoppangRankingException exception, HttpServletResponse response) throws IOException {
        errors.write(response, exception.status(), exception.code(), exception.getMessage());
    }
    @ExceptionHandler(RestAuthenticationException.class)
    public void authentication(RestAuthenticationException exception, HttpServletResponse response) throws IOException {
        var error = exception.error();
        errors.write(response, error.status(), error.code(), error.message());
    }
}
