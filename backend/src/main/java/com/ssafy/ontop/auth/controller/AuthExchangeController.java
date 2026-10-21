package com.ssafy.ontop.auth.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.auth.dto.AuthExchangeResponse;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.AuthExchangeService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthExchangeController {

    private final AuthExchangeService service;

    public AuthExchangeController(AuthExchangeService service) {
        this.service = service;
    }

    @PostMapping("/exchange")
    public ResponseEntity<AuthExchangeResponse> exchange(@RequestBody JsonNode body, HttpServletRequest request) {
        if (body == null || !body.isObject() || body.size() != 1 || !body.path("exchangeCode").isTextual()
                || !body.path("exchangeCode").asText().matches("[A-Za-z0-9_-]{43}")) {
            throw new AuthExchangeException(AuthExchangeException.Error.INVALID_REQUEST);
        }
        AuthExchangeService.Result result = service.exchange(request, body.path("exchangeCode").asText());
        ResponseEntity.BodyBuilder response = ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer");
        if (result.refreshCookie() != null) {
            response.header(HttpHeaders.SET_COOKIE, result.refreshCookie());
        }
        return response.body(result.body());
    }
}
