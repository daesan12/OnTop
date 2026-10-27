package com.ssafy.ontop.world.map;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldMapProperties;
import com.ssafy.ontop.world.config.WorldProximityProperties;
import com.ssafy.ontop.world.movement.ParkScene;
import java.io.IOException;
import java.nio.file.Path;
import java.util.Optional;
import java.util.stream.Collectors;

/** 프로세스 시작 시 한 번 선택한 장면·시설·테이블 구성을 모든 소비자가 함께 사용한다. */
public final class WorldMapRuntime {
    private final ParkScene scene;
    private final PreparedParkMap prepared;
    private final LegacyParkTables legacyTables;

    private WorldMapRuntime(ParkScene scene, PreparedParkMap prepared, LegacyParkTables legacyTables) {
        this.scene = scene;
        this.prepared = prepared;
        this.legacyTables = legacyTables;
    }

    public static WorldMapRuntime load(WorldMapProperties properties, WorldChannelProperties channels)
            throws IOException {
        var channelIds = channels.channels().stream().map(WorldChannelProperties.Channel::channelId)
                .collect(Collectors.toUnmodifiableSet());
        if (properties.source() == WorldMapProperties.Source.LEGACY) {
            ParkScene scene = ParkScene.load();
            return new WorldMapRuntime(scene, null, LegacyParkTables.from(scene, channelIds));
        }
        var prepared = PreparedParkMap.load(Path.of(properties.jsonPath()),
                Path.of(properties.manifestPath()), channelIds);
        return new WorldMapRuntime(prepared.createScene(), prepared, null);
    }

    public ParkScene scene() { return scene; }

    public Optional<PreparedParkMap> prepared() { return Optional.ofNullable(prepared); }

    public Optional<LegacyParkTables> legacyTables() { return Optional.ofNullable(legacyTables); }

    public WorldProximityProperties proximity(WorldProximityProperties configured) {
        return prepared == null ? legacyTables.proximity(configured) : prepared.proximity();
    }
}
