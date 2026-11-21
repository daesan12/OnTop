package com.ssafy.ontop.game.yutnori;

import com.ssafy.ontop.OntopApplication;
import com.ssafy.ontop.demo.AlkkagiParkApplication;
import com.ssafy.ontop.demo.SkewerCoopDemoApplication;
import org.springframework.boot.SpringApplication;

/** 기존 loopback 검수 계정·포트로 최신 220m 맵을 읽는 테스트 전용 진입점. 운영 JAR에는 포함하지 않는다. */
public final class YutParkApplication {
    private YutParkApplication() { }

    public static void main(String[] args) {
        new SpringApplication(OntopApplication.class, AlkkagiParkApplication.Fixture.class,
                SkewerCoopDemoApplication.Fixture.class).run(
                "--spring.profiles.active=local,frontend-test,alkkagi-park,skewer-network",
                "--server.address=127.0.0.1", "--server.port=19185",
                "--ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
                "--ontop.auth.allowed-origins=http://127.0.0.1:5244,http://localhost:5244",
                "--ontop.games.skewer-coop.enabled=true", "--ontop.websocket.authenticated=true",
                "--ontop.world.map.source=generated", "--ontop.world.map.require-match=true",
                "--ontop.world.map.json-path=../frontend/generated/park-renewal/server-map.json",
                "--ontop.world.map.manifest-path=../frontend/generated/park-renewal/manifest.json");
    }
}
