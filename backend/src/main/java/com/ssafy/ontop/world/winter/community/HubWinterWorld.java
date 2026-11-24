package com.ssafy.ontop.world.winter.community;

import com.ssafy.ontop.table.service.TableHub;

final class HubWinterWorld implements WinterWorld {
    private final TableHub hub;
    HubWinterWorld(TableHub hub) { this.hub = hub; }
    @Override public WinterCommunity.Player player(long user, String channel) { return hub.winterPlayer(user, channel); }
    @Override public void requireTree(WinterCommunity.Player player, String channel) { hub.requireWinterTree(player, channel); }
    @Override public void publishTree(WinterCommunity.TreeStatus status) { hub.winterTreeChanged(status); }
}
