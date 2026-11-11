package com.ssafy.ontop.world.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("ontop.world.map")
public record WorldMapProperties(Source source, String jsonPath, String manifestPath, boolean requireMatch) {
    public WorldMapProperties {
        source = source == null ? Source.LEGACY : source;
        jsonPath = jsonPath == null ? "" : jsonPath.strip();
        manifestPath = manifestPath == null ? "" : manifestPath.strip();
        if (source == Source.GENERATED && (jsonPath.isEmpty() || manifestPath.isEmpty() || !requireMatch)) {
            throw new IllegalArgumentException("새 맵은 JSON·manifest 경로와 require-match=true가 필요합니다.");
        }
    }

    public enum Source { LEGACY, GENERATED }
}
