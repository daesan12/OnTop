package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.config.WorldProximityProperties;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

@Service
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class WorldProximity {

    private final WorldChannelRegistry channels;
    private final WorldProximityProperties properties;

    public WorldProximity(WorldChannelRegistry channels, WorldProximityProperties properties) {
        this.channels = channels;
        this.properties = properties;
    }

    @Autowired
    public WorldProximity(WorldChannelRegistry channels, WorldProximityProperties properties, WorldMapRuntime runtime) {
        this(channels, runtime.proximity(properties));
    }

    public boolean hasPosition(String userId) {
        return channels.positionOf(userId) != null;
    }

    public boolean canHear(String senderId, String receiverId) {
        String channel = channels.channelOf(senderId);
        if (channel == null || !channel.equals(channels.channelOf(receiverId))) {
            return false;
        }
        Position sender = channels.positionOf(senderId);
        Position receiver = channels.positionOf(receiverId);
        return sender != null && receiver != null
                && within(sender.x(), sender.z(), receiver.x(), receiver.z(), properties.chatRadius());
    }

    public boolean canWatch(String userId, String tableId, String tableChannel) {
        if (tableId == null || tableChannel == null || !tableChannel.equals(channels.channelOf(userId))) {
            return false;
        }
        Position user = channels.positionOf(userId);
        WorldProximityProperties.Point table = properties.tables().get(tableId);
        return user != null && table != null
                && within(user.x(), user.z(), table.x(), table.z(), properties.watchRadius());
    }

    // hypot는 제곱 합의 overflow 없이 큰 유한 좌표도 안전하게 처리한다. 경계 20m는 포함한다.
    private boolean within(double x1, double z1, double x2, double z2, double radius) {
        return Math.hypot(x1 - x2, z1 - z2) <= radius;
    }
}
