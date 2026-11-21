package com.ssafy.ontop.demo;

import com.ssafy.ontop.OntopApplication;
import org.springframework.boot.SpringApplication;

/** 기존 독립 테스트 계정을 재사용하는 공원 검수 진입점. 운영 JAR에는 포함하지 않는다. */
public final class OntopParkApplication {
    public static void main(String[] args) {
        new SpringApplication(OntopApplication.class, AlkkagiParkApplication.Fixture.class).run(
                "--spring.profiles.active=local,frontend-test,alkkagi-park,ontop-preview",
                "--server.address=127.0.0.1", "--server.port=19188",
                "--ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
                "--ontop.auth.allowed-origins=http://127.0.0.1:5291,http://localhost:5291",
                "--ontop.websocket.authenticated=true", "--ontop.start-rehearsal.enabled=false",
                "--ontop.ai.enabled=true",
                "--ontop.world.map.source=GENERATED", "--ontop.world.map.require-match=true",
                "--ontop.world.map.json-path=../frontend/generated/park-renewal/server-map.json",
                "--ontop.world.map.manifest-path=../frontend/generated/park-renewal/manifest.json");
    }
}
