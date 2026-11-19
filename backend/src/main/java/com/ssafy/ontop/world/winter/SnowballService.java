package com.ssafy.ontop.world.winter;

import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.function.DoubleUnaryOperator;

/** 재화·이동 상태를 변경하지 않는 채널 내 눈싸움. TableHub 잠금 안에서 호출한다. */
public final class SnowballService {
    public static final double RANGE = 16;
    private final Map<String, Recent> recent = new HashMap<>();

    public record Target(String userId, Position position) { }
    public record Event(String shotId, String channelId, String userId, String hitUserId,
                        double x, double y, double z, double endX, double endY, double endZ,
                        String sentAt, int durationMs) { }
    private record Recent(String requestId, String channelId, long at, Event event) { }

    public Event create(String requestId, String channelId, String userId, Position origin, double yaw,
                        Collection<Target> targets, DoubleUnaryOperator obstacle, long now, Instant sentAt) {
        Recent previous = recent.get(userId);
        if (previous != null && previous.requestId().equals(requestId) && previous.channelId().equals(channelId)) {
            return previous.event();
        }
        if (previous != null && now - previous.at() < 900_000_000L) {
            throw new IllegalStateException("눈을 뭉치고 있어요. 잠시 뒤 다시 던져주세요.");
        }
        if (!Double.isFinite(yaw) || Math.abs(yaw) > Math.PI) {
            throw new IllegalArgumentException("눈덩이를 던질 방향을 확인해주세요.");
        }
        double dx = Math.sin(yaw), dz = Math.cos(yaw);
        double distance = Math.clamp(obstacle.applyAsDouble(yaw), 0, RANGE);
        String hit = "";
        for (Target target : targets) {
            if (target.userId().equals(userId)) {
                continue;
            }
            Position p = target.position();
            double x = p.x() - origin.x(), z = p.z() - origin.z();
            double along = x * dx + z * dz;
            double side = Math.abs(x * dz - z * dx);
            double flightY = origin.y() + .35 + .7 * Math.sin(Math.PI * along / RANGE);
            if (along > .6 && along < distance && side < .65 && Math.abs(p.y() - flightY) < 1) {
                distance = along;
                hit = target.userId();
            }
        }
        Event event = new Event(userId + ":" + requestId, channelId, userId, hit, origin.x(), origin.y() + .35, origin.z(),
                origin.x() + dx * distance, origin.y() + .35 + .7 * Math.sin(Math.PI * distance / RANGE),
                origin.z() + dz * distance, sentAt.toString(), (int) Math.max(100, distance / 22 * 1000));
        recent.put(userId, new Recent(requestId, channelId, now, event));
        return event;
    }

    public void disconnected(String userId) {
        recent.remove(userId);
    }
}
