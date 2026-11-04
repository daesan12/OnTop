package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.dto.ChannelListResponse;
import com.ssafy.ontop.world.dto.ChannelListResponse.ChannelResponse;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class ChannelQueryService {

    private final List<Channel> channels;
    private final ChannelPresence presence;

    public ChannelQueryService(WorldChannelProperties properties, ObjectProvider<ChannelPresence> presence) {
        channels = properties.channels().stream().sorted(DynamicChannelDisplayNumbers.comparator()).toList();
        // 광장 입장 기능이 아직 없으므로 공급자 미등록 시 모든 채널의 실제 입장 인원은 0이다.
        this.presence = presence.getIfAvailable(() -> Map::of);
    }

    public ChannelListResponse listChannels() {
        try {
            // 응답 하나에서 인원 시점이 섞이지 않게 한 번만 읽는다. 조회는 입장·예약을 하지 않는다.
            Map<String, Integer> counts = Map.copyOf(presence.snapshot());
            List<Channel> visible = presence instanceof WorldChannelRegistry registry
                    ? registry.definitions() : channels;
            return new ChannelListResponse(visible.stream().sorted(DynamicChannelDisplayNumbers.comparator()).map(channel -> {
                int currentUsers = counts.getOrDefault(channel.channelId(), 0);
                if (currentUsers < 0) {
                    throw new IllegalStateException("채널 사용자 수는 음수일 수 없습니다.");
                }
                return new ChannelResponse(channel.channelId(), channel.name(), currentUsers, channel.capacity(),
                        currentUsers < channel.capacity());
            }).toList());
        } catch (RuntimeException exception) {
            throw new UnavailableException(exception);
        }
    }

    public static final class UnavailableException extends RuntimeException {

        private UnavailableException(RuntimeException cause) {
            super("채널 인원을 확인할 수 없습니다.", cause);
        }
    }
}
