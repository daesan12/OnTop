package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("local")
public class WorldChannelRegistry implements ChannelPresence {

    private final Map<String, Room> rooms = new LinkedHashMap<>();
    private final Map<String, String> membership = new HashMap<>();

    public WorldChannelRegistry(WorldChannelProperties properties) {
        for (Channel channel : properties.channels()) {
            rooms.put(channel.channelId(), new Room(channel));
        }
    }

    public synchronized Change join(String userId, String channelId) {
        Room room = rooms.get(channelId);
        if (room == null) {
            throw new ChannelException("CHANNEL_NOT_FOUND", "등록되지 않은 채널입니다.");
        }
        String current = membership.get(userId);
        if (current != null) {
            if (!current.equals(channelId)) {
                throw new ChannelException("ALREADY_IN_CHANNEL", "먼저 현재 채널에서 퇴장해주세요.");
            }
            return new Change(room.state(), false);
        }
        if (room.users.size() >= room.definition.capacity()) {
            throw new ChannelException("CHANNEL_FULL", "채널의 빈자리가 없습니다.");
        }
        room.users.add(userId);
        membership.put(userId, channelId);
        room.version++;
        return new Change(room.state(), true);
    }

    public synchronized State leave(String userId) {
        State state = disconnect(userId);
        if (state == null) {
            throw new ChannelException("NOT_IN_CHANNEL", "입장한 채널이 없습니다.");
        }
        return state;
    }

    public synchronized State disconnect(String userId) {
        String channelId = membership.remove(userId);
        if (channelId == null) {
            return null;
        }
        Room room = rooms.get(channelId);
        room.users.remove(userId);
        room.version++;
        return room.state();
    }

    public synchronized boolean isInChannel(String userId, String channelId) {
        return channelId.equals(membership.get(userId));
    }

    @Override
    public synchronized Map<String, Integer> snapshot() {
        Map<String, Integer> counts = new LinkedHashMap<>();
        rooms.forEach((id, room) -> counts.put(id, room.users.size()));
        return Map.copyOf(counts);
    }

    public synchronized void clear() {
        membership.clear();
        for (Room room : rooms.values()) {
            if (!room.users.isEmpty()) {
                room.users.clear();
                room.version++;
            }
        }
    }

    public record Change(State state, boolean changed) {
    }

    public record State(String channelId, String name, long version, int capacity, int currentUsers,
            List<String> userIds) {

        public State {
            userIds = List.copyOf(userIds);
        }
    }

    public static final class ChannelException extends RuntimeException {

        private final String code;

        private ChannelException(String code, String message) {
            super(message);
            this.code = code;
        }

        public String code() {
            return code;
        }
    }

    private static final class Room {

        private final Channel definition;
        private final LinkedHashSet<String> users = new LinkedHashSet<>();
        private long version;

        private Room(Channel definition) {
            this.definition = definition;
        }

        private State state() {
            return new State(definition.channelId(), definition.name(), version, definition.capacity(), users.size(),
                    List.copyOf(users));
        }
    }
}
