package com.ssafy.ontop.world.map;

import com.ssafy.ontop.world.config.WorldProximityProperties;
import com.ssafy.ontop.world.movement.ParkScene;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** 현재 충돌 맵의 앵커에서 방 등록과 관전 좌표를 함께 만든다. */
public record LegacyParkTables(List<Entry> entries) {

    public LegacyParkTables {
        entries = List.copyOf(entries);
    }

    public static LegacyParkTables from(ParkScene scene, Set<String> channelIds) {
        var entries = new ArrayList<Entry>();
        for (String channelId : channelIds.stream().sorted().toList()) {
            for (ParkScene.TableAnchor anchor : scene.tableAnchors()) {
                // 기존 두 테이블과 같은 계산식을 사용해 ID를 보존한다.
                String tableId = "table-" + UUID.nameUUIDFromBytes(
                        (channelId + "\0" + anchor.anchorId()).getBytes(StandardCharsets.UTF_8));
                entries.add(new Entry(channelId, tableId, anchor.anchorId(), anchor.x(), anchor.y(), anchor.z()));
            }
        }
        return new LegacyParkTables(entries);
    }

    public WorldProximityProperties proximity(WorldProximityProperties configured) {
        var positions = new HashMap<String, WorldProximityProperties.Point>();
        for (Entry entry : entries) {
            positions.put(entry.tableId(), new WorldProximityProperties.Point(entry.x(), entry.z()));
        }
        // 명시적인 서버 거리 검증용 좌표 설정은 기존 우선순위를 유지한다.
        positions.putAll(configured.tables());
        return new WorldProximityProperties(configured.chatRadius(), configured.watchRadius(), positions);
    }

    public record Entry(String channelId, String tableId, String anchorId, double x, double y, double z) {}
}
