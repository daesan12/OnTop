package com.ssafy.ontop.world.movement;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.service.WorldFacilityService.Pose;

/** The rentable boat uses the 220 m map's existing dock and mooring. */
public final class DuckBoatCourse {
    private final ParkScene scene;
    private final JsonNode dock;
    private final JsonNode lake;
    private final Pose berth;

    private DuckBoatCourse(ParkScene scene, JsonNode dock, JsonNode mooring) {
        this.scene = scene;
        this.dock = dock;
        lake = scene.data.path("lake");
        var center = mooring.path("center");
        berth = new Pose(center.path(0).asDouble(), lake.path("surfaceY").asDouble() + .08,
                center.path(2).asDouble(), mooring.path("yaw").asDouble());
    }

    static DuckBoatCourse from(ParkScene scene) {
        var dock = scene.data.path("duckBoatDock");
        if (!dock.isObject() || !scene.data.path("duckBoat").isObject()) return null;
        for (var box : scene.data.path("boxes")) {
            if (box.path("id").asText().equals("duck-boat-moored--1")) {
                return new DuckBoatCourse(scene, dock, box);
            }
        }
        return null;
    }

    public Pose berth() {
        return berth;
    }

    public boolean reachable(double x, double y, double z) {
        var reach = dock.path("reachPosition");
        return Math.hypot(x - reach.path(0).asDouble(), z - reach.path(2).asDouble())
                <= dock.path("radius").asDouble()
                && Math.abs(y - reach.path(1).asDouble()) <= dock.path("heightTolerance").asDouble();
    }

    public Pose steer(Pose pose, int turn, int throttle, double dt) {
        if (turn == 0 && throttle == 0) return pose;
        double yaw = pose.yaw() - turn * 1.55 * dt;
        double distance = throttle * (throttle < 0 ? 2.2 : 5.6) * dt;
        double x = pose.x() - Math.sin(yaw) * distance;
        double z = pose.z() - Math.cos(yaw) * distance;
        if (!navigable(x, z)) return new Pose(pose.x(), pose.y(), pose.z(), yaw);
        return new Pose(x, pose.y(), z, yaw);
    }

    private boolean navigable(double x, double z) {
        double lakeX = lake.path("x").asDouble(), lakeZ = lake.path("z").asDouble();
        double rx = lake.path("radiusX").asDouble(), rz = lake.path("radiusZ").asDouble();
        double dx = x - lakeX, dz = z - lakeZ;
        if (Math.hypot(dx / (rx - 2), dz / (rz - 2)) > 1
                || Math.hypot(dx / (rx * .57), dz / (rz * .55)) < 1) return false;
        // The west bridge spans the channel between the island and the west bank.
        if (dx < 0 && Math.abs(dz) < 3.7) return false;
        if (Math.abs(x - dock.path("position").path(0).asDouble()) < 7.2 && z > berth.z() + .1) return false;
        return scene.groundHeight(x, z) < berth.y() - .35;
    }

    public Pose driver(Pose hull) {
        // Driver anchor from the original docked GLB. Actor coordinates use capsule center.
        double sin = Math.sin(hull.yaw()), cos = Math.cos(hull.yaw());
        return new Pose(hull.x() - .47 * cos + .48 * sin, hull.y() + .82 + .8,
                hull.z() + .47 * sin + .48 * cos, Math.atan2(-sin, -cos));
    }
}
