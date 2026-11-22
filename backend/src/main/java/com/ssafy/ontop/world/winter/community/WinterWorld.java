package com.ssafy.ontop.world.winter.community;

import java.util.List;

/** 위치는 기존 공원 권한자가 제공한다. DB 호출을 공원 물리 락 안에서 실행하지 않는다. */
public interface WinterWorld {
    WinterCommunity.Player player(long user, String channel);
    List<WinterCommunity.Player> players(String channel);
    WinterCommunity.Surface surface(String channel, double x, double z, double radius);
    void requireTree(WinterCommunity.Player player, String channel);
    void install(WinterCommunity.Snowman snowman);
    void publish(WinterCommunity.BuildingState state);
    void publishTree(WinterCommunity.TreeStatus status);
}
