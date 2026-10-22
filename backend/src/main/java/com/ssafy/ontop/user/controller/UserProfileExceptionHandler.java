package com.ssafy.ontop.user.controller;

import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.security.RestSecurityErrorHandler;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = UserProfileController.class)
public class UserProfileExceptionHandler {

    private final RestSecurityErrorHandler errors;

    public UserProfileExceptionHandler(RestSecurityErrorHandler errors) {
        this.errors = errors;
    }

    @ExceptionHandler(RestAuthenticationException.class)
    public void handleAuthentication(RestAuthenticationException exception, HttpServletResponse response)
            throws IOException {
        var error = exception.error();
        errors.write(response, error.status(), error.code(), error.message());
    }
}
