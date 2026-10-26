package com.ssafy.ontop.world.map;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldMapProperties;
import com.ssafy.ontop.world.movement.ParkScene;
import java.io.IOException;
import java.nio.file.Path;
import java.util.Optional;
import java.util.stream.Collectors;

/** 프로세스 시작 시 한 번 선택한 장면·시설·테이블 구성을 모든 소비자가 함께 사용한다. */
public final class WorldMapRuntime {
    private final ParkScene scene;
    private final PreparedParkMap prepared;

    private WorldMapRuntime(ParkScene scene, PreparedParkMap prepared) {
        this.scene = scene;
        this.prepared = prepared;
    }

    public static WorldMapRuntime load(WorldMapProperties properties, WorldChannelProperties channels)
            throws IOException {
        if (properties.source() == WorldMapProperties.Source.LEGACY) {
            return new WorldMapRuntime(ParkScene.load(), null);
        }
        var channelIds = channels.channels().stream().map(WorldChannelProperties.Channel::channelId)
                .collect(Collectors.toUnmodifiableSet());
        var prepared = PreparedParkMap.load(Path.of(properties.jsonPath()),
                Path.of(properties.manifestPath()), channelIds);
        return new WorldMapRuntime(prepared.createScene(), prepared);
    }

    public ParkScene scene() { return scene; }

    public Optional<PreparedParkMap> prepared() { return Optional.ofNullable(prepared); }
}
