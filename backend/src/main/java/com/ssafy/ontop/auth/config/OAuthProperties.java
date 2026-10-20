package com.ssafy.ontop.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ontop.oauth")
public record OAuthProperties(Client ssafy, Client naver) {

    public record Client(String clientId, String redirectUri) {
    }
}
