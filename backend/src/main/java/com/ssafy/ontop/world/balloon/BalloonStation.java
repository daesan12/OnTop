package com.ssafy.ontop.world.balloon;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.map.PreparedParkMap;
import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;

record BalloonStation(double x, double y, double z, double deckReachY, double heightTolerance) {
    // World-space door offset from the docked model in frontend/park-renewal-preview/plan.ts.
    private static final double DOOR_OFFSET_X = 3.7308743485736175;
    private static final double APPROACH_OFFSET = .65;
    private static final double BOARDING_RADIUS = 1.6;

    static BalloonStation findIn(PreparedParkMap map) {
        for (JsonNode anchor : map.constructionSites()) {
            if ("balloon".equals(anchor.path("id").asText())) {
                var center = anchor.path("position");
                var reach = anchor.path("reachPosition");
                if (!center.isArray() || center.size() != 3 || !reach.isArray() || reach.size() != 3) {
                    return null;
                }
                return new BalloonStation(center.get(0).asDouble(), center.get(1).asDouble(), center.get(2).asDouble(),
                        reach.get(1).asDouble(), anchor.path("heightTolerance").asDouble());
            }
        }
        return null;
    }

    boolean canBoard(Position player) {
        if (player == null || player.swimming()) {
            return false;
        }
        double doorX = x + DOOR_OFFSET_X;
        return player.x() <= doorX
                && Math.hypot(player.x() - (doorX - APPROACH_OFFSET), player.z() - z) <= BOARDING_RADIUS
                && Math.abs(player.y() - deckReachY) <= heightTolerance;
    }
}
