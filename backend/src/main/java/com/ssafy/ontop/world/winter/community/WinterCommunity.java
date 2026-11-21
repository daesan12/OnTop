package com.ssafy.ontop.world.winter.community;

import java.util.List;
import java.util.Set;

/** 공개 상태에는 계정별 저장 키·중복 방지 키를 포함하지 않는다. */
public final class WinterCommunity {
    public static final double MAX_RADIUS = 1.1;
    public static final int MAX_BALLS = 24;
    public static final int MAX_SNOWMEN = 12;
    public static final int TREE_TARGET = 100;

    private WinterCommunity() { }

    public record TreeStatus(long count, boolean lit, String litAt, long revision) { }
    public record TreeMessage(long id, String text, boolean anonymous, String nickname, String createdAt) { }
    public record TreePage(TreeStatus status, List<TreeMessage> messages, Long nextBefore) { }
    public record TreeReceipt(TreeStatus status, TreeMessage message, String nextAllowedAt) { }
    public record Snowman(String id, String channelId, String name, double x, double groundY, double z, double yaw,
            double baseRadius, double middleRadius, double headRadius, String hat, String scarf, String face,
            String createdAt) {
        public double height() { return SnowmanShape.stack(baseRadius, middleRadius, headRadius).height(); }
    }
    public record SnowBall(String id, double x, double groundY, double z, double radius, List<String> pushing,
            boolean reserved) { }
    public record BuildingState(String channelId, long version, String serverTime, List<SnowBall> balls,
            List<Snowman> snowmen) { }
    public record Player(String userId, String nickname, double x, double y, double z, double yaw,
            boolean free, boolean inputBusy, String pileId) { }
    public record Surface(double y, boolean clear, boolean buildingZone) { }
    public record Decoration(String name, String hat, String scarf, String face) {
        public Decoration {
            if (name == null || name.isBlank() || name.codePointCount(0, name.length()) > 40
                    || name.codePoints().anyMatch(Character::isISOControl)
                    || !Set.of("TOP_HAT", "BEANIE", "NONE").contains(hat == null ? "" : hat)
                    || !Set.of("RED", "GREEN", "BLUE", "GOLD").contains(scarf == null ? "" : scarf)
                    || !Set.of("SMILE", "WINK").contains(face == null ? "" : face)) {
                throw new WinterCommunityException(400, "WINTER_DECORATION_INVALID", "이름과 장식을 확인해주세요.");
            }
            name = name.strip();
        }
    }
}
