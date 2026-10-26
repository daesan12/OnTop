package com.ssafy.ontop.world.dto;

/** 서버가 실제 로딩한 맵의 식별 정보. 클라이언트 설정으로 덮어쓰지 않는다. */
public record WorldMapMetadata(String mapId, int schemaVersion, String mapVersion) {
    public WorldMapMetadata {
        if (mapId == null || !mapId.matches("[A-Za-z0-9_-]{1,80}") || schemaVersion < 1
                || mapVersion == null || !mapVersion.matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException("맵 식별 정보가 올바르지 않습니다.");
        }
    }
}
