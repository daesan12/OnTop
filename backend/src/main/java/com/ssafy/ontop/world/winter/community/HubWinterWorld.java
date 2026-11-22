package com.ssafy.ontop.world.winter.community;

import com.ssafy.ontop.table.service.TableHub;
import java.util.List;

final class HubWinterWorld implements WinterWorld {
    private final TableHub hub;
    HubWinterWorld(TableHub hub) { this.hub = hub; }
    @Override public WinterCommunity.Player player(long user, String channel) { return hub.winterPlayer(user, channel); }
    @Override public List<WinterCommunity.Player> players(String channel) { return hub.winterPlayers(channel); }
    @Override public WinterCommunity.Surface surface(String channel, double x, double z, double radius) {
        return hub.winterSurface(channel, x, z, radius);
    }
    @Override public void requireTree(WinterCommunity.Player player, String channel) { hub.requireWinterTree(player, channel); }
    @Override public void install(WinterCommunity.Snowman snowman) { hub.installWinterSnowman(snowman); }
    @Override public void publish(WinterCommunity.BuildingState state) { hub.winterCommunityChanged(state.channelId(), state); }
    @Override public void publishTree(WinterCommunity.TreeStatus status) { hub.winterTreeChanged(status); }
}
