package com.ssafy.ontop.world.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.dto.WorldMapMetadata;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.movement.ParkScene;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public final class WorldMapCompatibility {
    private final boolean requireMatch;
    private final WorldMapMetadata metadata;

    public WorldMapCompatibility(@Value("${ontop.world.map.require-match:false}") boolean requireMatch) {
        this(requireMatch, ParkScene.load().metadata());
    }

    @Autowired
    public WorldMapCompatibility(@Value("${ontop.world.map.require-match:false}") boolean requireMatch,
            WorldMapRuntime runtime) {
        this(requireMatch, runtime.scene().metadata());
    }

    public WorldMapCompatibility(boolean requireMatch, WorldMapMetadata metadata) {
        this.requireMatch = requireMatch;
        this.metadata = java.util.Objects.requireNonNull(metadata);
    }

    public boolean requiresMatch() {
        return requireMatch;
    }

    public WorldMapMetadata metadata() {
        return metadata;
    }

    public boolean matches(JsonNode payload) {
        return metadata.mapId().equals(payload.path("mapId").asText())
                && metadata.schemaVersion() == payload.path("schemaVersion").asInt()
                && metadata.mapVersion().equals(payload.path("mapVersion").asText());
    }
}
