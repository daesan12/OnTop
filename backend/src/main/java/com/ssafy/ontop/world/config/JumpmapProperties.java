package com.ssafy.ontop.world.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 점프맵 코스 충돌체 기능 플래그. 기본값은 비활성이다. */
@ConfigurationProperties("ontop.world.jumpmap")
public record JumpmapProperties(boolean enabled, String courseJsonPath, String courseChecksumPath) {
    public JumpmapProperties(boolean enabled) { this(enabled, "", ""); }
    @org.springframework.boot.context.properties.bind.ConstructorBinding
    public JumpmapProperties {
        courseJsonPath = courseJsonPath == null ? "" : courseJsonPath.strip();
        courseChecksumPath = courseChecksumPath == null ? "" : courseChecksumPath.strip();
        if (courseJsonPath.isEmpty() != courseChecksumPath.isEmpty()) {
            throw new IllegalArgumentException("점프맵 JSON과 checksum 경로를 함께 지정해주세요.");
        }
    }
    public com.ssafy.ontop.world.jumpmap.JumpCourse loadCourse() throws java.io.IOException {
        return courseJsonPath.isEmpty() ? com.ssafy.ontop.world.jumpmap.JumpCourse.loadDefault()
                : com.ssafy.ontop.world.jumpmap.JumpCourse.load(java.nio.file.Path.of(courseJsonPath), java.nio.file.Path.of(courseChecksumPath));
    }
}
