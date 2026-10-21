package com.ssafy.ontop.auth.config;

import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.client.RestClient;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(OAuthProperties.class)
@EnableScheduling
public class OAuthConfiguration {

    // 기존 게임/heartbeat Clock 주입에 영향을 주지 않고 OAuth에서 명시적으로 선택한다.
    @Bean(defaultCandidate = false)
    Clock oauthClock() {
        return Clock.systemUTC();
    }

    @Bean
    RestClient oauthRestClient() {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(Duration.ofSeconds(5));
        return RestClient.builder().requestFactory(factory).build();
    }
}
