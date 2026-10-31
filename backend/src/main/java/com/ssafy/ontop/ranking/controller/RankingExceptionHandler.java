package com.ssafy.ontop.ranking.controller;

import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.security.RestSecurityErrorHandler;
import com.ssafy.ontop.ranking.exception.RankingException;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = {RankingController.class, ParkRankingController.class})
public class RankingExceptionHandler {
    private final RestSecurityErrorHandler errors;

    public RankingExceptionHandler(RestSecurityErrorHandler errors) {
        this.errors = errors;
    }

    @ExceptionHandler(RankingException.class)
    public void ranking(RankingException exception, HttpServletResponse response) throws IOException {
        errors.write(response, exception.error().status(), exception.error().code(), exception.getMessage());
    }

    @ExceptionHandler(RestAuthenticationException.class)
    public void authentication(RestAuthenticationException exception, HttpServletResponse response) throws IOException {
        var error = exception.error();
        errors.write(response, error.status(), error.code(), error.message());
    }
}
