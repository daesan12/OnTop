package com.ssafy.ontop.demo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.OntopApplication;
import com.ssafy.ontop.auth.security.AccessAuthenticationService;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldFacilityService.Pose;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.springframework.web.filter.OncePerRequestFilter;

/** 운영 JAR에 포함되지 않는 loopback 전용 검수 앱. 계정 인증만 대역이며 협동 엔진·맵·소켓은 실제다. */
public final class SkewerCoopDemoApplication {
    public static void main(String[] args) {
        new SpringApplication(OntopApplication.class, AlkkagiParkApplication.Fixture.class, Fixture.class).run(
                "--spring.profiles.active=local,frontend-test,alkkagi-park,skewer-network",
                "--server.address=127.0.0.1", "--server.port=19185",
                "--ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
                "--ontop.auth.allowed-origins=http://127.0.0.1:5244,http://localhost:5244",
                "--ontop.games.skewer-coop.enabled=true", "--ontop.websocket.authenticated=true",
                "--ontop.world.map.source=generated", "--ontop.world.map.require-match=true",
                "--ontop.world.map.json-path=../frontend/generated/park/server-map.json",
                "--ontop.world.map.manifest-path=../frontend/generated/park/manifest.json");
    }

    @TestConfiguration(proxyBeanMethods = false)
    @Profile("local & skewer-network & !db & !dev & !prod & !production")
    public static class Fixture {
        @Bean
        FilterRegistrationBean<OncePerRequestFilter> skewerEntranceFixture(AccessAuthenticationService auth,
                WorldChannelRegistry channels, WorldMapRuntime map, ObjectMapper mapper) {
            var registration = new FilterRegistrationBean<OncePerRequestFilter>();
            registration.setOrder(-190);
            registration.setFilter(new OncePerRequestFilter() {
                @Override
                protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                        FilterChain chain) throws ServletException, IOException {
                    if (!request.getRequestURI().equals("/local/skewer/entrance")
                            || !request.getMethod().equals("POST")) {
                        chain.doFilter(request, response);
                        return;
                    }
                    String header = request.getHeader("Authorization");
                    try {
                        long user = auth.authenticate(header != null && header.startsWith("Bearer ")
                                ? header.substring(7) : "").userId();
                        String identity = Long.toString(user);
                        if (channels.channelOf(identity) == null) {
                            response.setStatus(409);
                            return;
                        }
                        var entrance = map.prepared().orElseThrow().vrEntrance().orElseThrow().center();
                        channels.releaseFacility(identity,
                                new Pose(entrance.x(), entrance.y(), entrance.z(), entrance.yaw()));
                        response.setContentType("application/json");
                        mapper.writeValue(response.getWriter(), Map.of("placed", true));
                    } catch (RuntimeException rejected) {
                        response.setStatus(403);
                    }
                }
            });
            return registration;
        }
    }
}
