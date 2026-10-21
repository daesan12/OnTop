package com.ssafy.ontop.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

@ConfigurationProperties(prefix = "ontop.oauth")
public record OAuthProperties(Client ssafy, Client naver, String frontendCallbackUri) {

    @ConstructorBinding
    public OAuthProperties {
    }

    public OAuthProperties(Client ssafy, Client naver) {
        this(ssafy, naver, "");
    }

    @Override
    public String toString() {
        return "OAuthProperties[redacted]";
    }

    public record Client(String clientId, String redirectUri, String clientSecret) {

        @ConstructorBinding
        public Client {
        }

        public Client(String clientId, String redirectUri) {
            this(clientId, redirectUri, "");
        }

        @Override
        public String toString() {
            return "OAuthClient[redacted]";
        }
    }
}
