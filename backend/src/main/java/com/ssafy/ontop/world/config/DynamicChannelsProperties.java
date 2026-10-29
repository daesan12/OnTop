package com.ssafy.ontop.world.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Operating limits for the single-process park channel lifecycle. */
@ConfigurationProperties(prefix = "ontop.world.dynamic-channels")
public record DynamicChannelsProperties(boolean enabled, @DefaultValue("20") int capacity,
        @DefaultValue("18") int spawnAt, @DefaultValue("2") int maxChannels,
        @DefaultValue("5m") Duration idleTimeout) {

    public DynamicChannelsProperties {
        if (capacity <= 0 || spawnAt <= 0 || spawnAt >= capacity || maxChannels <= 0
                || idleTimeout == null || idleTimeout.isNegative() || idleTimeout.isZero()) {
            throw new IllegalArgumentException("유동 채널 정원·생성 기준·최대 개수·유휴 시간을 확인해주세요.");
        }
    }

    public static DynamicChannelsProperties disabled() {
        return new DynamicChannelsProperties(false, 20, 18, 2, Duration.ofMinutes(5));
    }
}
