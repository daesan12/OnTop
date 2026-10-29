package com.ssafy.ontop.wallet.controller;

import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.security.RestSecurityErrorHandler;
import com.ssafy.ontop.wallet.exception.WalletQueryException;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = WalletController.class)
public class WalletExceptionHandler {

    private final RestSecurityErrorHandler errors;

    public WalletExceptionHandler(RestSecurityErrorHandler errors) {
        this.errors = errors;
    }

    @ExceptionHandler(WalletQueryException.class)
    public void handleWallet(WalletQueryException exception, HttpServletResponse response) throws IOException {
        var error = exception.error();
        errors.write(response, error.status().value(), error.code(), exception.getMessage());
    }

    @ExceptionHandler(RestAuthenticationException.class)
    public void handleAuthentication(RestAuthenticationException exception, HttpServletResponse response)
            throws IOException {
        var error = exception.error();
        errors.write(response, error.status(), error.code(), error.message());
    }
}
