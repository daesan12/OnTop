package com.ssafy.ontop.notes.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("ontop.notes")
public record NotesProperties(String privacySecret, Double x, Double y, Double z) {
    public NotesProperties {
        if (privacySecret == null || privacySecret.length() < 32) {
            throw new IllegalArgumentException("익명 메모 전용 비밀키를 32자 이상으로 설정해주세요.");
        }
        // NOTES_BOX.y + 캡슐 중심 0.8m. FE config/notes.ts, parkPlan.ts 기준.
        x = x == null ? 54.5 : x;
        y = y == null ? 18.92 : y;
        z = z == null ? 48.5 : z;
        if(com.ssafy.ontop.world.movement.GeneratedParkMap.enabled()) {
            var p=com.ssafy.ontop.world.movement.GeneratedParkMap.current().data().path("interactions").path("notes").path("position");
            x=p.get(0).asDouble();y=p.get(1).asDouble()+.8;z=p.get(2).asDouble();
        }
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z)) {
            throw new IllegalArgumentException("익명 메모함 위치는 유한한 좌표여야 합니다.");
        }
    }

    @Override
    public String toString() { return "NotesProperties[redacted]"; }
}
