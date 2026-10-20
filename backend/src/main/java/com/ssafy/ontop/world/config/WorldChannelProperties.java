package com.ssafy.ontop.world.config;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ontop.world")
public record WorldChannelProperties(List<Channel> channels) {

    public WorldChannelProperties {
        channels = channels == null ? List.of() : List.copyOf(channels);
        Set<String> ids = new HashSet<>();
        for (Channel channel : channels) {
            if (!ids.add(channel.channelId())) {
                throw new IllegalArgumentException("채널 ID는 중복될 수 없습니다.");
            }
        }
    }

    public record Channel(String channelId, String name, int capacity) {

        public Channel {
            if (channelId == null || channelId.isBlank() || name == null || name.isBlank() || capacity <= 0) {
                throw new IllegalArgumentException("채널 ID·이름과 양수 정원이 필요합니다.");
            }
        }
    }
}
