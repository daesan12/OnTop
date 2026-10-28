package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** TableHub 잠금 안에서만 사용한다. 관계는 연결 수명 동안만 유지하며 위치는 서버 값을 받는다. */
public final class WorldFollowService {

    private final Map<String, Room> rooms = new HashMap<>();

    public State state(String channelId) {
        return room(channelId).state(channelId);
    }

    public boolean isFollowing(String userId) {
        return rooms.values().stream().anyMatch(room -> room.links.containsKey(userId));
    }

    public List<State> activeStates() {
        return rooms.entrySet().stream().filter(entry -> !entry.getValue().links.isEmpty())
                .map(entry -> entry.getValue().state(entry.getKey())).toList();
    }

    public State start(String channelId, String followerId, String targetId,
            Position follower, Position target) {
        if (followerId.equals(targetId)) {
            throw new FollowException("FOLLOW_SELF_NOT_ALLOWED", "다른 사용자를 선택해주세요.");
        }
        if (follower == null || target == null) {
            throw new FollowException("WORLD_POSITION_REQUIRED", "서버 위치를 확인해주세요.");
        }
        Room room = room(channelId);
        Link previous = room.links.get(followerId);
        if (previous != null && previous.targetId().equals(targetId)) {
            return room.state(channelId);
        }
        if (!within(follower, target, 12, 2)) {
            throw new FollowException("FOLLOW_OUT_OF_RANGE", "가까운 같은 높이의 사용자를 선택해주세요.");
        }
        String next = targetId;
        Set<String> visited = new HashSet<>();
        while (next != null && visited.add(next)) {
            if (next.equals(followerId)) {
                throw new FollowException("FOLLOW_CYCLE_NOT_ALLOWED", "서로 순환해서 따라갈 수 없습니다.");
            }
            Link link = room.links.get(next);
            next = link == null ? null : link.targetId();
        }
        room.links.put(followerId, new Link(UUID.randomUUID().toString(), followerId, targetId));
        room.version++;
        return room.state(channelId);
    }

    public State stop(String channelId, String followerId, String followId) {
        Room room = room(channelId);
        Link link = room.links.get(followerId);
        if (link != null && !link.followId().equals(followId)) {
            throw new FollowException("FOLLOW_LINK_MISMATCH", "현재 따라가기 ID를 확인해주세요.");
        }
        if (link != null) {
            room.links.remove(followerId);
            room.version++;
        }
        return room.state(channelId);
    }

    public List<State> removeUser(String userId) {
        List<State> changes = new ArrayList<>();
        rooms.forEach((channelId, room) -> {
            if (room.links.values().removeIf(link -> link.followerId().equals(userId)
                    || link.targetId().equals(userId))) {
                room.version++;
                changes.add(room.state(channelId));
            }
        });
        return List.copyOf(changes);
    }

    /** 직접 조작은 본인의 따라가기만 해제한다. 본인을 따라오던 다른 사용자는 유지한다. */
    public List<State> stopFollowing(String userId) {
        List<State> changes = new ArrayList<>();
        rooms.forEach((channelId, room) -> {
            if (room.links.remove(userId) != null) {
                room.version++;
                changes.add(room.state(channelId));
            }
        });
        return List.copyOf(changes);
    }

    public State prune(String channelId, Map<String, Position> positions, Set<String> unavailable) {
        Room room = room(channelId);
        boolean changed = room.links.values().removeIf(link -> {
            Position follower = positions.get(link.followerId());
            Position target = positions.get(link.targetId());
            return follower == null || target == null || unavailable.contains(link.followerId())
                    || unavailable.contains(link.targetId()) || !within(follower, target, 24, 3.5);
        });
        if (changed) {
            room.version++;
        }
        return room.state(channelId);
    }

    public void clear() {
        rooms.clear();
    }

    public void removeEmptyChannel(String channelId) {
        Room room = rooms.get(channelId);
        if (room != null && !room.links.isEmpty()) {
            throw new IllegalStateException("따라가기 연결이 있는 채널은 정리할 수 없습니다.");
        }
        rooms.remove(channelId);
    }

    public boolean hasLinks(String channelId) {
        Room room = rooms.get(channelId);
        return room != null && !room.links.isEmpty();
    }

    private Room room(String channelId) {
        return rooms.computeIfAbsent(channelId, ignored -> new Room());
    }

    private static boolean within(Position first, Position second, double radius, double height) {
        return Math.hypot(first.x() - second.x(), first.z() - second.z()) <= radius
                && Math.abs(first.y() - second.y()) <= height;
    }

    public record Link(String followId, String followerId, String targetId) {
    }

    public record State(String channelId, long version, List<Link> links) {
        public State {
            links = List.copyOf(links);
        }
    }

    private static final class Room {
        private final Map<String, Link> links = new LinkedHashMap<>();
        private long version;

        private State state(String channelId) {
            return new State(channelId, version, List.copyOf(links.values()));
        }
    }

    public static final class FollowException extends RuntimeException {
        private final String code;

        private FollowException(String code, String message) {
            super(message);
            this.code = code;
        }

        public String code() {
            return code;
        }
    }
}
