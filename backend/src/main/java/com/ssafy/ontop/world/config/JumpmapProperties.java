package com.ssafy.ontop.world.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 점프맵 코스 충돌체 기능 플래그. 기본값은 비활성이다. */
@ConfigurationProperties("ontop.world.jumpmap")
public record JumpmapProperties(boolean enabled) {}
