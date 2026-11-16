package com.ssafy.ontop.world.boat;

import com.ssafy.ontop.world.service.WorldFacilityService.Pose;
import java.util.List;

/**
 * 프론트 duckBoatRidePath.ts와 같은 등속 보간. 경로 점은 맵 생성물에서만 받는다.
 * 좌석 좌표는 배 원점 기준 로컬 값이며 모델 정면은 -Z다.
 */
public record DuckBoatRoute(double seconds, double y, List<double[]> points, List<double[]> seats,
        double laneSeconds) {

    public DuckBoatRoute {
        if (!(seconds > 0) || !Double.isFinite(y) || points.size() < 2 || seats.size() != 2
                || !(laneSeconds >= 0) || laneSeconds * 2 >= seconds) {
            throw new IllegalArgumentException("오리배 경로를 확인해주세요.");
        }
        points = List.copyOf(points);
        seats = List.copyOf(seats);
    }

    public long lapMillis() {
        return Math.round(seconds * 1000);
    }

    public long laneMillis() {
        return Math.round(laneSeconds * 1000);
    }

    /** 출발 후 elapsed초에 해당 좌석의 아바타 원점 자세. 경로 양 끝으로 고정한다. */
    public Pose seatPose(double elapsed, int seat) {
        double total = 0;
        double[] lengths = new double[points.size()];
        for (int i = 1; i < points.size(); i++) {
            double[] a = points.get(i - 1), b = points.get(i);
            total += Math.hypot(b[0] - a[0], b[1] - a[1]);
            lengths[i] = total;
        }
        double s = Math.max(0, Math.min(1, elapsed / seconds)) * total;
        int i = 1;
        while (i < points.size() - 1 && lengths[i] < s) {
            i++;
        }
        double[] a = points.get(i - 1), b = points.get(i);
        double span = lengths[i] - lengths[i - 1], u = span > 0 ? (s - lengths[i - 1]) / span : 0;
        double x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
        double riderYaw = Math.atan2(b[0] - a[0], b[1] - a[1]), boatYaw = riderYaw + Math.PI;
        double[] local = seats.get(seat);
        double c = Math.cos(boatYaw), sin = Math.sin(boatYaw);
        return new Pose(x + local[0] * c + local[2] * sin, y + local[1], z - local[0] * sin + local[2] * c, riderYaw);
    }
}
