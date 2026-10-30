package com.ssafy.ontop.table.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** 로컬 검증 기본값이며 운영 수치·신뢰 프록시는 배포 전에 별도 합의한다. */
@ConfigurationProperties("ontop.websocket.limits")
public record WebSocketLimitProperties(@DefaultValue("120") int messagesPerSecond,
        @DefaultValue("240") int burst, @DefaultValue("200") int maxConnections,
        @DefaultValue("100") int maxConnectionsPerAddress, List<String> trustedProxyCidrs) {
    public WebSocketLimitProperties {
        if (messagesPerSecond < 1 || messagesPerSecond > 1_000_000 || burst < 1 || burst > 1_000_000
                || maxConnections < 1 || maxConnections > 100_000
                || maxConnectionsPerAddress < 1 || maxConnectionsPerAddress > 100_000) {
            throw new IllegalArgumentException("WebSocket 유입 제한 설정을 확인해주세요.");
        }
        trustedProxyCidrs = trustedProxyCidrs == null ? List.of() : List.copyOf(trustedProxyCidrs);
        if (trustedProxyCidrs.size() > 128) { throw new IllegalArgumentException("신뢰 프록시 범위가 너무 많습니다."); }
    }
}
